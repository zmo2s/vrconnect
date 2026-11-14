using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Channels;

namespace DashboardVRChat.Api.Services.Chat;

/// <summary>One event relayed to the dashboard: an SSE event name and its JSON payload.</summary>
public sealed record PipelineEvent(string Type, string Json);

/// <summary>
/// Live VRChat events. Keeps one WebSocket to wss://pipeline.vrchat.cloud per signed-in dashboard session
/// (shared by every open tab of that session) and fans its events out to the dashboard's SSE streams.
/// The pipeline is receive-only and documented by the community, not by VRChat: when it is down the
/// dashboard is told ("status" event) and goes back to polling the REST API.
/// </summary>
public sealed class VrChatPipeline : IDisposable
{
    private const string PipelineUrl = "wss://pipeline.vrchat.cloud/?authToken=";
    // Keep the socket a little after the last tab closes, so a page refresh does not reconnect.
    private static readonly TimeSpan IdleGrace = TimeSpan.FromSeconds(30);

    private readonly Dictionary<string, Connection> _connections = new();
    private readonly object _gate = new();
    private readonly ILogger<VrChatPipeline> _logger;

    public VrChatPipeline(ILogger<VrChatPipeline> logger) => _logger = logger;

    public Subscription Subscribe(string sessionKey, string authToken, string userAgent)
    {
        lock (_gate)
        {
            if (_connections.TryGetValue(sessionKey, out var existing) && existing.AuthToken != authToken)
            {
                existing.Stop();
                _connections.Remove(sessionKey);
                existing = null;
            }
            if (existing == null)
            {
                existing = new Connection(this, sessionKey, authToken, userAgent);
                _connections[sessionKey] = existing;
            }
            return existing.AddSubscriber();
        }
    }

    /// <summary>Closes the session's socket and ends its SSE streams (sign-out).</summary>
    public void Stop(string sessionKey)
    {
        lock (_gate)
        {
            if (!_connections.Remove(sessionKey, out var connection)) return;
            connection.Stop();
        }
    }

    private void RemoveIfIdle(Connection connection)
    {
        lock (_gate)
        {
            if (!connection.IsIdle) return;
            if (_connections.TryGetValue(connection.SessionKey, out var current) && current == connection)
                _connections.Remove(connection.SessionKey);
            connection.Stop();
        }
    }

    public void Dispose()
    {
        lock (_gate)
        {
            foreach (var connection in _connections.Values) connection.Stop();
            _connections.Clear();
        }
    }

    public sealed class Subscription : IDisposable
    {
        private readonly Action _dispose;
        private int _disposed;
        public ChannelReader<PipelineEvent> Reader { get; }
        internal Subscription(ChannelReader<PipelineEvent> reader, Action dispose) { Reader = reader; _dispose = dispose; }
        public void Dispose() { if (Interlocked.Exchange(ref _disposed, 1) == 0) _dispose(); }
    }

    private sealed class Connection
    {
        private readonly VrChatPipeline _owner;
        private readonly string _userAgent;
        private readonly ConcurrentDictionary<Guid, Channel<PipelineEvent>> _subscribers = new();
        private readonly CancellationTokenSource _stop = new();
        private Task? _loop;
        private Timer? _idleTimer;
        private volatile bool _connected;

        public string SessionKey { get; }
        public string AuthToken { get; }
        public bool IsIdle => _subscribers.IsEmpty;

        public Connection(VrChatPipeline owner, string sessionKey, string authToken, string userAgent)
        {
            _owner = owner;
            SessionKey = sessionKey;
            AuthToken = authToken;
            _userAgent = userAgent;
        }

        public Subscription AddSubscriber()
        {
            _idleTimer?.Dispose();
            _idleTimer = null;
            var id = Guid.NewGuid();
            var channel = Channel.CreateBounded<PipelineEvent>(new BoundedChannelOptions(500)
            {
                FullMode = BoundedChannelFullMode.DropOldest, SingleReader = true,
            });
            _subscribers[id] = channel;
            channel.Writer.TryWrite(StatusEvent(_connected));
            _loop ??= Task.Run(() => RunAsync(_stop.Token));
            return new Subscription(channel.Reader, () => RemoveSubscriber(id));
        }

        private void RemoveSubscriber(Guid id)
        {
            if (_subscribers.TryRemove(id, out var channel)) channel.Writer.TryComplete();
            if (_subscribers.IsEmpty)
                _idleTimer = new Timer(_ => _owner.RemoveIfIdle(this), null, IdleGrace, Timeout.InfiniteTimeSpan);
        }

        public void Stop()
        {
            _idleTimer?.Dispose();
            if (!_stop.IsCancellationRequested) _stop.Cancel();
            foreach (var channel in _subscribers.Values) channel.Writer.TryComplete();
            _subscribers.Clear();
        }

        private void Broadcast(PipelineEvent item)
        {
            foreach (var channel in _subscribers.Values) channel.Writer.TryWrite(item);
        }

        private void SetConnected(bool connected, int? retryInSeconds = null)
        {
            if (_connected == connected && retryInSeconds == null) return;
            _connected = connected;
            Broadcast(StatusEvent(connected, retryInSeconds));
        }

        private static PipelineEvent StatusEvent(bool connected, int? retryInSeconds = null) =>
            new("status", new JsonObject { ["connected"] = connected, ["retryInSeconds"] = retryInSeconds }.ToJsonString());

        private async Task RunAsync(CancellationToken stop)
        {
            // Exponential backoff, as the community docs ask; reset after a connection that held for a while.
            int[] delays = [2, 5, 10, 30, 60, 120, 300];
            var attempt = 0;
            while (!stop.IsCancellationRequested)
            {
                var startedAt = DateTime.UtcNow;
                try
                {
                    using var socket = new ClientWebSocket();
                    socket.Options.SetRequestHeader("User-Agent", _userAgent);
                    socket.Options.KeepAliveInterval = TimeSpan.FromSeconds(30);
                    using (var connectTimeout = CancellationTokenSource.CreateLinkedTokenSource(stop))
                    {
                        connectTimeout.CancelAfter(TimeSpan.FromSeconds(15));
                        await socket.ConnectAsync(new Uri(PipelineUrl + Uri.EscapeDataString(AuthToken)), connectTimeout.Token);
                    }
                    _owner._logger.LogInformation("VRChat pipeline connected");
                    SetConnected(true);
                    await ReceiveAsync(socket, stop);
                }
                catch (OperationCanceledException) when (stop.IsCancellationRequested) { break; }
                catch (Exception ex)
                {
                    _owner._logger.LogWarning("VRChat pipeline connection failed: {Error}", ex.Message);
                }

                if (stop.IsCancellationRequested) break;
                if (DateTime.UtcNow - startedAt > TimeSpan.FromMinutes(2)) attempt = 0;
                var delay = delays[Math.Min(attempt++, delays.Length - 1)];
                SetConnected(false, delay);
                try { await Task.Delay(TimeSpan.FromSeconds(delay), stop); }
                catch (OperationCanceledException) { break; }
            }
            _connected = false;
        }

        private async Task ReceiveAsync(ClientWebSocket socket, CancellationToken stop)
        {
            var buffer = new byte[16 * 1024];
            using var message = new MemoryStream();
            while (socket.State == WebSocketState.Open && !stop.IsCancellationRequested)
            {
                var result = await socket.ReceiveAsync(buffer, stop);
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    _owner._logger.LogInformation("VRChat pipeline closed: {Status} {Description}", result.CloseStatus, result.CloseStatusDescription);
                    return;
                }
                message.Write(buffer, 0, result.Count);
                if (message.Length > 4 * 1024 * 1024) { message.SetLength(0); continue; } // ignore absurd frames
                if (!result.EndOfMessage) continue;
                var text = Encoding.UTF8.GetString(message.GetBuffer(), 0, (int)message.Length);
                message.SetLength(0);
                if (Translate(text) is { } item) Broadcast(item);
            }
        }

        private PipelineEvent? Translate(string text)
        {
            JsonObject? root;
            try { root = JsonNode.Parse(text) as JsonObject; }
            catch (JsonException) { return null; }
            if (root == null) return null;

            // VRChat sends {"err": "..."} before closing (e.g. expired login, token used from another IP).
            if (root["err"] is JsonNode err)
            {
                _owner._logger.LogWarning("VRChat pipeline error: {Error}", err.ToJsonString());
                return null;
            }

            var type = root["type"]?.GetValue<string>();
            if (string.IsNullOrEmpty(type)) return null;
            var content = root["content"];
            // Most "content" values are JSON encoded a second time, as a string.
            if (content is JsonValue value && value.TryGetValue<string>(out var inner))
            {
                try { content = JsonNode.Parse(inner); } catch (JsonException) { /* keep the string */ }
            }

            if (type.StartsWith("friend-", StringComparison.Ordinal))
                return new PipelineEvent(type, SlimFriendEvent(content as JsonObject).ToJsonString());
            if (type.StartsWith("notification", StringComparison.Ordinal))
                return new PipelineEvent("notification", new JsonObject { ["kind"] = type }.ToJsonString());
            return null;
        }

        /// <summary>Only the fields the dashboard uses, so we never relay more of the account than needed.</summary>
        private static JsonObject SlimFriendEvent(JsonObject? content)
        {
            var slim = new JsonObject();
            if (content == null) return slim;
            foreach (var key in new[] { "userId", "location", "travelingToLocation", "worldId", "platform" })
                if (content[key] is JsonNode node) slim[key] = node.DeepClone();
            if (content["user"] is JsonObject user)
            {
                var slimUser = new JsonObject();
                foreach (var key in new[] { "id", "displayName", "status", "statusDescription", "bio", "currentAvatarImageUrl",
                                             "currentAvatarThumbnailImageUrl", "profilePicOverrideThumbnail", "last_login", "location" })
                    if (user[key] is JsonNode node) slimUser[key] = node.DeepClone();
                slim["user"] = slimUser;
            }
            return slim;
        }
    }
}
