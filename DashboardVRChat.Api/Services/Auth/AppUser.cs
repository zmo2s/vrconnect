using Microsoft.AspNetCore.Identity;

namespace DashboardVRChat.Api.Services.Auth
{
    public class AppUser : IdentityUser<Guid>
    {
        public string? idvrchat { get; set; }
    }
}
