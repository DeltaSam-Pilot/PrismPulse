[CmdletBinding()]
param(
    [switch]$Uninstall,
    [string]$TargetDirectory
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$AppName = "PrismPulse"
$Version = "1.0.1"
$ExeName = "PrismPulse.exe"
$DefaultSource = Join-Path $PSScriptRoot "out\PrismPulse-win32-x64"
$DefaultTarget = if (-not [string]::IsNullOrWhiteSpace($TargetDirectory)) {
    $TargetDirectory
} else {
    Join-Path $env:LOCALAPPDATA $AppName
}
$UserDataDir = Join-Path $env:APPDATA $AppName

function Resolve-BuildSource([string]$PreferredPath, [string]$ExeFileName) {
    if (Test-Path (Join-Path $PreferredPath $ExeFileName)) {
        return $PreferredPath
    }
    $altBuild = Get-ChildItem -Path $PSScriptRoot -Directory -Filter "out_build_*" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        ForEach-Object {
            $candidate = Join-Path $_.FullName "PrismPulse-win32-x64"
            if (Test-Path (Join-Path $candidate $ExeFileName)) { $candidate }
        } | Select-Object -First 1
    if ($altBuild) {
        return $altBuild
    }
    return $PreferredPath
}

$SourceDir = Resolve-BuildSource -PreferredPath $DefaultSource -ExeFileName $ExeName
$sourceExe = Join-Path $SourceDir $ExeName
if (-not $Uninstall -and -not (Test-Path $sourceExe)) {
    [System.Windows.Forms.MessageBox]::Show(
        "Packaged build not found at:`n$sourceExe`n`nRun 'npm run make' first.",
        "$AppName Installer",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
    exit 1
}

$sourceFiles = Get-ChildItem -Path $SourceDir -Recurse -File
$totalBytes = ($sourceFiles | Measure-Object -Property Length -Sum).Sum
if (-not $totalBytes) { $totalBytes = 0 }
$totalMB = [Math]::Round(($totalBytes / 1MB), 1)

# Palette
$bgVoid       = [System.Drawing.Color]::FromArgb(9, 13, 24)
$bgHeader     = [System.Drawing.Color]::FromArgb(13, 19, 34)
$bgSurface    = [System.Drawing.Color]::FromArgb(19, 28, 48)
$bgInput      = [System.Drawing.Color]::FromArgb(27, 39, 65)
$borderSubtle = [System.Drawing.Color]::FromArgb(39, 55, 89)
$accentCyan   = [System.Drawing.Color]::FromArgb(56, 189, 248)
$accentBright = [System.Drawing.Color]::FromArgb(125, 211, 252)
$textPrimary  = [System.Drawing.Color]::FromArgb(241, 245, 249)
$textMuted    = [System.Drawing.Color]::FromArgb(148, 163, 184)
$dangerBase   = [System.Drawing.Color]::FromArgb(69, 26, 36)
$dangerHover  = [System.Drawing.Color]::FromArgb(185, 28, 28)
$neutralBase  = [System.Drawing.Color]::FromArgb(30, 41, 59)
$neutralHover = [System.Drawing.Color]::FromArgb(51, 65, 85)

$form = New-Object System.Windows.Forms.Form
$form.Text = "$AppName Installer"
$form.Size = New-Object System.Drawing.Size(660, 485)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "None"
$form.BackColor = $bgVoid
$form.ForeColor = $textPrimary

$iconPath = Join-Path $PSScriptRoot "assets\icon.ico"
if (Test-Path $iconPath) {
    $form.Icon = New-Object System.Drawing.Icon($iconPath)
}

# Rounded window region
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$radius = 16
$rect = New-Object System.Drawing.Rectangle(0, 0, $form.Width, $form.Height)
$d = $radius * 2
$path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
$path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
$path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
$path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
$path.CloseFigure()
$form.Region = New-Object System.Drawing.Region($path)

$form.Add_Paint({
    param($sender, $e)
    $e.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $pen = New-Object System.Drawing.Pen($borderSubtle, 1.5)
    $e.Graphics.DrawRectangle($pen, 1, 1, ($form.Width - 2), ($form.Height - 2))
    $pen.Dispose()
})

# Header
$topBar = New-Object System.Windows.Forms.Panel
$topBar.Size = New-Object System.Drawing.Size(660, 64)
$topBar.Location = New-Object System.Drawing.Point(0, 0)
$topBar.BackColor = $bgHeader
$topBar.Add_Paint({
    param($sender, $e)
    $linePen = New-Object System.Drawing.Pen($borderSubtle, 1)
    $e.Graphics.DrawLine($linePen, 0, ($topBar.Height - 1), $topBar.Width, ($topBar.Height - 1))
    $linePen.Dispose()
})
$form.Controls.Add($topBar)

if (Test-Path $iconPath) {
    $logoBox = New-Object System.Windows.Forms.PictureBox
    $logoBox.Size = New-Object System.Drawing.Size(30, 30)
    $logoBox.Location = New-Object System.Drawing.Point(22, 17)
    $logoBox.SizeMode = "Zoom"
    $logoBox.BackColor = [System.Drawing.Color]::Transparent
    $logoBox.Image = ([System.Drawing.Icon]::new($iconPath)).ToBitmap()
    $topBar.Controls.Add($logoBox)
}

$titleLabel = New-Object System.Windows.Forms.Label
$titleLabel.Text = "$AppName"
$titleLabel.Font = New-Object System.Drawing.Font("Segoe UI", 13.5, [System.Drawing.FontStyle]::Bold)
$titleLabel.ForeColor = $textPrimary
$titleLabel.Location = New-Object System.Drawing.Point(60, 16)
$titleLabel.AutoSize = $true
$topBar.Controls.Add($titleLabel)

$verBadge = New-Object System.Windows.Forms.Label
$verBadge.Text = "v$Version  •  $totalMB MB  •  $($sourceFiles.Count) files"
$verBadge.Font = New-Object System.Drawing.Font("Segoe UI", 8.5, [System.Drawing.FontStyle]::Bold)
$verBadge.ForeColor = $accentCyan
$verBadge.BackColor = $bgSurface
$verBadge.Location = New-Object System.Drawing.Point(168, 21)
$verBadge.Padding = New-Object System.Windows.Forms.Padding(8, 3, 8, 3)
$verBadge.AutoSize = $true
$topBar.Controls.Add($verBadge)

$closeBtn = New-Object System.Windows.Forms.Button
$closeBtn.Text = "✕"
$closeBtn.Size = New-Object System.Drawing.Size(34, 32)
$closeBtn.Location = New-Object System.Drawing.Point(604, 16)
$closeBtn.FlatStyle = "Flat"
$closeBtn.ForeColor = $textMuted
$closeBtn.BackColor = $neutralBase
$closeBtn.Font = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)
$closeBtn.FlatAppearance.BorderSize = 0
$closeBtn.Cursor = [System.Windows.Forms.Cursors]::Hand
$closeBtn.Add_MouseEnter({ $closeBtn.BackColor = $dangerHover; $closeBtn.ForeColor = $textPrimary })
$closeBtn.Add_MouseLeave({ $closeBtn.BackColor = $neutralBase; $closeBtn.ForeColor = $textMuted })
$closeBtn.Add_Click({ $form.Close() })
$topBar.Controls.Add($closeBtn)

# Drag window
$script:dragging = $false
$script:dragOffset = [System.Drawing.Point]::Empty
$onMouseDown = {
    if ($_.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
        $script:dragging = $true
        $script:dragOffset = New-Object System.Drawing.Point($_.X, $_.Y)
    }
}
$onMouseMove = {
    if ($script:dragging) {
        $form.Location = New-Object System.Drawing.Point(
            ($form.Location.X + $_.X - $script:dragOffset.X),
            ($form.Location.Y + $_.Y - $script:dragOffset.Y)
        )
    }
}
$onMouseUp = { $script:dragging = $false }
foreach ($ctrl in @($topBar, $titleLabel, $verBadge)) {
    $ctrl.Add_MouseDown($onMouseDown)
    $ctrl.Add_MouseMove($onMouseMove)
    $ctrl.Add_MouseUp($onMouseUp)
}

# Main Card
$card = New-Object System.Windows.Forms.Panel
$card.Size = New-Object System.Drawing.Size(612, 206)
$card.Location = New-Object System.Drawing.Point(24, 82)
$card.BackColor = $bgSurface
$card.Add_Paint({
    param($sender, $e)
    $e.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $p = New-Object System.Drawing.Pen($borderSubtle, 1)
    $e.Graphics.DrawRectangle($p, 0, 0, ($card.Width - 1), ($card.Height - 1))
    $dividerPen = New-Object System.Drawing.Pen($borderSubtle, 1)
    $e.Graphics.DrawLine($dividerPen, 16, 128, ($card.Width - 16), 128)
    $p.Dispose()
    $dividerPen.Dispose()
})
$form.Controls.Add($card)

$dirLabel = New-Object System.Windows.Forms.Label
$dirLabel.Text = "DESTINATION FOLDER"
$dirLabel.Font = New-Object System.Drawing.Font("Segoe UI", 8, [System.Drawing.FontStyle]::Bold)
$dirLabel.ForeColor = $textMuted
$dirLabel.Location = New-Object System.Drawing.Point(18, 12)
$dirLabel.AutoSize = $true
$card.Controls.Add($dirLabel)

$dirBox = New-Object System.Windows.Forms.TextBox
$dirBox.Text = $DefaultTarget
$dirBox.Size = New-Object System.Drawing.Size(462, 30)
$dirBox.Location = New-Object System.Drawing.Point(18, 34)
$dirBox.Font = New-Object System.Drawing.Font("Segoe UI", 9.5)
$dirBox.BackColor = $bgInput
$dirBox.ForeColor = $textPrimary
$dirBox.BorderStyle = "FixedSingle"
$card.Controls.Add($dirBox)

$browseBtn = New-Object System.Windows.Forms.Button
$browseBtn.Text = "Browse..."
$browseBtn.Size = New-Object System.Drawing.Size(102, 30)
$browseBtn.Location = New-Object System.Drawing.Point(490, 34)
$browseBtn.FlatStyle = "Flat"
$browseBtn.BackColor = $neutralBase
$browseBtn.ForeColor = $textPrimary
$browseBtn.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$browseBtn.FlatAppearance.BorderColor = $borderSubtle
$browseBtn.FlatAppearance.BorderSize = 1
$browseBtn.Cursor = [System.Windows.Forms.Cursors]::Hand
$browseBtn.Add_MouseEnter({ if ($browseBtn.Enabled) { $browseBtn.BackColor = $neutralHover } })
$browseBtn.Add_MouseLeave({ $browseBtn.BackColor = $neutralBase })
$browseBtn.Add_Click({
    $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
    $dlg.SelectedPath = $dirBox.Text
    if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        $chosen = $dlg.SelectedPath
        if ((Split-Path $chosen -Leaf) -ne $AppName) {
            $chosen = Join-Path $chosen $AppName
        }
        $dirBox.Text = $chosen
    }
})
$card.Controls.Add($browseBtn)

$srcLabel = New-Object System.Windows.Forms.Label
$srcLabel.Text = "Source: $SourceDir"
$srcLabel.Font = New-Object System.Drawing.Font("Segoe UI", 8)
$srcLabel.ForeColor = $textMuted
$srcLabel.Location = New-Object System.Drawing.Point(18, 72)
$srcLabel.Size = New-Object System.Drawing.Size(574, 18)
$card.Controls.Add($srcLabel)

$spaceLabel = New-Object System.Windows.Forms.Label
$spaceLabel.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
$spaceLabel.ForeColor = $textMuted
$spaceLabel.Location = New-Object System.Drawing.Point(18, 94)
$spaceLabel.Size = New-Object System.Drawing.Size(574, 20)
$card.Controls.Add($spaceLabel)

$desktopChk = New-Object System.Windows.Forms.CheckBox
$desktopChk.Text = "Create Desktop shortcut"
$desktopChk.Checked = $true
$desktopChk.Font = New-Object System.Drawing.Font("Segoe UI", 9.5)
$desktopChk.ForeColor = $textPrimary
$desktopChk.Location = New-Object System.Drawing.Point(18, 140)
$desktopChk.Cursor = [System.Windows.Forms.Cursors]::Hand
$desktopChk.AutoSize = $true
$card.Controls.Add($desktopChk)

$startMenuChk = New-Object System.Windows.Forms.CheckBox
$startMenuChk.Text = "Add Start Menu shortcut"
$startMenuChk.Checked = $true
$startMenuChk.Font = New-Object System.Drawing.Font("Segoe UI", 9.5)
$startMenuChk.ForeColor = $textPrimary
$startMenuChk.Location = New-Object System.Drawing.Point(245, 140)
$startMenuChk.Cursor = [System.Windows.Forms.Cursors]::Hand
$startMenuChk.AutoSize = $true
$card.Controls.Add($startMenuChk)

$launchChk = New-Object System.Windows.Forms.CheckBox
$launchChk.Text = "Launch $AppName after install"
$launchChk.Checked = $true
$launchChk.Font = New-Object System.Drawing.Font("Segoe UI", 9.5)
$launchChk.ForeColor = $textPrimary
$launchChk.Location = New-Object System.Drawing.Point(18, 168)
$launchChk.Cursor = [System.Windows.Forms.Cursors]::Hand
$launchChk.AutoSize = $true
$card.Controls.Add($launchChk)

# Progress & Status
$progressBar = New-Object System.Windows.Forms.ProgressBar
$progressBar.Location = New-Object System.Drawing.Point(24, 306)
$progressBar.Size = New-Object System.Drawing.Size(554, 14)
$progressBar.Style = "Continuous"
$form.Controls.Add($progressBar)

$pctLabel = New-Object System.Windows.Forms.Label
$pctLabel.Text = "0%"
$pctLabel.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$pctLabel.ForeColor = $accentCyan
$pctLabel.Location = New-Object System.Drawing.Point(584, 303)
$pctLabel.Size = New-Object System.Drawing.Size(52, 20)
$pctLabel.TextAlign = "MiddleRight"
$form.Controls.Add($pctLabel)

$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Text = "Ready."
$statusLabel.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$statusLabel.ForeColor = $textMuted
$statusLabel.Location = New-Object System.Drawing.Point(24, 332)
$statusLabel.Size = New-Object System.Drawing.Size(510, 38)
$form.Controls.Add($statusLabel)

$logLink = New-Object System.Windows.Forms.LinkLabel
$logLink.Text = "Open Log"
$logLink.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$logLink.LinkColor = $accentCyan
$logLink.ActiveLinkColor = $accentBright
$logLink.Location = New-Object System.Drawing.Point(550, 334)
$logLink.Size = New-Object System.Drawing.Size(86, 20)
$logLink.TextAlign = "MiddleRight"
$logLink.Cursor = [System.Windows.Forms.Cursors]::Hand
$logLink.Visible = $false
$logLink.Add_Click({
    $logPath = Join-Path $dirBox.Text.Trim() "install.log"
    if (Test-Path $logPath) {
        Start-Process notepad.exe -ArgumentList "`"$logPath`""
    }
})
$form.Controls.Add($logLink)

# Footer buttons
$openDirBtn = New-Object System.Windows.Forms.Button
$openDirBtn.Text = "Open Folder"
$openDirBtn.Size = New-Object System.Drawing.Size(112, 42)
$openDirBtn.Location = New-Object System.Drawing.Point(94, 414)
$openDirBtn.FlatStyle = "Flat"
$openDirBtn.BackColor = $neutralBase
$openDirBtn.ForeColor = $textPrimary
$openDirBtn.Font = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)
$openDirBtn.FlatAppearance.BorderColor = $borderSubtle
$openDirBtn.FlatAppearance.BorderSize = 1
$openDirBtn.Cursor = [System.Windows.Forms.Cursors]::Hand
$openDirBtn.Add_MouseEnter({ if ($openDirBtn.Enabled) { $openDirBtn.BackColor = $neutralHover } })
$openDirBtn.Add_MouseLeave({ $openDirBtn.BackColor = $neutralBase })
$openDirBtn.Add_Click({
    $target = $dirBox.Text.Trim()
    if ($target -and (Test-Path $target)) {
        Start-Process explorer.exe -ArgumentList "`"$target`""
    }
})
$form.Controls.Add($openDirBtn)

$uninstallBtn = New-Object System.Windows.Forms.Button
$uninstallBtn.Text = "Uninstall"
$uninstallBtn.Size = New-Object System.Drawing.Size(112, 42)
$uninstallBtn.Location = New-Object System.Drawing.Point(214, 414)
$uninstallBtn.FlatStyle = "Flat"
$uninstallBtn.BackColor = $dangerBase
$uninstallBtn.ForeColor = $textPrimary
$uninstallBtn.Font = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)
$uninstallBtn.FlatAppearance.BorderSize = 0
$uninstallBtn.Cursor = [System.Windows.Forms.Cursors]::Hand
$uninstallBtn.Add_MouseEnter({ if ($uninstallBtn.Enabled) { $uninstallBtn.BackColor = $dangerHover } })
$uninstallBtn.Add_MouseLeave({ $uninstallBtn.BackColor = $dangerBase })
$form.Controls.Add($uninstallBtn)

$repairBtn = New-Object System.Windows.Forms.Button
$repairBtn.Text = "Repair"
$repairBtn.Size = New-Object System.Drawing.Size(112, 42)
$repairBtn.Location = New-Object System.Drawing.Point(334, 414)
$repairBtn.FlatStyle = "Flat"
$repairBtn.BackColor = $neutralBase
$repairBtn.ForeColor = $textPrimary
$repairBtn.Font = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)
$repairBtn.FlatAppearance.BorderColor = $borderSubtle
$repairBtn.FlatAppearance.BorderSize = 1
$repairBtn.Cursor = [System.Windows.Forms.Cursors]::Hand
$repairBtn.Add_MouseEnter({ if ($repairBtn.Enabled) { $repairBtn.BackColor = $neutralHover } })
$repairBtn.Add_MouseLeave({ $repairBtn.BackColor = $neutralBase })
$form.Controls.Add($repairBtn)

$installBtn = New-Object System.Windows.Forms.Button
$installBtn.Text = "Install Now"
$installBtn.Size = New-Object System.Drawing.Size(182, 42)
$installBtn.Location = New-Object System.Drawing.Point(454, 414)
$installBtn.FlatStyle = "Flat"
$installBtn.BackColor = $accentCyan
$installBtn.ForeColor = $bgVoid
$installBtn.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$installBtn.FlatAppearance.BorderSize = 0
$installBtn.Cursor = [System.Windows.Forms.Cursors]::Hand
$installBtn.Add_MouseEnter({ if ($installBtn.Enabled) { $installBtn.BackColor = $accentBright } })
$installBtn.Add_MouseLeave({ $installBtn.BackColor = $accentCyan })
$form.Controls.Add($installBtn)

function Set-ProgressUI([int]$Value, [int]$Maximum) {
    $safeMax = [Math]::Max($Maximum, 1)
    $clamped = [Math]::Min([Math]::Max($Value, 0), $safeMax)
    $progressBar.Maximum = $safeMax
    $progressBar.Value = $clamped
    $pct = [Math]::Round(($clamped / $safeMax) * 100)
    $pctLabel.Text = "$pct%"
}

function Stop-RunningApp([string]$ProcessBaseName) {
    $procs = Get-Process -Name $ProcessBaseName -ErrorAction SilentlyContinue
    if ($procs) {
        $procs | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 400
    }
}

function New-AppShortcut([string]$ShortcutPath, [string]$TargetExe, [string]$WorkingDir, [string]$IconFile) {
    $wsh = New-Object -ComObject WScript.Shell
    $lnk = $wsh.CreateShortcut($ShortcutPath)
    $lnk.TargetPath = $TargetExe
    $lnk.WorkingDirectory = $WorkingDir
    if (Test-Path $IconFile) { $lnk.IconLocation = $IconFile }
    $lnk.Save()
}

function Register-Application([string]$TargetDir, [string]$InstalledExe) {
    $uninstallScript = Join-Path $TargetDir "PrismPulse-Uninstaller.ps1"
    Copy-Item -LiteralPath $PSCommandPath -Destination $uninstallScript -Force
    $uninstallString = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$uninstallScript`" -Uninstall -TargetDirectory `"$TargetDir`""
    $registryPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\PrismPulse"
    New-Item -Path $registryPath -Force | Out-Null
    Set-ItemProperty -Path $registryPath -Name "DisplayName" -Value $AppName
    Set-ItemProperty -Path $registryPath -Name "DisplayVersion" -Value $Version
    Set-ItemProperty -Path $registryPath -Name "Publisher" -Value "viper"
    Set-ItemProperty -Path $registryPath -Name "InstallLocation" -Value $TargetDir
    Set-ItemProperty -Path $registryPath -Name "DisplayIcon" -Value $InstalledExe
    Set-ItemProperty -Path $registryPath -Name "UninstallString" -Value $uninstallString
    Set-ItemProperty -Path $registryPath -Name "QuietUninstallString" -Value $uninstallString
    Set-ItemProperty -Path $registryPath -Name "NoModify" -Value 1 -Type DWord
    Set-ItemProperty -Path $registryPath -Name "NoRepair" -Value 0 -Type DWord
    Set-ItemProperty -Path $registryPath -Name "EstimatedSize" -Value ([Math]::Ceiling($totalBytes / 1KB)) -Type DWord
}

function Test-DriveSpace([string]$TargetPath, [long]$RequiredBytes) {
    $root = [System.IO.Path]::GetPathRoot($TargetPath)
    if ([string]::IsNullOrWhiteSpace($root)) { return $true }
    $driveLetter = $root.Substring(0, 1).ToUpper()
    $psDrive = Get-PSDrive -Name $driveLetter -ErrorAction SilentlyContinue
    if (-not $psDrive -or -not $psDrive.Free) { return $true }
    $freeGB = [Math]::Round(($psDrive.Free / 1GB), 1)
    $spaceLabel.Text = "Drive ${driveLetter}:\ free: $freeGB GB  •  Required: $totalMB MB"
    return ($psDrive.Free -ge ($RequiredBytes + 50MB))
}

function Write-InstallLog([string]$TargetDir, [string]$Message) {
    try {
        if (-not (Test-Path $TargetDir)) {
            New-Item -Path $TargetDir -ItemType Directory -Force | Out-Null
        }
        $logFile = Join-Path $TargetDir "install.log"
        $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        Add-Content -Path $logFile -Value "[$stamp] $Message" -ErrorAction SilentlyContinue
        $logLink.Visible = $true
    } catch {}
}

function Copy-BuildFast([string]$Src, [string]$Dst, [string]$Word) {
    if (-not (Test-Path $Dst)) {
        New-Item -Path $Dst -ItemType Directory -Force | Out-Null
    }

    $sync = [hashtable]::Synchronized(@{
        Done    = $false
        Copied  = 0
        Total   = [Math]::Max($sourceFiles.Count, 1)
        Current = ""
        Error   = $null
    })

    $rs = [runspacefactory]::CreateRunspace()
    $rs.Open()
    $rs.SessionStateProxy.SetVariable("sync", $sync)
    $rs.SessionStateProxy.SetVariable("Src", $Src)
    $rs.SessionStateProxy.SetVariable("Dst", $Dst)

    $ps = [powershell]::Create()
    $ps.Runspace = $rs
    [void]$ps.AddScript({
        try {
            $files = Get-ChildItem -Path $Src -Recurse -File
            $sync.Total = [Math]::Max($files.Count, 1)
            $count = 0
            foreach ($file in $files) {
                $relPath = $file.FullName.Substring($Src.Length).TrimStart('\')
                $destFile = Join-Path $Dst $relPath
                $destFolder = Split-Path -Path $destFile -Parent
                if (-not (Test-Path $destFolder)) {
                    New-Item -Path $destFolder -ItemType Directory -Force | Out-Null
                }
                Copy-Item -Path $file.FullName -Destination $destFile -Force
                $count++
                $sync.Copied = $count
                $sync.Current = $file.Name
            }
        } catch {
            $sync.Error = $_.Exception.Message
        } finally {
            $sync.Done = $true
        }
    })

    $handle = $ps.BeginInvoke()
    while (-not $sync.Done) {
        Set-ProgressUI -Value $sync.Copied -Maximum $sync.Total
        if ($sync.Current) {
            $statusLabel.Text = "$Word $($sync.Current) ($($sync.Copied)/$($sync.Total))"
        }
        [System.Windows.Forms.Application]::DoEvents()
        Start-Sleep -Milliseconds 30
    }
    $ps.EndInvoke($handle) | Out-Null
    $ps.Dispose()
    $rs.Close()
    $rs.Dispose()

    Set-ProgressUI -Value $sync.Copied -Maximum $sync.Total
    if ($sync.Error) {
        throw $sync.Error
    }
    return $sync.Copied
}

$updateUIState = {
    $target = $dirBox.Text.Trim()
    $existingExe = if ([string]::IsNullOrWhiteSpace($target)) { $null } else { Join-Path $target $ExeName }
    $isInstalled = ($existingExe -and (Test-Path $existingExe))
    $uninstallBtn.Enabled = $isInstalled
    $repairBtn.Enabled = $isInstalled
    $openDirBtn.Enabled = (-not [string]::IsNullOrWhiteSpace($target)) -and (Test-Path $target)
    [void](Test-DriveSpace -TargetPath $target -RequiredBytes $totalBytes)

    if (-not $installBtn.Tag) {
        $installBtn.Text = "Install Now"
        $statusLabel.Text = if ($isInstalled) {
            "$AppName is installed here. Click Install Now to update or Repair to refresh."
        } else {
            "Ready to install $AppName to $target."
        }
    }
}
$dirBox.Add_TextChanged({
    $installBtn.Tag = $null
    & $updateUIState
})
& $updateUIState

$runInstall = {
    param([bool]$IsRepair = $false)

    $targetDir = $dirBox.Text.Trim()
    if ([string]::IsNullOrWhiteSpace($targetDir)) {
        [System.Windows.Forms.MessageBox]::Show("Choose a valid installation folder.", "$AppName Installer") | Out-Null
        return
    }

    if (-not (Test-DriveSpace -TargetPath $targetDir -RequiredBytes $totalBytes)) {
        [System.Windows.Forms.MessageBox]::Show(
            "Not enough free disk space on the target drive to install $AppName ($totalMB MB required).",
            "Insufficient Disk Space",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Warning
        ) | Out-Null
        return
    }

    $installBtn.Enabled = $false
    $uninstallBtn.Enabled = $false
    $repairBtn.Enabled = $false
    $openDirBtn.Enabled = $false
    $browseBtn.Enabled = $false
    $dirBox.Enabled = $false
    $actionWord = if ($IsRepair) { "Repairing" } else { "Installing" }
    $verbWord = if ($IsRepair) { "Repairing" } else { "Copying" }
    $statusLabel.Text = "$actionWord $AppName..."
    Set-ProgressUI -Value 0 -Maximum $sourceFiles.Count
    [System.Windows.Forms.Application]::DoEvents()

    $procName = [System.IO.Path]::GetFileNameWithoutExtension($ExeName)
    Stop-RunningApp -ProcessBaseName $procName
    Write-InstallLog -TargetDir $targetDir -Message "$actionWord $AppName v$Version from $SourceDir"

    try {
        $copied = Copy-BuildFast -Src $SourceDir -Dst $targetDir -Word $verbWord
    } catch {
        Write-InstallLog -TargetDir $targetDir -Message "ERROR: $($_.Exception.Message)"
        $statusLabel.Text = "Error: $($_.Exception.Message)"
        $installBtn.Enabled = $true
        $browseBtn.Enabled = $true
        $dirBox.Enabled = $true
        & $updateUIState
        return
    }

    $installedExe = Join-Path $targetDir $ExeName
    if ($desktopChk.Checked) {
        $desktopLnk = Join-Path ([Environment]::GetFolderPath("Desktop")) "$AppName.lnk"
        New-AppShortcut -ShortcutPath $desktopLnk -TargetExe $installedExe -WorkingDir $targetDir -IconFile $iconPath
    }
    if ($startMenuChk.Checked) {
        $startMenuDir = Join-Path ([Environment]::GetFolderPath("StartMenu")) "Programs"
        if (-not (Test-Path $startMenuDir)) { New-Item -Path $startMenuDir -ItemType Directory -Force | Out-Null }
        $startMenuLnk = Join-Path $startMenuDir "$AppName.lnk"
        New-AppShortcut -ShortcutPath $startMenuLnk -TargetExe $installedExe -WorkingDir $targetDir -IconFile $iconPath
    }

    if (-not (Test-Path $installedExe)) {
        Write-InstallLog -TargetDir $targetDir -Message "ERROR: Installed executable not found at $installedExe"
        $statusLabel.Text = "Copy completed but $ExeName was not found."
        $installBtn.Enabled = $true
        $browseBtn.Enabled = $true
        $dirBox.Enabled = $true
        & $updateUIState
        return
    }
    Register-Application -TargetDir $targetDir -InstalledExe $installedExe

    Write-InstallLog -TargetDir $targetDir -Message "Completed successfully ($copied files)."
    Set-ProgressUI -Value $sourceFiles.Count -Maximum $sourceFiles.Count
    $browseBtn.Enabled = $true
    $dirBox.Enabled = $true

    if ($launchChk.Checked -and (-not $IsRepair) -and (Test-Path $installedExe)) {
        $statusLabel.Text = "Installation complete. Launching $AppName..."
        [System.Windows.Forms.Application]::DoEvents()
        Start-Process -FilePath $installedExe
        $form.Close()
        return
    }

    $statusLabel.Text = if ($IsRepair) { "Repaired $AppName in $targetDir." } else { "Installed to $targetDir" }
    $installBtn.Text = "Launch $AppName"
    $installBtn.Tag = $installedExe
    $installBtn.Enabled = $true
    & $updateUIState
}

$repairBtn.Add_Click({ & $runInstall -IsRepair $true })

$uninstallBtn.Add_Click({
    $targetDir = $dirBox.Text.Trim()
    if ([string]::IsNullOrWhiteSpace($targetDir) -or (-not (Test-Path $targetDir))) {
        [System.Windows.Forms.MessageBox]::Show("Installation folder not found.", "$AppName Uninstaller") | Out-Null
        return
    }

    $confirm = [System.Windows.Forms.MessageBox]::Show(
        "Uninstall $AppName from:`n$targetDir",
        "Confirm Uninstall",
        [System.Windows.Forms.MessageBoxButtons]::YesNo,
        [System.Windows.Forms.MessageBoxIcon]::Warning
    )
    if ($confirm -ne [System.Windows.Forms.DialogResult]::Yes) { return }

    $deleteUserData = $false
    if (Test-Path $UserDataDir) {
        $dataPrompt = [System.Windows.Forms.MessageBox]::Show(
            "Also delete saved user data and settings in:`n$UserDataDir",
            "Remove User Data?",
            [System.Windows.Forms.MessageBoxButtons]::YesNo,
            [System.Windows.Forms.MessageBoxIcon]::Question
        )
        $deleteUserData = ($dataPrompt -eq [System.Windows.Forms.DialogResult]::Yes)
    }

    $installBtn.Enabled = $false
    $uninstallBtn.Enabled = $false
    $repairBtn.Enabled = $false
    $openDirBtn.Enabled = $false
    $browseBtn.Enabled = $false
    $dirBox.Enabled = $false
    $statusLabel.Text = "Removing $AppName..."
    Set-ProgressUI -Value 0 -Maximum 100
    [System.Windows.Forms.Application]::DoEvents()

    $procName = [System.IO.Path]::GetFileNameWithoutExtension($ExeName)
    Stop-RunningApp -ProcessBaseName $procName

    $desktopLnk = Join-Path ([Environment]::GetFolderPath("Desktop")) "$AppName.lnk"
    $startMenuLnk = Join-Path ([Environment]::GetFolderPath("StartMenu")) "Programs\$AppName.lnk"
    foreach ($lnk in @($desktopLnk, $startMenuLnk)) {
        if (Test-Path $lnk) { Remove-Item -Path $lnk -Force -ErrorAction SilentlyContinue }
    }

    Set-ProgressUI -Value 50 -Maximum 100
    [System.Windows.Forms.Application]::DoEvents()

    if (Test-Path $targetDir) {
        Remove-Item -Path $targetDir -Recurse -Force
    }
    if ($deleteUserData -and (Test-Path $UserDataDir)) {
        Remove-Item -Path $UserDataDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    $registryPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\PrismPulse"
    if (Test-Path $registryPath) {
        Remove-Item -Path $registryPath -Recurse -Force
    }

    Set-ProgressUI -Value 100 -Maximum 100
    $installBtn.Text = "Install Now"
    $installBtn.Tag = $null
    $installBtn.Enabled = $true
    $browseBtn.Enabled = $true
    $dirBox.Enabled = $true
    & $updateUIState
    $statusLabel.Text = "Uninstalled $AppName."
})

$installBtn.Add_Click({
    if ($installBtn.Tag -and (Test-Path $installBtn.Tag)) {
        Start-Process -FilePath $installBtn.Tag
        $form.Close()
        return
    }
    & $runInstall -IsRepair $false
})

[System.Windows.Forms.Application]::Run($form) | Out-Null