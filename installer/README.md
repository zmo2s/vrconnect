# Building the Installer

## How to build VRChatDashboard-Installer.exe

### Prerequisites on YOUR machine (to build)
- Windows 10/11
- PowerShell 5+
- Internet connection (to download Node, .NET, PostgreSQL)

### Steps

1. **Open PowerShell as Administrator**
2. **Run:**
   ```powershell
   Set-ExecutionPolicy -Scope Process Bypass
   .\installer\BUILD-INSTALLER.ps1
   ```
3. Wait ~5-10 minutes (downloads ~400MB of prerequisites)
4. Find the output at: `installer\build\VRChatDashboard-Installer.exe`

### What the installer does for end users

When a user runs `VRChatDashboard-Installer.exe`:

1. Installs **Node.js** silently
2. Installs **PostgreSQL 16** silently (creates a local DB automatically)
3. Builds/installs the **API** (self-contained, no .NET needed by user)
4. Auto-generates a **random JWT secret key**
5. Runs **database migrations** automatically
6. Creates a **desktop shortcut** + **Start Menu entry**
7. Launches the app in the browser

### What the user sees

Just a standard Windows installer wizard — Next → Next → Install → Finish.
The app appears on their desktop. Done.
