namespace DashboardVRChat.Api.Services.ChatService
{
    using DashboardVRChat.Api;
    using DashboardVRChat.Api.Services.Chat;
    using Microsoft.AspNetCore.Authentication.JwtBearer;
    using Microsoft.AspNetCore.Authorization;
    using Microsoft.AspNetCore.Mvc;
    using Microsoft.EntityFrameworkCore;
    using System.Security.Claims;
    using static DashboardVRChat.Api.Services.ChatService.VrChatSessionService;

    [ApiController]
    [Route("api/conversations")]
    //[Authorize]
    public class ConversationsController : ControllerBase
    {
        private readonly ChatDbContext _db;

        public ConversationsController(ChatDbContext db)
        {
            _db = db;
        }

        [HttpGet("userIds")]
        public async Task<IActionResult> GetAllUserIds()
        {
            var userIds = await _db.Users
                .Select(u => u.Id)
                .ToListAsync();
            return Ok(userIds);
        }

        [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
        [HttpGet("user/by-vrchat/{vrchatId}")]
        public async Task<IActionResult> GetUserIdByVrchatId([FromRoute] string vrchatId)
        {
            try
            {
                var user = await _db.Users
                    .Where(u => u.idvrchat == vrchatId)
                    .Select(u => new
                    {
                        u.Id,
                        u.UserName,
                        u.idvrchat
                    })
                    .FirstOrDefaultAsync();

                if (user == null)
                    return NotFound("User not found.");

                return Ok(user);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    error = ex.Message,
                    inner = ex.InnerException?.Message
                });
            }
        }

        [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
        [HttpGet("messages/{otherUserId}")]
        public async Task<IActionResult> GetMessagesBetweenUsers(Guid otherUserId)
        {
            var userIdValue = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

            if (!Guid.TryParse(userIdValue, out var currentUserId))
                return Unauthorized();

            var messages = await _db.Messages
                .Where(m =>
                    (m.SenderId == currentUserId && m.ReceiverId == otherUserId) ||
                    (m.SenderId == otherUserId && m.ReceiverId == currentUserId))
                .OrderBy(m => m.SentAtUtc)
                .Select(m => new
                {
                    m.Id,
                    m.SenderId,
                    m.ReceiverId,
                    m.Content,
                    m.SentAtUtc,
                    m.IsRead
                })
                .ToListAsync();

            return Ok(messages);
        }

     
        [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
        [HttpPost("debug-auth")]
      
        public async Task<IActionResult> SendMessage([FromBody] SendMessageDto dto)
        {
            var claims = User.Claims.ToList();
            var currentUserId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;

            if (string.IsNullOrEmpty(currentUserId))
                return Unauthorized();

            var message = new ChatMessage
            {
                Id = Guid.NewGuid(),
                SenderId = Guid.Parse(currentUserId),
                ReceiverId = new Guid(dto.ReceiverId),
                Content = dto.Content,
                SentAtUtc = DateTime.UtcNow,
                IsRead = false
            };

            _db.Messages.Add(message);
            await _db.SaveChangesAsync();

            return Ok(message);
        }
    }
}
