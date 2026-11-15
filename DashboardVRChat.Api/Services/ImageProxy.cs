using System.Net;
using DashboardVRChat.Api.Services.ChatService;
using Microsoft.Extensions.Caching.Memory;

namespace DashboardVRChat.Api.Services;

/// <summary>
/// Serves VRChat images (world thumbnails…) from this local API so the dashboard can draw them in WebGL.
/// VRChat's image servers send no CORS headers, and WebGL refuses textures without them; a plain &lt;img&gt; doesn't care.
/// Only VRChat hosts can be requested, so this can't be used to reach other sites or this PC's network.
/// </summary>
public static class ImageProxy
{
    private const int MaxBytes = 10 * 1024 * 1024;
    private const int MaxRedirects = 5;
    private static readonly HttpClient Http = new(new SocketsHttpHandler
    {
        AllowAutoRedirect = false, // each redirect is checked against the allow-list below
        ConnectTimeout = TimeSpan.FromSeconds(10),
    }) { Timeout = TimeSpan.FromSeconds(20) };

    /// <summary>Where a request may start: VRChat's API and file hosts.</summary>
    private static bool IsVrChatHost(string host) =>
        host is "vrchat.cloud" or "vrchat.com" || host.EndsWith(".vrchat.cloud", StringComparison.OrdinalIgnoreCase) || host.EndsWith(".vrchat.com", StringComparison.OrdinalIgnoreCase);

    /// <summary>Where VRChat may redirect to: its own hosts and the storage / CDN behind them.</summary>
    private static bool IsAllowedRedirect(string host) =>
        IsVrChatHost(host) || host.EndsWith(".amazonaws.com", StringComparison.OrdinalIgnoreCase) || host.EndsWith(".cloudfront.net", StringComparison.OrdinalIgnoreCase);

    private static bool IsSafe(Uri uri, bool first) =>
        uri.Scheme == Uri.UriSchemeHttps && uri.IsDefaultPort && !IPAddress.TryParse(uri.Host, out _)
        && (first ? IsVrChatHost(uri.Host) : IsAllowedRedirect(uri.Host));

    private sealed record CachedImage(byte[] Bytes, string ContentType);

    public static void MapImageProxy(this WebApplication app)
    {
        app.MapGet("/vrchat/image-proxy", async (string url, IMemoryCache cache, HttpContext context, CancellationToken ct) =>
        {
            if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || !IsSafe(uri, first: true))
                return Results.BadRequest(new { error = "Only VRChat image addresses can be loaded." });

            var cacheKey = "image-proxy:" + uri.AbsoluteUri;
            if (!cache.TryGetValue(cacheKey, out CachedImage? image) || image == null)
            {
                try { image = await DownloadAsync(uri, ct); }
                catch (OperationCanceledException) when (!ct.IsCancellationRequested) { return Results.StatusCode(StatusCodes.Status504GatewayTimeout); }
                catch (HttpRequestException) { image = null; }
                if (image == null) return Results.StatusCode(StatusCodes.Status502BadGateway);
                cache.Set(cacheKey, image, new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(1), Size = null });
            }
            context.Response.Headers.CacheControl = "private, max-age=3600";
            return Results.Bytes(image.Bytes, image.ContentType);
        });
    }

    private static async Task<CachedImage?> DownloadAsync(Uri uri, CancellationToken ct)
    {
        for (var hop = 0; hop <= MaxRedirects; hop++)
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, uri);
            request.Headers.TryAddWithoutValidation("User-Agent", AppIdentity.UserAgent);
            using var response = await Http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);

            if ((int)response.StatusCode is >= 300 and < 400 && response.Headers.Location is { } location)
            {
                var next = location.IsAbsoluteUri ? location : new Uri(uri, location);
                if (!IsSafe(next, first: false)) return null;
                uri = next;
                continue;
            }
            if (!response.IsSuccessStatusCode) return null;
            var type = response.Content.Headers.ContentType?.MediaType ?? "";
            if (!type.StartsWith("image/", StringComparison.OrdinalIgnoreCase) || type.Contains("svg", StringComparison.OrdinalIgnoreCase)) return null;
            if (response.Content.Headers.ContentLength > MaxBytes) return null;

            await using var stream = await response.Content.ReadAsStreamAsync(ct);
            using var buffer = new MemoryStream();
            var chunk = new byte[81920];
            int read;
            while ((read = await stream.ReadAsync(chunk, ct)) > 0)
            {
                if (buffer.Length + read > MaxBytes) return null;
                buffer.Write(chunk, 0, read);
            }
            return new CachedImage(buffer.ToArray(), type);
        }
        return null;
    }
}
