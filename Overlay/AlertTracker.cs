namespace VrConnect.Overlay;

public enum AlertKind { FavoriteOnline, Gathering }

/// <summary>A short banner shown in front of you for a few seconds, even with the SteamVR menu closed.</summary>
public sealed record Alert(AlertKind Kind, string Title, string Detail);

/// <summary>
/// Compares each refresh with the previous one and says what is worth interrupting you for:
/// a VRChat favorite coming online, or friends gathering in a place you can join.
/// Kept quiet on purpose: nothing on the first refresh, a cooldown per friend and per place, at most 3 at a time.
/// </summary>
public sealed class AlertTracker
{
    public const int GatheringSize = 3;
    private static readonly TimeSpan Cooldown = TimeSpan.FromMinutes(15);

    private HashSet<string>? _inGame;
    private Dictionary<string, int> _placeSizes = new();
    private readonly Dictionary<string, DateTimeOffset> _lastAlert = new();

    public List<Alert> Update(OverlayState state, IReadOnlySet<string> favorites)
    {
        var alerts = new List<Alert>();
        if (state.Problem != null) return alerts; // a failed refresh says nothing about who left

        var inGame = state.Friends.Where(friend => friend.Presence != Presence.Web).Select(friend => friend.Id).ToHashSet();
        var placeSizes = state.Places.ToDictionary(place => $"{place.WorldId}:{place.InstanceId}", place => place.Friends.Count);

        if (_inGame != null) // the first refresh only sets the baseline
        {
            foreach (var friend in state.Friends.Where(friend => favorites.Contains(friend.Id) && inGame.Contains(friend.Id) && !_inGame.Contains(friend.Id)))
                if (Allow($"friend:{friend.Id}"))
                    alerts.Add(new Alert(AlertKind.FavoriteOnline, $"{friend.Name} is online",
                        friend.WorldName ?? (friend.Location == "private" ? "In a private world" : "Just connected")));

            foreach (var place in state.Places.Where(place => place.IsOpen && !place.IsFull && place.Friends.Count >= GatheringSize))
            {
                var key = $"{place.WorldId}:{place.InstanceId}";
                if (_placeSizes.GetValueOrDefault(key) >= GatheringSize || !Allow($"place:{key}")) continue;
                var names = string.Join(", ", place.Friends.Select(friend => friend.Name).Take(3)) + (place.Friends.Count > 3 ? $" +{place.Friends.Count - 3}" : "");
                alerts.Add(new Alert(AlertKind.Gathering, $"{place.Friends.Count} friends together in {place.WorldName}", names));
            }
        }

        _inGame = inGame;
        _placeSizes = placeSizes;
        return alerts.Take(3).ToList();
    }

    /// <summary>Someone hopping between worlds or reconnecting shouldn't ping you every minute.</summary>
    private bool Allow(string key)
    {
        if (_lastAlert.TryGetValue(key, out var last) && DateTimeOffset.Now - last < Cooldown) return false;
        _lastAlert[key] = DateTimeOffset.Now;
        return true;
    }
}
