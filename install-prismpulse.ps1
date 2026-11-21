Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$AppName = "PrismPulse"
$ExeName = "PrismPulseApp.exe"
$SourceDir = Join-Path $PSScriptRoot "out\PrismPulseApp-win32-x64"
$DefaultTarget = Join-Path $env:LOCALAPPDATA $AppName

if (-not (Test-Path (Join-Path $SourceDir $ExeName))) {
    [System.Windows.Forms.MessageBox]::Show(
        "Packaged build not found at:`n$SourceDir\$ExeName`n`nRun 'npm run make' first.",
        "$AppName Installer",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
    exit 1
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "$AppName Custom Installer"
$form.Size = New-Object System.Drawing.Size(540, 320)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "None"
$form.BackColor = [System.Drawing.Color]::FromArgb(15, 23, 42)
$form.ForeColor = [System.Drawing.Color]::FromArgb(248, 250, 252)

$iconPath = Join-Path $PSScriptRoot "assets\icon.ico"
if (Test-Path $iconPath) {
    $form.Icon = New-Object System.Drawing.Icon($iconPath)
}

# Custom top bar
$topBar = New-Object System.Windows.Forms.Panel
$topBar.Size = New-Object System.Drawing.Size(540, 42)
$topBar.Location = New-Object System.Drawing.Point(0, 0)
$topBar.BackColor = [System.Drawing.Color]::FromArgb(10, 15, 28)
$form.Controls.Add($topBar)

$titleLabel = New-Object System.Windows.Forms.Label
$titleLabel.Text = "$AppName Setup"
$titleLabel.Font = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
$titleLabel.ForeColor = [System.Drawing.Color]::FromArgb(34, 211, 238)
$titleLabel.Location = New-Object System.Drawing.Point(16, 10)
$titleLabel.AutoSize = $true
$topBar.Controls.Add($titleLabel)

$closeBtn = New-Object System.Windows.Forms.Button
$closeBtn.Text = "X"
$closeBtn.Size = New-Object System.Drawing.Size(34, 28)
$closeBtn.Location = New-Object System.Drawing.Point(494, 7)
$closeBtn.FlatStyle = "Flat"
$closeBtn.ForeColor = [System.Drawing.Color]::White
$closeBtn.BackColor = [System.Drawing.Color]::FromArgb(30, 41, 59)
$closeBtn.FlatAppearance.BorderSize = 0
$closeBtn.Add_Click({ $form.Close() })
$topBar.Controls.Add($closeBtn)

# Drag window by top bar
$script:dragging = $false
$script:dragOffset = [System.Drawing.Point]::Empty
$topBar.Add_MouseDown({
    if ($_.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
        $script:dragging = $true
        $script:dragOffset = New-Object System.Drawing.Point($_.X, $_.Y)
    }
})
$topBar.Add_MouseMove({
    if ($script:dragging) {
        $form.Location = New-Object System.Drawing.Point(
            ($form.Location.X + $_.X - $script:dragOffset.X),
            ($form.Location.Y + $_.Y - $script:dragOffset.Y)
        )
    }
})
$topBar.Add_MouseUp({ $script:dragging = $false })

# Path selection
$dirLabel = New-Object System.Windows.Forms.Label
$dirLabel.Text = "Install Folder:"
$dirLabel.Font = New-Object System.Drawing.Font("Segoe UI", 9.5)
$dirLabel.Location = New-Object System.Drawing.Point(24, 68)
$dirLabel.AutoSize = $true
$form.Controls.Add($dirLabel)

$dirBox = New-Object System.Windows.Forms.TextBox
$dirBox.Text = $DefaultTarget
$dirBox.Size = New-Object System.Drawing.Size(385, 26)
$dirBox.Location = New-Object System.Drawing.Point(24, 92)
$dirBox.BackColor = [System.Drawing.Color]::FromArgb(30, 41, 59)
$dirBox.ForeColor = [System.Drawing.Color]::White
$dirBox.BorderStyle = "FixedSingle"
$form.Controls.Add($dirBox)

$browseBtn = New-Object System.Windows.Forms.Button
$browseBtn.Text = "Browse"
$browseBtn.Size = New-Object System.Drawing.Size(96, 26)
$browseBtn.Location = New-Object System.Drawing.Point(418, 92)
$browseBtn.FlatStyle = "Flat"
$browseBtn.BackColor = [System.Drawing.Color]::FromArgb(51, 65, 85)
$browseBtn.ForeColor = [System.Drawing.Color]::White
$browseBtn.FlatAppearance.BorderSize = 0
$browseBtn.Add_Click({
    $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
    $dlg.SelectedPath = $dirBox.Text
    if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        $dirBox.Text = Join-Path $dlg.SelectedPath $AppName
    }
})
$form.Controls.Add($browseBtn)

$shortcutChk = New-Object System.Windows.Forms.CheckBox
$shortcutChk.Text = "Create Desktop shortcut"
$shortcutChk.Checked = $true
$shortcutChk.Font = New-Object System.Drawing.Font("Segoe UI", 9.5)
$shortcutChk.Location = New-Object System.Drawing.Point(24, 134)
$shortcutChk.AutoSize = $true
$form.Controls.Add($shortcutChk)

$progressBar = New-Object System.Windows.Forms.ProgressBar
$progressBar.Location = New-Object System.Drawing.Point(24, 180)
$progressBar.Size = New-Object System.Drawing.Size(490, 22)
$progressBar.Style = "Continuous"
$form.Controls.Add($progressBar)

$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Text = "Ready to install $AppName."
$statusLabel.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(148, 163, 184)
$statusLabel.Location = New-Object System.Drawing.Point(24, 210)
$statusLabel.Size = New-Object System.Drawing.Size(490, 22)
$form.Controls.Add($statusLabel)

$uninstallBtn = New-Object System.Windows.Forms.Button
$uninstallBtn.Text = "Uninstall"
$uninstallBtn.Size = New-Object System.Drawing.Size(120, 38)
$uninstallBtn.Location = New-Object System.Drawing.Point(244, 255)
$uninstallBtn.FlatStyle = "Flat"
$uninstallBtn.BackColor = [System.Drawing.Color]::FromArgb(127, 29, 29)
$uninstallBtn.ForeColor = [System.Drawing.Color]::White
$uninstallBtn.Font = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)
$uninstallBtn.FlatAppearance.BorderSize = 0
$form.Controls.Add($uninstallBtn)

$installBtn = New-Object System.Windows.Forms.Button
$installBtn.Text = "Install Now"
$installBtn.Size = New-Object System.Drawing.Size(140, 38)
$installBtn.Location = New-Object System.Drawing.Point(374, 255)
$installBtn.FlatStyle = "Flat"
$installBtn.BackColor = [System.Drawing.Color]::FromArgb(6, 182, 212)
$installBtn.ForeColor = [System.Drawing.Color]::FromArgb(15, 23, 42)
$installBtn.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$installBtn.FlatAppearance.BorderSize = 0
$form.Controls.Add($installBtn)

$updateUninstallState = {
    $target = $dirBox.Text.Trim()
    $existingExe = if ([string]::IsNullOrWhiteSpace($target)) { $null } else { Join-Path $target $ExeName }
    $uninstallBtn.Enabled = ($existingExe -and (Test-Path $existingExe))
}
$dirBox.Add_TextChanged($updateUninstallState)
& $updateUninstallState

$uninstallBtn.Add_Click({
    $targetDir = $dirBox.Text.Trim()
    if ([string]::IsNullOrWhiteSpace($targetDir) -or (-not (Test-Path $targetDir))) {
        [System.Windows.Forms.MessageBox]::Show("Installation folder not found.", "$AppName Uninstaller") | Out-Null
        return
    }

    $confirm = [System.Windows.Forms.MessageBox]::Show(
        "Remove $AppName from:`n$targetDir",
        "Confirm Uninstall",
        [System.Windows.Forms.MessageBoxButtons]::YesNo,
        [System.Windows.Forms.MessageBoxIcon]::Warning
    )
    if ($confirm -ne [System.Windows.Forms.DialogResult]::Yes) {
        return
    }

    $installBtn.Enabled = $false
    $uninstallBtn.Enabled = $false
    $statusLabel.Text = "Uninstalling $AppName..."
    $progressBar.Value = 0
    [System.Windows.Forms.Application]::DoEvents()

    Get-Process -Name ([System.IO.Path]::GetFileNameWithoutExtension($ExeName)) -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

    $lnkPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "$AppName.lnk"
    if (Test-Path $lnkPath) {
        Remove-Item -Path $lnkPath -Force -ErrorAction SilentlyContinue
    }

    if (Test-Path $targetDir) {
        Remove-Item -Path $targetDir -Recurse -Force
    }

    $progressBar.Value = $progressBar.Maximum
    $statusLabel.Text = "Uninstalled $AppName."
    $installBtn.Text = "Install Now"
    $installBtn.Tag = $null
    $installBtn.Enabled = $true
    & $updateUninstallState
})

$installBtn.Add_Click({
    if ($installBtn.Tag -and (Test-Path $installBtn.Tag)) {
        Start-Process -FilePath $installBtn.Tag
        $form.Close()
        return
    }

    $targetDir = $dirBox.Text.Trim()
    if ([string]::IsNullOrWhiteSpace($targetDir)) {
        [System.Windows.Forms.MessageBox]::Show("Choose a valid installation folder.", "$AppName Installer") | Out-Null
        return
    }

    $installBtn.Enabled = $false
    $uninstallBtn.Enabled = $false
    $statusLabel.Text = "Copying files..."
    [System.Windows.Forms.Application]::DoEvents()

    if (-not (Test-Path $targetDir)) {
        New-Item -Path $targetDir -ItemType Directory -Force | Out-Null
    }

    $files = Get-ChildItem -Path $SourceDir -Recurse -File
    $progressBar.Minimum = 0
    $progressBar.Maximum = [Math]::Max($files.Count, 1)
    $progressBar.Value = 0

    foreach ($file in $files) {
        $relPath = $file.FullName.Substring($SourceDir.Length).TrimStart('\')
        $destFile = Join-Path $targetDir $relPath
        $destFolder = Split-Path -Path $destFile -Parent
        if (-not (Test-Path $destFolder)) {
            New-Item -Path $destFolder -ItemType Directory -Force | Out-Null
        }
        Copy-Item -Path $file.FullName -Destination $destFile -Force
        $progressBar.Value = [Math]::Min($progressBar.Value + 1, $progressBar.Maximum)
        if (($progressBar.Value % 15) -eq 0) {
            [System.Windows.Forms.Application]::DoEvents()
        }
    }

    $installedExe = Join-Path $targetDir $ExeName
    if ($shortcutChk.Checked) {
        $wsh = New-Object -ComObject WScript.Shell
        $lnkPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "$AppName.lnk"
        $lnk = $wsh.CreateShortcut($lnkPath)
        $lnk.TargetPath = $installedExe
        $lnk.WorkingDirectory = $targetDir
        if (Test-Path $iconPath) { $lnk.IconLocation = $iconPath }
        $lnk.Save()
    }

    $progressBar.Value = $progressBar.Maximum
    $statusLabel.Text = "Installed to $targetDir"
    $installBtn.Text = "Launch $AppName"
    $installBtn.Enabled = $true
    $installBtn.Tag = $installedExe
    & $updateUninstallState
})

[System.Windows.Forms.Application]::Run($form) | Out-Null