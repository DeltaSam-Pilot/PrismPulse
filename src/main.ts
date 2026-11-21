import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import started from 'electron-squirrel-startup';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

if (started) {
  app.quit();
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

interface ComponentToggles {
  core?: boolean;
  optimfg?: boolean;
  effects?: boolean;
  glassCockpit?: boolean;
  neuralRender?: boolean;
}

interface LookSettings {
  sharpness: number;
  vibrance: number;
  hdrPower: number;
  contrast: number;
  neuralStrength: number;
}

interface InstallPayload {
  presetName: string;
  components: ComponentToggles;
  look: LookSettings;
}

interface SimDirectoryInspection {
  name: string;
  path: string;
  hasProfile: boolean;
  hasUserCfg: boolean;
  hasAntiCheat: boolean;
  savedPresets: string[];
  simRunning: boolean;
}

const SIM_PROCESS_NAMES = [
  'flightsimulator.exe',
  'flightsimulator2024.exe',
  'x-plane.exe',
];

const ANTI_CHEAT_INDICATORS = [
  'easyanticheat',
  'battleye',
  'vgk.sys',
  'mhyprot',
];

function clampPercent(value: unknown, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function sanitizePresetName(rawName: string): string {
  const cleaned = (rawName || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\.\./g, '_')
    .trim();
  return cleaned.length > 0 ? cleaned : 'DefaultPreset';
}

function buildPresetIniContent(
  presetName: string,
  components: ComponentToggles,
  look: LookSettings,
): string {
  return [
    '; PrismPulse Configuration',
    `ActivePreset=${presetName}`,
    '',
    '[Components]',
    `CoreRuntime=${components.core ? 1 : 0}`,
    `OptiMFGFrameGen=${components.optimfg ? 1 : 0}`,
    `ImageEffectsShaders=${components.effects ? 1 : 0}`,
    `GlassCockpitDLSSFix=${components.glassCockpit ? 1 : 0}`,
    `NeuralRendering=${components.neuralRender ? 1 : 0}`,
    '',
    '[LookEditor]',
    `CAS_Sharpness=${look.sharpness}`,
    `Vibrance_Strength=${look.vibrance}`,
    `FakeHDR_Power=${look.hdrPower}`,
    `AtmosphericContrast=${look.contrast}`,
    `NeuralRenderStrength=${look.neuralStrength}`,
    '',
  ].join('\r\n');
}

function writeFileAtomically(filePath: string, contents: string): void {
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, contents, 'utf-8');
    fs.renameSync(temporaryPath, filePath);
  } catch (error: unknown) {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    throw error;
  }
}

function getSha256(contents: string): string {
  return crypto.createHash('sha256').update(contents, 'utf-8').digest('hex');
}

function getLatestBackup(backupDir: string, prefix: string): string | undefined {
  if (!fs.existsSync(backupDir)) return undefined;
  const backups = fs
    .readdirSync(backupDir)
    .filter((name) => name.startsWith(prefix) && name.endsWith('.bak'))
    .map((name) => path.join(backupDir, name))
    .sort(
      (left, right) =>
        fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs ||
        right.localeCompare(left),
    );
  const latestBackup = backups[0];
  return latestBackup;
}

function parseIniLookValues(
  iniText: string,
  fallback: LookSettings,
): LookSettings {
  const parsed: LookSettings = { ...fallback };
  for (const rawLine of iniText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#') || line.startsWith('[')) {
      continue;
    }
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    const val = line.slice(eqIndex + 1).trim();

    if (key === 'CAS_Sharpness') parsed.sharpness = clampPercent(val, parsed.sharpness);
    else if (key === 'Vibrance_Strength') parsed.vibrance = clampPercent(val, parsed.vibrance);
    else if (key === 'FakeHDR_Power') parsed.hdrPower = clampPercent(val, parsed.hdrPower);
    else if (key === 'AtmosphericContrast') parsed.contrast = clampPercent(val, parsed.contrast);
    else if (key === 'NeuralRenderStrength') parsed.neuralStrength = clampPercent(val, parsed.neuralStrength);
  }
  return parsed;
}

function parseIniComponentValues(iniText: string): ComponentToggles {
  const parsed: ComponentToggles = {};
  const keys: Record<string, keyof ComponentToggles> = {
    CoreRuntime: 'core',
    OptiMFGFrameGen: 'optimfg',
    ImageEffectsShaders: 'effects',
    GlassCockpitDLSSFix: 'glassCockpit',
    NeuralRendering: 'neuralRender',
  };

  for (const rawLine of iniText.split(/\r?\n/)) {
    const line = rawLine.trim();
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = keys[line.slice(0, eqIndex).trim()];
    const value = line.slice(eqIndex + 1).trim();
    if (key && (value === '0' || value === '1')) {
      parsed[key] = value === '1';
    }
  }

  return parsed;
}

function isSimulatorRunning(): boolean {
  const tasks = execSync('tasklist /FO CSV /NH', {
    encoding: 'utf-8',
    windowsHide: true,
  }).toLowerCase();

  return SIM_PROCESS_NAMES.some((procName) => tasks.includes(procName));
}

function getGpuName(): string {
  try {
    const raw = execSync(
      'powershell -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object -First 1 Name | ConvertTo-Json"',
      { encoding: 'utf-8', windowsHide: true },
    );
    const parsed = JSON.parse(raw) as { Name?: string } | null;
    if (parsed?.Name && typeof parsed.Name === 'string') {
      return parsed.Name.trim();
    }
  } catch {
    // Fallback below
  }
  return 'GPU detection unavailable';
}

function inspectDirectory(
  label: string,
  dirPath: string,
  simRunning = isSimulatorRunning(),
): SimDirectoryInspection {
  const dataDir = path.join(dirPath, 'PrismPulseData');
  const presetsDir = path.join(dataDir, 'Presets');
  const activeIni = path.join(dirPath, 'PrismPulse.ini');
  const dirExists = fs.existsSync(dirPath);

  let files: string[] = [];
  if (dirExists) {
    try {
      files = fs.readdirSync(dirPath);
    } catch {
      files = [];
    }
  }

  const hasAntiCheat = files.some((file) =>
    ANTI_CHEAT_INDICATORS.some((indicator) =>
      file.toLowerCase().includes(indicator),
    ),
  );

  let savedPresets: string[] = [];
  if (fs.existsSync(presetsDir)) {
    try {
      savedPresets = fs
        .readdirSync(presetsDir)
        .filter((file) => file.toLowerCase().endsWith('.ini'));
    } catch {
      savedPresets = [];
    }
  }

  return {
    name: label,
    path: dirPath,
    hasProfile: fs.existsSync(dataDir) || fs.existsSync(activeIni),
    hasUserCfg: fs.existsSync(path.join(dirPath, 'UserCfg.opt')),
    hasAntiCheat,
    savedPresets,
    simRunning,
  };
}

function createWindow(): BrowserWindow {
  const windowIcon = path.join(app.getAppPath(), 'assets', 'icon.ico');
  const mainWindow = new BrowserWindow({
    title: 'PrismPulse',
    width: 1240,
    height: 800,
    minWidth: 920,
    minHeight: 600,
    icon: fs.existsSync(windowIcon) ? windowIcon : undefined,
    show: false,
    backgroundColor: '#0a0d13',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  return mainWindow;
}

function registerIpcHandlers(): void {
  ipcMain.handle('auto-detect-all-sims', async () => {
    const localApp = process.env.LOCALAPPDATA || '';
    const roamingApp = process.env.APPDATA || '';

    const candidates = [
      {
        label: 'MSFS 2024 (Steam)',
        dir: path.join(roamingApp, 'Microsoft Flight Simulator 2024'),
      },
      {
        label: 'MSFS 2020 (Steam)',
        dir: path.join(roamingApp, 'Microsoft Flight Simulator'),
      },
      {
        label: 'MSFS 2024 (Microsoft Store)',
        dir: path.join(
          localApp,
          'Packages',
          'Microsoft.Limitless_8wekyb3d8bbwe',
          'LocalCache',
        ),
      },
      {
        label: 'MSFS 2020 (Microsoft Store)',
        dir: path.join(
          localApp,
          'Packages',
          'Microsoft.FlightSimulator_8wekyb3d8bbwe',
          'LocalCache',
        ),
      },
    ];

    const valid = candidates.filter((c) =>
      fs.existsSync(path.join(c.dir, 'UserCfg.opt')),
    );
    const matches =
      valid.length > 0 ? valid : candidates.filter((c) => fs.existsSync(c.dir));

    return matches.map((m) => inspectDirectory(m.label, m.dir));
  });

  ipcMain.handle('inspect-target-folder', async (_event, folderPath: unknown) => {
    if (typeof folderPath !== 'string' || !path.isAbsolute(folderPath)) {
      return null;
    }

    const targetPath = path.resolve(folderPath);
    try {
      if (!fs.statSync(targetPath).isDirectory()) return null;
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error.code === 'ENOENT' || error.code === 'ENOTDIR')
      ) {
        return null;
      }
      throw error;
    }

    return inspectDirectory(path.basename(targetPath), targetPath);
  });

  ipcMain.handle('select-target-folder', async () => {
    const parentWin = BrowserWindow.getFocusedWindow();
    const result = parentWin
      ? await dialog.showOpenDialog(parentWin, {
          properties: ['openDirectory'],
          title: 'Select Game or Simulator Directory',
        })
      : await dialog.showOpenDialog({
          properties: ['openDirectory'],
          title: 'Select Game or Simulator Directory',
        });

    const folderPath = result.filePaths.at(0);
    if (result.canceled || !folderPath) return null;

    return inspectDirectory(path.basename(folderPath), folderPath);
  });

  ipcMain.handle('open-target-folder', async (_event, folderPath: string) => {
    if (folderPath && fs.existsSync(folderPath)) {
      await shell.openPath(folderPath);
    }
  });

  ipcMain.handle('import-preset', async (_event, folderPath: string) => {
    if (!folderPath || !fs.existsSync(folderPath)) {
      return {
        success: false,
        message: 'Target folder does not exist.',
      };
    }

    const parentWin = BrowserWindow.getFocusedWindow();
    const dialogOptions = {
      properties: ['openFile' as const, 'multiSelections' as const],
      title: 'Select .INI Preset File(s) to Import',
      filters: [{ name: 'INI Preset Files', extensions: ['ini'] }],
    };

    const result = parentWin
      ? await dialog.showOpenDialog(parentWin, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    if (result.canceled || result.filePaths.length === 0) {
      return {
        success: false,
        message: 'Preset import canceled.',
      };
    }

    try {
      const presetsDir = path.join(folderPath, 'PrismPulseData', 'Presets');
      fs.mkdirSync(presetsDir, { recursive: true });

      const importedNames: string[] = [];

      for (const sourceFile of result.filePaths) {
        if (!fs.existsSync(sourceFile)) continue;
        if (path.extname(sourceFile).toLowerCase() !== '.ini') continue;

        const safeFileName = sanitizePresetName(
          path.basename(sourceFile, path.extname(sourceFile)),
        );
        const destPath = path.join(presetsDir, `${safeFileName}.ini`);
        fs.copyFileSync(sourceFile, destPath);
        importedNames.push(`${safeFileName}.ini`);
      }

      if (importedNames.length === 0) {
        return {
          success: false,
          message: 'No valid .ini preset files were selected.',
        };
      }

      return {
        success: true,
        message: `Imported ${importedNames.join(', ')} into PrismPulseData/Presets.`,
        updatedState: inspectDirectory(path.basename(folderPath), folderPath),
      };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to import .ini preset.';
      return { success: false, message };
    }
  });

  ipcMain.handle(
    'load-preset-ini',
    async (_event, folderPath: string, presetName: string) => {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return { success: false, message: 'Target folder does not exist.' };
      }

      const safePreset = sanitizePresetName(presetName);
      const presetsDir = path.resolve(folderPath, 'PrismPulseData', 'Presets');
      const presetPath = path.resolve(presetsDir, `${safePreset}.ini`);

      if (!presetPath.startsWith(presetsDir + path.sep) || !fs.existsSync(presetPath)) {
        return {
          success: false,
          message: `No saved INI found for "${safePreset}".`,
        };
      }

      try {
        const content = fs.readFileSync(presetPath, 'utf-8');
        const defaultLook: LookSettings = {
          sharpness: 65,
          vibrance: 20,
          hdrPower: 35,
          contrast: 15,
          neuralStrength: 40,
        };
        return {
          success: true,
          message: `Loaded look values from ${safePreset}.ini`,
          look: parseIniLookValues(content, defaultLook),
          components: parseIniComponentValues(content),
        };
      } catch (err: unknown) {
        return {
          success: false,
          message:
            err instanceof Error ? err.message : 'Failed to read INI preset.',
        };
      }
    },
  );

  ipcMain.handle(
    'save-preset-ini',
    async (
      _event,
      folderPath: string,
      presetName: string,
      components: ComponentToggles,
      rawLook: LookSettings,
    ) => {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return { success: false, message: 'Target folder does not exist.' };
      }

      try {
        const presetsDir = path.join(folderPath, 'PrismPulseData', 'Presets');
        fs.mkdirSync(presetsDir, { recursive: true });

        const safePreset = sanitizePresetName(presetName);
        const safeLook: LookSettings = {
          sharpness: clampPercent(rawLook?.sharpness, 65),
          vibrance: clampPercent(rawLook?.vibrance, 20),
          hdrPower: clampPercent(rawLook?.hdrPower, 35),
          contrast: clampPercent(rawLook?.contrast, 15),
          neuralStrength: clampPercent(rawLook?.neuralStrength, 40),
        };

        const iniLines = buildPresetIniContent(
          safePreset,
          components ?? {},
          safeLook,
        );
        writeFileAtomically(
          path.join(presetsDir, `${safePreset}.ini`),
          iniLines,
        );

        return {
          success: true,
          message: `Saved preset "${safePreset}.ini" to PrismPulseData/Presets.`,
          updatedState: inspectDirectory(path.basename(folderPath), folderPath),
        };
      } catch (err: unknown) {
        return {
          success: false,
          message: err instanceof Error ? err.message : 'Failed to save preset.',
        };
      }
    },
  );

  ipcMain.handle(
    'install-prismpulse',
    async (_event, folderPath: string, payload: InstallPayload) => {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return {
          success: false,
          message: 'Target folder does not exist.',
        };
      }

      if (isSimulatorRunning()) {
        return {
          success: false,
          message:
            'Simulator is running — close it first before saving the profile.',
        };
      }

      try {
        const dataDir = path.join(folderPath, 'PrismPulseData');
        const presetsDir = path.join(dataDir, 'Presets');
        const backupDir = path.join(dataDir, 'Backups');

        fs.mkdirSync(presetsDir, { recursive: true });
        fs.mkdirSync(backupDir, { recursive: true });

        const activeIniPath = path.join(folderPath, 'PrismPulse.ini');
        const backupId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}`;
        if (fs.existsSync(activeIniPath)) {
          fs.copyFileSync(
            activeIniPath,
            path.join(backupDir, `PrismPulse_${backupId}.ini.bak`),
          );
        }
        const manifestPath = path.join(dataDir, 'manifest.json');
        if (fs.existsSync(manifestPath)) {
          fs.copyFileSync(
            manifestPath,
            path.join(backupDir, `manifest_${backupId}.json.bak`),
          );
        }

        const safePreset = sanitizePresetName(payload.presetName);
        const components = payload.components ?? {};
        const look: LookSettings = {
          sharpness: clampPercent(payload.look?.sharpness, 65),
          vibrance: clampPercent(payload.look?.vibrance, 20),
          hdrPower: clampPercent(payload.look?.hdrPower, 35),
          contrast: clampPercent(payload.look?.contrast, 15),
          neuralStrength: clampPercent(payload.look?.neuralStrength, 40),
        };

        const iniLines = buildPresetIniContent(safePreset, components, look);

        const sha256 = getSha256(iniLines);
        writeFileAtomically(activeIniPath, iniLines);
        writeFileAtomically(path.join(presetsDir, `${safePreset}.ini`), iniLines);
        writeFileAtomically(
          manifestPath,
          JSON.stringify(
            {
              installedAt: new Date().toISOString(),
              presetName: safePreset,
              components,
              look,
              activeConfigSha256: sha256,
              configurationOnly: true,
            },
            null,
            2,
          ),
        );

        if (getSha256(fs.readFileSync(activeIniPath, 'utf-8')) !== sha256) {
          throw new Error('Configuration integrity check failed after writing.');
        }

        return {
          success: true,
          message: `Saved "${safePreset}" configuration and verified its SHA-256. Runtime components are not included or installed by PrismPulse.`,
          updatedState: inspectDirectory(path.basename(folderPath), folderPath, false),
        };
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Failed to install PrismPulse.';
        return { success: false, message };
      }
    },
  );

  ipcMain.handle(
    'restore-original-files',
    async (_event, folderPath: string, keepPresets: boolean) => {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return {
          success: false,
          message: 'Target folder does not exist.',
        };
      }

      if (isSimulatorRunning()) {
        return {
          success: false,
          message: 'Close the simulator before restoring original files.',
        };
      }

      try {
        const activeIniPath = path.join(folderPath, 'PrismPulse.ini');
        const dataDir = path.join(folderPath, 'PrismPulseData');
        const backupDir = path.join(dataDir, 'Backups');
        const previousIni = getLatestBackup(backupDir, 'PrismPulse_');

        if (previousIni) {
          writeFileAtomically(activeIniPath, fs.readFileSync(previousIni, 'utf-8'));
        } else if (fs.existsSync(activeIniPath)) {
          fs.unlinkSync(activeIniPath);
        }

        if (fs.existsSync(dataDir)) {
          const manifestPath = path.join(dataDir, 'manifest.json');
          const previousManifest = getLatestBackup(backupDir, 'manifest_');
          if (previousManifest) {
            writeFileAtomically(
              manifestPath,
              fs.readFileSync(previousManifest, 'utf-8'),
            );
          } else if (fs.existsSync(manifestPath)) {
            fs.unlinkSync(manifestPath);
          }

          if (!keepPresets) {
            fs.rmSync(dataDir, { recursive: true, force: true });
          }
        }

        return {
          success: true,
          message: keepPresets
            ? 'Restored the previous configuration and kept saved presets.'
            : 'Restored the previous configuration and removed PrismPulse data.',
          updatedState: inspectDirectory(path.basename(folderPath), folderPath, false),
        };
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Failed to restore original files.';
        return { success: false, message };
      }
    },
  );

  ipcMain.handle('run-diagnostics', async (_event, folderPath: string) => {
    const cpus = os.cpus();
    const totalRamGB = (os.totalmem() / 1024 ** 3).toFixed(1);
    const gpu = getGpuName();

    let manifestInfo = 'No PrismPulse configuration found in selected folder.';
    let integrityStatus = 'Not installed';
    if (folderPath) {
      const activeIniPath = path.join(folderPath, 'PrismPulse.ini');
      const manifestPath = path.join(folderPath, 'PrismPulseData', 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        try {
          const manifestText = fs.readFileSync(manifestPath, 'utf-8');
          const manifest = JSON.parse(manifestText) as {
            activeConfigSha256?: unknown;
            sha256?: unknown;
          };
          manifestInfo = manifestText;
          const expectedHash =
            typeof manifest.activeConfigSha256 === 'string'
              ? manifest.activeConfigSha256
              : manifest.sha256;
          if (
            fs.existsSync(activeIniPath) &&
            typeof expectedHash === 'string'
          ) {
            integrityStatus =
              getSha256(fs.readFileSync(activeIniPath, 'utf-8')) ===
              expectedHash
                ? 'Configuration hash verified'
                : 'Configuration hash mismatch';
          } else {
            integrityStatus = 'Configuration or integrity hash missing';
          }
        } catch (error: unknown) {
          manifestInfo =
            error instanceof Error
              ? `Manifest unreadable: ${error.message}`
              : 'Manifest unreadable.';
          integrityStatus = 'Could not verify configuration';
        }
      } else if (fs.existsSync(activeIniPath)) {
        integrityStatus = 'Configuration exists without a manifest';
      }
    }

    return {
      cpu: cpus.at(0)?.model || 'Unknown CPU',
      ram: `${totalRamGB} GB`,
      gpu,
      simRunning: isSimulatorRunning(),
      integrityStatus,
      manifestInfo,
    };
  });
}

app.on('second-instance', () => {
  const existingWindow = BrowserWindow.getAllWindows()[0];
  if (existingWindow) {
    if (existingWindow.isMinimized()) {
      existingWindow.restore();
    }
    existingWindow.focus();
  }
});

app.whenReady().then(() => {
  app.setName('PrismPulse');
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});