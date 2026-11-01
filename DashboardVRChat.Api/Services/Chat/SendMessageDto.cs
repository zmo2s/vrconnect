namespace DashboardVRChat.Api.Services.Chat
{
    public class SendMessageDto
    {
        public string ReceiverId { get; set; }
        public string Content { get; set; }
        public string? vrchatId { get; set; }
    }
}
