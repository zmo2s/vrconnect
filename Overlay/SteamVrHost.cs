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
    private ulong _overlay, _thumbnail;
    private int _frame;

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
            error = $"Could not create the overlay: {OpenVR.Overlay.GetOverlayErrorNameFromEnum(result)}";
            OpenVR.Shutdown();
            return false;
        }

        OpenVR.Overlay.SetOverlayWidthInMeters(created._overlay, 2.4f);
        OpenVR.Overlay.SetOverlayInputMethod(created._overlay, VROverlayInputMethod.Mouse);
        var scale = new HmdVector2_t { v0 = OverlayRenderer.Width, v1 = OverlayRenderer.Height };
        OpenVR.Overlay.SetOverlayMouseScale(created._overlay, ref scale);

        var thumbnail = Path.Combine(AppContext.BaseDirectory, "thumbnail.png");
        OverlayRenderer.RenderThumbnail(thumbnail);
        OpenVR.Overlay.SetOverlayFromFile(created._thumbnail, thumbnail);

        host = created;
        error = "";
        return true;
    }

    /// <summary>True while the user looks at our tab in the SteamVR dashboard (no need to refresh otherwise).</summary>
    public bool IsVisible => OpenVR.Overlay.IsOverlayVisible(_overlay);

    public void Show(OverlayState state)
    {
        // Alternate between two files: SteamVR may keep showing a cached image for an unchanged path
        var path = Path.Combine(AppContext.BaseDirectory, $"panel-{_frame++ % 2}.png");
        OverlayRenderer.RenderPanel(state, path);
        OpenVR.Overlay.SetOverlayFromFile(_overlay, path);
    }

    /// <summary>Handles SteamVR events. Returns false when SteamVR asks us to quit.</summary>
    public bool PumpEvents(out bool refreshClicked)
    {
        refreshClicked = false;
        var size = (uint)Marshal.SizeOf<VREvent_t>();
        var vrEvent = new VREvent_t();
        while (OpenVR.Overlay.PollNextOverlayEvent(_overlay, ref vrEvent, size))
        {
            if (vrEvent.eventType != (uint)EVREventType.VREvent_MouseButtonDown) continue;
            // SteamVR mouse coordinates start at the bottom-left; the image starts at the top-left
            var x = vrEvent.data.mouse.x;
            var y = OverlayRenderer.Height - vrEvent.data.mouse.y;
            if (OverlayRenderer.RefreshButton.Contains(x, y)) refreshClicked = true;
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
        if (_overlay != 0) OpenVR.Overlay.DestroyOverlay(_overlay);
        OpenVR.Shutdown();
    }
}
