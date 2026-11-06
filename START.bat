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

:: ---- Check appsettings.json is configured ----
findstr /C:"YOUR_DB_PASSWORD" "DashboardVRChat.Api\appsettings.json" >nul 2>&1
if not errorlevel 1 (
    color 0E
    echo [WARNING] The API is not configured yet!
    echo.
    echo Please edit: DashboardVRChat.Api\appsettings.json
    echo   - Set your PostgreSQL connection string
    echo   - Set a real JWT secret key (min 32 characters)
    echo.
    echo Then run this launcher again.
    pause
    exit /b 1
)

:: ---- Install frontend dependencies if needed ----
if not exist "vrchat-friends-ui\node_modules" (
    echo [1/3] Installing frontend dependencies (first time only)...
    cd vrchat-friends-ui
    call npm install
    cd ..
    echo.
)

:: ---- Start API in background ----
echo [2/3] Starting API backend...
start "VRChat Dashboard - API" cmd /k "cd DashboardVRChat.Api && dotnet run --launch-profile http"

:: ---- Wait for API to start ----
echo Waiting for API to start...
timeout /t 5 /nobreak >nul

:: ---- Start frontend ----
echo [3/3] Starting frontend...
start "VRChat Dashboard - UI" cmd /k "cd vrchat-friends-ui && npm run dev"

echo.
echo  =============================================
echo   Both services are starting!
echo.
echo   API:      http://localhost:5000   (docs: http://localhost:5000/swagger)
echo   Frontend: http://localhost:8080
echo.
echo   Close the two terminal windows to stop.
echo  =============================================
echo.
timeout /t 4 /nobreak >nul

:: Open browser
start "" "http://localhost:8080"
