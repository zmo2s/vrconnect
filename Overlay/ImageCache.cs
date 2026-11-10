using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using SkiaSharp;

namespace VrConnect.Overlay;

/// <summary>
/// Avatar and world pictures: downloaded once, kept in %LOCALAPPDATA%\VRChatDashboard\overlay-images and in memory.
/// Drawing never waits on the network: <see cref="Get"/> only returns what is already loaded.
/// </summary>
public sealed class ImageCache : IDisposable
{
    private static readonly string Folder = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "VRChatDashboard", "overlay-images");
    private static readonly TimeSpan RetryAfter = TimeSpan.FromMinutes(10);

    private readonly ConcurrentDictionary<string, SKImage> _loaded = new();
    private readonly ConcurrentDictionary<string, DateTimeOffset> _failed = new();
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(10) };

    public ImageCache()
    {
        // VRChat rejects requests without a User-Agent
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("vrconnect-overlay/1.0");
        Directory.CreateDirectory(Folder);
    }

    /// <summary>Last download error per host, for --preview diagnostics.</summary>
    public ConcurrentDictionary<string, string> LastErrors { get; } = new();

    public SKImage? Get(string? url) => url != null && _loaded.TryGetValue(url, out var image) ? image : null;

    /// <summary>Loads the given pictures (from disk, else the network), 4 at a time, giving up after <paramref name="budget"/>.</summary>
    public async Task PrefetchAsync(IEnumerable<string?> urls, TimeSpan budget, CancellationToken cancellationToken)
    {
        var wanted = urls.OfType<string>().Distinct()
            .Where(url => !_loaded.ContainsKey(url) && !(_failed.TryGetValue(url, out var at) && DateTimeOffset.Now - at < RetryAfter))
            .ToList();
        if (wanted.Count == 0) return;
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(budget);
        try
        {
            await Parallel.ForEachAsync(wanted, new ParallelOptions { MaxDegreeOfParallelism = 4, CancellationToken = timeout.Token },
                async (url, token) => await LoadAsync(url, token));
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested) { /* the rest shows up next refresh */ }
    }

    private async Task LoadAsync(string url, CancellationToken cancellationToken)
    {
        // Only pictures VRChat points to over HTTPS
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps) { _failed[url] = DateTimeOffset.Now; return; }
        var file = Path.Combine(Folder, Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(url)))[..32] + ".img");
        try
        {
            byte[] bytes;
            if (File.Exists(file)) bytes = await File.ReadAllBytesAsync(file, cancellationToken);
            else
            {
                bytes = await _http.GetByteArrayAsync(uri, cancellationToken);
                if (bytes.Length > 5_000_000) throw new InvalidDataException("Picture too large");
            }
            // Decode small: avatars are drawn at ~40 px and worlds at ~600 px, no need to keep 1024 px images around
            using var data = SKData.CreateCopy(bytes);
            using var codec = SKCodec.Create(data) ?? throw new InvalidDataException("Not a picture");
            using var full = SKBitmap.Decode(codec) ?? throw new InvalidDataException("Not a picture");
            var scale = Math.Min(1f, 640f / Math.Max(full.Width, full.Height));
            using var small = scale < 1 ? full.Resize(new SKImageInfo((int)(full.Width * scale), (int)(full.Height * scale)), new SKSamplingOptions(SKFilterMode.Linear)) : full.Copy();
            _loaded[url] = SKImage.FromBitmap(small);
            if (!File.Exists(file)) await File.WriteAllBytesAsync(file, bytes, cancellationToken);
        }
        catch (Exception ex) when (ex is HttpRequestException or InvalidDataException or IOException or TaskCanceledException && !cancellationToken.IsCancellationRequested)
        {
            _failed[url] = DateTimeOffset.Now;
            LastErrors[uri.Host] = ex is HttpRequestException { StatusCode: { } status } ? $"HTTP {(int)status}" : ex.GetType().Name;
        }
    }

    public void Dispose()
    {
        _http.Dispose();
        foreach (var image in _loaded.Values) image.Dispose();
    }
}
