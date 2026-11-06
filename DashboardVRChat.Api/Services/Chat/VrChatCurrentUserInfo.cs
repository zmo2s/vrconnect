namespace DashboardVRChat.Api.Services.Chat
{
    public class VrChatCurrentUserInfo
    {
        public string Id { get; set; }
        public string DisplayName { get; set; }
        public string Status { get; set; }
        public string? StatusDescription { get; set; }
        public List<string> StatusHistory { get; set; } = new();
        public string? ProfilePicUrl { get; set; }
        public string Bio { get; set; }
        public string CurrentAvatarImageUrl { get; set; }
        public string CurrentAvatarThumbnailImageUrl { get; set; }
    }
}
