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
OutputDir=C:\Users\anto9\OneDrive\Bureau\VRChatDashboard-OpenSource\installer\build
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
Source: "C:\Users\anto9\OneDrive\Bureau\VRChatDashboard-OpenSource\installer\VRChatDashboard.exe";      DestDir: "{app}";          Flags: ignoreversion
Source: "C:\Users\anto9\OneDrive\Bureau\VRChatDashboard-OpenSource\installer\build\api\*";  DestDir: "{app}\api";      Flags: ignoreversion recursesubdirs
Source: "C:\Users\anto9\OneDrive\Bureau\VRChatDashboard-OpenSource\installer\build\frontend\*";   DestDir: "{app}\frontend";  Flags: ignoreversion recursesubdirs
Source: "C:\Users\anto9\OneDrive\Bureau\VRChatDashboard-OpenSource\installer\assets\nodejs.msi";    DestDir: "{tmp}";           Flags: deleteafterinstall
Source: "C:\Users\anto9\OneDrive\Bureau\VRChatDashboard-OpenSource\installer\assets\postgresql.exe";      DestDir: "{tmp}";           Flags: deleteafterinstall

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
