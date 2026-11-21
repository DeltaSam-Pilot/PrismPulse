import { contextBridge, ipcRenderer } from 'electron';

export interface SimDirectoryInfo {
  name: string;
  path: string;
  hasProfile: boolean;
  hasUserCfg: boolean;
  hasAntiCheat: boolean;
  savedPresets: string[];
  simRunning: boolean;
}

export interface LookSettings {
  sharpness: number;
  vibrance: number;
  hdrPower: number;
  contrast: number;
  neuralStrength: number;
}

export interface ComponentSettings {
  core: boolean;
  optimfg: boolean;
  effects: boolean;
  glassCockpit: boolean;
  neuralRender: boolean;
}

export interface PrismPulseInstallPayload {
  presetName: string;
  components: ComponentSettings;
  look: LookSettings;
}

export interface ActionResult {
  success: boolean;
  message: string;
  updatedState?: SimDirectoryInfo;
}

export interface LoadedPresetResult {
  success: boolean;
  message: string;
  look?: LookSettings;
  components?: Partial<ComponentSettings>;
}

export interface DiagnosticsReport {
  cpu: string;
  ram: string;
  gpu: string;
  simRunning: boolean;
  integrityStatus: string;
  manifestInfo: string;
}

contextBridge.exposeInMainWorld('prismpulse', {
  autoDetectAllSims: (): Promise<SimDirectoryInfo[]> =>
    ipcRenderer.invoke('auto-detect-all-sims'),
  inspectTargetFolder: (folderPath: string): Promise<SimDirectoryInfo | null> =>
    ipcRenderer.invoke('inspect-target-folder', folderPath),
  selectTargetFolder: (): Promise<SimDirectoryInfo | null> =>
    ipcRenderer.invoke('select-target-folder'),
  openTargetFolder: (folderPath: string): Promise<void> =>
    ipcRenderer.invoke('open-target-folder', folderPath),
  importPreset: (folderPath: string): Promise<ActionResult> =>
    ipcRenderer.invoke('import-preset', folderPath),
  loadPresetIni: (
    folderPath: string,
    presetName: string,
  ): Promise<LoadedPresetResult> =>
    ipcRenderer.invoke('load-preset-ini', folderPath, presetName),
  savePresetIni: (
    folderPath: string,
    presetName: string,
    components: ComponentSettings,
    look: LookSettings,
  ): Promise<ActionResult> =>
    ipcRenderer.invoke('save-preset-ini', folderPath, presetName, components, look),
  installPrismPulse: (
    folderPath: string,
    payload: PrismPulseInstallPayload,
  ): Promise<ActionResult> =>
    ipcRenderer.invoke('install-prismpulse', folderPath, payload),
  restoreOriginalFiles: (
    folderPath: string,
    keepPresets: boolean,
  ): Promise<ActionResult> =>
    ipcRenderer.invoke('restore-original-files', folderPath, keepPresets),
  runDiagnostics: (folderPath: string): Promise<DiagnosticsReport> =>
    ipcRenderer.invoke('run-diagnostics', folderPath),
});