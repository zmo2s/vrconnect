using System.Runtime.InteropServices;
using Valve.VR;

namespace VrConnect.Overlay;

/// <summary>
/// A SteamVR dashboard overlay: a "vrconnect" tab in the SteamVR menu. SteamVR handles the controller
/// laser and sends mouse events, so clicking works without any input code of our own.
/// </summary>
public sealed class SteamVrHost : IDisposable
{
    private const string Key = "vrconnect.overlay";
    private ulong _overlay, _thumbnail, _alert;
    private int _frame, _alertFrame;
    private DateTimeOffset _alertUntil = DateTimeOffset.MinValue;
    private readonly Queue<Alert> _alerts = new();

    /// <summary>True when the last TryStart failed because another copy already owns the overlay.</summary>
    public static bool AlreadyRunning { get; private set; }

    /// <summary>SteamVR's server process. Checked before OpenVR.Init, which would otherwise start SteamVR itself.</summary>
    public static bool IsSteamVrRunning() => System.Diagnostics.Process.GetProcessesByName("vrserver").Length > 0;

    public static bool TryStart(out SteamVrHost? host, out string error)
    {
        host = null;
        var initError = EVRInitError.None;
        OpenVR.Init(ref initError, EVRApplicationType.VRApplication_Overlay);
        if (initError != EVRInitError.None)
        {
            error = initError == EVRInitError.Init_NoServerForBackgroundApp || initError == EVRInitError.Init_HmdNotFound
                ? "SteamVR is not running. Start SteamVR, then the overlay."
                : $"SteamVR refused the overlay: {OpenVR.GetStringForHmdError(initError)}";
            return false;
        }

        var created = new SteamVrHost();
        var result = OpenVR.Overlay.CreateDashboardOverlay(Key, "vrconnect", ref created._overlay, ref created._thumbnail);
        if (result != EVROverlayError.None)
        {
            AlreadyRunning = result == EVROverlayError.KeyInUse;
            error = AlreadyRunning ? "The vrconnect overlay is already running in SteamVR."
                : $"Could not create the overlay: {OpenVR.Overlay.GetOverlayErrorNameFromEnum(result)}";
            OpenVR.Shutdown();
            return false;
        }

        OpenVR.Overlay.SetOverlayWidthInMeters(created._overlay, 2.4f);
        OpenVR.Overlay.SetOverlayInputMethod(created._overlay, VROverlayInputMethod.Mouse);
        var scale = new HmdVector2_t { v0 = OverlayRenderer.Width, v1 = OverlayRenderer.Height };
        OpenVR.Overlay.SetOverlayMouseScale(created._overlay, ref scale);
        // Thumbstick / trackpad scrolling while pointing at the panel
        OpenVR.Overlay.SetOverlayFlag(created._overlay, VROverlayFlags.SendVRDiscreteScrollEvents, true);

        // Alert banner: a separate overlay locked to the headset, a little below eye level, hidden until needed
        if (OpenVR.Overlay.CreateOverlay("vrconnect.alert", "vrconnect alerts", ref created._alert) == EVROverlayError.None)
        {
            OpenVR.Overlay.SetOverlayWidthInMeters(created._alert, 0.42f);
            var inFront = new HmdMatrix34_t { m0 = 1, m5 = 1, m10 = 1, m3 = 0, m7 = -0.16f, m11 = -0.75f };
            OpenVR.Overlay.SetOverlayTransformTrackedDeviceRelative(created._alert, OpenVR.k_unTrackedDeviceIndex_Hmd, ref inFront);
        }

        var thumbnail = Path.Combine(AppContext.BaseDirectory, "thumbnail.png");
        OverlayRenderer.RenderThumbnail(thumbnail);
        OpenVR.Overlay.SetOverlayFromFile(created._thumbnail, thumbnail);

        host = created;
        error = "";
        return true;
    }

    /// <summary>True while the user looks at our tab in the SteamVR dashboard (no need to refresh otherwise).</summary>
    public bool IsVisible => OpenVR.Overlay.IsOverlayVisible(_overlay);

    /// <summary>Avatars and world pictures to draw, when already downloaded.</summary>
    public ImageCache? Images { get; set; }

    /// <summary>The list picked on the left and its scroll position.</summary>
    public PanelView View { get; } = new();

    /// <summary>Shows a frame and returns its clickable areas.</summary>
    public List<HitTarget> Show(OverlayState state)
    {
        // Alternate between two files: SteamVR may keep showing a cached image for an unchanged path
        var path = Path.Combine(AppContext.BaseDirectory, $"panel-{_frame++ % 2}.png");
        var targets = OverlayRenderer.RenderPanel(state, View, path, Images);
        OpenVR.Overlay.SetOverlayFromFile(_overlay, path);
        return targets;
    }

    public void Enqueue(IEnumerable<Alert> alerts)
    {
        foreach (var alert in alerts) _alerts.Enqueue(alert);
    }

    /// <summary>Call often: shows queued alerts one after another, 6 seconds each, then hides the banner.</summary>
    public void TickAlerts()
    {
        if (_alert == 0 || DateTimeOffset.Now < _alertUntil) return;
        if (_alerts.TryDequeue(out var next))
        {
            var path = Path.Combine(AppContext.BaseDirectory, $"alert-{_alertFrame++ % 2}.png");
            OverlayRenderer.RenderAlert(next, path);
            OpenVR.Overlay.SetOverlayFromFile(_alert, path);
            OpenVR.Overlay.ShowOverlay(_alert);
            _alertUntil = DateTimeOffset.Now.AddSeconds(6);
        }
        else if (_alertUntil != DateTimeOffset.MinValue)
        {
            OpenVR.Overlay.HideOverlay(_alert);
            _alertUntil = DateTimeOffset.MinValue;
        }
    }

    /// <summary>Handles SteamVR events. Returns false when SteamVR asks us to quit; <paramref name="inputs"/> gets the laser input, in texture pixels.</summary>
    public bool PumpEvents(List<PanelInput> inputs)
    {
        var size = (uint)Marshal.SizeOf<VREvent_t>();
        var vrEvent = new VREvent_t();
        while (OpenVR.Overlay.PollNextOverlayEvent(_overlay, ref vrEvent, size))
        {
            // SteamVR mouse coordinates start at the bottom-left; the image starts at the top-left
            var x = vrEvent.data.mouse.x;
            var y = OverlayRenderer.Height - vrEvent.data.mouse.y;
            switch ((EVREventType)vrEvent.eventType)
            {
                case EVREventType.VREvent_MouseButtonDown: inputs.Add(new(PanelInputKind.Down, x, y)); break;
                case EVREventType.VREvent_MouseButtonUp: inputs.Add(new(PanelInputKind.Up, x, y)); break;
                case EVREventType.VREvent_MouseMove: inputs.Add(new(PanelInputKind.Move, x, y)); break;
                case EVREventType.VREvent_ScrollDiscrete: inputs.Add(new(PanelInputKind.Scroll, 0, 0, vrEvent.data.scroll.ydelta)); break;
            }
        }
        while (OpenVR.System.PollNextEvent(ref vrEvent, size))
        {
            if (vrEvent.eventType == (uint)EVREventType.VREvent_Quit)
            {
                OpenVR.System.AcknowledgeQuit_Exiting();
                return false;
            }
        }
        return true;
    }

    /// <summary>Registers the overlay with SteamVR so it starts automatically with SteamVR.</summary>
    public static string Register()
    {
        var manifest = Path.Combine(AppContext.BaseDirectory, "manifest.vrmanifest");
        var error = OpenVR.Applications.AddApplicationManifest(manifest, false);
        if (error != EVRApplicationError.None) return $"Could not register: {OpenVR.Applications.GetApplicationsErrorNameFromEnum(error)}";
        OpenVR.Applications.SetApplicationAutoLaunch(Key, true);
        return "Registered: vrconnect will start with SteamVR.";
    }

    public void Dispose()
    {
        if (_alert != 0) OpenVR.Overlay.DestroyOverlay(_alert);
        if (_overlay != 0) OpenVR.Overlay.DestroyOverlay(_overlay);
        OpenVR.Shutdown();
    }
}
