using SkiaSharp;
using VrConnect.Overlay;
using Xunit;


public class PanelViewTests
{
    private static OnlineFriend Friend(string id, Presence presence = Presence.Active) => new(id, id, presence, "private", null);

    [Fact]
    public void Group_lists_online_members_first_and_names_offline_ones()
    {
        var groups = FriendGroup.Build([("group:group_0", "Close", ["Zed", "off1", "Amy", "off2"])],
            [Friend("Amy", Presence.AskMe), Friend("Zed", Presence.JoinMe), Friend("Other")],
            new Dictionary<string, string> { ["off1"] = "Bob" });

        var group = Assert.Single(groups);
        Assert.Equal(["Zed", "Amy", "Bob", "Unknown friend"], group.Members.Select(member => member.Name));
        Assert.Equal(2, group.Online);
        Assert.Equal(Presence.Offline, group.Members[2].Presence);
    }

    private static PanelView Scrolled(int max) => new() { MaxScroll = max, Visible = 10, ThumbTravel = 100 };

    [Fact]
    public void Scrolling_stays_within_the_list()
    {
        var view = Scrolled(5);
        Assert.True(view.Apply(new(PanelInputKind.Scroll, 0, 0, -3), [], out _));
        Assert.Equal(3, view.Scroll);
        view.Apply(new(PanelInputKind.Scroll, 0, 0, -9), [], out _);
        Assert.Equal(5, view.Scroll);
        view.Apply(new(PanelInputKind.Scroll, 0, 0, 20), [], out _);
        Assert.Equal(0, view.Scroll);
        Assert.False(view.Apply(new(PanelInputKind.Scroll, 0, 0, 1), [], out _));
    }

    [Fact]
    public void Dragging_the_thumb_follows_the_laser()
    {
        var view = Scrolled(20);
        HitTarget[] targets = [new(new SKRect(0, 0, 10, 10), ClickAction.ScrollThumb)];
        view.Apply(new(PanelInputKind.Down, 5, 5), targets, out _);
        Assert.True(view.Dragging);
        view.Apply(new(PanelInputKind.Move, 5, 55), targets, out _);   // half the travel
        Assert.Equal(10, view.Scroll);
        view.Apply(new(PanelInputKind.Up, 5, 55), targets, out _);
        view.Apply(new(PanelInputKind.Move, 5, 105), targets, out _);  // released: no effect
        Assert.Equal(10, view.Scroll);
    }

    [Fact]
    public void Picking_a_list_starts_at_the_top_and_buttons_go_to_the_caller()
    {
        var view = Scrolled(20);
        view.Scroll = 7;
        var join = new HitTarget(new SKRect(0, 20, 10, 30), ClickAction.JoinPlace);
        HitTarget[] targets = [new(new SKRect(0, 0, 10, 10), ClickAction.SelectList, List: "group:group_1"), join];

        view.Apply(new(PanelInputKind.Down, 5, 5), targets, out var press);
        Assert.Null(press);
        Assert.Equal(("group:group_1", 0), (view.Selected, view.Scroll));

        Assert.False(view.Apply(new(PanelInputKind.Down, 5, 25), targets, out press));
        Assert.Same(join, press);
    }
}
