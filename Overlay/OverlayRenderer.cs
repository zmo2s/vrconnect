using SkiaSharp;

namespace VrConnect.Overlay;

/// <summary>Draws the overlay panel (and its dashboard thumbnail) as PNG images that SteamVR shows.</summary>
public static class OverlayRenderer
{
    public const int Width = 1280, Height = 800;
    /// <summary>The "Refresh" button, in texture pixels (SteamVR mouse events use the same coordinates).</summary>
    public static readonly SKRect RefreshButton = new(Width - 220, 34, Width - 40, 86);

    // Same palette as the web dashboard (--status-* tokens in index.css)
    private static readonly SKColor Background = new(0x10, 0x14, 0x1F), Panel = new(0x1A, 0x20, 0x2E), Line = new(0x2A, 0x32, 0x44),
        Text = new(0xF2, 0xF4, 0xF8), Muted = new(0x9A, 0xA3, 0xB5), Accent = new(0x3B, 0x82, 0xF6),
        Gold = new(0xF5, 0xC2, 0x42), JoinMe = new(0x42, 0xC8, 0xFF), Active = new(0x5B, 0xE3, 0x7C), AskMe = new(0xE8, 0x85, 0x3A), Busy = new(0xE8, 0x43, 0x43);

    private static readonly SKTypeface Regular = SKTypeface.FromFamilyName("Segoe UI") ?? SKTypeface.Default;
    private static readonly SKTypeface Bold = SKTypeface.FromFamilyName("Segoe UI", SKFontStyle.Bold) ?? SKTypeface.Default;

    /// <summary>Draws the panel to a PNG and returns its clickable areas. <paramref name="images"/> gives already-loaded pictures.</summary>
    public static List<HitTarget> RenderPanel(OverlayState state, PanelView view, string path, ImageCache? images = null)
    {
        var targets = new List<HitTarget> { new(RefreshButton, ClickAction.Refresh) };
        using var surface = SKSurface.Create(new SKImageInfo(Width, Height));
        var canvas = surface.Canvas;
        canvas.Clear(Background);

        // Header
        DrawText(canvas, "vrconnect", 48, 76, 40, Text, bold: true);
        var online = state.Friends.Count(friend => friend.Presence != Presence.Web);
        var web = state.Friends.Count - online;
        DrawText(canvas, state.Problem == null ? $"{online} friends in game{(web > 0 ? $" · {web} on the website" : "")} · updated {state.UpdatedAt:HH:mm}" : "Not connected",
            260, 72, 22, Muted);
        using (var button = new SKPaint { Color = Accent, IsAntialias = true })
            canvas.DrawRoundRect(RefreshButton, 26, 26, button);
        DrawText(canvas, "Refresh", RefreshButton.MidX, RefreshButton.MidY + 8, 22, SKColors.White, bold: true, center: true);

        if (state.Problem != null)
        {
            DrawText(canvas, state.Problem, Width / 2f, Height / 2f, 30, Text, center: true);
            DrawToast(canvas, state.Toast);
            Save(surface, path);
            return targets;
        }

        // Left: the lists (where to go, everyone online, your VRChat favorite groups)
        DrawText(canvas, "LISTS", 48, 150, 18, Muted, bold: true);
        var lists = new List<(string Key, string Name, string Count)>
        {
            (PanelView.Places, "Where to go", state.Places.Count.ToString()),
            (PanelView.Friends, "Friends online", state.Friends.Count.ToString()),
        };
        lists.AddRange(state.Groups.Select(group => (group.Key, group.Name, $"{group.Online}/{group.Members.Count}")));
        if (lists.All(list => list.Key != view.Selected)) view.Select(PanelView.Places);
        var y = ContentTop;
        foreach (var (key, name, count) in lists.Take(8))
        {
            var row = new SKRect(40, y, SidebarRight, y + 60);
            var selected = key == view.Selected;
            if (selected)
            {
                using (var fill = new SKPaint { Color = Panel, IsAntialias = true }) canvas.DrawRoundRect(row, 16, 16, fill);
                using (var bar = new SKPaint { Color = Accent, IsAntialias = true }) canvas.DrawRoundRect(new SKRect(row.Left, row.Top + 12, row.Left + 6, row.Bottom - 12), 3, 3, bar);
            }
            var isGroup = key.StartsWith("group:", StringComparison.Ordinal);
            if (isGroup)
                using (var star = new SKPaint { Color = Gold, IsAntialias = true }) canvas.DrawPath(Star(row.Left + 30, row.MidY - 1, 11, 5), star);
            DrawText(canvas, Fit(name, 22, row.Width - 120, bold: true), row.Left + (isGroup ? 50 : 22), row.MidY + 8, 22, selected ? Text : Muted, bold: true);
            DrawText(canvas, count, row.Right - 16, row.MidY + 7, 20, Muted, right: true);
            targets.Add(new(row, ClickAction.SelectList, List: key));
            y += 68;
        }
        if (state.Groups.Count == 0) DrawText(canvas, "No favorite groups on VRChat", 48, y + 30, 18, Muted);
        using (var line = new SKPaint { Color = Line, StrokeWidth = 1 }) canvas.DrawLine(SidebarRight + 20, ContentTop, SidebarRight + 20, ContentBottom, line);

        // Right: what the selected list holds, scrollable
        if (view.Selected == PanelView.Places)
        {
            DrawText(canvas, "WHERE TO GO", ContentLeft + 8, 150, 18, Muted, bold: true);
            const float card = 124, step = 134;
            var visible = (int)((ContentBottom - ContentTop + step - card) / step);
            Scrollable(canvas, view, state.Places.Count, visible, targets);
            y = ContentTop;
            foreach (var place in state.Places.Skip(view.Scroll).Take(visible))
            {
                var box = new SKRect(ContentLeft, y, ContentRight, y + card);
                DrawPlace(canvas, place, box, first: place == state.Places[0], images?.Get(place.ThumbnailUrl));
                // Join when you can walk in; otherwise ask a friend who is there (Busy friends block invites)
                var asker = place.Friends.FirstOrDefault(friend => friend.Presence != Presence.Busy);
                if (place.IsOpen && !place.IsFull)
                    targets.Add(new(DrawButton(canvas, "Join", box.Right - 20, box.Bottom - 16, Accent), ClickAction.JoinPlace, Place: place));
                else if (asker != null)
                    targets.Add(new(DrawButton(canvas, "Ask invite", box.Right - 20, box.Bottom - 16, Line), ClickAction.AskInvite, Friend: asker));
                y += step;
            }
            if (state.Places.Count == 0) DrawText(canvas, "None of your friends is in a place you can see right now.", ContentLeft + 8, ContentTop + 40, 22, Muted);
        }
        else
        {
            // Everyone online (Join me first, like VRChat's quick menu), or one group's members (offline ones last)
            var group = state.Groups.FirstOrDefault(candidate => candidate.Key == view.Selected);
            var people = group?.Members ?? state.Friends.OrderBy(friend => friend.Presence).ThenBy(friend => friend.Name, StringComparer.CurrentCultureIgnoreCase).ToList();
            var title = group == null ? "FRIENDS ONLINE" : $"{group.Name.ToUpperInvariant()} \u00b7 {group.Online} ONLINE";
            DrawText(canvas, Fit(title, 18, 560, bold: true), ContentLeft + 8, 150, 18, Muted, bold: true);
            const float step = 54;
            var visible = (int)((ContentBottom - ContentTop) / step);
            Scrollable(canvas, view, people.Count, visible, targets);
            if (people.Count > visible)
                DrawText(canvas, $"{view.Scroll + 1}\u2013{Math.Min(view.Scroll + visible, people.Count)} of {people.Count}", ContentRight, 150, 18, Muted, right: true);
            y = ContentTop;
            foreach (var friend in people.Skip(view.Scroll).Take(visible))
            {
                var row = new SKRect(ContentLeft, y, ContentRight, y + 52);
                // In a private world: you can only get there with an invite. Busy blocks invites.
                var canAsk = friend.Presence is not (Presence.Busy or Presence.Web or Presence.Offline) && friend.Location == "private";
                DrawFriend(canvas, friend, row, images?.Get(friend.AvatarUrl), reserveButton: canAsk);
                if (canAsk) targets.Add(new(DrawButton(canvas, "Ask invite", row.Right - 4, row.Bottom - 8, Line, small: true), ClickAction.AskInvite, Friend: friend));
                y += step;
            }
            if (people.Count == 0) DrawText(canvas, group == null ? "No friends online right now." : "This group is empty on VRChat.", ContentLeft + 8, ContentTop + 40, 22, Muted);
        }

        DrawToast(canvas, state.Toast);
        Save(surface, path);
        return targets;
    }

    // Layout: the lists on the left, their content on the right, the scrollbar at the right edge
    private const float ContentTop = 168, ContentBottom = Height - 90, SidebarRight = 330, ContentLeft = 370, ContentRight = Width - 84;
    private const float ScrollbarLeft = Width - 72, ScrollbarRight = Width - 40, ArrowHeight = 44;

    /// <summary>Clamps the scroll position and, when the list is longer than the panel, draws the scrollbar and its click areas.</summary>
    private static void Scrollable(SKCanvas canvas, PanelView view, int count, int visible, List<HitTarget> targets)
    {
        view.Visible = visible;
        view.MaxScroll = Math.Max(0, count - visible);
        view.Scroll = Math.Clamp(view.Scroll, 0, view.MaxScroll);
        view.ThumbTravel = 0;
        if (view.MaxScroll == 0) return;

        var up = new SKRect(ScrollbarLeft, ContentTop, ScrollbarRight, ContentTop + ArrowHeight);
        var down = new SKRect(ScrollbarLeft, ContentBottom - ArrowHeight, ScrollbarRight, ContentBottom);
        var track = new SKRect(ScrollbarLeft + 8, up.Bottom + 8, ScrollbarRight - 8, down.Top - 8);
        var thumbHeight = Math.Max(48, track.Height * visible / count);
        view.ThumbTravel = track.Height - thumbHeight;
        var thumbTop = track.Top + view.ThumbTravel * view.Scroll / view.MaxScroll;
        var thumb = new SKRect(track.Left, thumbTop, track.Right, thumbTop + thumbHeight);

        using (var fill = new SKPaint { Color = Panel, IsAntialias = true })
        {
            canvas.DrawRoundRect(up, 12, 12, fill);
            canvas.DrawRoundRect(down, 12, 12, fill);
            canvas.DrawRoundRect(track, 8, 8, fill);
        }
        using (var paint = new SKPaint { Color = Accent, IsAntialias = true }) canvas.DrawRoundRect(thumb, 8, 8, paint);
        using (var arrow = new SKPaint { Color = Text, IsAntialias = true })
        {
            canvas.DrawPath(Triangle(up.MidX, up.MidY, pointingUp: true), arrow);
            canvas.DrawPath(Triangle(down.MidX, down.MidY, pointingUp: false), arrow);
        }

        // Wider than drawn: a laser is hard to keep on a thin bar
        targets.Add(new(Wider(up), ClickAction.ScrollUp));
        targets.Add(new(Wider(down), ClickAction.ScrollDown));
        targets.Add(new(Wider(thumb), ClickAction.ScrollThumb));
        targets.Add(new(Wider(new SKRect(track.Left, track.Top, track.Right, thumb.Top)), ClickAction.PageUp));
        targets.Add(new(Wider(new SKRect(track.Left, thumb.Bottom, track.Right, track.Bottom)), ClickAction.PageDown));
    }

    private static SKRect Wider(SKRect area) => new(area.Left - 12, area.Top, area.Right + 12, area.Bottom);

    private static SKPath Triangle(float x, float y, bool pointingUp)
    {
        var path = new SKPath();
        var tip = pointingUp ? -7f : 7f;
        path.MoveTo(x, y + tip);
        path.LineTo(x - 9, y - tip);
        path.LineTo(x + 9, y - tip);
        path.Close();
        return path;
    }

    /// <summary>A pill button whose bottom-right corner is at (right, bottom). Returns its area, slightly enlarged for the laser.</summary>
    private static SKRect DrawButton(SKCanvas canvas, string label, float right, float bottom, SKColor color, bool small = false)
    {
        float size = small ? 18 : 22, height = small ? 36 : 44;
        using var font = new SKFont(Bold, size);
        var width = font.MeasureText(label) + (small ? 28 : 40);
        var area = new SKRect(right - width, bottom - height, right, bottom);
        using (var fill = new SKPaint { Color = color, IsAntialias = true }) canvas.DrawRoundRect(area, height / 2, height / 2, fill);
        DrawText(canvas, label, area.MidX, area.MidY + size * 0.36f, size, SKColors.White, bold: true, center: true);
        area.Inflate(6, 6);
        return area;
    }

    private static void DrawToast(SKCanvas canvas, Toast? toast)
    {
        if (toast == null || toast.Until < DateTimeOffset.Now) return;
        var box = new SKRect(40, Height - 76, Width - 40, Height - 20);
        using (var fill = new SKPaint { Color = toast.Ok ? new SKColor(0x16, 0x3D, 0x2A) : new SKColor(0x4A, 0x1C, 0x1C), IsAntialias = true })
            canvas.DrawRoundRect(box, 18, 18, fill);
        DrawText(canvas, Fit(toast.Text, 22, box.Width - 48), box.MidX, box.MidY + 8, 22, Text, center: true);
    }

    public const int AlertWidth = 900, AlertHeight = 170;

    /// <summary>The banner shown in front of you: a star for a favorite, a group icon for friends gathering.</summary>
    public static void RenderAlert(Alert alert, string path)
    {
        using var surface = SKSurface.Create(new SKImageInfo(AlertWidth, AlertHeight));
        var canvas = surface.Canvas;
        canvas.Clear(SKColors.Transparent);
        var box = new SKRect(6, 6, AlertWidth - 6, AlertHeight - 6);
        using (var fill = new SKPaint { Color = Background.WithAlpha(235), IsAntialias = true }) canvas.DrawRoundRect(box, 40, 40, fill);
        var color = alert.Kind == AlertKind.FavoriteOnline ? new SKColor(0xF5, 0xC2, 0x42) : Active;
        using (var ring = new SKPaint { Color = color, IsAntialias = true, Style = SKPaintStyle.Stroke, StrokeWidth = 4 }) canvas.DrawRoundRect(box, 40, 40, ring);

        // Icon: a star for a favorite, three dots for a gathering
        using (var icon = new SKPaint { Color = color, IsAntialias = true })
        {
            if (alert.Kind == AlertKind.FavoriteOnline) canvas.DrawPath(Star(84, 85, 40, 17), icon);
            else { canvas.DrawCircle(64, 98, 16, icon); canvas.DrawCircle(104, 98, 16, icon); canvas.DrawCircle(84, 66, 18, icon); }
        }
        DrawText(canvas, Fit(alert.Title, 38, AlertWidth - 200, bold: true), 150, 78, 38, Text, bold: true);
        DrawText(canvas, Fit(alert.Detail, 28, AlertWidth - 200), 150, 122, 28, Muted);
        Save(surface, path);
    }

    private static SKPath Star(float cx, float cy, float outer, float inner)
    {
        var path = new SKPath();
        for (var i = 0; i < 10; i++)
        {
            var radius = i % 2 == 0 ? outer : inner;
            var angle = Math.PI / 5 * i - Math.PI / 2;
            var point = new SKPoint(cx + (float)(radius * Math.Cos(angle)), cy + (float)(radius * Math.Sin(angle)));
            if (i == 0) path.MoveTo(point); else path.LineTo(point);
        }
        path.Close();
        return path;
    }

    /// <summary>Small square icon SteamVR shows in its dashboard bar.</summary>
    public static void RenderThumbnail(string path)
    {
        using var surface = SKSurface.Create(new SKImageInfo(256, 256));
        var canvas = surface.Canvas;
        canvas.Clear(SKColors.Transparent);
        using var paint = new SKPaint { Color = Accent, IsAntialias = true };
        canvas.DrawRoundRect(new SKRect(16, 16, 240, 240), 56, 56, paint);
        DrawText(canvas, "vr", 128, 158, 110, SKColors.White, bold: true, center: true);
        Save(surface, path);
    }

    private static void DrawPlace(SKCanvas canvas, Place place, SKRect box, bool first, SKImage? picture)
    {
        using (var fill = new SKPaint { Color = Panel, IsAntialias = true }) canvas.DrawRoundRect(box, 20, 20, fill);
        if (picture != null)
        {
            // World picture as the card background, darkened on the left where the text is
            canvas.Save();
            canvas.ClipRoundRect(new SKRoundRect(box, 20, 20), antialias: true);
            DrawCover(canvas, picture, box);
            using var shade = new SKPaint
            {
                Shader = SKShader.CreateLinearGradient(new SKPoint(box.Left, 0), new SKPoint(box.Right, 0),
                    [Background.WithAlpha(245), Background.WithAlpha(215), Background.WithAlpha(150)], [0, 0.55f, 1], SKShaderTileMode.Clamp),
            };
            canvas.DrawRect(box, shade);
            canvas.Restore();
        }
        if (first)
            using (var ring = new SKPaint { Color = Accent, IsAntialias = true, Style = SKPaintStyle.Stroke, StrokeWidth = 3 }) canvas.DrawRoundRect(box, 20, 20, ring);

        DrawText(canvas, Fit(place.WorldName, 26, box.Width - 200, bold: true), box.Left + 24, box.Top + 40, 26, Text, bold: true);
        // Top right: everyone in the instance / max, like the web cards
        var count = place.People is { } people ? $"{people}{(place.Capacity is { } cap ? $"/{cap}" : "")} people" : "? people";
        DrawText(canvas, count, box.Right - 24, box.Top + 38, 22, place.IsFull ? Busy : Text, bold: true, right: true);

        var detail = string.Join(" · ", new[] { place.Access, place.Region, place.IsFull ? "Full" : null, place.IsOpen ? null : "Invite needed" }.OfType<string>());
        DrawText(canvas, detail, box.Left + 24, box.Top + 72, 20, place.IsOpen ? Muted : AskMe);

        var names = string.Join(", ", place.Friends.Select(friend => friend.Name).Take(3)) + (place.Friends.Count > 3 ? $" +{place.Friends.Count - 3}" : "");
        DrawDot(canvas, box.Left + 30, box.Top + 100, Active);
        // Leave room for the Join / Ask invite button on the right
        DrawText(canvas, Fit($"{place.Friends.Count} {(place.Friends.Count == 1 ? "friend" : "friends")}: {names}", 20, box.Width - 230), box.Left + 46, box.Top + 107, 20, Text);
    }

    private static void DrawFriend(SKCanvas canvas, OnlineFriend friend, SKRect row, SKImage? avatar, bool reserveButton = false)
    {
        using (var line = new SKPaint { Color = Line, StrokeWidth = 1 }) canvas.DrawLine(row.Left, row.Bottom, row.Right, row.Bottom, line);
        if (reserveButton) row = new SKRect(row.Left, row.Top, row.Right - 140, row.Bottom);
        var color = friend.Presence switch { Presence.JoinMe => JoinMe, Presence.Active => Active, Presence.AskMe => AskMe, Presence.Busy => Busy, Presence.Offline => Muted.WithAlpha(150), _ => JoinMe };

        // Round avatar (or the initial), with the status dot on its bottom-right like VRChat
        var center = new SKPoint(row.Left + 22, row.MidY);
        var circle = new SKRect(center.X - 19, center.Y - 19, center.X + 19, center.Y + 19);
        if (avatar != null)
        {
            canvas.Save();
            using (var clip = new SKPath()) { clip.AddOval(circle); canvas.ClipPath(clip, antialias: true); }
            DrawCover(canvas, avatar, circle);
            canvas.Restore();
        }
        else
        {
            using (var fill = new SKPaint { Color = Line, IsAntialias = true }) canvas.DrawOval(circle, fill);
            DrawText(canvas, friend.Name[..1].ToUpperInvariant(), center.X, center.Y + 7, 20, Muted, bold: true, center: true);
        }
        using (var ring = new SKPaint { Color = Background, IsAntialias = true }) canvas.DrawCircle(center.X + 14, center.Y + 14, 9, ring);
        using (var dot = new SKPaint { Color = color, IsAntialias = true, Style = friend.Presence == Presence.Web ? SKPaintStyle.Stroke : SKPaintStyle.Fill, StrokeWidth = 2.5f })
            canvas.DrawCircle(center.X + 14, center.Y + 14, 6, dot);

        var offline = friend.Presence == Presence.Offline;
        DrawText(canvas, Fit(friend.Name, 24, 300, bold: true), row.Left + 54, row.MidY + 8, 24, offline ? Muted : Text, bold: true);
        var where = offline ? "Offline" : friend.Presence == Presence.Web ? "On the website"
            : friend.WorldName ?? (friend.Location == "private" ? "Private world" : friend.Location == "traveling" ? "Traveling…" : "In game");
        DrawText(canvas, Fit(where, 20, row.Width - 380), row.Right - 8, row.MidY + 7, 20, Muted, right: true);
    }

    /// <summary>Draws the picture filling the box (cropped, never stretched), like CSS object-fit: cover.</summary>
    private static void DrawCover(SKCanvas canvas, SKImage image, SKRect box)
    {
        var scale = Math.Max(box.Width / image.Width, box.Height / image.Height);
        float width = box.Width / scale, height = box.Height / scale;
        var source = SKRect.Create((image.Width - width) / 2, (image.Height - height) / 2, width, height);
        using var paint = new SKPaint { IsAntialias = true };
        canvas.DrawImage(image, source, box, new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.Linear), paint);
    }

    private static void DrawDot(SKCanvas canvas, float x, float y, SKColor color, bool hollow = false)
    {
        using var paint = new SKPaint { Color = color, IsAntialias = true, Style = hollow ? SKPaintStyle.Stroke : SKPaintStyle.Fill, StrokeWidth = 3 };
        canvas.DrawCircle(x, y, 8, paint);
    }

    /// <summary>Draws text, switching to a fallback font for characters Segoe UI lacks (Japanese, Korean, emoji…).</summary>
    private static void DrawText(SKCanvas canvas, string text, float x, float y, float size, SKColor color, bool bold = false, bool center = false, bool right = false)
    {
        // Names mix scripts ("我的家 ꧁Luna꧂"): draw each run with a font that has its characters
        var runs = Runs(text, bold);
        using var paint = new SKPaint { Color = color, IsAntialias = true };
        var width = Measure(runs, size);
        x = center ? x - width / 2 : right ? x - width : x;
        foreach (var (part, typeface) in runs)
        {
            using var font = new SKFont(typeface, size) { Subpixel = true };
            canvas.DrawText(part, x, y, SKTextAlign.Left, font, paint);
            x += font.MeasureText(part);
        }
    }

    private static readonly Dictionary<(int, bool), SKTypeface> Fallbacks = new();

    /// <summary>Splits text into runs that share a typeface: Segoe UI where it can, else whatever Windows font has the character.</summary>
    private static List<(string Text, SKTypeface Typeface)> Runs(string text, bool bold)
    {
        var primary = bold ? Bold : Regular;
        var runs = new List<(string, SKTypeface)>();
        var current = new System.Text.StringBuilder();
        SKTypeface? currentFace = null;
        foreach (var rune in text.EnumerateRunes())
        {
            SKTypeface face;
            if (primary.ContainsGlyph(rune.Value) || System.Text.Rune.IsWhiteSpace(rune)) face = currentFace ?? primary;
            else if (!Fallbacks.TryGetValue((rune.Value, bold), out face!))
                Fallbacks[(rune.Value, bold)] = face = SKFontManager.Default.MatchCharacter("Segoe UI", bold ? SKFontStyle.Bold : SKFontStyle.Normal, null, rune.Value) ?? primary;
            // Spaces and Latin letters stay in the current run only if that font has them
            if (face != primary && primary.ContainsGlyph(rune.Value) && !(currentFace?.ContainsGlyph(rune.Value) ?? false)) face = primary;
            if (currentFace != null && face != currentFace) { runs.Add((current.ToString(), currentFace)); current.Clear(); }
            currentFace = face;
            current.Append(rune.ToString());
        }
        if (currentFace != null) runs.Add((current.ToString(), currentFace));
        return runs;
    }

    private static float Measure(List<(string Text, SKTypeface Typeface)> runs, float size) =>
        runs.Sum(run => { using var font = new SKFont(run.Typeface, size); return font.MeasureText(run.Text); });

    /// <summary>Shortens text with "…" so it fits the given width (never cutting a character in half).</summary>
    private static string Fit(string text, float size, float maxWidth, bool bold = false)
    {
        if (Measure(Runs(text, bold), size) <= maxWidth) return text;
        while (text.Length > 1 && Measure(Runs(text + "…", bold), size) > maxWidth)
            text = text[..^(text.Length > 1 && char.IsLowSurrogate(text[^1]) ? 2 : 1)];
        return text.TrimEnd() + "…";
    }

    private static void Save(SKSurface surface, string path)
    {
        using var image = surface.Snapshot();
        using var data = image.Encode(SKEncodedImageFormat.Png, 100);
        var temporary = path + ".tmp";
        using (var file = File.Create(temporary)) data.SaveTo(file);
        File.Move(temporary, path, true);
    }
}
