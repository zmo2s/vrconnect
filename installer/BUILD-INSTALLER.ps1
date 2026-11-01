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
$pgInstaller     = Join-Path $assetsDir "postgresql.exe"

$missing = @()
if (-not (Test-Path $dotnetInstaller)) { $missing += "dotnet-sdk.exe" }
if (-not (Test-Path $nodeInstaller))   { $missing += "nodejs.msi" }
if (-not (Test-Path $pgInstaller))     { $missing += "postgresql.exe" }

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
if (Test-Path "bun.lock")          { Remove-Item "bun.lock"          -Force }
if (Test-Path "package-lock.json") { Remove-Item "package-lock.json" -Force }
if (Test-Path "node_modules")      { Remove-Item "node_modules"      -Recurse -Force }
cmd /c "npm install --include=dev --legacy-peer-deps 2>&1"
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

# Write Program.cs fresh (Windows line endings, UTF-8)
$programCs = Join-Path $launcherSrc "Program.cs"
$b64 = "Ly8gVG9wLWxldmVsIHByb2dyYW0gLSAuTkVUIDYrCnZhciBhcHBEaXIgPSBBcHBEb21haW4uQ3VycmVudERvbWFpbi5CYXNlRGlyZWN0b3J5Owp2YXIgYXBpRXhlID0gUGF0aC5Db21iaW5lKGFwcERpciwgImFwaSIsICJEYXNoYm9hcmRWUkNoYXQuQXBpLmV4ZSIpOwpDb25zb2xlLlRpdGxlID0gIlZSQ2hhdCBEYXNoYm9hcmQiOwpDb25zb2xlLldyaXRlTGluZSgiU3RhcnRpbmcgVlJDaGF0IERhc2hib2FyZC4uLiIpOwp2YXIgYXBpID0gbmV3IFN5c3RlbS5EaWFnbm9zdGljcy5Qcm9jZXNzKCk7CmFwaS5TdGFydEluZm8uRmlsZU5hbWUgPSBhcGlFeGU7CmFwaS5TdGFydEluZm8uV29ya2luZ0RpcmVjdG9yeSA9IFBhdGguQ29tYmluZShhcHBEaXIsICJhcGkiKTsKYXBpLlN0YXJ0SW5mby5Vc2VTaGVsbEV4ZWN1dGUgPSBmYWxzZTsKYXBpLlN0YXJ0SW5mby5DcmVhdGVOb1dpbmRvdyA9IHRydWU7CmFwaS5TdGFydCgpOwpDb25zb2xlLldyaXRlKCJXYWl0aW5nIGZvciBBUEkiKTsKdXNpbmcgdmFyIGh0dHAgPSBuZXcgU3lzdGVtLk5ldC5IdHRwLkh0dHBDbGllbnQoKTsKaHR0cC5UaW1lb3V0ID0gVGltZVNwYW4uRnJvbVNlY29uZHMoMik7CmZvciAoaW50IGkgPSAwOyBpIDwgMzA7IGkrKykgewogICAgVGhyZWFkLlNsZWVwKDEwMDApOyBDb25zb2xlLldyaXRlKCIuIik7CiAgICB0cnkgewogICAgICAgIHZhciByID0gaHR0cC5HZXRBc3luYygiaHR0cHM6Ly9sb2NhbGhvc3Q6NzE1NC8iKS5HZXRBd2FpdGVyKCkuR2V0UmVzdWx0KCk7CiAgICAgICAgaWYgKHIuSXNTdWNjZXNzU3RhdHVzQ29kZSkgYnJlYWs7CiAgICB9IGNhdGNoIHsgfQp9CkNvbnNvbGUuV3JpdGVMaW5lKCIgcmVhZHkhIik7ClN5c3RlbS5EaWFnbm9zdGljcy5Qcm9jZXNzLlN0YXJ0KG5ldyBTeXN0ZW0uRGlhZ25vc3RpY3MuUHJvY2Vzc1N0YXJ0SW5mbygiaHR0cDovL2xvY2FsaG9zdDo3MTU0IikgeyBVc2VTaGVsbEV4ZWN1dGUgPSB0cnVlIH0pOwpDb25zb2xlLldyaXRlTGluZSgiUHJlc3MgRW50ZXIgdG8gc3RvcC4iKTsKQ29uc29sZS5SZWFkTGluZSgpOwp0cnkgeyBhcGkuS2lsbChlbnRpcmVQcm9jZXNzVHJlZTogdHJ1ZSk7IH0gY2F0Y2ggeyB9Cg=="
$bytes = [System.Convert]::FromBase64String($b64)
[System.IO.File]::WriteAllBytes($programCs, $bytes)

# Clean and build
if (Test-Path (Join-Path $launcherSrc "obj")) { Remove-Item (Join-Path $launcherSrc "obj") -Recurse -Force }
if (Test-Path (Join-Path $launcherSrc "bin")) { Remove-Item (Join-Path $launcherSrc "bin") -Recurse -Force }

$launcherCsproj = Join-Path $launcherSrc "launcher.csproj"
dotnet publish "$launcherCsproj" --configuration Release --runtime win-x64 --self-contained true -p:PublishSingleFile=true --output "$scriptDir"

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
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; Flags: checked

[Files]
Source: "$launcherExe";      DestDir: "{app}";         Flags: ignoreversion
Source: "$apiPublishDir\*";  DestDir: "{app}\api";     Flags: ignoreversion recursesubdirs
Source: "$frontDistDir\*";   DestDir: "{app}\frontend"; Flags: ignoreversion recursesubdirs
Source: "$nodeInstaller";    DestDir: "{tmp}";          Flags: deleteafterinstall
Source: "$pgInstaller";      DestDir: "{tmp}";          Flags: deleteafterinstall

[Icons]
Name: "{group}\{#MyAppName}";           Filename: "{app}\{#MyAppExe}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{commondesktop}\{#MyAppName}";   Filename: "{app}\{#MyAppExe}"; Tasks: desktopicon

[Run]
Filename: "msiexec.exe"; Parameters: "/i ""{tmp}\nodejs.msi"" /quiet /norestart"; StatusMsg: "Installing Node.js..."; Flags: waituntilterminated
Filename: "{tmp}\postgresql.exe"; Parameters: "--mode unattended --superpassword CHANGE_ME_DB_PASSWORD --serverport 5432 --servicename postgresql-16"; StatusMsg: "Installing PostgreSQL..."; Flags: waituntilterminated
Filename: "{app}\{#MyAppExe}"; Description: "Launch VRChat Dashboard"; Flags: nowait postinstall skipifsilent

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
var Key, Json, FilePath, Chars: String; i: Integer;
begin
  if CurStep = ssPostInstall then begin
    Chars := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    Randomize();
    Key := '';
    for i := 1 to 48 do Key := Key + Chars[(Random(Length(Chars)) + 1)];
    Json := '{' + #13#10 +
      '  "Logging": { "LogLevel": { "Default": "Information", "Microsoft.AspNetCore": "Warning" } },' + #13#10 +
      '  "AllowedHosts": "*",' + #13#10 +
      '  "ConnectionStrings": { "DefaultConnection": "Host=localhost;Port=5432;Database=vrchatdashboard;Username=postgres;Password=CHANGE_ME_DB_PASSWORD" },' + #13#10 +
      '  "Jwt": { "Key": "' + Key + '", "Issuer": "DashboardVRChat.Api", "Audience": "DashboardVRChat.Client" }' + #13#10 + '}';
    FilePath := ExpandConstant('{app}\api\appsettings.json');
    SaveStringToFile(FilePath, Json, False);
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
Start-Process -FilePath $innoExe -ArgumentList "`"$issPath`"" -Wait -NoNewWindow

$out = Join-Path $buildDir "VRChatDashboard-Installer.exe"
if (Test-Path $out) {
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

