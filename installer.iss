#define MyAppName "PrismPulse"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "viper"
#define MyAppIconFile "assets\icon.ico"
#define MyAppLicenseFile "LICENSE.txt"
#define MyAppExeName "PrismPulseApp.exe"
#define MySourceDir "out\PrismPulseApp-win32-x64"

#if !FileExists(AddBackslash(MySourceDir) + MyAppExeName)
  #error "Packaged build not found at " + AddBackslash(MySourceDir) + MyAppExeName + ". Run `npm run make` first."
#endif

#if !FileExists(MyAppIconFile)
  #error "Icon file not found at " + MyAppIconFile + ". Place a valid .ico file at assets\icon.ico before compiling."
#endif

[Setup]
AppId={{8E4F2A19-5C3B-4D7E-9A12-7B8C9D0E1F2A}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
SetupIconFile={#MyAppIconFile}
#if FileExists(MyAppLicenseFile)
LicenseFile={#MyAppLicenseFile}
#endif
OutputDir=out\installer
OutputBaseFilename=PrismPulse-Installer
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
WizardSizePercent=105
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
UninstallDisplayIcon={app}\{#MyAppExeName}
AppMutex=PrismPulseSingleInstanceMutex

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
WelcomeTitle=Welcome to {#MyAppName} Setup
WelcomeSubTitle=This wizard will install {#MyAppName} v{#MyAppVersion} for your Windows user while preserving existing settings.
OpenInstallDir=Open installation folder after setup

[Tasks]
Name: "desktopicon"; Description: "Create a &Desktop shortcut"; GroupDescription: "Shortcuts:"
Name: "startup"; Description: "Launch {#MyAppName} automatically when &Windows starts"; GroupDescription: "Startup options:"; Flags: unchecked
Name: "openfolder"; Description: "{cm:OpenInstallDir}"; GroupDescription: "After installation:"; Flags: unchecked

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
Filename: "explorer.exe"; Parameters: """{app}"""; Description: "{cm:OpenInstallDir}"; Flags: nowait postinstall skipifsilent unchecked; Check: IsTaskSelected('openfolder')

[Code]
procedure InitializeWizard();
begin
  WizardForm.Color := $261812;
  WizardForm.MainPanel.Color := $2C1D18;
  WizardForm.WelcomeLabel1.Caption := ExpandConstant('{cm:WelcomeTitle}');
  WizardForm.WelcomeLabel2.Caption := ExpandConstant('{cm:WelcomeSubTitle}');
  WizardForm.WelcomeLabel1.Font.Color := $EED322;
  WizardForm.WelcomeLabel2.Font.Color := $F8FAFC;
  WizardForm.PageNameLabel.Font.Color := $EED322;
  WizardForm.PageDescriptionLabel.Font.Color := $CBD5E1;
end;

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