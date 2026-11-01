namespace DashboardVRChat.Api.Services.ChatService
{
    public class UploadedImage
    {
        public Guid Id { get; set; }
        public string FileName { get; set; }
        public string ContentType { get; set; }
        public byte[] Data { get; set; }
        public DateTime CreatedAtUtc { get; set; }
    }
}
