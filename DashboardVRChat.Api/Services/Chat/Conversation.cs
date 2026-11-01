namespace DashboardVRChat.Api.Services.ChatService
{
    public class Conversation
    {
        public Guid Id { get; set; }
        public Guid User1Id { get; set; }
        public Guid User2Id { get; set; }
        public DateTime CreatedAtUtc { get; set; }
    }
}
