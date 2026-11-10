using VrConnect.Overlay;

// vrconnect overlay: your VRChat friends and "where to go" in the SteamVR dashboard.
//   vrconnect-overlay              run the overlay (needs SteamVR and the dashboard API)
//   vrconnect-overlay --register   also start it automatically with SteamVR
//   vrconnect-overlay --no-alerts  no banners when a favorite comes online or friends gather
//   vrconnect-overlay --preview    no SteamVR: render one frame to overlay-preview.png (live data, or sample data)
//   vrconnect-overlay --preview --sample   same, with sample friends only

using var cancel = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) => { e.Cancel = true; cancel.Cancel(); };
using var client = new DashboardClient(Environment.GetEnvironmentVariable("VRCONNECT_API") ?? "http://localhost:5000");
using var images = new ImageCache();

if (args.Contains("--preview"))
{
    var state = args.Contains("--sample") ? Sample.State() : await client.LoadAsync(cancel.Token);
    await images.PrefetchAsync(Pictures(state), TimeSpan.FromSeconds(15), cancel.Token);
    if (args.Contains("--toast")) state = state with { Toast = new Toast("Invite to Sunset Rooftop sent. Accept it in your VRChat notifications.", true, DateTimeOffset.Now.AddMinutes(1)) };
    if (args.Contains("--sample"))
    {
        OverlayRenderer.RenderAlert(new Alert(AlertKind.FavoriteOnline, "Luna is online", "Sunset Rooftop"), Path.GetFullPath("alert-preview-favorite.png"));
        OverlayRenderer.RenderAlert(new Alert(AlertKind.Gathering, "3 friends together in Sunset Rooftop", "Luna, NeonFox, Astro"), Path.GetFullPath("alert-preview-gathering.png"));
    }
    // --view places|friends|<group number>  --scroll <rows>: which list to draw
    var view = new PanelView();
    var shown = Option("--view");
    if (shown != null) view.Select(int.TryParse(shown, out var number) && number >= 1 && number <= state.Groups.Count ? state.Groups[number - 1].Key : shown);
    if (int.TryParse(Option("--scroll"), out var scroll)) view.Scroll = scroll;
    var path = Path.GetFullPath("overlay-preview.png");
    OverlayRenderer.RenderPanel(state, view, path, images);
    Console.WriteLine(state.Problem ?? $"{state.Friends.Count} friends, {state.Places.Count} places, {Pictures(state).Count(url => images.Get(url) != null)} pictures, "
        + $"groups: {string.Join(", ", state.Groups.Select(group => $"{group.Name} {group.Online}/{group.Members.Count}"))}");
    foreach (var (host, problem) in images.LastErrors) Console.WriteLine($"Pictures from {host}: {problem}");
    Console.WriteLine($"Preview written to {path}");
    return 0;
}

// Never start SteamVR ourselves (an overlay app would): wait until the user starts it, and again after it closes.
// --once (used when SteamVR launches us) quits with SteamVR instead.
var once = args.Contains("--once");
var waitingShown = false;
while (!cancel.IsCancellationRequested)
{
    if (!SteamVrHost.IsSteamVrRunning())
    {
        if (once) { Console.Error.WriteLine("SteamVR is not running."); return 1; }
        if (!waitingShown) Console.WriteLine("Waiting for SteamVR… (the overlay appears as soon as you start it)");
        waitingShown = true;
        try { await Task.Delay(5000, cancel.Token); } catch (TaskCanceledException) { }
        continue;
    }
    waitingShown = false;
    if (!SteamVrHost.TryStart(out var host, out var error))
    {
        Console.Error.WriteLine(error);
        if (SteamVrHost.AlreadyRunning) return 0; // e.g. SteamVR auto-started it and START.bat tried too
        if (once) return 1;
        try { await Task.Delay(10000, cancel.Token); } catch (TaskCanceledException) { }
        continue;
    }
    host!.Images = images;
    using (host) await RunAsync(host, client, images, args, cancel.Token);
    if (once || cancel.IsCancellationRequested) break;
    Console.WriteLine("SteamVR closed.");
    // Let vrserver finish exiting before checking again
    try { await Task.Delay(5000, cancel.Token); } catch (TaskCanceledException) { }
}
return 0;

string? Option(string name) => Array.IndexOf(args, name) is >= 0 and var at && at + 1 < args.Length ? args[at + 1] : null;

/// <summary>Pictures the panel can show: the places' worlds and the first 10 friends' avatars.</summary>
static IEnumerable<string?> Pictures(OverlayState state) =>
    state.Places.Select(place => place.ThumbnailUrl)
        .Concat(state.Friends.OrderBy(friend => friend.Presence).ThenBy(friend => friend.Name, StringComparer.CurrentCultureIgnoreCase).Take(10).Select(friend => friend.AvatarUrl));

/// <summary>One SteamVR session: refreshes the panel, handles clicks and alerts until SteamVR quits or Ctrl+C.</summary>
static async Task RunAsync(SteamVrHost host, DashboardClient client, ImageCache images, string[] args, CancellationToken cancel)
{
    if (args.Contains("--register")) Console.WriteLine(SteamVrHost.Register());
    Console.WriteLine("vrconnect overlay running. Open the SteamVR dashboard and pick the vrconnect tab. Ctrl+C to stop.");

    var alertsOn = !args.Contains("--no-alerts");
    var tracker = new AlertTracker();
    var nextRefresh = DateTimeOffset.MinValue;
    var state = OverlayState.Failed("Loading…");
    var targets = host.Show(state);
    var inputs = new List<PanelInput>();
    while (!cancel.IsCancellationRequested)
    {
        inputs.Clear();
        if (!host.PumpEvents(inputs)) break;
        host.TickAlerts();

        // Lists and scrolling are handled by the view; buttons that talk to VRChat below
        HitTarget? hit = null;
        var redraw = false;
        foreach (var input in inputs)
        {
            redraw |= host.View.Apply(input, targets, out var press);
            if (press != null) { hit = press; break; }
        }

        if (hit is { Action: ClickAction.JoinPlace or ClickAction.AskInvite })
        {
            // Show "Sending…" at once: the laser click needs visible feedback
            targets = host.Show(state with { Toast = new Toast("Sending…", true, DateTimeOffset.Now.AddSeconds(30)) });
            var (ok, message) = hit.Action == ClickAction.JoinPlace
                ? await client.JoinAsync(hit.Place!, cancel)
                : await client.AskInviteAsync(hit.Friend!, cancel);
            state = state with { Toast = new Toast(message, ok, DateTimeOffset.Now.AddSeconds(8)) };
            targets = host.Show(state);
            // Ignore clicks made while sending: they were aimed at the old frame
            host.PumpEvents([]);
            continue;
        }

        // Refresh every 20 s while the tab is visible, every 60 s in the background (for alerts), at once on "Refresh"
        var refreshDue = hit?.Action == ClickAction.Refresh || nextRefresh == DateTimeOffset.MinValue
            || (DateTimeOffset.Now >= nextRefresh && (host.IsVisible || alertsOn) && !host.View.Dragging);
        var toastExpired = state.Toast is { } toast && toast.Until < DateTimeOffset.Now;
        if (refreshDue)
        {
            state = (await client.LoadAsync(cancel)) with { Toast = toastExpired ? null : state.Toast };
            if (alertsOn) host.Enqueue(tracker.Update(state, await client.GetFavoritesAsync(cancel)));
            // New pictures load at most 3 s; slower ones appear on the next refresh
            await images.PrefetchAsync(Pictures(state), TimeSpan.FromSeconds(3), cancel);
            nextRefresh = DateTimeOffset.Now + TimeSpan.FromSeconds(state.Problem != null ? 5 : host.IsVisible ? 20 : 60);
            targets = host.Show(state);
        }
        else if (toastExpired)
        {
            state = state with { Toast = null };
            targets = host.Show(state);
        }
        else if (redraw)
        {
            targets = host.Show(state);
        }
        // Faster while dragging the scrollbar, so the list follows the laser
        try { await Task.Delay(host.View.Dragging ? 30 : 100, cancel); } catch (TaskCanceledException) { }
    }
}

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
        friends.AddRange(Enumerable.Range(1, 14).Select(i => F($"Friend {i:00}", i % 3 == 0 ? Presence.AskMe : Presence.Active, "private", null)));
        var groups = FriendGroup.Build(
        [
            ("group:group_0", "Close friends", ["usr_Luna", "usr_Kitsune", "usr_Mochi", "usr_x1", "usr_x2"]),
            ("group:group_1", "Event crew", ["usr_NeonFox", "usr_Astro", "usr_hifum", "usr_x3"]),
            ("group:group_2", "Japan", ["usr_ヌッヌヌ", "usr_x4"]),
        ], friends, new Dictionary<string, string> { ["usr_x1"] = "Sora", ["usr_x2"] = "Rin", ["usr_x3"] = "Maple", ["usr_x4"] = "ハル" });
        return new OverlayState(friends, places, DateTimeOffset.Now, null) { Groups = groups };
    }
}
