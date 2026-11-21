#define MyAppName "PrismPulse"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "viper"
#define MyAppExeName "PrismPulse.exe"
#define MySourceDir "out\PrismPulse-win32-x64"

[Setup]
AppId={{8E4F2A19-5C3B-4D7E-9A12-7B8C9D0E1F2A}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
LicenseFile=LICENSE.txt
OutputDir=out\installer
OutputBaseFilename={#MyAppName}_Setup_v{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
UninstallDisplayIcon={app}\{#MyAppExeName}
AppMutex=PrismPulseSingleInstanceMutex

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &Desktop shortcut"; GroupDescription: "Additional options:"
Name: "startup"; Description: "Launch {#MyAppName} automatically when &Windows starts"; GroupDescription: "Additional options:"; Flags: unchecked

[Files]
Source: "{#MySourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "{#MyAppName}"; ValueData: """{app}\{#MyAppExeName}"""; Flags: uninsdeletevalue; Tasks: startup

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName} now"; Flags: nowait postinstall skipifsilent

[Code]
function IsProcessRunning(const ExeName: String): Boolean;
var
  ResultCode: Integer;
  TempFile: String;
  Lines: TStringList;
  I: Integer;
begin
  Result := False;
  TempFile := ExpandConstant('{tmp}\pp_procs.txt');
  if Exec('cmd.exe', '/C tasklist /FI "IMAGENAME eq ' + ExeName + '" /NH > "' + TempFile + '"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    if FileExists(TempFile) then
    begin
      Lines := TStringList.Create;
      try
        Lines.LoadFromFile(TempFile);
        for I := 0 to Lines.Count - 1 do
        begin
          if Pos(Lowercase(ExeName), Lowercase(Lines[I])) > 0 then
          begin
            Result := True;
            Break;
          end;
        end;
      finally
        Lines.Free;
        DeleteFile(TempFile);
      end;
    end;
  end;
end;

function InitializeSetup(): Boolean;
begin
  Result := True;
  if IsProcessRunning('FlightSimulator2024.exe') or IsProcessRunning('FlightSimulator.exe') or IsProcessRunning('X-Plane.exe') then
  begin
    if MsgBox('A flight simulator process is currently running. Close it before installing PrismPulse for best results. Continue anyway?', mbConfirmation, MB_YESNO) = IDNO then
      Result := False;
  end;
end;