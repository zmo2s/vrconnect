namespace DashboardVRChat.Api.Services.Auth
{
    public class RegisterDto
    {
        public string Username { get; set; }
        public string Password { get; set; }
        public string Mail { get; set; }

        public string? idvrchat { get; set; }

    }
}
