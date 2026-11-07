using DashboardVRChat.Api.Services.Chat;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Net;
using VRChat.API.Client;
using VRChat.API.Model;
using static System.Net.Mime.MediaTypeNames;


namespace DashboardVRChat.Api.Services.ChatService;

public class VrChatSessionService
{
    private IVRChat? _vrchat;
    private readonly SemaphoreSlim _boopGate = new(1, 1);
    private readonly SemaphoreSlim _inviteGate = new(1, 1);
    private const int MaxInviteMessageLength = 64;
    private CookieContainer _cookies;

    private readonly ChatDbContext _db;

    private readonly ILogger<VrChatSessionService>? _logger;
    // Diagnostic ID only; this is not an authentication token.
    public Guid DiagnosticId { get; } = Guid.NewGuid();

    private readonly VrChatSessionStore? _store;
    private readonly string? _sessionKey;

    public VrChatSessionService(ILogger<VrChatSessionService>? logger = null,
        VrChatSessionStore? store = null, string? sessionKey = null,
        VrChatSessionStore.SavedSession? saved = null)
    {
        _logger = logger;
        _store = store;
        _sessionKey = sessionKey;
        if (saved != null)
        {
            _vrchat = new VRChatClientBuilder()
                .WithApplication(name: "DashboardVRChat", version: "1.0.0", contact: ContactInfo)
                .WithAuthCookie(saved.Auth, saved.TwoFactor).Build();
            _vrchat.Client.SerializerSettings.ContractResolver = new VrChatContractResolver();
        }
    }

    /// <summary>
    /// Contact sent to VRChat in the User-Agent (VRChat asks API clients to identify themselves).
    /// Set "VRChat:Contact" in appsettings.json (or the VRCHAT_CONTACT environment variable) to your email.
    /// </summary>
    public static string Contact { get; set; } = "";
    private static string ContactInfo => string.IsNullOrWhiteSpace(Contact) ? "unconfigured-contact" : Contact.Trim();

    /// <summary>Turns a VRChat API error into a message that says what happened and what to do.</summary>
    private string DescribeLoginError(ApiException ex)
    {
        _logger?.LogWarning("VRChat login failed with HTTP {Code}: {Message} {Content}", ex.ErrorCode, ex.Message, ex.ErrorContent);
        return ex.ErrorCode switch
        {
            401 => "Invalid VRChat username or password.",
            429 => "Too many login attempts. Wait a few minutes before trying again.",
            403 => string.IsNullOrWhiteSpace(Contact)
                ? "VRChat refused the connection (403). Set \"VRChat:Contact\" in appsettings.json to your email address, restart the API, then try again."
                : "VRChat refused the connection (403). Your network or IP may be blocked by VRChat; try again later or from another connection.",
            400 => "VRChat rejected the login request (400). Check your username and password, then try again.",
            0 => "Could not reach VRChat. Check your internet connection.",
            >= 500 => $"VRChat's servers are having trouble ({ex.ErrorCode}). Try again in a few minutes.",
            _ => $"VRChat could not complete the login (error {ex.ErrorCode}). Please try again.",
        };
    }

    private IVRChat? _pendingLogin;
    private List<string> _pendingMethods = [];
    private readonly SemaphoreSlim _loginGate = new(1, 1);

    public async Task<ApiResult> LoginAsync(string username, string password)
    {
        await _loginGate.WaitAsync();
        try
        {
            ClearSession();
            if (string.IsNullOrWhiteSpace(username) || string.IsNullOrEmpty(password))
                return ApiResult.Fail("Enter your VRChat username and password.");

            var client = new VRChatClientBuilder()
                .WithUsername(username.Trim())
                .WithPassword(password)
                .WithApplication(name: "DashboardVRChat", version: "1.0.0", contact: ContactInfo)
                .Build();
            client.Client.SerializerSettings.ContractResolver = new VrChatContractResolver();
            var user = await client.Authentication.GetCurrentUserAsync();
            if (user.RequiresTwoFactorAuth?.Count > 0)
            {
                _pendingLogin = client;
                _pendingMethods = user.RequiresTwoFactorAuth;
                _logger?.LogInformation("VRChat login challenge stored on instance {InstanceId}; methods: {Methods}", DiagnosticId, string.Join(",", _pendingMethods));
                return ApiResult.Fail("Verification required.", _pendingMethods);
            }
            if (string.IsNullOrEmpty(user.Id)) return ApiResult.Fail("VRChat did not confirm your login.");
            _vrchat = client;
            SaveSession();
            _logger?.LogInformation("VRChat login completed on instance {InstanceId}", DiagnosticId);
            return ApiResult.Ok(new { user.Id, user.DisplayName });
        }
        catch (ApiException ex)
        {
            return ApiResult.Fail(DescribeLoginError(ex));
        }
        catch (Exception ex)
        {
            return ApiResult.Fail($"Could not connect to VRChat: {ex.GetType().Name}: {ex.Message}");
        }
        finally { _loginGate.Release(); }
    }

    private void SaveSession()
    {
        if (_vrchat == null || _store == null || _sessionKey == null) return;
        var cookies = _vrchat.GetCookies().Cast<Cookie>().ToList();
        var auth = cookies.FirstOrDefault(cookie => cookie.Name == "auth")?.Value;
        var twoFactor = cookies.FirstOrDefault(cookie => cookie.Name == "twoFactorAuth")?.Value;
        if (!string.IsNullOrEmpty(auth)) _store.Save(_sessionKey, auth, twoFactor);
    }

    public async Task<ApiResult> ResumeAsync()
    {
        await _loginGate.WaitAsync();
        try
        {
            if (_vrchat == null) return ApiResult.Fail("No saved login. Please sign in.");
            var user = await _vrchat.Authentication.GetCurrentUserAsync();
            if (user.RequiresTwoFactorAuth?.Count > 0 || string.IsNullOrEmpty(user.Id))
            {
                ClearSession();
                return ApiResult.Fail("Your saved VRChat login expired. Please sign in again.");
            }
            SaveSession();
            return ApiResult.Ok(new { user.Id, user.DisplayName });
        }
        catch (ApiException ex) when (ex.ErrorCode is 401 or 403)
        {
            ClearSession();
            return ApiResult.Fail("Your saved VRChat login expired. Please sign in again.");
        }
        catch (Exception)
        {
            return ApiResult.Fail("Could not restore your login right now. Please try again.");
        }
        finally { _loginGate.Release(); }
    }

    private void ClearSession()
    {
        _vrchat = null;
        _pendingLogin = null;
        _pendingMethods = [];
        if (_sessionKey != null) _store?.Delete(_sessionKey);
    }

    public async Task<ApiResult> ForgetAsync()
    {
        await _loginGate.WaitAsync();
        try { ClearSession(); return ApiResult.Ok(null); }
        finally { _loginGate.Release(); }
    }
    public async Task<ApiResult> GetCurrentUserAsync()
    {
        if (_vrchat == null)
            return ApiResult.Fail("Not logged in");

        try
        {
            var user = await _vrchat.Authentication.GetCurrentUserAsync();

            return ApiResult.Ok(new
            {
                user.DisplayName,
                user.Id
            });
        }
        catch (Exception ex)
        {
            return ApiResult.Fail(ex.Message);
        }
    }

    public Task<ApiResult> VerifyTotpAsync(string code) => VerifyCodeAsync(code, "totp");
    public Task<ApiResult> VerifyEmailOtpAsync(string code) => VerifyCodeAsync(code, "emailOtp");

    private async Task<ApiResult> VerifyCodeAsync(string code, string method)
    {
        await _loginGate.WaitAsync();
        try
        {
            var client = _pendingLogin;
            _logger?.LogInformation("VRChat verification on instance {InstanceId}; pending: {Pending}; requested method: {Method}", DiagnosticId, client != null, method);
            if (client == null)
                return ApiResult.Fail(_vrchat != null
                    ? "This session is already signed in. Return to the dashboard."
                    : "No pending VRChat login in this session. Sign in through /vrchat/login first, then send the same X-VRChat-Session header when verifying.");
            if (!_pendingMethods.Contains(method))
                return ApiResult.Fail("This verification method was not requested by VRChat. Use the method returned by the login response.", _pendingMethods);
            if (string.IsNullOrWhiteSpace(code) || !System.Text.RegularExpressions.Regex.IsMatch(code.Trim(), @"^[0-9]{6}$"))
                return ApiResult.Fail("Enter the 6-digit verification code.");

            var verified = method == "emailOtp"
                ? (await client.Authentication.Verify2FAEmailCodeAsync(new TwoFactorEmailCode(code.Trim()))).Verified
                : (await client.Authentication.Verify2FAAsync(new TwoFactorAuthCode(code.Trim()))).Verified;
            if (!verified) return ApiResult.Fail("Invalid or expired code. Please try again.");
            var user = await client.Authentication.GetCurrentUserAsync();
            if (user.RequiresTwoFactorAuth?.Count > 0 || string.IsNullOrEmpty(user.Id))
                return ApiResult.Fail("Verification is not complete. Please try again.");
            _vrchat = client;
            SaveSession();
            _logger?.LogInformation("VRChat login completed on instance {InstanceId}", DiagnosticId);
            _pendingLogin = null;
            _pendingMethods = [];
            return ApiResult.Ok(new { user.Id, user.DisplayName });
        }
        catch (ApiException ex)
        {
            return ApiResult.Fail(ex.ErrorCode == 429 ? "Too many attempts. Please wait before trying again." : "Invalid or expired code. Please try again.");
        }
        catch (Exception ex)
        {
            return ApiResult.Fail($"Could not connect to VRChat: {ex.GetType().Name}: {ex.Message}");
        }
        finally { _loginGate.Release(); }
    }
    public async Task<ApiResult> GetCurrentUserInfoAsync()
    {
        if (_vrchat == null)
            return ApiResult.Fail("No VRChat session. Login first.");

        try
        {
            var user = await _vrchat.Authentication.GetCurrentUserAsync();

            var result = new VrChatCurrentUserInfo
            {
                Id = user.Id,
                DisplayName = user.DisplayName,
                Status = user.Status.ToString(),
                StatusDescription = user.StatusDescription,
                StatusHistory = user.StatusHistory?.Where(s => !string.IsNullOrWhiteSpace(s)).Distinct().Take(8).ToList() ?? new(),
                // Same picture VRChat shows for you: custom icon, then profile override, then avatar
                ProfilePicUrl = new[] { user.UserIcon, user.ProfilePicOverrideThumbnail, user.ProfilePicOverride, user.CurrentAvatarThumbnailImageUrl }
                    .FirstOrDefault(u => !string.IsNullOrWhiteSpace(u)),
                Bio = user.Bio,
                CurrentAvatarImageUrl = user.CurrentAvatarImageUrl,
                CurrentAvatarThumbnailImageUrl = user.CurrentAvatarThumbnailImageUrl
            };
               return ApiResult.Ok(result);
        }
        catch (Exception ex)
        {
            return ApiResult.Fail(ex.Message);
        }
    }

    /// <summary>Sets your own VRChat status and status message (what friends see in game).</summary>
    public async Task<ApiResult> UpdateMyStatusAsync(string? status, string? statusDescription, CancellationToken cancellationToken = default)
    {
        if (_vrchat == null)
            return ApiResult.Fail("No VRChat session. Login first.");

        UserStatus? newStatus = null;
        switch ((status ?? "").ToLowerInvariant().Replace(" ", "").Replace("_", "").Replace("-", ""))
        {
            case "": break;
            case "active": case "online": newStatus = UserStatus.Active; break;
            case "joinme": newStatus = UserStatus.JoinMe; break;
            case "askme": newStatus = UserStatus.AskMe; break;
            case "busy": case "donotdisturb": newStatus = UserStatus.Busy; break;
            default: return ApiResult.Fail("Unknown status. Use Join me, Online, Ask me or Do not disturb.");
        }

        var description = statusDescription?.Trim();
        if (description != null && description.Length > 32)
            return ApiResult.Fail("Status message is limited to 32 characters by VRChat.");

        try
        {
            var me = await _vrchat.Authentication.GetCurrentUserAsync();
            var request = new UpdateUserRequest();
            if (newStatus != null) request.Status = newStatus.Value;
            if (description != null) request.StatusDescription = description;
            var updated = await _vrchat.Users.UpdateUserAsync(me.Id, request, cancellationToken);
            return ApiResult.Ok(new { status = updated.Status.ToString(), statusDescription = updated.StatusDescription });
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // The browser cancelled the request (page refresh, navigation…). Nothing to report.
            return ApiResult.Fail("Request cancelled.");
        }
        catch (Exception ex)
        {
            return ApiResult.Fail($"VRChat refused the status change: {ex.Message}");
        }
    }

    /// <summary>Your VRChat favorite-friend groups (Group 1-3 or their custom names) with member user IDs.</summary>
    /// <remarks>
    /// Read as plain JSON instead of the SDK models: VRChat adds new favorite types (e.g. "vrcPlusWorld")
    /// that older VRChat.API versions can't deserialize, which would fail the whole request.
    /// </remarks>
    public async Task<ApiResult> GetFavoriteFriendGroupsAsync(CancellationToken cancellationToken = default)
    {
        var client = _vrchat;
        if (client == null)
            return ApiResult.Fail("No VRChat session. Login first.");

        try
        {
            var (groupStatus, groupBody) = await GetFromVrChatAsync(client, "favorite/groups?n=100&offset=0", cancellationToken);
            if (groupStatus is < 200 or >= 300)
                return ApiResult.Fail($"VRChat refused the favorite groups request ({groupStatus}): {VrChatErrorMessage(groupBody) ?? "no details"}");

            var allGroups = Newtonsoft.Json.Linq.JArray.Parse(groupBody).OfType<Newtonsoft.Json.Linq.JObject>().ToList();
            // "friend", plus any VRChat+ variant such as "vrcPlusFriend"
            static bool IsFriendType(string? type) => type != null && type.Contains("friend", StringComparison.OrdinalIgnoreCase);
            var groups = allGroups
                .Where(g => IsFriendType((string?)g["type"]) && !string.IsNullOrEmpty((string?)g["name"]))
                .Select(g => new
                {
                    Name = (string)g["name"]!,
                    DisplayName = (string?)g["displayName"],
                    Visibility = (string?)g["visibility"],
                })
                .ToList();

            if (groups.Count == 0)
            {
                var seen = string.Join(", ", allGroups.Select(g => $"{(string?)g["displayName"] ?? (string?)g["name"]} [{(string?)g["type"]}]"));
                return ApiResult.Fail($"No friend favorite groups found. VRChat returned: {(seen.Length > 0 ? seen : "no groups")}.");
            }

            // All favorites (no type filter, so VRChat+ friend favorites are included), keeping the ones that are users.
            // VRChat returns at most 100 favorites per call.
            var favorites = new List<(string Id, List<string> Tags)>();
            for (var offset = 0; offset < 3000; offset += 100)
            {
                var (status, body) = await GetFromVrChatAsync(client, $"favorites?n=100&offset={offset}", cancellationToken);
                if (status is < 200 or >= 300)
                    return ApiResult.Fail($"VRChat refused the favorites request ({status}): {VrChatErrorMessage(body) ?? "no details"}");
                var page = Newtonsoft.Json.Linq.JArray.Parse(body).OfType<Newtonsoft.Json.Linq.JObject>().ToList();
                favorites.AddRange(page
                    .Where(f => ((string?)f["favoriteId"])?.StartsWith("usr_", StringComparison.Ordinal) == true
                        || (IsFriendType((string?)f["type"]) && !string.IsNullOrEmpty((string?)f["favoriteId"])))
                    .Select(f => ((string)f["favoriteId"]!, f["tags"]?.Values<string>().OfType<string>().ToList() ?? new List<string>())));
                if (page.Count < 100) break;
            }

            var result = groups
                .OrderBy(g => g.Name, StringComparer.Ordinal)
                .Select(g => new
                {
                    name = g.Name,                 // "group_0", "group_1"…
                    displayName = string.IsNullOrWhiteSpace(g.DisplayName) ? g.Name : g.DisplayName,
                    visibility = g.Visibility,
                    members = favorites.Where(f => f.Tags.Contains(g.Name)).Select(f => f.Id).Distinct().ToList()
                })
                .ToList();

            return ApiResult.Ok(result);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // The browser cancelled the request (page refresh, navigation…). Nothing to report.
            return ApiResult.Fail("Request cancelled.");
        }
        catch (Exception ex)
        {
            return ApiResult.Fail($"Could not load your VRChat favorite groups: {ex.Message}");
        }
    }

    [HttpGet("friends")]
    public async Task<ApiResult> GetFriendsAsync(int offset = 0, int n = 100, bool offline = false)
    {
        if (_vrchat == null)
            return ApiResult.Fail("No VRChat session. Login first.");

        try
        {
            var friends = await _vrchat.Friends.GetFriendsAsync(offset, n, offline);

            // Friends on the VRChat website (not in game) have location "offline" but are listed
            // in the current user's activeFriends. Only needed for the online list.
            HashSet<string>? webFriendIds = null;
            if (!offline)
            {
                try { webFriendIds = (await _vrchat.Authentication.GetCurrentUserAsync()).ActiveFriends?.ToHashSet(); }
                catch (Exception) { /* Fall back to the location check below. */ }
            }

            var result = friends.Select(f => new
            {
                id = f.Id,
                // "online" = in game, "active" = on the website, "offline" = not connected
                state = webFriendIds?.Contains(f.Id) == true ? "active"
                    : !string.IsNullOrEmpty(f.Location) && f.Location != "offline" ? "online"
                    : !offline && webFriendIds == null && f.Location == "offline" ? "active"
                    : "offline",
                platform = f.Platform,
                displayName = f.DisplayName,
                // Send the name ("JoinMe"), not the enum number, so the UI can't misread it
                status = f.Status.ToString(),
                statusDescription = f.StatusDescription,
                bio = f.Bio,
                location = f.Location,
                currentAvatarImageUrl = f.CurrentAvatarImageUrl,
                currentAvatarThumbnailImageUrl = f.CurrentAvatarThumbnailImageUrl,
                lastLogin = f.LastLogin
            });

            return ApiResult.Ok(result);
        }
        catch (Exception ex)
        {
            return ApiResult.Fail(ex.Message);
        }
    }

    public async Task<(bool Success, string? Error, int StatusCode, bool Uncertain)> SendBoopAsync(
        string userId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(userId) || userId.Length > 128 ||
            !System.Text.RegularExpressions.Regex.IsMatch(userId, @"^[a-zA-Z0-9_-]+$"))
            return (false, "Invalid friend ID.", 400, false);
        var client = _vrchat;
        if (client == null)
            return (false, "Sign in to VRChat before sending boops.", 401, false);
        if (!await _boopGate.WaitAsync(0, cancellationToken))
            return (false, "Another boop is being sent. Please wait before trying again.", 429, false);
        try
        {
            await client.Friends.BoopAsync(userId, new BoopRequest(), cancellationToken);
            return (true, null, 200, false);
        }
        catch (ApiException ex) when (ex.ErrorCode == 429)
        {
            return (false, "VRChat is rate-limiting boops. The remaining sends have been stopped.", 429, false);
        }
        catch (ApiException ex) when (ex.ErrorCode == 401)
        {
            return (false, "Your VRChat session expired. Sign in again.", 401, false);
        }
        catch (ApiException ex) when (ex.ErrorCode is 400 or 403 or 404)
        {
            return (false, "VRChat declined this boop. Check friendship, boop settings, or a pending boop.", ex.ErrorCode, false);
        }
        catch (Exception)
        {
            // A transport failure can occur after VRChat accepted the notification. Never retry automatically.
            return (false, "Delivery could not be confirmed. Check VRChat before sending again.", 502, true);
        }
        finally
        {
            await Task.Delay(1000);
            _boopGate.Release();
        }
    }

    /// <summary>POSTs JSON to the VRChat API with the signed-in session, without the SDK's response models.</summary>
    private static async Task<(int Status, string Body)> PostToVrChatAsync(IVRChat client, string path, object body, CancellationToken cancellationToken)
    {
        var basePath = (client.Configuration?.BasePath ?? "https://api.vrchat.cloud/api/1").TrimEnd('/');
        using var message = new HttpRequestMessage(HttpMethod.Post, $"{basePath}/{path}")
        {
            Content = new StringContent(Newtonsoft.Json.JsonConvert.SerializeObject(body), System.Text.Encoding.UTF8, "application/json"),
        };
        var userAgent = client.Configuration?.UserAgent;
        if (!string.IsNullOrWhiteSpace(userAgent) && client.HttpClient.DefaultRequestHeaders.UserAgent.Count == 0)
            message.Headers.TryAddWithoutValidation("User-Agent", userAgent);
        using var response = await client.HttpClient.SendAsync(message, cancellationToken);
        return ((int)response.StatusCode, await response.Content.ReadAsStringAsync(cancellationToken));
    }

    private static async Task<(int Status, string Body)> GetFromVrChatAsync(IVRChat client, string path, CancellationToken cancellationToken)
    {
        var basePath = (client.Configuration?.BasePath ?? "https://api.vrchat.cloud/api/1").TrimEnd('/');
        using var message = new HttpRequestMessage(HttpMethod.Get, $"{basePath}/{path}");
        var userAgent = client.Configuration?.UserAgent;
        if (!string.IsNullOrWhiteSpace(userAgent) && client.HttpClient.DefaultRequestHeaders.UserAgent.Count == 0)
            message.Headers.TryAddWithoutValidation("User-Agent", userAgent);
        using var response = await client.HttpClient.SendAsync(message, cancellationToken);
        return ((int)response.StatusCode, await response.Content.ReadAsStringAsync(cancellationToken));
    }

    private static bool LooksLikeParsingError(string? message) =>
        message != null && System.Text.RegularExpressions.Regex.IsMatch(message,
            "required property|deserializ|Unexpected character|Error converting|Could not convert|JSON", System.Text.RegularExpressions.RegexOptions.IgnoreCase);

    /// <summary>Extracts VRChat's own message from an error body like {"error":{"message":"…","status_code":400}}.</summary>
    private static string? VrChatErrorMessage(object? content)
    {
        var text = content?.ToString();
        if (string.IsNullOrWhiteSpace(text)) return null;
        try
        {
            var json = Newtonsoft.Json.Linq.JToken.Parse(text);
            var message = json.SelectToken("error.message")?.ToString() ?? json.SelectToken("message")?.ToString() ?? json.SelectToken("error")?.ToString();
            if (!string.IsNullOrWhiteSpace(message)) return message.Trim('"');
        }
        catch (Newtonsoft.Json.JsonException) { /* not JSON */ }
        return text.Length > 160 ? text[..160] + "…" : text;
    }

    /// <summary>True for errors raised while reading a VRChat reply (the request itself already succeeded).</summary>
    private static bool IsResponseParsingError(Exception ex)
    {
        for (var e = ex; e != null; e = e.InnerException)
        {
            if (e is Newtonsoft.Json.JsonException or System.Text.Json.JsonException or ArgumentNullException or InvalidDataException)
                return true;
            if (e is ArgumentException && e.Message.Contains("required", StringComparison.OrdinalIgnoreCase))
                return true;
        }
        return false;
    }

    /// <summary>Saved invite / request-invite message slots (VRChat keeps 12 per type).</summary>
    public async Task<ApiResult> GetInviteMessagesAsync(bool request, CancellationToken cancellationToken = default)
    {
        var client = _vrchat;
        if (client == null) return ApiResult.Fail("Sign in to VRChat first.");
        try
        {
            var me = await client.Authentication.GetCurrentUserAsync();
            var messages = await client.Invites.GetInviteMessagesAsync(me.Id, request ? InviteMessageType.Request : InviteMessageType.Message, cancellationToken);
            return ApiResult.Ok(messages.OrderBy(m => m.Slot).Select(m => new
            {
                slot = m.Slot,
                message = m.Message,
                cooldownMinutes = m.RemainingCooldownMinutes,
                canBeUpdated = m.CanBeUpdated,
            }));
        }
        catch (ApiException ex) when (ex.ErrorCode == 401)
        {
            return ApiResult.Fail("Your VRChat session expired. Sign in again.");
        }
        catch (Exception ex)
        {
            return ApiResult.Fail(ex.Message);
        }
    }

    /// <summary>
    /// Invites a friend to the instance you are in (request = false), or asks them to invite you (request = true).
    /// VRChat only sends saved message slots: a custom text reuses a slot that already holds it,
    /// otherwise it rewrites a slot that is off cooldown (each slot can change once per hour).
    /// </summary>
    public async Task<(bool Success, string? Error, int StatusCode, bool Uncertain)> SendInviteAsync(
        string userId, bool request, string? message, int? slot, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(userId) || userId.Length > 128 ||
            !System.Text.RegularExpressions.Regex.IsMatch(userId, @"^[a-zA-Z0-9_-]+$"))
            return (false, "Invalid friend ID.", 400, false);
        message = message?.Trim();
        if (message?.Length > MaxInviteMessageLength)
            return (false, $"Messages are limited to {MaxInviteMessageLength} characters by VRChat.", 400, false);
        if (slot is < 0 or > 11)
            return (false, "Invalid message slot.", 400, false);
        var client = _vrchat;
        if (client == null)
            return (false, "Sign in to VRChat first.", 401, false);
        if (!await _inviteGate.WaitAsync(0, cancellationToken))
            return (false, "Another invite is being sent. Please wait a moment.", 429, false);
        var sending = false;
        try
        {
            var me = await client.Authentication.GetCurrentUserAsync();
            var type = request ? InviteMessageType.Request : InviteMessageType.Message;
            var useSlot = slot ?? 0;

            if (!string.IsNullOrEmpty(message))
            {
                var messages = await client.Invites.GetInviteMessagesAsync(me.Id, type, cancellationToken);
                var same = messages.FirstOrDefault(m => string.Equals(m.Message?.Trim(), message, StringComparison.Ordinal));
                if (same != null)
                {
                    useSlot = same.Slot;
                }
                else
                {
                    var free = messages
                        .Where(m => m.CanBeUpdated && m.RemainingCooldownMinutes <= 0)
                        .OrderByDescending(m => m.Slot)
                        .FirstOrDefault();
                    if (free == null)
                    {
                        var wait = messages.Count == 0 ? 60 : messages.Min(m => m.RemainingCooldownMinutes);
                        return (false, $"VRChat lets each saved message change once an hour and all 12 were changed recently. Pick a saved message, or try again in {wait} min.", 429, false);
                    }
                    await client.Invites.UpdateInviteMessageAsync(me.Id, type, free.Slot, new UpdateInviteMessageRequest(message), cancellationToken);
                    useSlot = free.Slot;
                }
            }

            int status;
            string reply;
            if (request)
            {
                sending = true;
                // Sent directly (same session/cookies) so VRChat's real status and reason are visible
                // and an unexpected reply format can't turn a delivered request into an error.
                (status, reply) = await PostToVrChatAsync(client, $"requestInvite/{Uri.EscapeDataString(userId)}", new { requestSlot = useSlot }, cancellationToken);
            }
            else
            {
                var world = me.Presence?.World;
                var instance = me.Presence?.Instance;
                if (string.IsNullOrEmpty(world) || !world.StartsWith("wrld_") || string.IsNullOrEmpty(instance) || instance == "offline")
                    return (false, "Join a world in VRChat first: an invite brings your friend to the instance you're in.", 409, false);
                var location = instance.StartsWith("wrld_") ? instance : $"{world}:{instance}";
                sending = true;
                (status, reply) = await PostToVrChatAsync(client, $"invite/{Uri.EscapeDataString(userId)}", new { instanceId = location, messageSlot = useSlot }, cancellationToken);
            }

            var kind = request ? "request" : "invite";
            if (status is >= 200 and < 300) return (true, null, 200, false);
            var reason = VrChatErrorMessage(reply) ?? "no reason given";
            _logger?.LogWarning("VRChat {Kind} to {UserId} returned HTTP {Code}: {Reply}", kind, userId, status, reply);
            return status switch
            {
                401 => (false, "Your VRChat session expired. Sign in again.", 401, false),
                429 => (false, "VRChat is rate-limiting invites. Wait a minute before trying again.", 429, false),
                >= 500 => (false, $"VRChat's servers had a problem ({status}: {reason}). Check VRChat before sending again.", 502, true),
                _ => (false, $"VRChat refused the {kind} ({status}): {reason}", status, false),
            };
        }
        catch (ApiException ex) when (ex.ErrorCode == 429)
        {
            return (false, "VRChat is rate-limiting invites. Wait a minute before trying again.", 429, false);
        }
        catch (ApiException ex) when (ex.ErrorCode == 401)
        {
            return (false, "Your VRChat session expired. Sign in again.", 401, false);
        }
        catch (ApiException ex) when (ex.ErrorCode is 400 or 403 or 404)
        {
            var why = VrChatErrorMessage(ex.ErrorContent);
            _logger?.LogWarning("VRChat declined the {Kind} to {UserId}: HTTP {Code} {Reason}", request ? "request" : "invite", userId, ex.ErrorCode, why);
            return (false, (request
                ? "VRChat declined the request. Your friend may be offline, private, or not accepting requests."
                : "VRChat declined the invite. Check that you're friends and in a world they can join.")
                + (why != null ? $" (VRChat: {why})" : ""), ex.ErrorCode, false);
        }
        catch (ApiException ex)
        {
            var kind = request ? "request" : "invite";
            _logger?.LogWarning("VRChat {Kind} to {UserId} failed: HTTP {Code} {Message}", kind, userId, ex.ErrorCode, ex.Message);
            // Code 0 + a parsing problem: VRChat answered 2xx, only its reply couldn't be read → delivered.
            if (sending && (ex.ErrorCode is >= 200 and < 300 || (ex.ErrorCode == 0 && LooksLikeParsingError(ex.Message))))
                return (true, null, 200, false);
            if (ex.ErrorCode == 0)
                return (false, $"Could not reach VRChat to send the {kind}. Check your connection, then check VRChat before sending again.", 502, sending);
            var reason = VrChatErrorMessage(ex.ErrorContent) ?? "no reason given";
            return (false, ex.ErrorCode >= 500
                ? $"VRChat's servers had a problem ({ex.ErrorCode}: {reason}). Check VRChat before sending again."
                : $"VRChat refused the {kind} ({ex.ErrorCode}): {reason}", ex.ErrorCode >= 500 ? 502 : ex.ErrorCode, ex.ErrorCode >= 500);
        }
        catch (Exception ex) when (sending && IsResponseParsingError(ex))
        {
            // VRChat accepted the request (2xx) but its reply didn't match the library's model
            // (e.g. a "required" field missing). The invite/request was delivered.
            _logger?.LogInformation("VRChat accepted the {Kind} to {UserId}; its response could not be parsed: {Error}",
                request ? "invite request" : "invite", userId, ex.Message);
            return (true, null, 200, false);
        }
        catch (Exception ex)
        {
            _logger?.LogWarning(ex, "{Kind} to {UserId} failed unexpectedly", request ? "Invite request" : "Invite", userId);
            // A transport failure can happen after VRChat accepted it: never retry automatically.
            return (false, sending
                ? $"Delivery could not be confirmed ({ex.GetType().Name}). Check VRChat before sending again."
                : $"Could not prepare the {(request ? "request" : "invite")}: {ex.GetType().Name}: {ex.Message}", 502, sending);
        }
        finally
        {
            await Task.Delay(1000);
            _inviteGate.Release();
        }
    }

    public async Task<ApiResult> GetAppNotificationsAsync(CancellationToken cancellationToken = default)
    {
        var client = _vrchat;
        if (client == null) return ApiResult.Fail("Sign in to VRChat to load notifications.");
        var items = new System.Collections.Concurrent.ConcurrentBag<object>();
        var warnings = new System.Collections.Concurrent.ConcurrentBag<string>();
        async Task Legacy()
        {
            try
            {
                var notifications = await client.Notifications.GetNotificationsAsync(n: 100, cancellationToken: cancellationToken);
                foreach (var n in notifications) items.Add(new
                {
                    id = n.Id, feed = "v1", type = Newtonsoft.Json.JsonConvert.SerializeObject(n.Type).Trim('"'),
                    message = n.Message, senderId = n.SenderUserId, senderName = n.SenderUsername,
                    createdAt = n.CreatedAt, seen = n.Seen, details = n.Details
                });
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                // The browser cancelled the request (page refresh, navigation…). Nothing to report.
                return;
            }
            catch (Exception) { warnings.Add("Friend notifications could not be loaded. Sign in or refresh to retry."); }
        }
        async Task Modern()
        {
            try
            {
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                timeout.CancelAfter(TimeSpan.FromSeconds(20));
                // Reuse the SDK's authenticated HttpClient/cookie container, but not its strict generated models.
                using var request = new HttpRequestMessage(HttpMethod.Get, "https://api.vrchat.cloud/api/1/notifications?limit=100");
                request.Headers.TryAddWithoutValidation("User-Agent", client.Configuration.UserAgent);
                using var response = await client.HttpClient.SendAsync(request, timeout.Token);
                if (!response.IsSuccessStatusCode)
                {
                    warnings.Add(response.StatusCode == HttpStatusCode.Unauthorized
                        ? "Your VRChat session expired. Sign in again to load group notifications."
                        : response.StatusCode == HttpStatusCode.TooManyRequests
                            ? "VRChat is rate-limiting notifications. Wait before refreshing."
                            : $"Group notifications are temporarily unavailable (VRChat HTTP {(int)response.StatusCode}).");
                    return;
                }
                var parsed = NotificationFeedParser.ParseModern(await response.Content.ReadAsStringAsync(timeout.Token));
                foreach (var item in parsed.Items) items.Add(item);
                if (parsed.Skipped > 0) warnings.Add($"{parsed.Skipped} malformed notifications were skipped. Other notifications remain available.");
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                // The browser cancelled the request (page refresh, navigation…). Nothing to report.
                return;
            }
            catch (System.Text.Json.JsonException) { warnings.Add("VRChat returned an unexpected notification format. Other notifications remain available."); }
            catch (Exception) { warnings.Add("Could not reach the group notification feed. Check your connection and retry."); }
        }        await Task.WhenAll(Legacy(), Modern());
        if (items.IsEmpty && warnings.Count >= 2) return ApiResult.Fail("VRChat notifications are unavailable. Check your session and retry.");
        return ApiResult.Ok(new { items = items.ToArray(), warnings = warnings.ToArray() });
    }
    public async Task<ApiResult> GetWorldDetailsAsync(string worldId, CancellationToken cancellationToken = default)
    {
        if (!worldId.StartsWith("wrld_", StringComparison.Ordinal) ||
            !Guid.TryParseExact(worldId[5..], "D", out _))
            return ApiResult.Fail("Invalid VRChat world ID.");

        if (_vrchat == null)
            return ApiResult.Fail("No VRChat session. Login first.");

        try
        {
            var world = await _vrchat.Worlds.GetWorldAsync(worldId, cancellationToken);
            return ApiResult.Ok(new
            {
                id = world.Id,
                name = world.Name,
                thumbnailImageUrl = world.ThumbnailImageUrl,
                imageUrl = world.ImageUrl
            });
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // The browser cancelled the request (page refresh, navigation…). Nothing to report.
            return ApiResult.Fail("Request cancelled.");
        }
        catch (Exception)
        {
            return ApiResult.Fail("World details are unavailable. Check your VRChat session and world access.");
        }
    }

    /// <summary>Live head-count of one instance (everyone in it, not only friends).</summary>
    public async Task<ApiResult> GetInstanceDetailsAsync(string worldId, string instanceId, CancellationToken cancellationToken = default)
    {
        if (!worldId.StartsWith("wrld_", StringComparison.Ordinal) ||
            !Guid.TryParseExact(worldId[5..], "D", out _))
            return ApiResult.Fail("Invalid VRChat world ID.");
        // Only the characters VRChat uses in instance IDs, e.g. 12345~group(grp_…)~groupAccessType(public)~region(jp)
        if (string.IsNullOrWhiteSpace(instanceId) || instanceId.Length > 512 ||
            !System.Text.RegularExpressions.Regex.IsMatch(instanceId, @"^[A-Za-z0-9~()_:.\-]+$"))
            return ApiResult.Fail("Invalid VRChat instance ID.");

        if (_vrchat == null)
            return ApiResult.Fail("No VRChat session. Login first.");

        try
        {
            // Not the SDK's GetInstanceAsync: it percent-encodes "(" and ")" and VRChat's firewall rejects that
            // with 400 "malformed url". The ID is validated above, so it is sent as-is.
            var (status, body) = await GetFromVrChatAsync(_vrchat, $"instances/{worldId}:{instanceId}", cancellationToken);
            if (status is < 200 or >= 300)
            {
                Console.Error.WriteLine($"[instance] {worldId}:{instanceId} failed: HTTP {status} {body}");
                return ApiResult.Fail(status == 401
                    ? "Your VRChat session expired. Sign in again."
                    : $"Instance details are unavailable ({VrChatErrorMessage(body) ?? $"HTTP {status}"}).");
            }

            var instance = Newtonsoft.Json.Linq.JObject.Parse(body);
            static int ReadInt(Newtonsoft.Json.Linq.JToken? token) =>
                token?.Type == Newtonsoft.Json.Linq.JTokenType.Integer ? (int)token : 0;
            return ApiResult.Ok(new
            {
                worldId,
                instanceId,
                // userCount is the live number of players; n_users is an older field kept as a fallback
                userCount = Math.Max(ReadInt(instance["userCount"]), ReadInt(instance["n_users"])),
                capacity = ReadInt(instance["capacity"]),
                full = instance["full"]?.Type == Newtonsoft.Json.Linq.JTokenType.Boolean && (bool)instance["full"]!
            });
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // The browser cancelled the request (page refresh, navigation…). Nothing to report.
            return ApiResult.Fail("Request cancelled.");
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[instance] {worldId}:{instanceId} failed: {ex.GetType().Name}: {ex.Message}");
            return ApiResult.Fail("Instance details are unavailable. You may not have access to this instance.");
        }
    }

    public async Task<ApiResult> UploadImageToDatabaseAsync(IFormFile file, Guid id)
    {
        if (_db == null)
            return ApiResult.Fail("Database not available.");

        if (file == null || file.Length == 0)
            return ApiResult.Fail("No file uploaded.");

        var allowedTypes = new[] { "image/jpeg", "image/png", "image/webp" };
        if (!allowedTypes.Contains(file.ContentType))
            return ApiResult.Fail("Invalid file type.");

        try
        {
            byte[] fileBytes;
            using (var memoryStream = new MemoryStream())
            {
                await file.CopyToAsync(memoryStream);
                fileBytes = memoryStream.ToArray();
            }

            var image = new UploadedImage
            {
                Id = id,
                FileName = file.FileName,
                ContentType = file.ContentType,
                Data = fileBytes,
                CreatedAtUtc = DateTime.UtcNow
            };

            _db.UploadedImages.Add(image);
            await _db.SaveChangesAsync();

            return ApiResult.Ok(new
            {
                id = image.Id,
                fileName = image.FileName,
                contentType = image.ContentType
            });
        }
        catch (Exception ex)
        {
            return ApiResult.Fail(ex.Message);
        }
    }

    [HttpGet("image/{id:guid}")]
    public async Task<ApiResult> GetImage(Guid id)
    {
        var image = await _db.UploadedImages.FirstOrDefaultAsync(x => x.Id == id);

        if (image == null)
            return ApiResult.Fail("");

        return File(image.Data, image.ContentType, image.FileName);
    }

    private ApiResult File(byte[] data, string contentType, string fileName)
    {
        return File(data ,contentType,fileName);
    }
}





public class ApiResult
{
    public bool Success { get; set; }
    public string? Error { get; set; }
    public object? Data { get; set; }
    public List<string>? RequiresTwoFactorAuth { get; set; }

    public static ApiResult Ok(object? data) =>
        new ApiResult
        {
            Success = true,
            Data = data
        };

    public static ApiResult Fail(string error, List<string>? requiresTwoFactorAuth = null) =>
        new ApiResult
        {
            Success = false,
            Error = error,
            RequiresTwoFactorAuth = requiresTwoFactorAuth
        };
}











