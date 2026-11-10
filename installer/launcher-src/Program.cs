// VRChatDashboard.exe
// Starts the API (api\), serves the built frontend (frontend\) on http://localhost:8080,
// starts the SteamVR overlay (overlay\) when SteamVR is installed, and shows the dashboard
// in a WebView2 window. Closing the window stops everything.
//
// --dev (used by START.bat): starts nothing itself. It waits for the API and the Vite dev server that
// START.bat already runs, then shows them in the window. START.bat stops them when the window closes.

using System.Diagnostics;
using Microsoft.Extensions.FileProviders;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace VRChatDashboard.Launcher;

static class Program
{
    [STAThread]
    static int Main(string[] args)
    {
        var dev = args.Contains("--dev", StringComparer.OrdinalIgnoreCase);

        // One copy only: a second one would fight over ports 5000 / 8080.
        using var mutex = new Mutex(true, "VRChatDashboard.Launcher", out var first);
        if (!first)
        {
            MessageBox.Show("VRChat Dashboard est déjà ouvert.", "VRChat Dashboard",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return 0;
        }

        ApplicationConfiguration.Initialize();
        var window = new MainWindow(dev);
        Application.Run(window);
        // 2 = no WebView2 runtime: START.bat then falls back to the browser
        return window.NoWebView ? 2 : 0;
    }
}

sealed class MainWindow : Form
{
    const string FrontUrl = "http://localhost:8080";
    const string ApiUrl = "http://localhost:5000/";

    static readonly string AppDir = AppContext.BaseDirectory;
    static readonly string DataDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "VRChatDashboard");
    static readonly string LogDir = Path.Combine(DataDir, "logs");

    readonly Label status = new()
    {
        Dock = DockStyle.Fill,
        TextAlign = ContentAlignment.MiddleCenter,
        Font = new Font("Segoe UI", 14f),
        ForeColor = Color.Gainsboro,
        Text = "Démarrage de VRChat Dashboard…",
    };
    readonly WebView2 web = new() { Dock = DockStyle.Fill, Visible = false };

    readonly bool dev;
    Process api, overlay;
    WebApplication frontServer;

    public bool NoWebView { get; private set; }

    public MainWindow(bool dev)
    {
        this.dev = dev;
        Text = "VRChat Dashboard";
        Size = new Size(1400, 900);
        MinimumSize = new Size(800, 500);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(24, 24, 27);
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }

        Controls.Add(web);
        Controls.Add(status);
    }

    protected override async void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        try
        {
            Directory.CreateDirectory(LogDir);
            if (dev)
            {
                // START.bat runs the API and Vite: just wait for both (the first build can take a while).
                if (!await WaitForAsync(ApiUrl, 120) || !await WaitForAsync(FrontUrl, 120))
                {
                    ShowStatus("L'API ou le front ne répond pas.\n\nRegardez la console de START.bat.");
                    return;
                }
            }
            else
            {
                api = StartProcess(Path.Combine(AppDir, "api", "DashboardVRChat.Api.exe"), "", "api.log", required: true);
                frontServer = StartFrontServer(Path.Combine(AppDir, "frontend"));
                StartOverlayIfSteamVr();

                if (!await WaitForAsync(ApiUrl, 30))
                {
                    ShowStatus("L'API ne répond pas.\n\nRegardez le journal : " + Path.Combine(LogDir, "api.log"));
                    return;
                }
            }

            await ShowDashboardAsync();
        }
        catch (Exception ex)
        {
            ShowStatus("Impossible de démarrer :\n" + ex.Message);
        }
    }

    async Task ShowDashboardAsync()
    {
        try
        {
            // Keep the WebView2 profile (VRChat sign-in cookies) out of Program Files, which is read-only.
            var env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(DataDir, "WebView2"));
            await web.EnsureCoreWebView2Async(env);
        }
        catch (WebView2RuntimeNotFoundException)
        {
            // Very old Windows without the WebView2 runtime: fall back to the browser.
            NoWebView = true;
            if (dev) { Close(); return; } // START.bat opens the browser itself
            OpenExternal(FrontUrl);
            ShowStatus("Le dashboard est ouvert dans votre navigateur.\n\nFermez cette fenêtre pour tout arrêter.");
            return;
        }

        var core = web.CoreWebView2;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.AreDevToolsEnabled = dev || Debugger.IsAttached; // F12 while developing
        core.DocumentTitleChanged += (_, _) =>
            Text = string.IsNullOrWhiteSpace(core.DocumentTitle) ? "VRChat Dashboard" : core.DocumentTitle;

        // Links to other sites (vrchat.com, GitHub…) open in the user's browser, not in the app.
        core.NewWindowRequested += (_, args) => { args.Handled = true; OpenExternal(args.Uri); };
        core.NavigationStarting += (_, args) =>
        {
            if (IsLocal(args.Uri)) return;
            args.Cancel = true;
            OpenExternal(args.Uri);
        };

        core.Navigate(FrontUrl);
        web.Visible = true;
        status.Visible = false;
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        Kill(overlay);
        Kill(api);
        try { frontServer?.StopAsync().Wait(TimeSpan.FromSeconds(2)); } catch { }
        base.OnFormClosed(e);
    }

    // ---- services ----

    static Process StartProcess(string exe, string arguments, string logName, bool required)
    {
        if (!File.Exists(exe))
        {
            if (required) throw new FileNotFoundException("Fichier introuvable : " + exe);
            return null;
        }

        var p = new Process
        {
            StartInfo = new ProcessStartInfo(exe, arguments)
            {
                WorkingDirectory = Path.GetDirectoryName(exe),
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            },
        };

        // No console any more: keep the output in a log file for troubleshooting.
        var log = new StreamWriter(Path.Combine(LogDir, logName), append: false) { AutoFlush = true };
        p.OutputDataReceived += (_, d) => { if (d.Data != null) lock (log) log.WriteLine(d.Data); };
        p.ErrorDataReceived += (_, d) => { if (d.Data != null) lock (log) log.WriteLine(d.Data); };
        p.Start();
        p.BeginOutputReadLine();
        p.BeginErrorReadLine();
        return p;
    }

    static WebApplication StartFrontServer(string frontendDir)
    {
        if (!Directory.Exists(frontendDir)) throw new DirectoryNotFoundException("Dossier introuvable : " + frontendDir);

        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseUrls(FrontUrl);
        builder.Logging.ClearProviders();
        var app = builder.Build();

        var files = new PhysicalFileProvider(frontendDir);
        app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = files });
        app.UseStaticFiles(new StaticFileOptions { FileProvider = files });
        app.MapFallbackToFile("index.html", new StaticFileOptions { FileProvider = files });

        _ = app.RunAsync();
        return app;
    }

    void StartOverlayIfSteamVr()
    {
        // The overlay waits for SteamVR and never starts it, so it costs nothing on desktop.
        var steamVr = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "openvr", "openvrpaths.vrpath");
        if (!File.Exists(steamVr)) return;
        try { overlay = StartProcess(Path.Combine(AppDir, "overlay", "vrconnect-overlay.exe"), "", "overlay.log", required: false); }
        catch { /* the dashboard works without the overlay */ }
    }

    async Task<bool> WaitForAsync(string url, int seconds)
    {
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
        var until = DateTime.UtcNow.AddSeconds(seconds);
        while (DateTime.UtcNow < until)
        {
            if (api is { HasExited: true }) return false;
            try
            {
                await http.GetAsync(url); // any HTTP answer means the server is up
                return true;
            }
            catch { await Task.Delay(500); }
        }
        return false;
    }

    // ---- helpers ----

    void ShowStatus(string text)
    {
        web.Visible = false;
        status.Text = text;
        status.Visible = true;
    }

    static bool IsLocal(string uri) =>
        Uri.TryCreate(uri, UriKind.Absolute, out var u) &&
        (u.Scheme is "about" or "data" || u.IsLoopback);

    static void OpenExternal(string uri)
    {
        if (!Uri.TryCreate(uri, UriKind.Absolute, out var u) || u.Scheme is not ("http" or "https" or "mailto")) return;
        try { Process.Start(new ProcessStartInfo(u.AbsoluteUri) { UseShellExecute = true }); } catch { }
    }

    static void Kill(Process p)
    {
        try { if (p is { HasExited: false }) p.Kill(entireProcessTree: true); } catch { }
    }
}
