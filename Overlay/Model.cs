namespace VrConnect.Overlay;

/// <summary>VRChat social status, same names the API sends ("JoinMe", "Active", "AskMe", "Busy").</summary>
public enum Presence { JoinMe, Active, AskMe, Busy, Web, Offline }

public sealed record OnlineFriend(string Id, string Name, Presence Presence, string? Location, string? WorldName, string? AvatarUrl = null)
{
    /// <summary>"wrld_…:instance" when the friend is in a visible instance, otherwise null (private, website, offline).</summary>
    public (string WorldId, string InstanceId)? Instance =>
        Location is { } loc && loc.StartsWith("wrld_", StringComparison.Ordinal) && loc.IndexOf(':') is > 0 and var colon
            ? (loc[..colon], loc[(colon + 1)..]) : null;
}

/// <summary>An instance where at least one friend is, with the live head-count when VRChat gave it.</summary>
public sealed record Place(string WorldId, string InstanceId, string WorldName, string Access, string? Region,
    IReadOnlyList<OnlineFriend> Friends, int? People, int? Capacity, string? ThumbnailUrl = null)
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

    /// <summary>Result of the last button press, shown at the bottom for a few seconds.</summary>
    public Toast? Toast { get; init; }

    /// <summary>Your VRChat favorite-friend groups, with every member (offline ones too).</summary>
    public IReadOnlyList<FriendGroup> Groups { get; init; } = [];
}

/// <summary>A VRChat favorite-friend group. Members are online friends first, then offline ones (Presence.Offline).</summary>
public sealed record FriendGroup(string Key, string Name, IReadOnlyList<OnlineFriend> Members)
{
    public int Online => Members.Count(member => member.Presence != Presence.Offline);

    /// <summary>Joins the groups' member IDs with the friends online now; others are offline, named from <paramref name="names"/>.</summary>
    public static List<FriendGroup> Build(IEnumerable<(string Key, string Name, IReadOnlyList<string> Members)> groups,
        IReadOnlyList<OnlineFriend> online, IReadOnlyDictionary<string, string> names)
    {
        var byId = online.GroupBy(friend => friend.Id).ToDictionary(group => group.Key, group => group.First());
        return groups.Select(group => new FriendGroup(group.Key, group.Name, group.Members.Distinct()
                .Select(id => byId.TryGetValue(id, out var friend) ? friend
                    : new OnlineFriend(id, names.GetValueOrDefault(id) ?? "Unknown friend", Presence.Offline, "offline", null))
                .OrderBy(member => member.Presence).ThenBy(member => member.Name, StringComparer.CurrentCultureIgnoreCase).ToList()))
            .ToList();
    }
}

/// <summary>What the panel shows: the list picked on the left and how far it is scrolled.</summary>
public sealed class PanelView
{
    public const string Places = "places", Friends = "friends";

    /// <summary>"places", "friends", or a group's key.</summary>
    public string Selected { get; set; } = Places;

    /// <summary>First visible row (or card). The renderer keeps it between 0 and <see cref="MaxScroll"/>.</summary>
    public int Scroll { get; set; }

    // Set by the renderer for the frame it drew, to turn a scrollbar drag into rows
    public int MaxScroll { get; set; }
    public int Visible { get; set; }
    public float ThumbTravel { get; set; }

    public void Select(string selected)
    {
        if (selected != Selected) Scroll = 0;
        Selected = selected;
    }

    private float? _dragFrom;
    private int _dragScroll;

    public bool Dragging => _dragFrom != null;

    /// <summary>
    /// Applies one laser input. Returns true when the panel must be drawn again; <paramref name="press"/> gets a
    /// pressed button the caller handles (Refresh, Join, Ask invite).
    /// </summary>
    public bool Apply(PanelInput input, IReadOnlyList<HitTarget> targets, out HitTarget? press)
    {
        press = null;
        var before = (Selected, Scroll);
        switch (input.Kind)
        {
            case PanelInputKind.Scroll:
                Scroll -= Math.Sign(input.Delta) * Math.Max(1, (int)Math.Round(Math.Abs(input.Delta)));
                break;
            case PanelInputKind.Move when _dragFrom is { } from && ThumbTravel > 0:
                Scroll = _dragScroll + (int)Math.Round((input.Y - from) * MaxScroll / ThumbTravel);
                break;
            case PanelInputKind.Up:
                _dragFrom = null;
                break;
            case PanelInputKind.Down:
                var hit = targets.FirstOrDefault(target => target.Area.Contains(input.X, input.Y));
                switch (hit?.Action)
                {
                    case ClickAction.SelectList: Select(hit.List!); break;
                    case ClickAction.ScrollUp: Scroll--; break;
                    case ClickAction.ScrollDown: Scroll++; break;
                    case ClickAction.PageUp: Scroll -= Math.Max(1, Visible - 1); break;
                    case ClickAction.PageDown: Scroll += Math.Max(1, Visible - 1); break;
                    case ClickAction.ScrollThumb: _dragFrom = input.Y; _dragScroll = Scroll; break;
                    case null: break;
                    default: press = hit; break;
                }
                break;
        }
        Scroll = Math.Clamp(Scroll, 0, MaxScroll);
        return before != (Selected, Scroll);
    }
}

public sealed record Toast(string Text, bool Ok, DateTimeOffset Until);

public enum ClickAction { Refresh, JoinPlace, AskInvite, SelectList, ScrollUp, ScrollDown, PageUp, PageDown, ScrollThumb }

/// <summary>A clickable area of the panel, in texture pixels, and what it does.</summary>
public sealed record HitTarget(SkiaSharp.SKRect Area, ClickAction Action, Place? Place = null, OnlineFriend? Friend = null, string? List = null);

/// <summary>Laser input on the panel, in texture pixels. Scroll: Delta &gt; 0 means up.</summary>
public sealed record PanelInput(PanelInputKind Kind, float X, float Y, float Delta = 0);

public enum PanelInputKind { Down, Move, Up, Scroll }
