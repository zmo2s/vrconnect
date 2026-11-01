using System.Text.Json;

namespace DashboardVRChat.Api.Services.ChatService;

public static class NotificationFeedParser
{
    // Notification types and optional fields evolve independently of the generated SDK.
    public static (object[] Items, int Skipped) ParseModern(string json)
    {
        using var document = JsonDocument.Parse(json);
        if (document.RootElement.ValueKind != JsonValueKind.Array)
            throw new JsonException("Expected a notification array.");
        var items = new List<object>();
        var skipped = 0;
        foreach (var n in document.RootElement.EnumerateArray())
        {
            if (n.ValueKind != JsonValueKind.Object || string.IsNullOrWhiteSpace(Text(n, "id")) || string.IsNullOrWhiteSpace(Text(n, "type")))
            {
                skipped++;
                continue;
            }
            items.Add(new
            {
                id = Text(n, "id"), feed = "v2", type = Text(n, "type"),
                title = Text(n, "title"), message = Text(n, "message") ?? "",
                senderId = Text(n, "senderUserId"), senderName = Text(n, "senderUsername"),
                createdAt = Text(n, "createdAt") ?? "", seen = n.TryGetProperty("seen", out var seen) && seen.ValueKind == JsonValueKind.True,
                imageUrl = Text(n, "imageUrl"), link = Text(n, "link"), linkText = Text(n, "linkText"),
                details = Value(n, "details"), data = Value(n, "data"),
                category = Text(n, "category"), expiresAt = Text(n, "expiresAt")
            });
        }
        return (items.ToArray(), skipped);
    }
    private static string? Text(JsonElement item, string key) => item.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
    private static JsonElement? Value(JsonElement item, string key) => item.TryGetProperty(key, out var value) && value.ValueKind is not JsonValueKind.Null and not JsonValueKind.Undefined ? value.Clone() : null;
}
