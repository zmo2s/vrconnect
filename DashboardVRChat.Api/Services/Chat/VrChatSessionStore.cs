using Microsoft.AspNetCore.DataProtection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace DashboardVRChat.Api.Services.ChatService;

// Only authenticated VRChat cookies are persisted, never passwords or OTP codes.
public sealed class VrChatSessionStore(IWebHostEnvironment environment, IDataProtectionProvider protection)
{
    private readonly IDataProtector _protector = protection.CreateProtector("VRChat.RememberedSession.v1");
    private readonly string _directory = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "VRChatDashboard", "vrchat-sessions");
    public sealed record SavedSession(string Auth, string? TwoFactor, DateTimeOffset Expires);
    private string FilePath(string key)
    {
        Directory.CreateDirectory(_directory);
        return Path.Combine(_directory, Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(key))) + ".dat");
    }

    public SavedSession? Read(string key)
    {
        var path = FilePath(key);
        if (!File.Exists(path)) return null;
        try
        {
            var saved = JsonSerializer.Deserialize<SavedSession>(_protector.Unprotect(File.ReadAllText(path)));
            if (saved != null && saved.Expires > DateTimeOffset.UtcNow) return saved;
        }
        catch (Exception ex) when (ex is CryptographicException or JsonException or IOException) { }
        return null;
    }

    public void Save(string key, string auth, string? twoFactor)
    {
        Directory.CreateDirectory(_directory);
        var path = FilePath(key);
        var temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        File.WriteAllText(temporary, _protector.Protect(JsonSerializer.Serialize(
            new SavedSession(auth, twoFactor, DateTimeOffset.UtcNow.AddDays(30)))));
        File.Move(temporary, path, true);
    }

    public void Delete(string key) => File.Delete(FilePath(key));
}
