#define MyAppName    "VRChat Dashboard"
#define MyAppVersion "1.0.0"
#define MyAppExe     "VRChatDashboard.exe"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
OutputDir=C:\Users\anto9\OneDrive\Bureau\VRChatDashboard-OpenSource\installer\build
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
Source: "C:\Users\anto9\OneDrive\Bureau\VRChatDashboard-OpenSource\installer\VRChatDashboard.exe";      DestDir: "{app}";         Flags: ignoreversion
Source: "C:\Users\anto9\OneDrive\Bureau\VRChatDashboard-OpenSource\installer\build\api\*";  DestDir: "{app}\api";     Flags: ignoreversion recursesubdirs
Source: "C:\Users\anto9\OneDrive\Bureau\VRChatDashboard-OpenSource\installer\build\frontend\*";   DestDir: "{app}\frontend"; Flags: ignoreversion recursesubdirs
Source: "C:\Users\anto9\OneDrive\Bureau\VRChatDashboard-OpenSource\installer\build\overlay\*"; DestDir: "{app}\overlay"; Flags: ignoreversion recursesubdirs
Source: "C:\Users\anto9\OneDrive\Bureau\VRChatDashboard-OpenSource\installer\assets\nodejs.msi";    DestDir: "{tmp}";          Flags: deleteafterinstall

[Icons]
Name: "{group}\{#MyAppName}";           Filename: "{app}\{#MyAppExe}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{commondesktop}\{#MyAppName}";   Filename: "{app}\{#MyAppExe}"; Tasks: desktopicon

[Run]
Filename: "msiexec.exe"; Parameters: "/i ""{tmp}\nodejs.msi"" /quiet /norestart"; StatusMsg: "Installing Node.js..."; Flags: waituntilterminated
Filename: "{app}\{#MyAppExe}"; Description: "Launch VRChat Dashboard"; Flags: nowait postinstall skipifsilent

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
var Json, FilePath: String;
begin
  // No database and no secret: the API makes its own JWT key when Jwt:Key is empty.
  if CurStep = ssPostInstall then begin
    Json := '{' + #13#10 +
      '  "Logging": { "LogLevel": { "Default": "Information", "Microsoft.AspNetCore": "Warning" } },' + #13#10 +
      '  "AllowedHosts": "*",' + #13#10 +
      '  "Jwt": { "Key": "", "Issuer": "DashboardVRChat.Api", "Audience": "DashboardVRChat.Client" },' + #13#10 +
      '  "VRChat": { "Contact": "" }' + #13#10 + '}';
    FilePath := ExpandConstant('{app}\api\appsettings.json');
    SaveStringToFile(FilePath, Json, False);
  end;
end;
