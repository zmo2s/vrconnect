using System.Security.Cryptography;

namespace DashboardVRChat.Api.Services.ChatService;

/// <summary>
/// Lets the local SteamVR overlay reuse the VRChat session of the dashboard without copying anything.
/// At startup the API writes a random token to %LOCALAPPDATA%\VRChatDashboard\overlay-token (readable by the
/// current Windows user only). The overlay reads it and asks GET /overlay/session for the key of the session
/// the dashboard used most recently. Only loopback requests carrying that token are answered.
/// </summary>
public static class OverlayAccess
{
    public const string TokenHeader = "X-Overlay-Token";
    private static string? _lastSessionKey;

    public static string Token { get; } = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));

    public static string TokenPath { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "VRChatDashboard", "overlay-token");

    /// <summary>Called on startup: a fresh token per API run, so an old copy of the file is useless.</summary>
    public static void WriteToken()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(TokenPath)!);
        File.WriteAllText(TokenPath, Token);
    }

    /// <summary>Remembers a session the dashboard is actually using (a known or saved login, never a fresh key).</summary>
    public static void Remember(string key) => Volatile.Write(ref _lastSessionKey, key);

    public static string? LastSessionKey => Volatile.Read(ref _lastSessionKey);

    public static bool IsAllowed(HttpContext context) =>
        context.Connection.RemoteIpAddress is { } address && System.Net.IPAddress.IsLoopback(address) &&
        context.Request.Headers[TokenHeader].FirstOrDefault() is { Length: > 0 } supplied &&
        CryptographicOperations.FixedTimeEquals(
            System.Text.Encoding.UTF8.GetBytes(supplied), System.Text.Encoding.UTF8.GetBytes(Token));
}
