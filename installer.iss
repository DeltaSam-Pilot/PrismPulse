#define MyAppName "PrismPulse"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "viper"
#define MyAppIconFile "assets\icon.ico"
#define MyAppTermsFile "TERMS.txt"
#define MyAppExeName "PrismPulse.exe"
#define MySourceDir "out\PrismPulse-win32-x64"

#if !FileExists(AddBackslash(MySourceDir) + MyAppExeName)
  #error "Packaged build not found at " + AddBackslash(MySourceDir) + MyAppExeName + ". Run `npm run package` first."
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
AppPublisherURL=https://github.com/Sammy-Avgeek/PrismPulse
AppSupportURL=https://github.com/Sammy-Avgeek/PrismPulse/issues
AppUpdatesURL=https://github.com/Sammy-Avgeek/PrismPulse/releases
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
SetupIconFile={#MyAppIconFile}
LicenseFile={#MyAppTermsFile}
OutputDir=out\installer
OutputBaseFilename=PrismPulse-Setup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
WizardSizePercent=105
WizardResizable=yes
DefaultDialogFontName=Segoe UI
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
CloseApplications=yes
RestartApplications=no
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}
AppMutex=PrismPulseSingleInstanceMutex

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
WelcomeTitle=Welcome to {#MyAppName} Setup
WelcomeSubTitle=Install {#MyAppName} v{#MyAppVersion} for this Windows user. Review and accept the User Agreement to continue.
OpenInstallDir=Open installation folder after setup

[Tasks]
Name: "desktopicon"; Description: "Create a &Desktop shortcut"; GroupDescription: "Shortcuts:"
Name: "startmenu"; Description: "Add PrismPulse to the Start &menu"; GroupDescription: "Shortcuts:"
Name: "startup"; Description: "Launch {#MyAppName} automatically when &Windows starts"; GroupDescription: "Startup options:"; Flags: unchecked
Name: "openfolder"; Description: "{cm:OpenInstallDir}"; GroupDescription: "After installation:"; Flags: unchecked

[Files]
Source: "{#MySourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: startmenu
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"; Tasks: startmenu
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "{#MyAppName}"; ValueData: """{app}\{#MyAppExeName}"""; Flags: uninsdeletevalue; Tasks: startup

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName} now"; Flags: nowait postinstall skipifsilent
Filename: "explorer.exe"; Parameters: """{app}"""; Description: "{cm:OpenInstallDir}"; Flags: nowait postinstall skipifsilent unchecked; Check: IsTaskSelected('openfolder')

[Code]
type
  TScrollInfo = record
    cbSize: Cardinal;
    fMask: Cardinal;
    nMin: Integer;
    nMax: Integer;
    nPage: Cardinal;
    nPos: Integer;
    nTrackPos: Integer;
  end;

function GetScrollInfo(hWnd: HWND; nBar: Integer; var lpScrollInfo: TScrollInfo): LongBool;
  external 'GetScrollInfo@user32.dll stdcall';

function HasAcceptTermsSwitch(): Boolean;
var
  I: Integer;
begin
  Result := False;
  for I := 1 to ParamCount do
  begin
    if Uppercase(ParamStr(I)) = '/ACCEPTTERMS' then
    begin
      Result := True;
      Exit;
    end;
  end;
end;

function InitializeSetup(): Boolean;
begin
  Result := True;
  if WizardSilent and not HasAcceptTermsSwitch then
  begin
    Log('Silent setup requires explicit acceptance with /ACCEPTTERMS.');
    Result := False;
  end;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  ScrollInfo: TScrollInfo;
begin
  Result := True;
  if (CurPageID = wpLicense) and not WizardSilent then
  begin
    ScrollInfo.cbSize := SizeOf(ScrollInfo);
    ScrollInfo.fMask := $17;
    if not GetScrollInfo(WizardForm.LicenseMemo.Handle, 1, ScrollInfo) then
    begin
      MsgBox('The agreement reading position could not be verified. Please review the agreement and try again.',
        mbError, MB_OK);
      Result := False;
      Exit;
    end;

    if (ScrollInfo.nMax > Integer(ScrollInfo.nPage)) and
      (ScrollInfo.nPos + Integer(ScrollInfo.nPage) < ScrollInfo.nMax) then
    begin
      MsgBox('Scroll to the end of the User Agreement before continuing.',
        mbInformation, MB_OK);
      Result := False;
    end;
  end;
end;

procedure InitializeWizard();
begin
  WizardForm.Color := $120B08;
  WizardForm.MainPanel.Color := $1B110D;
  WizardForm.WelcomeLabel1.Caption := ExpandConstant('{cm:WelcomeTitle}');
  WizardForm.WelcomeLabel2.Caption := ExpandConstant('{cm:WelcomeSubTitle}');
  WizardForm.WelcomeLabel1.Font.Color := $EED322;
  WizardForm.WelcomeLabel1.Font.Style := [fsBold];
  WizardForm.WelcomeLabel2.Font.Color := $F8FAFC;
  WizardForm.PageNameLabel.Font.Color := $EED322;
  WizardForm.PageNameLabel.Font.Style := [fsBold];
  WizardForm.PageDescriptionLabel.Font.Color := $CBD5E1;
  WizardForm.LicenseMemo.Color := $151A28;
  WizardForm.LicenseMemo.Font.Color := $F3F4F6;
  WizardForm.FinishedHeadingLabel.Font.Color := $EED322;
  WizardForm.FinishedLabel.Font.Color := $F8FAFC;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = wpFinished then
  begin
    WizardForm.FinishedHeadingLabel.Caption := 'PrismPulse is ready';
    WizardForm.FinishedLabel.Caption := 'PrismPulse.exe has been installed. Select Finish to close setup or launch the app now.';
  end;
end;