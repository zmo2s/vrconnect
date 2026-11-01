namespace DashboardVRChat.Api.Services.ChatService
{
    using DashboardVRChat.Api;
    using Microsoft.AspNetCore.Authorization;
    using Microsoft.AspNetCore.SignalR;
    using Microsoft.EntityFrameworkCore;
    //[Authorize]
    public class PrivateChatHub : Hub
    {
        private readonly ChatDbContext _db;

        public PrivateChatHub(ChatDbContext db)
        {
            _db = db;
        }

        public async Task SendPrivateMessage(string receiverUserId, string content)
        {

            var senderUserId = Context.UserIdentifier;

              if (string.IsNullOrWhiteSpace(senderUserId))
                   throw new HubException("Utilisateur non authentifié.");

               if (string.IsNullOrWhiteSpace(receiverUserId))
                   throw new HubException("Destinataire invalide.");

               if (string.IsNullOrWhiteSpace(content))
                   throw new HubException("Message vide.");

            var senderId = Guid.Parse(senderUserId);
            var receiverId = Guid.Parse(receiverUserId);

            var conversation = await _db.Conversations
                .FirstOrDefaultAsync(c =>
                    (c.User1Id == senderId && c.User2Id == receiverId) ||
                    (c.User1Id == receiverId && c.User2Id == senderId));

            if (conversation == null)
            {
                conversation = new Conversation
                {
                    Id = Guid.NewGuid(),
                    User1Id = senderId,
                    User2Id = receiverId,
                    CreatedAtUtc = DateTime.UtcNow
                };

                _db.Conversations.Add(conversation);
            }

            var message = new ChatMessage
            {
                Id = Guid.NewGuid(),
                ConversationId = conversation.Id,
                SenderId = senderId,
                ReceiverId = receiverId,
                Content = content,
                SentAtUtc = DateTime.UtcNow,
                IsRead = false
            };

            _db.Messages.Add(message);
            await _db.SaveChangesAsync();

            var payload = new
            {
                message.Id,
                message.ConversationId,
                message.SenderId,
                message.ReceiverId,
                message.Content,
                message.SentAtUtc,
                message.IsRead
            };

            await Clients.User(receiverUserId).SendAsync("ReceivePrivateMessage", payload);
            await Clients.User(senderUserId).SendAsync("ReceivePrivateMessage", payload);
        }
    }
}
