using VrConnect.Overlay;

// vrconnect overlay: your VRChat friends and "where to go" in the SteamVR dashboard.
//   vrconnect-overlay              run the overlay (needs SteamVR and the dashboard API)
//   vrconnect-overlay --register   also start it automatically with SteamVR
//   vrconnect-overlay --preview    no SteamVR: render one frame to overlay-preview.png (live data, or sample data)
//   vrconnect-overlay --preview --sample   same, with sample friends only

using var cancel = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) => { e.Cancel = true; cancel.Cancel(); };
using var client = new DashboardClient(Environment.GetEnvironmentVariable("VRCONNECT_API") ?? "http://localhost:5000");

if (args.Contains("--preview"))
{
    var state = args.Contains("--sample") ? Sample.State() : await client.LoadAsync(cancel.Token);
    if (args.Contains("--toast")) state = state with { Toast = new Toast("Invite to Sunset Rooftop sent. Accept it in your VRChat notifications.", true, DateTimeOffset.Now.AddMinutes(1)) };
    var path = Path.GetFullPath("overlay-preview.png");
    OverlayRenderer.RenderPanel(state, path);
    Console.WriteLine(state.Problem ?? $"{state.Friends.Count} friends, {state.Places.Count} places");
    Console.WriteLine($"Preview written to {path}");
    return 0;
}

if (!SteamVrHost.TryStart(out var host, out var error))
{
    Console.Error.WriteLine(error);
    return 1;
}

using (host)
{
    if (args.Contains("--register")) Console.WriteLine(SteamVrHost.Register());
    Console.WriteLine("vrconnect overlay running. Open the SteamVR dashboard and pick the vrconnect tab. Ctrl+C to stop.");

    var nextRefresh = DateTimeOffset.MinValue;
    var state = OverlayState.Failed("Loading…");
    var targets = host!.Show(state);
    while (!cancel.IsCancellationRequested)
    {
        if (!host.PumpEvents(out var click)) break;
        var hit = click is { } point ? targets.FirstOrDefault(target => target.Area.Contains(point.X, point.Y)) : null;

        if (hit is { Action: ClickAction.JoinPlace or ClickAction.AskInvite })
        {
            // Show "Sending…" at once: the laser click needs visible feedback
            targets = host.Show(state with { Toast = new Toast("Sending…", true, DateTimeOffset.Now.AddSeconds(30)) });
            var (ok, message) = hit.Action == ClickAction.JoinPlace
                ? await client.JoinAsync(hit.Place!, cancel.Token)
                : await client.AskInviteAsync(hit.Friend!, cancel.Token);
            state = state with { Toast = new Toast(message, ok, DateTimeOffset.Now.AddSeconds(8)) };
            targets = host.Show(state);
            // Ignore clicks made while sending: they were aimed at the old frame
            host.PumpEvents(out _);
            continue;
        }

        // Refresh every 20 s while the tab is visible, at once when "Refresh" is clicked
        var refreshDue = hit?.Action == ClickAction.Refresh || nextRefresh == DateTimeOffset.MinValue || (host.IsVisible && DateTimeOffset.Now >= nextRefresh);
        var toastExpired = state.Toast is { } toast && toast.Until < DateTimeOffset.Now;
        if (refreshDue)
        {
            state = (await client.LoadAsync(cancel.Token)) with { Toast = toastExpired ? null : state.Toast };
            nextRefresh = DateTimeOffset.Now + TimeSpan.FromSeconds(state.Problem == null ? 20 : 5);
            targets = host.Show(state);
        }
        else if (toastExpired)
        {
            state = state with { Toast = null };
            targets = host.Show(state);
        }
        try { await Task.Delay(100, cancel.Token); } catch (TaskCanceledException) { }
    }
}
return 0;

/// <summary>Fictional friends, to check the layout without VRChat.</summary>
static class Sample
{
    public static OverlayState State()
    {
        OnlineFriend F(string name, Presence presence, string? location, string? world) => new($"usr_{name}", name, presence, location, world);
        var rooftop = "wrld_00000000-0000-0000-0000-000000000001:84210~region(eu)";
        var garden = "wrld_00000000-0000-0000-0000-000000000002:19280~hidden(usr_x)~region(jp)";
        var tutorial = "wrld_00000000-0000-0000-0000-000000000003:93936~group(grp_x)~groupAccessType(public)~region(jp)";
        var friends = new List<OnlineFriend>
        {
            F("Luna", Presence.JoinMe, rooftop, "Sunset Rooftop"), F("NeonFox", Presence.Active, rooftop, "Sunset Rooftop"),
            F("Astro", Presence.JoinMe, rooftop, "Sunset Rooftop"), F("Kitsune", Presence.AskMe, garden, "The Floating Garden"),
            F("Cloudy", Presence.Active, garden, "The Floating Garden"), F("hifum", Presence.Active, tutorial, "[CN] 中文新手教程 [Tutorial]"),
            F("Mochi", Presence.Busy, "private", null), F("Pixel", Presence.Active, "private", null), F("Ла Хакасе", Presence.Active, "traveling", null),
            F("ヌッヌヌ", Presence.Web, "offline", null),
        };
        var places = friends.Where(friend => friend.Instance != null).GroupBy(friend => friend.Location!).Select(group =>
        {
            var (worldId, instanceId) = group.First().Instance!.Value;
            var (people, capacity) = group.Key == rooftop ? (12, 32) : group.Key == garden ? (16, 16) : (9, 80);
            return new Place(worldId, instanceId, group.First().WorldName!, Place.AccessOf(instanceId), Place.RegionOf(instanceId), group.ToList(), people, capacity);
        }).OrderByDescending(place => place.Score).ToList();
        return new OverlayState(friends, places, DateTimeOffset.Now, null);
    }
}
