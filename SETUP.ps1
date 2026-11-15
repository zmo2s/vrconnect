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
    Write-Host "  https://dotnet.microsoft.com/download" -ForegroundColor Yellow
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
# Nothing to type: no database, the API makes its own JWT key, and it identifies itself to VRChat
# with the project page. (Optional: set "VRChat:Contact" to your own email.)
$apiDir = Join-Path $scriptDir "DashboardVRChat.Api"
$settingsPath = Join-Path $apiDir "appsettings.json"
if (-not (Test-Path $settingsPath)) {
    Copy-Item (Join-Path $apiDir "appsettings.example.json") $settingsPath
}
Write-Host "[OK] appsettings.json ready" -ForegroundColor Green

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
