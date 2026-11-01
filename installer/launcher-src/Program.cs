// Top-level program - .NET 6+
// Starts the API process + serves frontend static files on port 8080

var appDir = AppDomain.CurrentDomain.BaseDirectory;
var apiExe = Path.Combine(appDir, "api", "DashboardVRChat.Api.exe");
var frontendDir = Path.Combine(appDir, "frontend");

Console.Title = "VRChat Dashboard";
Console.WriteLine("=== VRChat Dashboard ===");

// Start the API
Console.WriteLine("Starting API...");
var api = new System.Diagnostics.Process();
api.StartInfo.FileName = apiExe;
api.StartInfo.WorkingDirectory = Path.Combine(appDir, "api");
api.StartInfo.UseShellExecute = false;
api.StartInfo.CreateNoWindow = true;
api.Start();

// Start frontend static file server on port 8080
Console.WriteLine("Starting frontend server on http://localhost:8080 ...");
var builder = WebApplication.CreateBuilder();
builder.WebHost.UseUrls("http://localhost:8080");
builder.Logging.ClearProviders(); // silence ASP.NET logs in console
var app = builder.Build();
app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions {
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(frontendDir),
    RequestPath = ""
});
app.MapFallbackToFile("index.html", new StaticFileOptions {
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(frontendDir)
});

// Run frontend server in background thread
var cts = new CancellationTokenSource();
var serverTask = app.RunAsync(cts.Token);

// Wait for API to be ready
Console.Write("Waiting for API");
using var http = new System.Net.Http.HttpClient();
http.Timeout = TimeSpan.FromSeconds(2);
for (int i = 0; i < 30; i++) {
    Thread.Sleep(1000); Console.Write(".");
    try {
        var r = http.GetAsync("http://localhost:5000/").GetAwaiter().GetResult();
        break;
    } catch { }
}
Console.WriteLine(" ready!");

// Open browser
System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("http://localhost:8080") { UseShellExecute = true });
Console.WriteLine("Dashboard running at http://localhost:8080");
Console.WriteLine("Press Enter to stop everything.");
Console.ReadLine();

// Shutdown
cts.Cancel();
try { api.Kill(entireProcessTree: true); } catch { }
try { serverTask.GetAwaiter().GetResult(); } catch { }
Console.WriteLine("Stopped.");
