Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$AppName = "PrismPulse"
$Version = "1.0.0"
$ExeName = "PrismPulseApp.exe"
$SourceDir = Join-Path $PSScriptRoot "out\PrismPulseApp-win32-x64"
$DefaultTarget = Join-Path $env:LOCALAPPDATA $AppName
$UserDataDir = Join-Path $env:APPDATA $AppName

$sourceExe = Join-Path $SourceDir $ExeName
if (-not (Test-Path $sourceExe)) {
    [System.Windows.Forms.MessageBox]::Show(
        "Packaged build not found at:`n$sourceExe`n`nRun 'npm run make' first.",
        "$AppName Installer",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
    exit 1
}

$sourceFiles = Get-ChildItem -Path$SourceDir -Recurse -File
$totalBytes = ($sourceFiles | Measure-Object -Property Length -Sum).Sum
if (-not $totalBytes) {$totalBytes = 0 }
$totalMB = [Math]::Round(($totalBytes / 1MB), 1)

$form = New-Object System.Windows.Forms.Form
$form.Text = "$AppName Installer"
$form.Size = New-Object System.Drawing.Size(620, 445)$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "None"
$form.BackColor = [System.Drawing.Color]::FromArgb(11, 16, 29)$form.ForeColor = [System.Drawing.Color]::FromArgb(248, 250, 252)

$iconPath = Join-Path$PSScriptRoot "assets\icon.ico"
if (Test-Path $iconPath) {
    $form.Icon = New-Object System.Drawing.Icon($iconPath)
}

# Rounded window region
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$radius = 18
$rect = New-Object System.Drawing.Rectangle(0, 0,$form.Width, $form.Height)$d = $radius * 2$path.AddArc($rect.X, $rect.Y, $d,$d, 180, 90)
$path.AddArc($rect.Right - $d,$rect.Y, $d,$d, 270, 90)
$path.AddArc($rect.Right - $d,$rect.Bottom - $d,$d, $d, 0, 90)$path.AddArc($rect.X, $rect.Bottom - $d,$d, $d, 90, 90)$path.CloseFigure()
$form.Region = New-Object System.Drawing.Region($path)

$form.Add_Paint({
    param($sender, $e)$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(34, 211, 238), 1.5)
    $e.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias$e.Graphics.DrawRectangle($pen, 1, 1, ($form.Width - 2), ($form.Height - 2))$pen.Dispose()
})

# Top Header Bar
$topBar = New-Object System.Windows.Forms.Panel
$topBar.Size = New-Object System.Drawing.Size(620, 58)
$topBar.Location = New-Object System.Drawing.Point(0, 0)$topBar.BackColor = [System.Drawing.Color]::FromArgb(8, 12, 22)
$form.Controls.Add($topBar)

if (Test-Path $iconPath) {$logoBox = New-Object System.Windows.Forms.PictureBox
    $logoBox.Size = New-Object System.Drawing.Size(28, 28)
    $logoBox.Location = New-Object System.Drawing.Point(20, 15)$logoBox.SizeMode = "Zoom"
    $logoBox.Image = ([System.Drawing.Icon]::new($iconPath)).ToBitmap()
    $topBar.Controls.Add($logoBox)
}

$titleLabel = New-Object System.Windows.Forms.Label
$titleLabel.Text = "$AppName Setup"
$titleLabel.Font = New-Object System.Drawing.Font("Segoe UI", 13, [System.Drawing.FontStyle]::Bold)
$titleLabel.ForeColor = [System.Drawing.Color]::FromArgb(34, 211, 238)$titleLabel.Location = New-Object System.Drawing.Point(56, 15)
$titleLabel.AutoSize =$true
$topBar.Controls.Add($titleLabel)

$verBadge = New-Object System.Drawing.Label
$verBadge.Text = "v$Version  •  $totalMB MB ($($sourceFiles.Count) files)"
$verBadge.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$verBadge.ForeColor = [System.Drawing.Color]::FromArgb(148, 163, 184)$verBadge.Location = New-Object System.Drawing.Point(180, 19)
$verBadge.AutoSize =$true
$topBar.Controls.Add($verBadge)

$closeBtn = New-Object System.Windows.Forms.Button
$closeBtn.Text = "✕"
$closeBtn.Size = New-Object System.Drawing.Size(34, 30)
$closeBtn.Location = New-Object System.Drawing.Point(568, 14)$closeBtn.FlatStyle = "Flat"
$closeBtn.ForeColor = [System.Drawing.Color]::FromArgb(203, 213, 225)
$closeBtn.BackColor = [System.Drawing.Color]::FromArgb(30, 41, 59)$closeBtn.FlatAppearance.BorderSize = 0
$closeBtn.Add_MouseEnter({$closeBtn.BackColor = [System.Drawing.Color]::FromArgb(185, 28, 28); $closeBtn.ForeColor = [System.Drawing.Color]::White })$closeBtn.Add_MouseLeave({ $closeBtn.BackColor = [System.Drawing.Color]::FromArgb(30, 41, 59);$closeBtn.ForeColor = [System.Drawing.Color]::FromArgb(203, 213, 225) })
$closeBtn.Add_Click({$form.Close() })
$topBar.Controls.Add($closeBtn)

# Drag window
$script:dragging =$false
$script:dragOffset = [System.Drawing.Point]::Empty$onMouseDown = {
    if ($_.Button -eq [System.Windows.Forms.MouseButtons]::Left) {$script:dragging = $true$script:dragOffset = New-Object System.Drawing.Point($_.X, $_.Y)
    }
}
$onMouseMove = {
    if ($script:dragging) {$form.Location = New-Object System.Drawing.Point(
            ($form.Location.X + $_.X -$script:dragOffset.X),
            ($form.Location.Y + $_.Y -$script:dragOffset.Y)
        )
    }
}
$onMouseUp = { $script:dragging =$false }

foreach ($ctrl in @($topBar, $titleLabel,$verBadge)) {
    $ctrl.Add_MouseDown($onMouseDown)
    $ctrl.Add_MouseMove($onMouseMove)
    $ctrl.Add_MouseUp($onMouseUp)
}

# Main Card Panel
$card = New-Object System.Windows.Forms.Panel
$card.Size = New-Object System.Drawing.Size(572, 168)
$card.Location = New-Object System.Drawing.Point(24, 76)$card.BackColor = [System.Drawing.Color]::FromArgb(18, 26, 46)
$form.Controls.Add($card)

$dirLabel = New-Object System.Windows.Forms.Label
$dirLabel.Text = "Installation Directory"
$dirLabel.Font = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)
$dirLabel.Location = New-Object System.Drawing.Point(16, 14)
$dirLabel.AutoSize =$true
$card.Controls.Add($dirLabel)

$dirBox = New-Object System.Windows.Forms.TextBox
$dirBox.Text = $DefaultTarget$dirBox.Size = New-Object System.Drawing.Size(428, 28)
$dirBox.Location = New-Object System.Drawing.Point(16, 40)$dirBox.Font = New-Object System.Drawing.Font("Segoe UI", 9.5)
$dirBox.BackColor = [System.Drawing.Color]::FromArgb(30, 41, 59)
$dirBox.ForeColor = [System.Drawing.Color]::White$dirBox.BorderStyle = "FixedSingle"
$card.Controls.Add($dirBox)

$browseBtn = New-Object System.Windows.Forms.Button
$browseBtn.Text = "Browse..."
$browseBtn.Size = New-Object System.Drawing.Size(100, 28)
$browseBtn.Location = New-Object System.Drawing.Point(454, 40)$browseBtn.FlatStyle = "Flat"
$browseBtn.BackColor = [System.Drawing.Color]::FromArgb(51, 65, 85)
$browseBtn.ForeColor = [System.Drawing.Color]::White$browseBtn.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$browseBtn.FlatAppearance.BorderSize = 0
$browseBtn.Add_MouseEnter({$browseBtn.BackColor = [System.Drawing.Color]::FromArgb(71, 85, 105) })
$browseBtn.Add_MouseLeave({$browseBtn.BackColor = [System.Drawing.Color]::FromArgb(51, 65, 85) })
$browseBtn.Add_Click({$dlg = New-Object System.Windows.Forms.FolderBrowserDialog
    $dlg.SelectedPath =$dirBox.Text
    if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        $chosen =$dlg.SelectedPath
        if ((Split-Path $chosen -Leaf) -ne $AppName) {$chosen = Join-Path $chosen$AppName
        }
        $dirBox.Text =$chosen
    }
})
$card.Controls.Add($browseBtn)

$spaceLabel = New-Object System.Windows.Forms.Label
$spaceLabel.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
$spaceLabel.ForeColor = [System.Drawing.Color]::FromArgb(148, 163, 184)
$spaceLabel.Location = New-Object System.Drawing.Point(16, 74)$spaceLabel.Size = New-Object System.Drawing.Size(540, 18)
$card.Controls.Add($spaceLabel)

$desktopChk = New-Object System.Windows.Forms.CheckBox
$desktopChk.Text = "Create Desktop shortcut"
$desktopChk.Checked = $true$desktopChk.Font = New-Object System.Drawing.Font("Segoe UI", 9.5)
$desktopChk.Location = New-Object System.Drawing.Point(16, 102)
$desktopChk.AutoSize =$true
$card.Controls.Add($desktopChk)

$startMenuChk = New-Object System.Windows.Forms.CheckBox
$startMenuChk.Text = "Add Start Menu shortcut"
$startMenuChk.Checked = $true$startMenuChk.Font = New-Object System.Drawing.Font("Segoe UI", 9.5)
$startMenuChk.Location = New-Object System.Drawing.Point(225, 102)
$startMenuChk.AutoSize =$true
$card.Controls.Add($startMenuChk)

$launchChk = New-Object System.Windows.Forms.CheckBox
$launchChk.Text = "Launch after install"
$launchChk.Checked = $true$launchChk.Font = New-Object System.Drawing.Font("Segoe