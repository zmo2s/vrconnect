namespace VrConnect.Overlay;

/// <summary>VRChat social status, same names the API sends ("JoinMe", "Active", "AskMe", "Busy").</summary>
public enum Presence { JoinMe, Active, AskMe, Busy, Web, Offline }

public sealed record OnlineFriend(string Id, string Name, Presence Presence, string? Location, string? WorldName)
{
    /// <summary>"wrld_…:instance" when the friend is in a visible instance, otherwise null (private, website, offline).</summary>
    public (string WorldId, string InstanceId)? Instance =>
        Location is { } loc && loc.StartsWith("wrld_", StringComparison.Ordinal) && loc.IndexOf(':') is > 0 and var colon
            ? (loc[..colon], loc[(colon + 1)..]) : null;
}

/// <summary>An instance where at least one friend is, with the live head-count when VRChat gave it.</summary>
public sealed record Place(string WorldId, string InstanceId, string WorldName, string Access, string? Region,
    IReadOnlyList<OnlineFriend> Friends, int? People, int? Capacity)
{
    public bool IsFull => People is { } people && Capacity is > 0 && people >= Capacity;

    /// <summary>Instances you can just walk into, without an invite.</summary>
    public bool IsOpen => Access is "Public" or "Group public" or "Friends+" or "Friends";

    /// <summary>Higher is better: more friends, open, with room left.</summary>
    public double Score => Friends.Count * 10
        + (IsOpen ? 6 : -8)
        + (IsFull ? -25 : 0)
        + Friends.Count(friend => friend.Presence == Presence.JoinMe) * 4
        - Friends.Count(friend => friend.Presence == Presence.Busy) * 6;

    /// <summary>Instance type, read from the ID the same way the web dashboard does.</summary>
    public static string AccessOf(string instanceId)
    {
        if (instanceId.Contains("~group(")) return instanceId.Contains("~groupAccessType(public)") ? "Group public"
            : instanceId.Contains("~groupAccessType(plus)") ? "Group+" : "Group";
        if (instanceId.Contains("~private(")) return instanceId.Contains("~canRequestInvite") ? "Invite+" : "Invite only";
        if (instanceId.Contains("~hidden(")) return "Friends+";
        if (instanceId.Contains("~friends(")) return "Friends";
        return "Public";
    }

    public static string? RegionOf(string instanceId)
    {
        var start = instanceId.IndexOf("~region(", StringComparison.Ordinal);
        if (start < 0) return null;
        start += "~region(".Length;
        var end = instanceId.IndexOf(')', start);
        return end > start ? instanceId[start..end].ToUpperInvariant() switch { "USE" => "US East", "USW" => "US West", var code => code } : null;
    }
}

/// <summary>Everything one frame of the overlay shows.</summary>
public sealed record OverlayState(IReadOnlyList<OnlineFriend> Friends, IReadOnlyList<Place> Places, DateTimeOffset UpdatedAt, string? Problem)
{
    public static OverlayState Failed(string problem) => new([], [], DateTimeOffset.Now, problem);
}
