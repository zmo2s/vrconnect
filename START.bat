@echo off
title VRChat Dashboard Launcher
color 0A
echo.
echo  =============================================
echo   VRChat Dashboard - Launcher
echo  =============================================
echo.

:: ---- Check for .NET SDK ----
dotnet --version >nul 2>&1
if errorlevel 1 (
    color 0C
    echo [ERROR] .NET SDK is not installed!
    echo.
    echo Please install .NET 8 SDK from:
    echo   https://dotnet.microsoft.com/download/dotnet/8.0
    echo.
    pause
    exit /b 1
)

:: ---- Check for Node.js ----
node --version >nul 2>&1
if errorlevel 1 (
    color 0C
    echo [ERROR] Node.js is not installed!
    echo.
    echo Please install Node.js from:
    echo   https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: ---- API settings ----
:: Nothing to configure: the database is not used, and the API makes its own JWT key.
if not exist "DashboardVRChat.Api\appsettings.json" (
    copy /y "DashboardVRChat.Api\appsettings.example.json" "DashboardVRChat.Api\appsettings.json" >nul
)

:: ---- Install frontend dependencies if needed ----
if not exist "vrchat-friends-ui\node_modules" (
    echo [1/3] Installing frontend dependencies ^(first time only^)...
    cd vrchat-friends-ui
    call npm install
    cd ..
    echo.
)

:: Everything runs in THIS console (start /b): the logs of the API, the UI and the
:: overlay are mixed here, and closing this window stops all of them.

:: ---- Start API ----
echo [2/3] Starting API backend...
start "" /b /d "DashboardVRChat.Api" dotnet run --launch-profile http

:: ---- Wait for API to start ----
echo Waiting for API to start...
timeout /t 5 /nobreak >nul

:: ---- Start frontend ----
echo [3/3] Starting frontend...
start "" /b /d "vrchat-friends-ui" cmd /c "npm run dev"

:: ---- SteamVR overlay (only when SteamVR is installed) ----
:: It waits for SteamVR and never starts it itself, so it is harmless when you play on desktop.
set "VR_OVERLAY="
if exist "%LOCALAPPDATA%\openvr\openvrpaths.vrpath" if exist "Overlay\Overlay.csproj" (
    echo [+] Starting the SteamVR overlay ^(waits for SteamVR^)...
    start "" /b /d "Overlay" dotnet run
    set "VR_OVERLAY=1"
)

echo.
echo  =============================================
echo   Services are starting!
echo.
echo   API:      http://localhost:5000   (docs: http://localhost:5000/swagger)
echo   Frontend: http://localhost:8080
if defined VR_OVERLAY echo   VR:       vrconnect tab in the SteamVR dashboard
echo.
echo   Close the dashboard window to stop everything.
echo  =============================================
echo.

:: ---- Dashboard window (WebView2) ----
:: The launcher in --dev mode starts nothing: it waits for the API and Vite, then shows them.
echo Opening the dashboard window...
dotnet run --project installer\launcher-src -c Release -- --dev
if errorlevel 1 goto browser

:: Window closed: stop the API, the UI and the overlay started from this folder.
echo Stopping...
powershell -NoProfile -Command "$r=(Get-Location).Path; Get-CimInstance Win32_Process | Where-Object { ((('DashboardVRChat.Api.exe','vrconnect-overlay.exe') -contains $_.Name) -and ($_.ExecutablePath -like ($r+'\*'))) -or (($_.Name -eq 'node.exe') -and ($_.CommandLine -like ('*'+$r+'\vrchat-friends-ui\*'))) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
exit /b 0

:: No WebView2 (or the window could not be built): use the browser, and keep this console open.
:browser
echo The window could not open: using your browser instead. Close this console to stop everything.
start "" "http://localhost:8080"
:wait
timeout /t 3600 /nobreak >nul
goto wait
