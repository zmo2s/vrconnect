# VRChat Dashboard

A self-hosted dashboard to see where your VRChat friends are, manage your status, and stay on top of invites and notifications — without opening the game.

> **Unofficial.** This project is not affiliated with or endorsed by VRChat Inc. It uses the VRChat API with your own account and runs entirely on your own PC.

## Features

### Friends
- 🟢 **Live friends list** with status dots in the same colours as VRChat (Join Me, Online, Ask Me, Do Not Disturb)
- 🌐 **Website presence** — friends active on vrchat.com count as online and get their own "On the website" section (hollow blue ring)
- 🌍 **Where everyone is** — friends grouped by world and instance, with the **total number of people in each instance** (not only your friends) and its capacity
- ⭐ **Favorites**, private notes, search, location filters and sorting (online first, by place, A–Z)
- 🕒 **Activity timeline** — who came online, changed world or status, and when

### You
- 🙋 **Profile button** — set your VRChat status and status message from the dashboard, with your recent messages one click away
- 👥 **Friend groups** — create your own, or **import your VRChat favorite-friend groups** (including VRChat+ groups)
- 👋 **Boops, invites and invite requests**, one at a time or to a whole group

### Notifications
- 🔔 Notification center for VRChat invites, requests, boops and group announcements
- 🔊 Optional sounds and desktop notifications, with favorite-friend alerts

### Personalisation
- 🎨 **Accent colour** — presets or any custom colour
- 🖼️ **Wallpaper** — your own image or a link, with darken and blur controls
- 🌗 Light / dark / system theme, compact list, animation toggles

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite 8 + Tailwind CSS |
| Backend | ASP.NET Core (.NET 10, C#) + [VRChat.API](https://github.com/vrchatapi/vrchatapi-csharp) |
| Database | PostgreSQL |
| Auth | JWT + ASP.NET Identity |
| Tests | Vitest + Testing Library |

---

## Quick Start (Windows)

### Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- [Node.js 22.12 or newer](https://nodejs.org/) (LTS recommended)
- [PostgreSQL](https://www.postgresql.org/download/)

> Prefer not to install these yourself? See [`installer/README.md`](installer/README.md) to build a one-click Windows installer.

### First-time Setup

1. **Clone or download** this repository
2. **Run the setup script** (right-click → "Run with PowerShell"):
   ```
   SETUP.ps1
   ```
   This will:
   - Ask for your PostgreSQL credentials
   - Generate a secure JWT key automatically
   - Apply database migrations
   - Install frontend dependencies

3. **Launch the app**:
   ```
   START.bat
   ```
   Double-click `START.bat` — it starts both the API and frontend and opens your browser.

### Updating

After pulling a new version, reinstall the frontend packages (dependencies change between versions):

```bash
cd vrchat-friends-ui
npm install
```

---

## Manual Setup

### 1. Configure the API

Copy `DashboardVRChat.Api/appsettings.example.json` to `appsettings.json` and fill in your values:

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;Port=5432;Database=chatdb;Username=YOUR_USER;Password=YOUR_PASSWORD"
  },
  "Jwt": {
    "Key": "YOUR_RANDOM_SECRET_MIN_32_CHARS"
  }
}
```

> ⚠️ **Never commit real credentials** — keep your real `appsettings.json` local.

### 2. Apply database migrations

```bash
cd DashboardVRChat.Api
dotnet ef database update
```

### 3. Run the API

```bash
cd DashboardVRChat.Api
dotnet run
```

The API is available at `http://localhost:5000` (Swagger docs at `http://localhost:5000/swagger`).

### 4. Configure the frontend

Copy `vrchat-friends-ui/.env.example` to `.env.local` (only needed if your API is not on the default address):

```env
VITE_API_URL=http://localhost:5000
```

### 5. Run the frontend

```bash
cd vrchat-friends-ui
npm install
npm run dev
```

The dashboard is available at `http://localhost:8080`.

### Useful commands

```bash
npm run test    # run the test suite
npm run build   # production build
npm audit       # check dependencies for known vulnerabilities
```

---

## Project Structure

```
VRChatDashboard-OpenSource/
├── DashboardVRChat.Api/          # ASP.NET Core backend
│   ├── Services/Chat/            # VRChat API integration (friends, status, favorites, invites…)
│   ├── Migrations/               # Database migrations
│   ├── appsettings.example.json  # Config template (no real secrets)
│   └── Program.cs                # App entry point + API routes
├── vrchat-friends-ui/            # React frontend
│   ├── src/
│   │   ├── pages/                # App pages (dashboard, login)
│   │   ├── components/           # UI: friends, profile, groups, activity, notifications…
│   │   ├── data/                 # Calls to the local API
│   │   ├── lib/                  # Status colours, locations, personalisation…
│   │   └── test/                 # Vitest tests
│   └── .env.example              # Environment variable template
├── installer/                    # One-click Windows installer build
├── START.bat                     # Windows launcher
├── SETUP.ps1                     # First-time setup wizard
└── README.md                     # This file
```

---

## Security Notes

- Everything runs **locally on your own PC** — your VRChat account is only ever sent to VRChat itself
- Your **VRChat password and 2FA codes are never saved**. To keep you signed in, only VRChat's session cookie is stored, **encrypted** with ASP.NET Data Protection
- JWT keys are generated randomly during setup
- Database passwords go in your local `appsettings.json`, which should never be committed
- The open-source repository contains **no real credentials**
- Dependencies are kept free of known vulnerabilities (`npm audit`)

---

## Contributing

Pull requests are welcome! Please:
- Don't commit any credentials or session files (`auth.dat`, `twofa.dat`, `.env.local`)
- Keep the `appsettings.json` template values as placeholders
- Run `npm run test` in `vrchat-friends-ui` before opening a pull request

## Contributors

A big thank you to everyone who helped build this project:

- **aleonard** — creator and maintainer
- **HakkerWell** — thank you for your help and contributions to the VRChat Dashboard! 💙

Want to see your name here? Contributions of any size are appreciated.

## License

MIT
