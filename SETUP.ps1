# VRChat Dashboard - First-time Setup
# Run this once: right-click > "Run with PowerShell"

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  VRChat Dashboard - First-time Setup" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# --- Check .NET ---
try {
    $dotnetVersion = dotnet --version
    Write-Host "[OK] .NET SDK $dotnetVersion found" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] .NET SDK not found. Please install from:" -ForegroundColor Red
    Write-Host "  https://dotnet.microsoft.com/download/dotnet/8.0" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# --- Check Node.js ---
try {
    $nodeVersion = node --version
    Write-Host "[OK] Node.js $nodeVersion found" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Node.js not found. Please install from:" -ForegroundColor Red
    Write-Host "  https://nodejs.org/" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# --- Configure appsettings.json ---
$settingsPath = Join-Path $scriptDir "DashboardVRChat.Api\appsettings.json"
Write-Host ""
Write-Host "--- Database Configuration ---" -ForegroundColor Yellow
Write-Host "You need a PostgreSQL database. Enter your connection details:"
Write-Host ""

$dbHost = Read-Host "DB Host [localhost]"
if ([string]::IsNullOrEmpty($dbHost)) { $dbHost = "localhost" }

$dbPort = Read-Host "DB Port [5432]"
if ([string]::IsNullOrEmpty($dbPort)) { $dbPort = "5432" }

$dbName = Read-Host "DB Name [chatdb]"
if ([string]::IsNullOrEmpty($dbName)) { $dbName = "chatdb" }

$dbUser = Read-Host "DB Username"
$dbPass = Read-Host "DB Password" -AsSecureString
$dbPassPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($dbPass))

# Generate a random JWT key
$jwtBytes = [byte[]]::new(48)
[System.Security.Cryptography.RandomNumberGenerator]::Fill($jwtBytes)
$jwtKey = [Convert]::ToBase64String($jwtBytes)

$settings = @{
    Logging = @{
        LogLevel = @{
            Default = "Information"
            "Microsoft.AspNetCore" = "Warning"
        }
    }
    AllowedHosts = "*"
    ConnectionStrings = @{
        DefaultConnection = "Host=$dbHost;Port=$dbPort;Database=$dbName;Username=$dbUser;Password=$dbPassPlain"
    }
    Jwt = @{
        Key = $jwtKey
        Issuer = "DashboardVRChat.Api"
        Audience = "DashboardVRChat.Client"
    }
}

$settings | ConvertTo-Json -Depth 5 | Set-Content $settingsPath -Encoding UTF8
Write-Host "[OK] appsettings.json configured" -ForegroundColor Green

# --- Apply DB Migrations ---
Write-Host ""
Write-Host "--- Applying Database Migrations ---" -ForegroundColor Yellow
Set-Location (Join-Path $scriptDir "DashboardVRChat.Api")
try {
    dotnet ef database update
    Write-Host "[OK] Database migrations applied" -ForegroundColor Green
} catch {
    Write-Host "[WARNING] Could not apply migrations automatically." -ForegroundColor Yellow
    Write-Host "  Run manually: cd DashboardVRChat.Api && dotnet ef database update" -ForegroundColor Gray
}

# --- Install frontend deps ---
Write-Host ""
Write-Host "--- Installing Frontend Dependencies ---" -ForegroundColor Yellow
Set-Location (Join-Path $scriptDir "vrchat-friends-ui")
npm install
Write-Host "[OK] Frontend dependencies installed" -ForegroundColor Green

# --- Done ---
Set-Location $scriptDir
Write-Host ""
Write-Host "=============================================" -ForegroundColor Green
Write-Host "  Setup complete!" -ForegroundColor Green
Write-Host "  Run START.bat to launch the application." -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to exit"
