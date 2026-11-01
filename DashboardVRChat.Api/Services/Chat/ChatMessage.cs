namespace DashboardVRChat.Api.Services.ChatService
{
    public class ChatMessage
    {
        public Guid Id { get; set; }
        public Guid ConversationId { get; set; }
        public Guid SenderId { get; set; }
        public Guid ReceiverId { get; set; }
        public string Content { get; set; } = "";
        public DateTime SentAtUtc { get; set; }
        public bool IsRead { get; set; }
    }
}
