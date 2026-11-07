using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace VrConnect.Overlay;

/// <summary>
/// Reads friends, world names and instance head-counts from the local DashboardVRChat.Api.
/// The VRChat session comes from the dashboard itself: the API writes a token file at startup and
/// GET /overlay/session returns the key of the session the dashboard is using.
/// </summary>
public sealed class DashboardClient(string baseUrl = "http://localhost:5000") : IDisposable
{
    private static readonly string TokenPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "VRChatDashboard", "overlay-token");

    private readonly HttpClient _http = new() { BaseAddress = new Uri(baseUrl), Timeout = TimeSpan.FromSeconds(15) };
    private readonly Dictionary<string, string> _worldNames = new();
    private readonly Dictionary<string, (int? People, int? Capacity, DateTimeOffset At)> _instances = new();
    private string? _sessionKey;

    public async Task<OverlayState> LoadAsync(CancellationToken cancellationToken)
    {
        try
        {
            if (_sessionKey == null && await FetchSessionKeyAsync(cancellationToken) is { } problem)
                return OverlayState.Failed(problem);

            var friends = await GetFriendsAsync(cancellationToken);
            if (friends == null)
            {
                // The session may have expired or the API restarted: ask for it again next time.
                _sessionKey = null;
                return OverlayState.Failed("Could not read your friends. Open the dashboard and check you are signed in.");
            }

            // Name the worlds friends are in (cached: names don't change)
            foreach (var worldId in friends.Select(friend => friend.Instance?.WorldId).OfType<string>().Distinct().Where(id => !_worldNames.ContainsKey(id)).Take(12))
                _worldNames[worldId] = await GetWorldNameAsync(worldId, cancellationToken) ?? "Unknown world";
            friends = friends.Select(friend => friend.Instance is { } instance && _worldNames.TryGetValue(instance.WorldId, out var name) ? friend with { WorldName = name } : friend).ToList();

            var places = friends.Where(friend => friend.Instance != null)
                .GroupBy(friend => friend.Location!)
                .Select(group =>
                {
                    var (worldId, instanceId) = group.First().Instance!.Value;
                    return new Place(worldId, instanceId, _worldNames.GetValueOrDefault(worldId, "Unknown world"), Place.AccessOf(instanceId), Place.RegionOf(instanceId), group.ToList(), null, null);
                })
                .OrderByDescending(place => place.Friends.Count).Take(6).ToList();

            // Live head-count for the places worth showing (refreshed at most once a minute each)
            for (var i = 0; i < places.Count; i++)
            {
                var key = $"{places[i].WorldId}:{places[i].InstanceId}";
                if (!_instances.TryGetValue(key, out var known) || DateTimeOffset.Now - known.At > TimeSpan.FromSeconds(60))
                    _instances[key] = known = await GetInstanceAsync(places[i].WorldId, places[i].InstanceId, cancellationToken) is { } count
                        ? (count.People, count.Capacity, DateTimeOffset.Now) : (known.People, known.Capacity, DateTimeOffset.Now);
                places[i] = places[i] with { People = known.People, Capacity = known.Capacity };
            }

            return new OverlayState(friends, places.OrderByDescending(place => place.Score).ToList(), DateTimeOffset.Now, null);
        }
        catch (HttpRequestException)
        {
            _sessionKey = null;
            return OverlayState.Failed("The dashboard API is not running. Start it with START.bat.");
        }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return OverlayState.Failed("The dashboard API did not answer in time.");
        }
    }

    /// <summary>Returns a problem to show, or null once the session key is known.</summary>
    private async Task<string?> FetchSessionKeyAsync(CancellationToken cancellationToken)
    {
        if (!File.Exists(TokenPath)) return "The dashboard API is not running. Start it with START.bat.";
        using var request = new HttpRequestMessage(HttpMethod.Get, "/overlay/session");
        request.Headers.Add("X-Overlay-Token", (await File.ReadAllTextAsync(TokenPath, cancellationToken)).Trim());
        using var response = await _http.SendAsync(request, cancellationToken);
        if (response.StatusCode == HttpStatusCode.NotFound) return "Open the dashboard in your browser and sign in to VRChat.";
        if (!response.IsSuccessStatusCode) return "The dashboard API refused the overlay. Restart the API, then the overlay.";
        _sessionKey = (await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken)).GetProperty("sessionKey").GetString();
        return _sessionKey == null ? "Open the dashboard in your browser and sign in to VRChat." : null;
    }

    private async Task<JsonElement?> GetDataAsync(string path, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Add("X-VRChat-Session", _sessionKey);
        using var response = await _http.SendAsync(request, cancellationToken);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken);
        return body.TryGetProperty("success", out var success) && success.GetBoolean() && body.TryGetProperty("data", out var data) ? data.Clone() : null;
    }

    private async Task<List<OnlineFriend>?> GetFriendsAsync(CancellationToken cancellationToken)
    {
        var all = new List<OnlineFriend>();
        for (var offset = 0; offset < 400; offset += 100)
        {
            if (await GetDataAsync($"/vrchat/getfriendlist/offset={offset}/n=100/online=true", cancellationToken) is not { ValueKind: JsonValueKind.Array } page)
                return offset == 0 ? null : all;
            foreach (var friend in page.EnumerateArray())
            {
                var state = friend.GetProperty("state").GetString();
                if (state == "offline") continue;
                var presence = state == "active" ? Presence.Web : (friend.GetProperty("status").GetString() ?? "") switch
                {
                    "JoinMe" => Presence.JoinMe, "AskMe" => Presence.AskMe, "Busy" => Presence.Busy, _ => Presence.Active,
                };
                all.Add(new OnlineFriend(friend.GetProperty("id").GetString()!, friend.GetProperty("displayName").GetString() ?? "?",
                    presence, friend.TryGetProperty("location", out var location) ? location.GetString() : null, null));
            }
            if (page.GetArrayLength() < 100) break;
        }
        return all;
    }

    private async Task<string?> GetWorldNameAsync(string worldId, CancellationToken cancellationToken) =>
        await GetDataAsync($"/vrchat/worlds/{Uri.EscapeDataString(worldId)}", cancellationToken) is { } world && world.TryGetProperty("name", out var name) ? name.GetString() : null;

    private async Task<(int? People, int? Capacity)?> GetInstanceAsync(string worldId, string instanceId, CancellationToken cancellationToken)
    {
        var query = $"worldId={Uri.EscapeDataString(worldId)}&instanceId={Uri.EscapeDataString(instanceId)}";
        if (await GetDataAsync($"/vrchat/instance?{query}", cancellationToken) is not { } instance) return null;
        int? Read(string property) => instance.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.Number && value.GetInt32() > 0 ? value.GetInt32() : null;
        return (Read("userCount"), Read("capacity"));
    }

    public void Dispose() => _http.Dispose();
}
