# VRChat Dashboard

A self-hosted dashboard to monitor and interact with your VRChat friends list, notifications, and chat.

## Features

- 🟢 Real-time friends list (online/offline status)
- 🌍 See which world friends are in
- 🔔 VRChat notifications center
- 💬 Private chat
- 👋 Send Boops to friends
- 🔐 Secure: your VRChat credentials never leave your own server

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + TypeScript + Vite + Tailwind CSS |
| Backend | ASP.NET Core 8 (C#) |
| Database | PostgreSQL |
| Auth | JWT + ASP.NET Identity |

---

## Quick Start (Windows)

### Prerequisites

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- [Node.js 18+](https://nodejs.org/)
- [PostgreSQL](https://www.postgresql.org/download/)

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

---

## Manual Setup

### 1. Configure the API

Copy `DashboardVRChat.Api/appsettings.json` and fill in your values:

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

> ⚠️ **Never commit real credentials** — `appsettings.json` contains only placeholder values by default.

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

API will be available at `https://localhost:7154`

### 4. Configure the frontend

Create `vrchat-friends-ui/.env.local`:

```env
VITE_API_URL=https://localhost:7154
```

### 5. Run the frontend

```bash
cd vrchat-friends-ui
npm install
npm run dev
```

Frontend will be available at `http://localhost:8080`

---

## Project Structure

```
VRChatDashboard-OpenSource/
├── DashboardVRChat.Api/          # ASP.NET Core backend
│   ├── Services/                 # VRChat API integration
│   ├── Migrations/               # Database migrations
│   ├── appsettings.json          # Config template (no real secrets)
│   └── Program.cs                # App entry point
├── vrchat-friends-ui/            # React frontend
│   ├── src/
│   │   ├── pages/                # App pages
│   │   ├── components/           # UI components
│   │   └── lib/vrchat-api.ts     # API client
│   └── .env.example              # Environment variable template
├── START.bat                     # Windows launcher
├── SETUP.ps1                     # First-time setup wizard
└── README.md                     # This file
```

---

## Security Notes

- VRChat credentials are **never stored in plaintext** — they stay in memory and use VRChat's own session cookie system
- JWT keys are generated randomly during setup
- Database passwords go in `appsettings.json` which is **gitignored in your local instance**
- The open-source repository contains **no real credentials**

---

## Contributing

Pull requests are welcome! Please:
- Don't commit any credentials or session files (`auth.dat`, `twofa.dat`, `.env.local`)
- Keep the `appsettings.json` template values as placeholders

## License

MIT
