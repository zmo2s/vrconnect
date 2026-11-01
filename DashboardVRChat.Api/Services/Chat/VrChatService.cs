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
                .WithApplication(name: "DashboardVRChat", version: "1.0.0", contact: "your-email@example.com")
                .WithAuthCookie(saved.Auth, saved.TwoFactor).Build();
            _vrchat.Client.SerializerSettings.ContractResolver = new VrChatContractResolver();
        }
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
                .WithApplication(name: "DashboardVRChat", version: "1.0.0", contact: "your-email@example.com")
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
            return ApiResult.Fail(ex.ErrorCode == 401 ? "Invalid VRChat username or password." : ex.ErrorCode == 429 ? "Too many login attempts. Please wait before trying again." : "VRChat could not complete the login. Please try again.");
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

    [HttpGet("friends")]
    public async Task<ApiResult> GetFriendsAsync(int offset = 0, int n = 100, bool offline = false)
    {
        if (_vrchat == null)
            return ApiResult.Fail("No VRChat session. Login first.");

        try
        {
            var friends = await _vrchat.Friends.GetFriendsAsync(offset, n, offline);

            var result = friends.Select(f => new
            {
                id = f.Id,
                displayName = f.DisplayName,
                status = f.Status,
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
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
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
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
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
            throw;
        }
        catch (Exception)
        {
            return ApiResult.Fail("World details are unavailable. Check your VRChat session and world access.");
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











