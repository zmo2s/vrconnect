using BCrypt.Net;
using DashboardVRChat.Api.Services.Chat;
using DashboardVRChat.Api.Services.ChatService;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using VRChat.API.Client;
namespace DashboardVRChat.Api.Services.Auth
{
    [ApiController]
    [Route("api/auth")]
    public class AuthController : ControllerBase
    {
        private readonly ChatDbContext _db;
        private readonly UserManager<AppUser> _userManager;
        private readonly IConfiguration _configuration;
        private VrChatSessionService _vrChatSessionService;


        public AuthController(ChatDbContext db, UserManager<AppUser> userManager, IConfiguration configuration , VrChatSessionService vrChatSessionService )
        {
            _db = db;
            _userManager = userManager;
            _configuration = configuration;
            _vrChatSessionService = vrChatSessionService;
        }

        [HttpPost("register")]
        public async Task<IActionResult> Register(RegisterDto dto)
        {


            var user = new AppUser
            {
                Id = Guid.NewGuid(),
                UserName = dto.Username?.Trim(),
                Email = dto.Mail?.Trim(),
            
            };

            var result = await _userManager.CreateAsync(user, dto.Password);

            if (!result.Succeeded)
                return BadRequest(result.Errors);

            return Ok(user.Id);
        }





        [HttpPost("login")]
        public async Task<IActionResult> Login(LoginDto dto)
        {
            if (dto == null ||
                string.IsNullOrWhiteSpace(dto.Username) ||
                string.IsNullOrWhiteSpace(dto.Password))
            {
                return BadRequest("Invalid data.");
            }

            var user = await _userManager.FindByNameAsync(dto.Username.Trim());

            if (user == null)
                return Unauthorized("Invalid username or password.");

            var passwordValid = await _userManager.CheckPasswordAsync(user, dto.Password);

            if (!passwordValid)
                return Unauthorized("Invalid username or password.");

            var token = GenerateJwtToken(user);

            return Ok(new
            {
                token,
                userId = user.Id,
                username = user.UserName
            });
        }

        private string GenerateJwtToken(AppUser user)
        {
            var jwtSettings = _configuration.GetSection("Jwt");

            var claims = new List<Claim>
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.UniqueName, user.UserName ?? string.Empty),
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Name, user.UserName ?? string.Empty)
        };

            var key = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(jwtSettings["Key"]));

            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var token = new JwtSecurityToken(
                issuer: jwtSettings["Issuer"],
                audience: jwtSettings["Audience"],
                claims: claims,
                expires: DateTime.UtcNow.AddHours(2),
                signingCredentials: creds
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }
}
