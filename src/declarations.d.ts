import type {
  ActionResult,
  ComponentSettings,
  DiagnosticsReport,
  LoadedPresetResult,
  LookSettings,
  PrismPulseInstallPayload,
  SimDirectoryInfo,
} from './preload';

declare global {
  interface Window {
    prismpulse: {
      autoDetectAllSims: () => Promise<SimDirectoryInfo[]>;
      selectTargetFolder: () => Promise<SimDirectoryInfo | null>;
      openTargetFolder: (folderPath: string) => Promise<void>;
      importPreset: (folderPath: string) => Promise<ActionResult>;
      loadPresetIni: (
        folderPath: string,
        presetName: string,
      ) => Promise<LoadedPresetResult>;
      savePresetIni: (
        folderPath: string,
        presetName: string,
        components: ComponentSettings,
        look: LookSettings,
      ) => Promise<ActionResult>;
      installPrismPulse: (
        folderPath: string,
        payload: PrismPulseInstallPayload,
      ) => Promise<ActionResult>;
      restoreOriginalFiles: (
        folderPath: string,
        keepPresets: boolean,
      ) => Promise<ActionResult>;
      runDiagnostics: (folderPath: string) => Promise<DiagnosticsReport>;
    };
  }
}

export {};