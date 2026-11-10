# Building the Installer

## How to build VRChatDashboard-Installer.exe

### Prerequisites on YOUR machine (to build)
- Windows 10/11
- PowerShell 5+
- Internet connection (to download Node and .NET)

### Steps

1. **Open PowerShell as Administrator**
2. **Run:**
   ```powershell
   Set-ExecutionPolicy -Scope Process Bypass
   .\installer\BUILD-INSTALLER.ps1
   ```
3. Wait a few minutes (it builds the API, the frontend, the VR overlay and the launcher)
4. Find the output at: `installer\build\VRChatDashboard-Installer.exe`

### What the installer does for end users

When a user runs `VRChatDashboard-Installer.exe`:

1. Installs **Node.js** silently
2. Installs the **API** (self-contained, no .NET needed by the user)
3. Installs the **frontend** (already built) and the **SteamVR overlay**
4. Writes `api\appsettings.json` with a **random JWT secret key** (no database: nothing else to set up)
5. Creates a **desktop shortcut** + **Start Menu entry**
6. Launches the app in its own window (closing the window stops everything)

### What the user sees

Just a standard Windows installer wizard — Next → Next → Install → Finish.
The app appears on their desktop. Done.
