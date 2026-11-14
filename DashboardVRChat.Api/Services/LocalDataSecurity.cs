using System.Security.AccessControl;
using System.Security.Principal;

namespace DashboardVRChat.Api.Services;

/// <summary>
/// Protects what the app keeps in %LOCALAPPDATA%\VRChatDashboard (saved VRChat login, encryption keys, overlay token).
/// </summary>
public static class LocalDataSecurity
{
    public static string DataDir { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "VRChatDashboard");

    public static string KeysDir => Path.Combine(DataDir, "keys");
    public static string SessionsDir => Path.Combine(DataDir, "vrchat-sessions");

    /// <summary>
    /// Only the current Windows user (plus SYSTEM and administrators, who can always take a folder) can open the
    /// data folder. Inherited entries from the user profile, such as sandbox groups of other apps, are removed.
    /// </summary>
    public static void LockDownDataFolder(ILogger? logger = null)
    {
        Directory.CreateDirectory(DataDir);
        if (!OperatingSystem.IsWindows()) return;
        try
        {
            var me = WindowsIdentity.GetCurrent().User!;
            var security = new DirectorySecurity();
            security.SetAccessRuleProtection(isProtected: true, preserveInheritance: false);
            const InheritanceFlags all = InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit;
            foreach (var who in new IdentityReference[]
                     {
                         me,
                         new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null),
                         new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null),
                     })
                security.AddAccessRule(new FileSystemAccessRule(who, FileSystemRights.FullControl, all, PropagationFlags.None, AccessControlType.Allow));
            security.SetOwner(me);
            new DirectoryInfo(DataDir).SetAccessControl(security);
        }
        catch (Exception ex)
        {
            // Never block the app on this: the folder is still under the user's profile.
            logger?.LogWarning(ex, "Could not restrict access to {Folder}", DataDir);
        }
    }

    /// <summary>
    /// Older versions saved the encryption key unencrypted next to the saved login, so a copy of the folder was
    /// enough to reuse the VRChat session. Such keys are deleted (with the sessions they protected): the user signs
    /// in once more and the new key is protected by Windows (DPAPI).
    /// </summary>
    public static bool RemoveUnprotectedKeys(ILogger? logger = null)
    {
        if (!Directory.Exists(KeysDir)) return false;
        var unprotected = Directory.EnumerateFiles(KeysDir, "*.xml")
            .Where(file => !File.ReadAllText(file).Contains("encryptedSecret", StringComparison.Ordinal))
            .ToList();
        if (unprotected.Count == 0) return false;

        foreach (var file in unprotected) File.Delete(file);
        if (Directory.Exists(SessionsDir))
            foreach (var file in Directory.EnumerateFiles(SessionsDir)) File.Delete(file);
        logger?.LogWarning("Removed {Count} unprotected encryption key(s); please sign in to VRChat again.", unprotected.Count);
        return true;
    }
}
