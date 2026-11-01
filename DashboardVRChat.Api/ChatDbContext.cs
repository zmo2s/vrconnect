namespace DashboardVRChat.Api
{
    using DashboardVRChat.Api.Services.Auth;
    using DashboardVRChat.Api.Services.ChatService;
    using Microsoft.EntityFrameworkCore;
    using Polly;
    using System.Reflection.Emit;

    public class ChatDbContext : DbContext
    {
        public ChatDbContext(DbContextOptions<ChatDbContext> options) : base(options) { }

        public DbSet<AppUser> Users => Set<AppUser>();
        public DbSet<Conversation> Conversations => Set<Conversation>();
        public DbSet<ChatMessage> Messages => Set<ChatMessage>();
        public DbSet<UploadedImage> UploadedImages => Set<UploadedImage>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<Conversation>()
                .HasIndex(c => new { c.User1Id, c.User2Id });

            modelBuilder.Entity<ChatMessage>()
                .HasIndex(m => new { m.ConversationId, m.SentAtUtc });
        }
    }
}
