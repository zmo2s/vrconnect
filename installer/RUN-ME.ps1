# ================================================================
#  VRChat Dashboard - Build Installer
#  Right-click -> "Run with PowerShell" (as Administrator)
# ================================================================

$ErrorActionPreference = "Continue"
$scriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir     = Split-Path -Parent $scriptDir
$buildDir    = Join-Path $scriptDir "build"
$assetsDir   = Join-Path $scriptDir "assets"

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
$nodeInstaller = Join-Path $assetsDir "nodejs.msi"
$pgInstaller   = Join-Path $assetsDir "postgresql.exe"

$missing = @()
if (-not (Test-Path $nodeInstaller)) { $missing += "nodejs.msi" }
# if (-not (Test-Path $pgInstaller))   { $missing += "postgresql.exe" }

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

if (Test-Path (Join-Path $apiPublishDir "DashboardVRChat.Api.exe")) {
    Write-Host "[OK] API built" -ForegroundColor Green
} else {
    Write-Host "[ERROR] API build failed" -ForegroundColor Red; exit 1
}

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
# STEP 4 - Build Launcher (fresh temp dir - avoids stale obj/bin)
# ================================================================
Write-Host ""
Write-Host "--- Building Launcher ---" -ForegroundColor Yellow

# Use a completely fresh temp directory - no stale cache possible
$tmpDir = Join-Path $env:TEMP "VRChatLauncherBuild_$([System.Guid]::NewGuid().ToString('N').Substring(0,8))"
New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null

# Write Program.cs via Base64 decode - byte-perfect, no PowerShell interpretation
$programCs = Join-Path $tmpDir "Program.cs"
$b64 = "Ly8gVG9wLWxldmVsIHByb2dyYW0gLSAuTkVUIDYrCi8vIFN0YXJ0cyB0aGUgQVBJIHByb2Nlc3MgKyBzZXJ2ZXMgZnJvbnRlbmQgc3RhdGljIGZpbGVzIG9uIHBvcnQgODA4MAoKdmFyIGFwcERpciA9IEFwcERvbWFpbi5DdXJyZW50RG9tYWluLkJhc2VEaXJlY3Rvcnk7CnZhciBhcGlFeGUgPSBQYXRoLkNvbWJpbmUoYXBwRGlyLCAiYXBpIiwgIkRhc2hib2FyZFZSQ2hhdC5BcGkuZXhlIik7CnZhciBmcm9udGVuZERpciA9IFBhdGguQ29tYmluZShhcHBEaXIsICJmcm9udGVuZCIpOwoKQ29uc29sZS5UaXRsZSA9ICJWUkNoYXQgRGFzaGJvYXJkIjsKQ29uc29sZS5Xcml0ZUxpbmUoIj09PSBWUkNoYXQgRGFzaGJvYXJkID09PSIpOwoKLy8gU3RhcnQgdGhlIEFQSQpDb25zb2xlLldyaXRlTGluZSgiU3RhcnRpbmcgQVBJLi4uIik7CnZhciBhcGkgPSBuZXcgU3lzdGVtLkRpYWdub3N0aWNzLlByb2Nlc3MoKTsKYXBpLlN0YXJ0SW5mby5GaWxlTmFtZSA9IGFwaUV4ZTsKYXBpLlN0YXJ0SW5mby5Xb3JraW5nRGlyZWN0b3J5ID0gUGF0aC5Db21iaW5lKGFwcERpciwgImFwaSIpOwphcGkuU3RhcnRJbmZvLlVzZVNoZWxsRXhlY3V0ZSA9IGZhbHNlOwphcGkuU3RhcnRJbmZvLkNyZWF0ZU5vV2luZG93ID0gdHJ1ZTsKYXBpLlN0YXJ0KCk7CgovLyBTdGFydCBmcm9udGVuZCBzdGF0aWMgZmlsZSBzZXJ2ZXIgb24gcG9ydCA4MDgwCkNvbnNvbGUuV3JpdGVMaW5lKCJTdGFydGluZyBmcm9udGVuZCBzZXJ2ZXIgb24gaHR0cDovL2xvY2FsaG9zdDo4MDgwIC4uLiIpOwp2YXIgYnVpbGRlciA9IFdlYkFwcGxpY2F0aW9uLkNyZWF0ZUJ1aWxkZXIoKTsKYnVpbGRlci5XZWJIb3N0LlVzZVVybHMoImh0dHA6Ly9sb2NhbGhvc3Q6ODA4MCIpOwpidWlsZGVyLkxvZ2dpbmcuQ2xlYXJQcm92aWRlcnMoKTsgLy8gc2lsZW5jZSBBU1AuTkVUIGxvZ3MgaW4gY29uc29sZQp2YXIgYXBwID0gYnVpbGRlci5CdWlsZCgpOwphcHAuVXNlRGVmYXVsdEZpbGVzKCk7CmFwcC5Vc2VTdGF0aWNGaWxlcyhuZXcgU3RhdGljRmlsZU9wdGlvbnMgewogICAgRmlsZVByb3ZpZGVyID0gbmV3IE1pY3Jvc29mdC5FeHRlbnNpb25zLkZpbGVQcm92aWRlcnMuUGh5c2ljYWxGaWxlUHJvdmlkZXIoZnJvbnRlbmREaXIpLAogICAgUmVxdWVzdFBhdGggPSAiIgp9KTsKYXBwLk1hcEZhbGxiYWNrVG9GaWxlKCJpbmRleC5odG1sIiwgbmV3IFN0YXRpY0ZpbGVPcHRpb25zIHsKICAgIEZpbGVQcm92aWRlciA9IG5ldyBNaWNyb3NvZnQuRXh0ZW5zaW9ucy5GaWxlUHJvdmlkZXJzLlBoeXNpY2FsRmlsZVByb3ZpZGVyKGZyb250ZW5kRGlyKQp9KTsKCi8vIFJ1biBmcm9udGVuZCBzZXJ2ZXIgaW4gYmFja2dyb3VuZCB0aHJlYWQKdmFyIGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpOwp2YXIgc2VydmVyVGFzayA9IGFwcC5SdW5Bc3luYyhjdHMuVG9rZW4pOwoKLy8gV2FpdCBmb3IgQVBJIHRvIGJlIHJlYWR5CkNvbnNvbGUuV3JpdGUoIldhaXRpbmcgZm9yIEFQSSIpOwp1c2luZyB2YXIgaHR0cCA9IG5ldyBTeXN0ZW0uTmV0Lkh0dHAuSHR0cENsaWVudCgpOwpodHRwLlRpbWVvdXQgPSBUaW1lU3Bhbi5Gcm9tU2Vjb25kcygyKTsKZm9yIChpbnQgaSA9IDA7IGkgPCAzMDsgaSsrKSB7CiAgICBUaHJlYWQuU2xlZXAoMTAwMCk7IENvbnNvbGUuV3JpdGUoIi4iKTsKICAgIHRyeSB7CiAgICAgICAgdmFyIHIgPSBodHRwLkdldEFzeW5jKCJodHRwOi8vbG9jYWxob3N0OjUwMDAvIikuR2V0QXdhaXRlcigpLkdldFJlc3VsdCgpOwogICAgICAgIGJyZWFrOwogICAgfSBjYXRjaCB7IH0KfQpDb25zb2xlLldyaXRlTGluZSgiIHJlYWR5ISIpOwoKLy8gT3BlbiBicm93c2VyClN5c3RlbS5EaWFnbm9zdGljcy5Qcm9jZXNzLlN0YXJ0KG5ldyBTeXN0ZW0uRGlhZ25vc3RpY3MuUHJvY2Vzc1N0YXJ0SW5mbygiaHR0cDovL2xvY2FsaG9zdDo4MDgwIikgeyBVc2VTaGVsbEV4ZWN1dGUgPSB0cnVlIH0pOwpDb25zb2xlLldyaXRlTGluZSgiRGFzaGJvYXJkIHJ1bm5pbmcgYXQgaHR0cDovL2xvY2FsaG9zdDo4MDgwIik7CkNvbnNvbGUuV3JpdGVMaW5lKCJQcmVzcyBFbnRlciB0byBzdG9wIGV2ZXJ5dGhpbmcuIik7CkNvbnNvbGUuUmVhZExpbmUoKTsKCi8vIFNodXRkb3duCmN0cy5DYW5jZWwoKTsKdHJ5IHsgYXBpLktpbGwoZW50aXJlUHJvY2Vzc1RyZWU6IHRydWUpOyB9IGNhdGNoIHsgfQp0cnkgeyBzZXJ2ZXJUYXNrLkdldEF3YWl0ZXIoKS5HZXRSZXN1bHQoKTsgfSBjYXRjaCB7IH0KQ29uc29sZS5Xcml0ZUxpbmUoIlN0b3BwZWQuIik7Cg=="
$bytes = [System.Convert]::FromBase64String($b64)
[System.IO.File]::WriteAllBytes($programCs, $bytes)

# Write csproj fresh in temp dir
$csprojContent = @'
<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <RuntimeIdentifier>win-x64</RuntimeIdentifier>
    <PublishSingleFile>true</PublishSingleFile>
    <SelfContained>true</SelfContained>
    <AssemblyName>VRChatDashboard</AssemblyName>
    <Nullable>disable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>
</Project>
'@
$csprojPath = Join-Path $tmpDir "launcher.csproj"
[System.IO.File]::WriteAllText($csprojPath, $csprojContent, [System.Text.Encoding]::UTF8)

Write-Host "Building from temp: $tmpDir" -ForegroundColor Gray
dotnet publish "$csprojPath" --configuration Release --runtime win-x64 --self-contained true -p:PublishSingleFile=true --output "$scriptDir"

# Cleanup temp
Remove-Item $tmpDir -Recurse -Force -ErrorAction SilentlyContinue

$launcherExe = Join-Path $scriptDir "VRChatDashboard.exe"
if (Test-Path $launcherExe) {
    Write-Host "[OK] Launcher built" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Launcher exe missing - check dotnet errors above" -ForegroundColor Red; exit 1
}

# ================================================================
# STEP 5 - Inno Setup
# ================================================================
$innoExe = $null
foreach ($p in @("C:\Program Files (x86)\Inno Setup 7\ISCC.exe","C:\Program Files\Inno Setup 7\ISCC.exe","C:\Program Files (x86)\Inno Setup 6\ISCC.exe")) {
    if (Test-Path $p) { $innoExe = $p; break }
}
if (-not $innoExe) { Write-Host "[ERROR] Inno Setup not found" -ForegroundColor Red; exit 1 }
Write-Host "[OK] Inno Setup: $innoExe" -ForegroundColor Green

# ================================================================
# STEP 6 - Generate .iss
# ================================================================
Write-Host ""
Write-Host "--- Generating installer script ---" -ForegroundColor Yellow
$issPath = Join-Path $scriptDir "installer.iss"
if (Test-Path $issPath) { Remove-Item $issPath -Force }

$iss = @"
#define MyAppName    "VRChat Dashboard"
#define MyAppVersion "1.0.0"
#define MyAppExe     "VRChatDashboard.exe"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
DefaultDirName={autopf}\{#MyAppName}
ShowLanguageDialog=no
DefaultGroupName={#MyAppName}
OutputDir=$buildDir
OutputBaseFilename=VRChatDashboard-Installer
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"

[Files]
Source: "$launcherExe";      DestDir: "{app}";          Flags: ignoreversion
Source: "$apiPublishDir\*";  DestDir: "{app}\api";      Flags: ignoreversion recursesubdirs
Source: "$frontDistDir\*";   DestDir: "{app}\frontend";  Flags: ignoreversion recursesubdirs
Source: "$nodeInstaller";    DestDir: "{tmp}";           Flags: deleteafterinstall
Source: "$pgInstaller";      DestDir: "{tmp}";           Flags: deleteafterinstall

[Icons]
Name: "{group}\{#MyAppName}";           Filename: "{app}\{#MyAppExe}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{commondesktop}\{#MyAppName}";   Filename: "{app}\{#MyAppExe}"; Tasks: desktopicon

[Run]
Filename: "msiexec.exe"; Parameters: "/i ""{tmp}\nodejs.msi"" /quiet /norestart"; StatusMsg: "Installing Node.js..."; Flags: waituntilterminated
; Filename: "{tmp}\postgresql.exe"; Parameters: "--mode unattended --superpassword CHANGE_ME_DB_PASSWORD --serverport 5432 --servicename postgresql-vrchat"; StatusMsg: "Installing PostgreSQL..."; Flags: waituntilterminated
Filename: "{app}\{#MyAppExe}"; Description: "Launch VRChat Dashboard"; Flags: nowait postinstall skipifsilent

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
var Key, Json, FilePath, Chars: String; i: Integer;
begin
  if CurStep = ssPostInstall then begin
    Chars := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
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
