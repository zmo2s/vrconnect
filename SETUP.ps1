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
# No database and no secret to type: the API makes its own JWT key.
# The only setting is the contact VRChat asks API tools to send (it may refuse unknown clients with 403).
$apiDir = Join-Path $scriptDir "DashboardVRChat.Api"
$settingsPath = Join-Path $apiDir "appsettings.json"
if (-not (Test-Path $settingsPath)) {
    Copy-Item (Join-Path $apiDir "appsettings.example.json") $settingsPath
}

$settings = Get-Content $settingsPath -Raw | ConvertFrom-Json
if (-not $settings.VRChat) {
    $settings | Add-Member -NotePropertyName VRChat -NotePropertyValue ([pscustomobject]@{ Contact = "" })
}
$current = $settings.VRChat.Contact

Write-Host ""
Write-Host "--- VRChat contact ---" -ForegroundColor Yellow
Write-Host "VRChat asks tools that use its API to identify themselves with a contact email."
Write-Host "It is only sent to VRChat, and stays in your local appsettings.json."
Write-Host ""
$prompt = "Your email"
if ($current) { $prompt += " [$current]" }
$contact = Read-Host $prompt
if ($contact) { $settings.VRChat.Contact = $contact.Trim() }

$settings | ConvertTo-Json -Depth 5 | Set-Content $settingsPath -Encoding UTF8
Write-Host "[OK] appsettings.json configured" -ForegroundColor Green

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
