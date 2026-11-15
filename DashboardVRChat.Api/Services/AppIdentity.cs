namespace DashboardVRChat.Api.Services;

/// <summary>
/// How the app identifies itself to VRChat in the User-Agent. VRChat asks API clients to say which app they are
/// and how to reach whoever maintains it, so this points to the project page by default: nobody has to type anything.
/// "VRChat:Contact" (appsettings.json or %LOCALAPPDATA%\VRChatDashboard\settings.json) or the VRCHAT_CONTACT
/// environment variable can replace that with your own contact.
/// </summary>
public static class AppIdentity
{
    public const string Name = "vrconnect";
    public const string Version = "1.0.0";
    public const string ProjectUrl = "https://github.com/zmo2s/vrconnect";

    /// <summary>Optional contact that replaces the project page (for example your own email).</summary>
    public static string? ContactOverride { get; set; }

    public static string Contact => string.IsNullOrWhiteSpace(ContactOverride) ? ProjectUrl : ContactOverride.Trim();

    /// <summary>Same shape as the VRChat client library's own User-Agent: "vrconnect/1.0.0 (contact)".</summary>
    public static string UserAgent => $"{Name}/{Version} ({Contact})";
}
