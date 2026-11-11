# ================================================================
#  VRChat Dashboard - Build Installer
#  Right-click -> "Run with PowerShell" (as Administrator)
# ================================================================

$ErrorActionPreference = "Continue"
$scriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir     = Split-Path -Parent $scriptDir
$buildDir    = Join-Path $scriptDir "build"
$assetsDir   = Join-Path $scriptDir "assets"
$launcherSrc = Join-Path $scriptDir "launcher-src"

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  VRChat Dashboard - Building Installer" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

New-Item -ItemType Directory -Force -Path $buildDir  | Out-Null
New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null

# ================================================================
# STEP 1 - Check assets
# ================================================================
$dotnetInstaller = Join-Path $assetsDir "dotnet-sdk.exe"
$nodeInstaller   = Join-Path $assetsDir "nodejs.msi"

$missing = @()
if (-not (Test-Path $dotnetInstaller)) { $missing += "dotnet-sdk.exe" }
if (-not (Test-Path $nodeInstaller))   { $missing += "nodejs.msi" }

if ($missing.Count -gt 0) {
    Write-Host "Missing in $assetsDir :" -ForegroundColor Yellow
    foreach ($m in $missing) { Write-Host "  $m" }
    exit 1
}
Write-Host "[OK] Assets present" -ForegroundColor Green

# ================================================================
# STEP 2 - Build API
# ================================================================
Write-Host ""
Write-Host "--- Building API ---" -ForegroundColor Yellow
$apiPublishDir = Join-Path $buildDir "api"
$apiProject    = Join-Path (Join-Path $rootDir "DashboardVRChat.Api") "DashboardVRChat.Api.csproj"

dotnet publish "$apiProject" --configuration Release --runtime win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true --output "$apiPublishDir"
Write-Host "[OK] API built" -ForegroundColor Green

# ================================================================
# STEP 3 - Build Frontend
# ================================================================
Write-Host ""
Write-Host "--- Building Frontend ---" -ForegroundColor Yellow
$frontDir     = Join-Path $rootDir "vrchat-friends-ui"
$frontDistDir = Join-Path $buildDir "frontend"

Push-Location $frontDir
# Use the committed package-lock.json as is (never delete it): install only when packages are missing
if (-not (Test-Path "node_modules")) { cmd /c "npm ci --include=dev 2>&1" }
$viteBin = Join-Path $frontDir "node_modules\.bin\vite.cmd"
cmd /c "`"$viteBin`" build --outDir `"$frontDistDir`" --emptyOutDir 2>&1"
Pop-Location

if (Test-Path $frontDistDir) {
    Write-Host "[OK] Frontend built" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Frontend dist missing" -ForegroundColor Red; exit 1
}

# ================================================================
# STEP 4 - Build Launcher
# ================================================================
Write-Host ""
Write-Host "--- Building Launcher ---" -ForegroundColor Yellow

# Delete stale launcher exe so we can detect build failure
$launcherExe = Join-Path $scriptDir "VRChatDashboard.exe"
if (Test-Path $launcherExe) { Remove-Item $launcherExe -Force }

# Clean and build
if (Test-Path (Join-Path $launcherSrc "obj")) { Remove-Item (Join-Path $launcherSrc "obj") -Recurse -Force }
if (Test-Path (Join-Path $launcherSrc "bin")) { Remove-Item (Join-Path $launcherSrc "bin") -Recurse -Force }

# Build the SteamVR overlay (started by the launcher when SteamVR is installed)
$overlayPublishDir = Join-Path $buildDir "overlay"
$overlayProject    = Join-Path (Join-Path $rootDir "Overlay") "Overlay.csproj"
dotnet publish "$overlayProject" --configuration Release --runtime win-x64 --self-contained true --output "$overlayPublishDir"
Write-Host "[OK] Overlay built" -ForegroundColor Green

$launcherCsproj = Join-Path $launcherSrc "launcher.csproj"
# Publish into its own folder: publishing straight into installer\ (the parent of launcher-src) makes the
# SDK exclude every source file under it, Program.cs included (error CS5001).
$launcherPublishDir = Join-Path $buildDir "launcher"
dotnet publish "$launcherCsproj" --configuration Release --runtime win-x64 --self-contained true -p:PublishSingleFile=true --output "$launcherPublishDir"
$publishedExe = Join-Path $launcherPublishDir "VRChatDashboard.exe"
if (Test-Path $publishedExe) { Copy-Item $publishedExe $launcherExe -Force }

if (Test-Path $launcherExe) {
    Write-Host "[OK] Launcher built" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Launcher exe missing" -ForegroundColor Red; exit 1
}

# ================================================================
# STEP 5 - Inno Setup
# ================================================================
$innoExe = $null
foreach ($p in @("C:\Program Files (x86)\Inno Setup 7\ISCC.exe","C:\Program Files\Inno Setup 7\ISCC.exe","C:\Program Files (x86)\Inno Setup 6\ISCC.exe")) {
    if (Test-Path $p) { $innoExe = $p; break }
}
if (-not $innoExe) {
    $innoInst = Join-Path $assetsDir "innosetup.exe"
    if (Test-Path $innoInst) {
        Start-Process -FilePath $innoInst -ArgumentList "/VERYSILENT /SUPPRESSMSGBOXES /NORESTART" -Wait
    }
    foreach ($p in @("C:\Program Files (x86)\Inno Setup 7\ISCC.exe","C:\Program Files\Inno Setup 7\ISCC.exe")) {
        if (Test-Path $p) { $innoExe = $p; break }
    }
}
if (-not $innoExe) { Write-Host "[ERROR] Inno Setup not found" -ForegroundColor Red; exit 1 }
Write-Host "[OK] Inno Setup: $innoExe" -ForegroundColor Green

# ================================================================
# STEP 6 - Generate .iss
# ================================================================
Write-Host ""
Write-Host "--- Generating installer script ---" -ForegroundColor Yellow
$issPath = Join-Path $scriptDir "installer.iss"

$iss = @"
#define MyAppName    "VRChat Dashboard"
#define MyAppVersion "1.0.0"
#define MyAppExe     "VRChatDashboard.exe"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
OutputDir=$buildDir
OutputBaseFilename=VRChatDashboard-Installer
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "french";  MessagesFile: "compiler:Languages\French.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"

[Files]
Source: "$launcherExe";      DestDir: "{app}";         Flags: ignoreversion
Source: "$apiPublishDir\*";  DestDir: "{app}\api";     Flags: ignoreversion recursesubdirs
Source: "$frontDistDir\*";   DestDir: "{app}\frontend"; Flags: ignoreversion recursesubdirs
Source: "$overlayPublishDir\*"; DestDir: "{app}\overlay"; Flags: ignoreversion recursesubdirs
Source: "$nodeInstaller";    DestDir: "{tmp}";          Flags: deleteafterinstall

[Icons]
Name: "{group}\{#MyAppName}";           Filename: "{app}\{#MyAppExe}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{commondesktop}\{#MyAppName}";   Filename: "{app}\{#MyAppExe}"; Tasks: desktopicon

[Run]
Filename: "msiexec.exe"; Parameters: "/i ""{tmp}\nodejs.msi"" /quiet /norestart"; StatusMsg: "Installing Node.js..."; Flags: waituntilterminated
Filename: "{app}\{#MyAppExe}"; Description: "Launch VRChat Dashboard"; Flags: nowait postinstall skipifsilent

[Code]
// User data lives in %LOCALAPPDATA%\VRChatDashboard (VRChat session, keys, window profile, settings.json).
// The uninstaller only removes what it installed, so all of it is still there after a reinstall.
var ContactPage: TInputQueryWizardPage;

function UserSettingsPath: String;
begin
  Result := ExpandConstant('{localappdata}\VRChatDashboard\settings.json');
end;

procedure InitializeWizard;
begin
  ContactPage := CreateInputQueryPage(wpSelectTasks,
    'VRChat contact', 'Your email for VRChat',
    'VRChat asks tools that use its API to identify themselves with a contact email. ' +
    'It is only sent to VRChat, and kept on this PC. You can leave it empty.');
  ContactPage.Add('Email:', False);
end;

// Already set by an earlier install: keep it and don't ask again.
function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := (PageID = ContactPage.ID) and FileExists(UserSettingsPath);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var Json, Contact: String;
begin
  if CurStep = ssPostInstall then begin
    // No database and no secret: the API makes its own JWT key when Jwt:Key is empty.
    Json := '{' + #13#10 +
      '  "Logging": { "LogLevel": { "Default": "Information", "Microsoft.AspNetCore": "Warning" } },' + #13#10 +
      '  "AllowedHosts": "*",' + #13#10 +
      '  "Jwt": { "Key": "", "Issuer": "DashboardVRChat.Api", "Audience": "DashboardVRChat.Client" }' + #13#10 + '}';
    SaveStringToFile(ExpandConstant('{app}\api\appsettings.json'), Json, False);

    Contact := Trim(ContactPage.Values[0]);
    StringChangeEx(Contact, '"', '', True);
    StringChangeEx(Contact, '\', '', True);
    if (not FileExists(UserSettingsPath)) and (Contact <> '') then begin
      ForceDirectories(ExtractFileDir(UserSettingsPath));
      SaveStringToFile(UserSettingsPath, '{ "VRChat": { "Contact": "' + Contact + '" } }', False);
    end;
  end;
end;
"@

$iss | Set-Content $issPath -Encoding UTF8
Write-Host "[OK] installer.iss written" -ForegroundColor Green

# ================================================================
# STEP 7 - Compile
# ================================================================
Write-Host ""
Write-Host "--- Compiling .exe ---" -ForegroundColor Yellow
$out = Join-Path $buildDir "VRChatDashboard-Installer.exe"
# Delete the previous installer so an old one is never reported as this build's result
if (Test-Path $out) { Remove-Item $out -Force }
$inno = Start-Process -FilePath $innoExe -ArgumentList "`"$issPath`"" -Wait -NoNewWindow -PassThru

if ($inno.ExitCode -eq 0 -and (Test-Path $out)) {
    $size = [math]::Round((Get-Item $out).Length / 1MB, 1)
    Write-Host ""
    Write-Host "================================================" -ForegroundColor Green
    Write-Host "  SUCCESS!  ($size MB)" -ForegroundColor Green
    Write-Host "  $out" -ForegroundColor Cyan
    Write-Host "================================================" -ForegroundColor Green
    Start-Process "explorer.exe" "/select,`"$out`""
} else {
    Write-Host "[ERROR] Installer not produced" -ForegroundColor Red
}

