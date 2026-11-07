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
        JoinMe = new(0x42, 0xC8, 0xFF), Active = new(0x5B, 0xE3, 0x7C), AskMe = new(0xE8, 0x85, 0x3A), Busy = new(0xE8, 0x43, 0x43);

    private static readonly SKTypeface Regular = SKTypeface.FromFamilyName("Segoe UI") ?? SKTypeface.Default;
    private static readonly SKTypeface Bold = SKTypeface.FromFamilyName("Segoe UI", SKFontStyle.Bold) ?? SKTypeface.Default;

    /// <summary>Draws the panel to a PNG and returns its clickable areas.</summary>
    public static List<HitTarget> RenderPanel(OverlayState state, string path)
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

        // Left: where to go
        DrawText(canvas, "WHERE TO GO", 48, 150, 18, Muted, bold: true);
        var y = 170f;
        foreach (var place in state.Places.Take(4))
        {
            var box = new SKRect(40, y, 640, y + 138);
            DrawPlace(canvas, place, box, first: y == 170f);
            // Join when you can walk in; otherwise ask a friend who is there (Busy friends block invites)
            var asker = place.Friends.FirstOrDefault(friend => friend.Presence != Presence.Busy);
            if (place.IsOpen && !place.IsFull)
                targets.Add(new(DrawButton(canvas, "Join", box.Right - 20, box.Bottom - 18, Accent), ClickAction.JoinPlace, Place: place));
            else if (asker != null)
                targets.Add(new(DrawButton(canvas, "Ask invite", box.Right - 20, box.Bottom - 18, Line), ClickAction.AskInvite, Friend: asker));
            y += 150;
        }
        if (state.Places.Count == 0) DrawText(canvas, "None of your friends is in a public place right now.", 48, 210, 22, Muted);

        // Right: friends list, Join me first (same order as VRChat's quick menu)
        DrawText(canvas, "FRIENDS ONLINE", 690, 150, 18, Muted, bold: true);
        y = 170;
        var ordered = state.Friends.OrderBy(friend => friend.Presence).ThenBy(friend => friend.Name, StringComparer.CurrentCultureIgnoreCase).ToList();
        // 10 rows keep clear of the message bar at the bottom
        foreach (var friend in ordered.Take(10))
        {
            var row = new SKRect(680, y, Width - 40, y + 52);
            // In a private world: you can only get there with an invite. Busy blocks invites.
            var canAsk = friend.Presence is not (Presence.Busy or Presence.Web) && friend.Location == "private";
            DrawFriend(canvas, friend, row, reserveButton: canAsk);
            if (canAsk) targets.Add(new(DrawButton(canvas, "Ask invite", row.Right - 4, row.Bottom - 8, Line, small: true), ClickAction.AskInvite, Friend: friend));
            y += 54;
        }
        if (ordered.Count > 10 && state.Toast == null) DrawText(canvas, $"+{ordered.Count - 10} more in the dashboard", 700, y + 26, 20, Muted);

        DrawToast(canvas, state.Toast);
        Save(surface, path);
        return targets;
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

    private static void DrawPlace(SKCanvas canvas, Place place, SKRect box, bool first)
    {
        using (var fill = new SKPaint { Color = Panel, IsAntialias = true }) canvas.DrawRoundRect(box, 20, 20, fill);
        if (first)
            using (var ring = new SKPaint { Color = Accent, IsAntialias = true, Style = SKPaintStyle.Stroke, StrokeWidth = 3 }) canvas.DrawRoundRect(box, 20, 20, ring);

        DrawText(canvas, Fit(place.WorldName, 26, box.Width - 200, bold: true), box.Left + 24, box.Top + 44, 26, Text, bold: true);
        // Top right: everyone in the instance / max, like the web cards
        var count = place.People is { } people ? $"{people}{(place.Capacity is { } cap ? $"/{cap}" : "")} people" : "? people";
        DrawText(canvas, count, box.Right - 24, box.Top + 42, 22, place.IsFull ? Busy : Text, bold: true, right: true);

        var detail = string.Join(" · ", new[] { place.Access, place.Region, place.IsFull ? "Full" : null, place.IsOpen ? null : "Invite needed" }.OfType<string>());
        DrawText(canvas, detail, box.Left + 24, box.Top + 78, 20, place.IsOpen ? Muted : AskMe);

        var names = string.Join(", ", place.Friends.Select(friend => friend.Name).Take(3)) + (place.Friends.Count > 3 ? $" +{place.Friends.Count - 3}" : "");
        DrawDot(canvas, box.Left + 30, box.Top + 108, Active);
        // Leave room for the Join / Ask invite button on the right
        DrawText(canvas, Fit($"{place.Friends.Count} {(place.Friends.Count == 1 ? "friend" : "friends")}: {names}", 20, box.Width - 230), box.Left + 46, box.Top + 115, 20, Text);
    }

    private static void DrawFriend(SKCanvas canvas, OnlineFriend friend, SKRect row, bool reserveButton = false)
    {
        using (var line = new SKPaint { Color = Line, StrokeWidth = 1 }) canvas.DrawLine(row.Left, row.Bottom, row.Right, row.Bottom, line);
        if (reserveButton) row = new SKRect(row.Left, row.Top, row.Right - 140, row.Bottom);
        var color = friend.Presence switch { Presence.JoinMe => JoinMe, Presence.Active => Active, Presence.AskMe => AskMe, Presence.Busy => Busy, _ => JoinMe };
        DrawDot(canvas, row.Left + 18, row.MidY, color, hollow: friend.Presence == Presence.Web);
        DrawText(canvas, Fit(friend.Name, 24, 250, bold: true), row.Left + 40, row.MidY + 8, 24, Text, bold: true);
        var where = friend.Presence == Presence.Web ? "On the website"
            : friend.WorldName ?? (friend.Location == "private" ? "Private world" : friend.Location == "traveling" ? "Traveling…" : "In game");
        DrawText(canvas, Fit(where, 20, row.Width - 320), row.Right - 8, row.MidY + 7, 20, Muted, right: true);
    }

    private static void DrawDot(SKCanvas canvas, float x, float y, SKColor color, bool hollow = false)
    {
        using var paint = new SKPaint { Color = color, IsAntialias = true, Style = hollow ? SKPaintStyle.Stroke : SKPaintStyle.Fill, StrokeWidth = 3 };
        canvas.DrawCircle(x, y, 8, paint);
    }

    /// <summary>Draws text, switching to a fallback font for characters Segoe UI lacks (Japanese, Korean, emoji…).</summary>
    private static void DrawText(SKCanvas canvas, string text, float x, float y, float size, SKColor color, bool bold = false, bool center = false, bool right = false)
    {
        using var font = new SKFont(TypefaceFor(text, bold), size) { Subpixel = true };
        using var paint = new SKPaint { Color = color, IsAntialias = true };
        var align = center ? SKTextAlign.Center : right ? SKTextAlign.Right : SKTextAlign.Left;
        canvas.DrawText(text, x, y, align, font, paint);
    }

    private static SKTypeface TypefaceFor(string text, bool bold)
    {
        var typeface = bold ? Bold : Regular;
        foreach (var rune in text.EnumerateRunes())
        {
            if (typeface.ContainsGlyph(rune.Value)) continue;
            return SKFontManager.Default.MatchCharacter("Segoe UI", bold ? SKFontStyle.Bold : SKFontStyle.Normal, null, rune.Value) ?? typeface;
        }
        return typeface;
    }

    /// <summary>Shortens text with "…" so it fits the given width.</summary>
    private static string Fit(string text, float size, float maxWidth, bool bold = false)
    {
        using var font = new SKFont(TypefaceFor(text, bold), size);
        if (font.MeasureText(text) <= maxWidth) return text;
        while (text.Length > 1 && font.MeasureText(text + "…") > maxWidth) text = text[..^1];
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
