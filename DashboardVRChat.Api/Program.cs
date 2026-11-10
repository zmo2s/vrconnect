using Microsoft.AspNetCore.DataProtection;
using DashboardVRChat.Api;
using DashboardVRChat.Api.Services.Auth;
using DashboardVRChat.Api.Services.ChatService;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

// VRChat asks API clients to identify themselves with a contact (sent in the User-Agent).
VrChatSessionService.Contact = builder.Configuration["VRChat:Contact"]
    ?? Environment.GetEnvironmentVariable("VRCHAT_CONTACT")
    ?? "";

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddMemoryCache();
builder.Services.AddDataProtection()
    .SetApplicationName("DashboardVRChat")
    .PersistKeysToFileSystem(new System.IO.DirectoryInfo(
        System.IO.Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "VRChatDashboard", "keys")));
builder.Services.AddSingleton<VrChatSessionStore>();
builder.Services.AddHttpContextAccessor();
// Each browser keeps its own VRChat client and pending verification cookies.
builder.Services.AddScoped<VrChatSessionService>(services =>
{
    var context = services.GetRequiredService<IHttpContextAccessor>().HttpContext!;
    var cache = services.GetRequiredService<Microsoft.Extensions.Caching.Memory.IMemoryCache>();
    const string cookieName = "vrchat-session";
    const string sessionHeader = "X-VRChat-Session";
    // Explicit tab sessions also work when cross-site cookies are blocked.
    var key = context.Request.Headers[sessionHeader].FirstOrDefault()
        ?? context.Request.Cookies[cookieName];
    if (key != null && cache.TryGetValue(key, out object? existing) && existing is VrChatSessionService session)
    {
        services.GetRequiredService<ILogger<VrChatSessionService>>()
            .LogInformation("Reused VRChat instance {InstanceId} for {Path}", session.DiagnosticId, context.Request.Path);
        context.Response.Headers[sessionHeader] = key;
        context.Response.Headers.CacheControl = "no-store";
        if (session.IsLoggedIn) OverlayAccess.Remember(key);
        return session;
    }
    var store = services.GetRequiredService<VrChatSessionStore>();
    var saved = key != null ? store.Read(key) : null;
    if (saved == null)
        key = Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32));
    else
        OverlayAccess.Remember(key!);
    var logger = services.GetRequiredService<ILogger<VrChatSessionService>>();
    var created = new VrChatSessionService(logger, store, key!, saved);
    logger.LogInformation("Created VRChat instance {InstanceId} for {Path}; session supplied: {Supplied}", created.DiagnosticId, context.Request.Path, !string.IsNullOrEmpty(key));
    using (var entry = cache.CreateEntry(key))
    {
        entry.Value = created;
        entry.SlidingExpiration = TimeSpan.FromMinutes(30);
        entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(12);
    }
    context.Response.Cookies.Append(cookieName, key, new CookieOptions
    {
        HttpOnly = true, Secure = true, SameSite = SameSiteMode.None,
        Path = "/", IsEssential = true, MaxAge = TimeSpan.FromDays(30)
    });
    context.Response.Headers[sessionHeader] = key;
    context.Response.Headers.CacheControl = "no-store";
    return created;
});

builder.Services.AddCors(options =>
{
    options.AddPolicy("react", policy =>
    {
        policy
            .WithOrigins("http://localhost:5173", "http://localhost:8080", "http://127.0.0.1:8080", "http://localhost:8082", "http://127.0.0.1:8082")
            .WithExposedHeaders("X-VRChat-Session")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});


// PostgreSQL/DbContext disabled - not needed for VRChat-only features
// builder.Services.AddDbContext<ChatDbContext>(options =>
//     options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));
var jwtSettings = builder.Configuration.GetSection("Jwt");

// No setup needed: when appsettings.json still has the example key (or none), sign with a random
// key for this run. Nothing issues tokens while the database is off, so nothing is lost on restart.
var jwtKey = jwtSettings["Key"];
if (string.IsNullOrWhiteSpace(jwtKey) || jwtKey.StartsWith("REPLACE_", StringComparison.Ordinal) || jwtKey.Length < 32)
    jwtSettings["Key"] = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(48));

// Identity disabled - requires PostgreSQL
// builder.Services.AddIdentity<AppUser, IdentityRole<Guid>>(options => { ... })
//     .AddEntityFrameworkStores<ChatDbContext>().AddDefaultTokenProviders();
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = false,
            ValidateAudience = false,
            ValidateIssuerSigningKey = true,
            ValidateLifetime = true,

            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(jwtSettings["Key"]))
        };
        // only signalR

      /*  options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                var path = context.HttpContext.Request.Path;

                if (!string.IsNullOrEmpty(accessToken) &&
                    (path.StartsWithSegments("/chatHub") ||
                     path.StartsWithSegments("/chatHubPrivate")))
                {
                    context.Token = accessToken;
                }

                return Task.CompletedTask;
            }
        };*/
    });


builder.Services.AddSignalR(options =>
{
    options.EnableDetailedErrors = true;
});

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
//builder.Services.AddSwaggerGen();


builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "DashboardVRChat API",
        Version = "v1"
    });

    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Enter your JWT token"
    });

    c.AddSecurityRequirement(document => new() { [new OpenApiSecuritySchemeReference("Bearer", document)] = [] });


});
builder.Services.AddAuthorization();

var app = builder.Build();
app.UseDeveloperExceptionPage();

app.UseSwagger();
app.UseSwaggerUI();

app.UseRouting();
app.UseCors("react");

app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/", () => "DashboardVRChat API is running");

// Local SteamVR overlay (Overlay project): hands it the session key the dashboard is using.
OverlayAccess.WriteToken();
app.MapGet("/overlay/session", (HttpContext context) =>
{
    if (!OverlayAccess.IsAllowed(context)) return Results.StatusCode(StatusCodes.Status403Forbidden);
    context.Response.Headers.CacheControl = "no-store";
    return OverlayAccess.LastSessionKey is { } key
        ? Results.Ok(new { sessionKey = key })
        : Results.NotFound(new { error = "Open the dashboard and sign in to VRChat first." });
});

app.MapPost("/vrchat/resume", async (VrChatSessionService service) =>
{
    var result = await service.ResumeAsync();
    return result.Success ? Results.Ok(result) : Results.BadRequest(result);
});

app.MapPost("/vrchat/logout", (VrChatSessionService service) => service.ForgetAsync());

app.MapPost("/vrchat/login", async (
    LoginRequest request,
    VrChatSessionService service) =>
{
    var result = await service.LoginAsync(request.Username, request.Password);
    return result.Success ? Results.Ok(result) : Results.BadRequest(result);
});

app.MapPost("/vrchat/2fa/totp", async (
    TwoFactorRequest request,
    VrChatSessionService service) =>
{
    var result = await service.VerifyTotpAsync(request.Code);
    return result.Success ? Results.Ok(result) : Results.BadRequest(result);
});

app.MapPost("/vrchat/2fa/email", async (
    TwoFactorRequest request,
    VrChatSessionService service) =>
{
    var result = await service.VerifyEmailOtpAsync(request.Code);
    return result.Success ? Results.Ok(result) : Results.BadRequest(result);
});

app.MapGet("/vrchat/me", async (VrChatSessionService service) =>
{
    var result = await service.GetCurrentUserInfoAsync();
    return result.Success ? Results.Ok(result) : Results.BadRequest(result);
});

// Your VRChat favorite-friend groups, for importing into the dashboard's groups
app.MapGet("/vrchat/favorites/friend-groups", async (VrChatSessionService service, CancellationToken cancellationToken) =>
{
    var result = await service.GetFavoriteFriendGroupsAsync(cancellationToken);
    return result.Success ? Results.Ok(result) : Results.BadRequest(result);
});

// Change your own status / status message. Body: { "status": "joinme", "statusDescription": "..." }
app.MapPost("/vrchat/me/status", async (StatusUpdateDto body, VrChatSessionService service, CancellationToken cancellationToken) =>
{
    var result = await service.UpdateMyStatusAsync(body.Status, body.StatusDescription, cancellationToken);
    return result.Success ? Results.Ok(result) : Results.BadRequest(result);
});

app.MapGet("/vrchat/getfriendlist/offset={offset}/n={n}/online={online}", async (VrChatSessionService service, int offset = 0,
    int n = 100,
    bool offline = false) =>
{
    var result = await service.GetFriendsAsync(offset,n,offline);
    return result.Success ? Results.Ok(result) : Results.BadRequest(result);
});

app.MapGet("/vrchat/notifications", async (VrChatSessionService service, CancellationToken cancellationToken) =>
{
    var result = await service.GetAppNotificationsAsync(cancellationToken);
    return result.Success ? Results.Ok(result) : Results.BadRequest(result);
});

app.MapPost("/vrchat/friends/{userId}/boop", async (
    string userId, VrChatSessionService service, CancellationToken cancellationToken) =>
{
    var result = await service.SendBoopAsync(userId, cancellationToken);
    return Results.Json(new { success = result.Success, error = result.Error, uncertain = result.Uncertain },
        statusCode: result.StatusCode);
});

// Invite a friend to the instance you are currently in. Body (optional): { "message": "...", "slot": 0-11 }
app.MapPost("/vrchat/friends/{userId}/invite", async (
    string userId, InviteSendDto? body, VrChatSessionService service, CancellationToken cancellationToken) =>
{
    // "request": true is still accepted here for older clients.
    var result = await service.SendInviteAsync(userId, body?.Request == true, body?.Message, body?.Slot, cancellationToken);
    return Results.Json(new { success = result.Success, error = result.Error, uncertain = result.Uncertain },
        statusCode: result.StatusCode);
});

// Ask a friend to invite you to where they are. Body (optional): { "message": "...", "slot": 0-11 }
app.MapPost("/vrchat/friends/{userId}/request-invite", async (
    string userId, InviteSendDto? body, VrChatSessionService service, CancellationToken cancellationToken) =>
{
    var result = await service.SendInviteAsync(userId, true, body?.Message, body?.Slot, cancellationToken);
    return Results.Json(new { success = result.Success, error = result.Error, uncertain = result.Uncertain },
        statusCode: result.StatusCode);
});

// Send yourself an invite to an instance (shows up in your in-game notifications). Used by the SteamVR overlay.
app.MapPost("/vrchat/invite-myself", async (
    string worldId, string instanceId, VrChatSessionService service, CancellationToken cancellationToken) =>
{
    var result = await service.InviteMyselfAsync(worldId, instanceId, cancellationToken);
    return Results.Json(new { success = result.Success, error = result.Error, uncertain = result.Uncertain },
        statusCode: result.StatusCode);
});

// Your saved VRChat messages. ?type=invite (default) or ?type=request  (?request=true also works)
app.MapGet("/vrchat/invite-messages", async (string? type, bool? request, VrChatSessionService service, CancellationToken cancellationToken) =>
{
    var isRequest = request == true || string.Equals(type, "request", StringComparison.OrdinalIgnoreCase);
    var result = await service.GetInviteMessagesAsync(isRequest, cancellationToken);
    return result.Success ? Results.Ok(result) : Results.BadRequest(result);
});

app.MapGet("/vrchat/worlds/{worldId}", async (
    string worldId, VrChatSessionService service, CancellationToken cancellationToken) =>
{
    var result = await service.GetWorldDetailsAsync(worldId, cancellationToken);
    return result.Success ? Results.Ok(result) : Results.BadRequest(result);
});

app.MapGet("/vrchat/instance", async (
    string worldId, string instanceId, VrChatSessionService service, CancellationToken cancellationToken) =>
{
    var result = await service.GetInstanceDetailsAsync(worldId, instanceId, cancellationToken);
    return result.Success ? Results.Ok(result) : Results.BadRequest(result);
});

app.MapGet("/vrchat/getPictureById/file={file}/id={id}", async (IFormFile file,Guid id,VrChatSessionService service) =>
{
    var result = await service.UploadImageToDatabaseAsync(file,id);
    return result.Success ? Results.Ok(result) : Results.BadRequest(result);
});

app.MapGet("/vrchat/postPicture/{id}", async (Guid id, VrChatSessionService service) =>
{
    IResult result = Results.Ok(service.GetImage(id));
    return  result;
});




// app.MapHub<PrivateChatHub>("/chatHubPrivate"); // requires PostgreSQL
// app.MapHub<ChatHub>("/chatHub"); // requires PostgreSQL
// app.MapControllers(); // AuthController requires PostgreSQL

app.Run();

/// <summary>Body of POST /vrchat/friends/{userId}/invite and /request-invite (all fields optional).</summary>
public record StatusUpdateDto(string? Status = null, string? StatusDescription = null);
public record InviteSendDto(bool Request = false, string? Message = null, int? Slot = null);


record LoginRequest(string Username, string Password);
record TwoFactorRequest(string Code);







