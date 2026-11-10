using VrConnect.Overlay;
using Xunit;

public class PlaceTests
{
    private static OnlineFriend Friend(string name, Presence presence = Presence.Active, string? location = null) =>
        new($"usr_{name}", name, presence, location, null);

    private static Place PlaceWith(string instanceId, int friends, int? people = null, int? capacity = null, Presence presence = Presence.Active) =>
        new("wrld_00000000-0000-0000-0000-000000000001", instanceId, "World", Place.AccessOf(instanceId), Place.RegionOf(instanceId),
            Enumerable.Range(0, friends).Select(i => Friend($"f{i}", presence)).ToList(), people, capacity);

    [Theory]
    [InlineData("12345~region(jp)", "Public")]
    [InlineData("12345~hidden(usr_x)~region(eu)", "Friends+")]
    [InlineData("12345~friends(usr_x)~region(us)", "Friends")]
    [InlineData("12345~private(usr_x)~canRequestInvite~region(us)", "Invite+")]
    [InlineData("12345~private(usr_x)~region(us)", "Invite only")]
    [InlineData("12345~group(grp_x)~groupAccessType(public)~region(jp)", "Group public")]
    [InlineData("12345~group(grp_x)~groupAccessType(plus)~region(jp)", "Group+")]
    [InlineData("12345~group(grp_x)~groupAccessType(members)~region(jp)", "Group")]
    public void Reads_the_instance_type_like_the_web_dashboard(string instanceId, string expected) =>
        Assert.Equal(expected, Place.AccessOf(instanceId));

    [Theory]
    [InlineData("1~region(jp)", "JP")]
    [InlineData("1~region(use)", "US East")]
    [InlineData("1~region(usw)", "US West")]
    [InlineData("1", null)]
    public void Reads_the_region(string instanceId, string? expected) => Assert.Equal(expected, Place.RegionOf(instanceId));

    [Fact]
    public void Splits_a_location_into_world_and_instance()
    {
        var friend = Friend("Luna", location: "wrld_00000000-0000-0000-0000-000000000001:84210~region(eu)");
        Assert.Equal(("wrld_00000000-0000-0000-0000-000000000001", "84210~region(eu)"), friend.Instance);
        Assert.Null(Friend("Mochi", location: "private").Instance);
        Assert.Null(Friend("Yuki", location: "offline").Instance);
        Assert.Null(Friend("Pixel").Instance);
    }

    [Fact]
    public void A_place_is_full_only_when_the_head_count_reaches_capacity()
    {
        Assert.True(PlaceWith("1", 2, people: 16, capacity: 16).IsFull);
        Assert.False(PlaceWith("1", 2, people: 15, capacity: 16).IsFull);
        Assert.False(PlaceWith("1", 2).IsFull); // unknown head-count: assume there is room
    }

    [Fact]
    public void More_friends_rank_higher()
    {
        Assert.True(PlaceWith("1~region(eu)", 3).Score > PlaceWith("1~region(eu)", 1).Score);
    }

    [Fact]
    public void An_open_place_beats_an_invite_only_one_with_as_many_friends()
    {
        Assert.True(PlaceWith("1~region(eu)", 2).Score > PlaceWith("1~private(usr_x)~region(eu)", 2).Score);
    }

    [Fact]
    public void A_full_place_ranks_below_a_smaller_one_with_room()
    {
        Assert.True(PlaceWith("1~region(eu)", 1, people: 5, capacity: 32).Score > PlaceWith("1~region(eu)", 2, people: 16, capacity: 16).Score);
    }

    [Fact]
    public void Join_me_friends_count_more_than_busy_ones()
    {
        Assert.True(PlaceWith("1", 2, presence: Presence.JoinMe).Score > PlaceWith("1", 2, presence: Presence.Busy).Score);
    }
}
