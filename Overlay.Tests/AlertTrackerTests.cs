using VrConnect.Overlay;
using Xunit;

public class AlertTrackerTests
{
    private const string World = "wrld_00000000-0000-0000-0000-000000000001";
    private static readonly HashSet<string> Favorites = ["usr_Luna"];

    private static OnlineFriend Friend(string name, string? instance = null, Presence presence = Presence.Active) =>
        new($"usr_{name}", name, presence, instance == null ? "private" : $"{World}:{instance}", instance == null ? null : "Rooftop");

    private static OverlayState State(params OnlineFriend[] friends)
    {
        var places = friends.Where(friend => friend.Instance != null).GroupBy(friend => friend.Location!).Select(group =>
        {
            var (worldId, instanceId) = group.First().Instance!.Value;
            return new Place(worldId, instanceId, "Rooftop", Place.AccessOf(instanceId), null, group.ToList(), 10, 32);
        }).ToList();
        return new OverlayState(friends, places, DateTimeOffset.Now, null);
    }

    [Fact]
    public void Says_nothing_on_the_first_refresh()
    {
        var tracker = new AlertTracker();
        Assert.Empty(tracker.Update(State(Friend("Luna"), Friend("A", "1"), Friend("B", "1"), Friend("C", "1")), Favorites));
    }

    [Fact]
    public void Alerts_when_a_favorite_comes_online()
    {
        var tracker = new AlertTracker();
        tracker.Update(State(), Favorites);
        var alert = Assert.Single(tracker.Update(State(Friend("Luna")), Favorites));
        Assert.Equal(AlertKind.FavoriteOnline, alert.Kind);
        Assert.Equal("Luna is online", alert.Title);
    }

    [Fact]
    public void Ignores_friends_who_are_not_favorites()
    {
        var tracker = new AlertTracker();
        tracker.Update(State(), Favorites);
        Assert.Empty(tracker.Update(State(Friend("Mochi")), Favorites));
    }

    [Fact]
    public void Ignores_a_favorite_who_is_only_on_the_website()
    {
        var tracker = new AlertTracker();
        tracker.Update(State(), Favorites);
        Assert.Empty(tracker.Update(State(Friend("Luna", presence: Presence.Web)), Favorites));
    }

    [Fact]
    public void Does_not_repeat_when_a_favorite_reconnects_soon_after()
    {
        var tracker = new AlertTracker();
        tracker.Update(State(), Favorites);
        Assert.Single(tracker.Update(State(Friend("Luna")), Favorites));
        tracker.Update(State(), Favorites);
        Assert.Empty(tracker.Update(State(Friend("Luna")), Favorites));
    }

    [Fact]
    public void Alerts_once_when_three_friends_gather_in_an_open_place()
    {
        var tracker = new AlertTracker();
        tracker.Update(State(Friend("A", "1~region(eu)"), Friend("B", "1~region(eu)")), Favorites);
        var alert = Assert.Single(tracker.Update(State(Friend("A", "1~region(eu)"), Friend("B", "1~region(eu)"), Friend("C", "1~region(eu)")), Favorites));
        Assert.Equal(AlertKind.Gathering, alert.Kind);
        Assert.StartsWith("3 friends together", alert.Title);
        // A fourth friend joining the same place is not news
        Assert.Empty(tracker.Update(State(Friend("A", "1~region(eu)"), Friend("B", "1~region(eu)"), Friend("C", "1~region(eu)"), Friend("D", "1~region(eu)")), Favorites));
    }

    [Fact]
    public void Ignores_gatherings_you_cannot_join()
    {
        var tracker = new AlertTracker();
        tracker.Update(State(), Favorites);
        var invite = "1~private(usr_x)~region(eu)";
        Assert.Empty(tracker.Update(State(Friend("A", invite), Friend("B", invite), Friend("C", invite)), Favorites));
    }

    [Fact]
    public void A_failed_refresh_does_not_make_everyone_come_back_online()
    {
        var tracker = new AlertTracker();
        tracker.Update(State(Friend("Luna")), Favorites);
        Assert.Empty(tracker.Update(OverlayState.Failed("API down"), Favorites));
        Assert.Empty(tracker.Update(State(Friend("Luna")), Favorites));
    }
}
