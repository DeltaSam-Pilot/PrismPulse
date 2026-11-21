import './index.css';
import logoUrl from '../assets/prismpulse-logo.svg';
import type {
  ComponentSettings,
  DiagnosticsReport,
  LookSettings,
  SimDirectoryInfo,
} from './preload';

type NavTab = 'library' | 'setup' | 'components' | 'look' | 'diagnostics' | 'wizard';
type StepId = 'target' | 'components' | 'look' | 'actions';
const LIBRARY_PATHS_KEY = 'prismpulse.library.paths';
const ACTIVE_TARGET_PATH_KEY = 'prismpulse.library.activePath';

interface UnavailableLibraryEntry {
  path: string;
  reason: string;
}

interface WizardStepConfig {
  id: StepId;
  title: string;
  enabled: boolean;
}

const PRESET_DEFAULTS: Record<string, LookSettings> = {
  'Natural Daylight': {
    sharpness: 65,
    vibrance: 20,
    hdrPower: 35,
    contrast: 15,
    neuralStrength: 40,
  },
  'Crisp Cockpit': {
    sharpness: 80,
    vibrance: 15,
    hdrPower: 25,
    contrast: 20,
    neuralStrength: 50,
  },
  'High Contrast IFR': {
    sharpness: 70,
    vibrance: 10,
    hdrPower: 45,
    contrast: 35,
    neuralStrength: 30,
  },
  'Golden Hour & Sunset': {
    sharpness: 60,
    vibrance: 35,
    hdrPower: 50,
    contrast: 25,
    neuralStrength: 45,
  },
};

const DEFAULT_COMPONENTS: ComponentSettings = {
  core: true,
  optimfg: true,
  effects: true,
  glassCockpit: false,
  neuralRender: false,
};

const COMPONENT_META: {
  key: keyof ComponentSettings;
  label: string;
  desc: string;
}[] = [
  { key: 'core', label: 'Profile Metadata', desc: 'Stores PrismPulse profile details for this simulator' },
  {
    key: 'optimfg',
    label: 'Performance Preferences',
    desc: 'Saves performance options; a frame-generation runtime is not included',
  },
  {
    key: 'effects',
    label: 'Visual Enhancement Values',
    desc: 'Stores image-adjustment values; no shader engine is included',
  },
  {
    key: 'glassCockpit',
    label: 'Cockpit Clarity Preference',
    desc: 'Saves a cockpit clarity preference for a compatible runtime',
  },
  {
    key: 'neuralRender',
    label: 'Neural Rendering Preference',
    desc: 'Saves a preference only; no neural-rendering component is included',
  },
];

let activeTab: NavTab = 'library';
let gameLibrary: SimDirectoryInfo[] = [];
let unavailableLibraryEntries: UnavailableLibraryEntry[] = [];
let activeSim: SimDirectoryInfo | null = null;
let statusMessage = '';
let statusTone: 'success' | 'warning' | 'neutral' = 'neutral';
let isWorking = false;
let diagnosticsReport: DiagnosticsReport | null = null;

let showFlowCustomizer = false;
let stepIndex = 0;
let wizardSteps: WizardStepConfig[] = [
  { id: 'target', title: 'Target & Safety', enabled: true },
  { id: 'components', title: 'Profile Options', enabled: true },
  { id: 'look', title: 'Visual Presets', enabled: true },
  { id: 'actions', title: 'Save & Verify', enabled: true },
];

let customPresets: string[] = Object.keys(PRESET_DEFAULTS);
let presetName = 'Natural Daylight';
let presetSlot1 = 'Natural Daylight';
let presetSlot2 = 'Crisp Cockpit';
let openFolderAfterInstall = false;
let runDiagAfterInstall = true;

let components: ComponentSettings = { ...DEFAULT_COMPONENTS };

let look: LookSettings = { ...PRESET_DEFAULTS['Natural Daylight'] };

function normalizeTargetPath(targetPath: string): string {
  return targetPath.trim().replace(/[\\/]+$/, '').toLowerCase();
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}

function readStoredLibraryPaths(): string[] {
  const stored = localStorage.getItem(LIBRARY_PATHS_KEY);
  if (!stored) return [];
  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
    throw new Error('Saved game library data has an invalid format.');
  }
  return [...new Set(parsed.map((item) => item.trim()).filter(Boolean))];
}

function writeStoredLibraryPaths(): void {
  const paths = [
    ...gameLibrary.map((sim) => sim.path),
    ...unavailableLibraryEntries.map((entry) => entry.path),
  ];
  localStorage.setItem(LIBRARY_PATHS_KEY, JSON.stringify([...new Set(paths)]));
}

function writeActiveTargetPath(targetPath: string | null): void {
  try {
    if (targetPath) localStorage.setItem(ACTIVE_TARGET_PATH_KEY, targetPath);
    else localStorage.removeItem(ACTIVE_TARGET_PATH_KEY);
  } catch (error: unknown) {
    statusMessage =
      error instanceof Error ? error.message : 'Could not save the active game selection.';
    statusTone = 'warning';
  }
}

function mergeGameLibrary(...groups: SimDirectoryInfo[][]): SimDirectoryInfo[] {
  const targets = new Map<string, SimDirectoryInfo>();
  for (const sim of groups.flat()) {
    const key = normalizeTargetPath(sim.path);
    if (key && !targets.has(key)) targets.set(key, sim);
  }
  return [...targets.values()];
}

function readStoredActivePath(): string | null {
  try {
    return localStorage.getItem(ACTIVE_TARGET_PATH_KEY);
  } catch (error: unknown) {
    statusMessage =
      error instanceof Error ? error.message : 'Could not read the active game selection.';
    statusTone = 'warning';
    return null;
  }
}

async function refreshGameLibrary(): Promise<void> {
  if (!window.prismpulse?.autoDetectAllSims || !window.prismpulse.inspectTargetFolder) {
    throw new Error('Game library bridge is unavailable.');
  }

  const savedPaths = readStoredLibraryPaths();
  const detected = await window.prismpulse.autoDetectAllSims();
  const detectedPaths = new Set(detected.map((sim) => normalizeTargetPath(sim.path)));
  const restored: SimDirectoryInfo[] = [];
  const unavailable: UnavailableLibraryEntry[] = [];

  for (const targetPath of savedPaths) {
    if (detectedPaths.has(normalizeTargetPath(targetPath))) continue;
    try {
      const inspected = await window.prismpulse.inspectTargetFolder(targetPath);
      if (inspected) {
        restored.push(inspected);
      } else {
        unavailable.push({ path: targetPath, reason: 'Folder not found or unavailable.' });
      }
    } catch (error: unknown) {
      unavailable.push({
        path: targetPath,
        reason: error instanceof Error ? error.message : 'Could not inspect this folder.',
      });
    }
  }

  gameLibrary = mergeGameLibrary(detected, restored);
  unavailableLibraryEntries = unavailable;
  writeStoredLibraryPaths();
}

function rememberGame(sim: SimDirectoryInfo): void {
  gameLibrary = mergeGameLibrary([sim], gameLibrary);
  unavailableLibraryEntries = unavailableLibraryEntries.filter(
    (entry) => normalizeTargetPath(entry.path) !== normalizeTargetPath(sim.path),
  );
  writeStoredLibraryPaths();
}

function getRootElement(): HTMLElement {
  let el = document.querySelector<HTMLElement>('#app');
  if (!el) {
    el = document.createElement('div');
    el.id = 'app';
    document.body.appendChild(el);
  }
  return el;
}

function getActiveSteps(): WizardStepConfig[] {
  const enabled = wizardSteps.filter((s) => s.enabled);
  return enabled.length > 0
    ? enabled
    : [{ id: 'actions', title: 'Save & Verify', enabled: true }];
}

function mergeSavedPresets(sim: SimDirectoryInfo | null): void {
  if (!sim) return;
  for (const file of sim.savedPresets) {
    const cleanName = file.replace(/\.ini$/i, '');
    if (cleanName && !customPresets.includes(cleanName)) {
      customPresets = [...customPresets, cleanName];
    }
  }
  if (customPresets.length > 0 && !customPresets.includes(presetSlot1)) {
    presetSlot1 = customPresets[0];
  }
  if (customPresets.length > 1 && !customPresets.includes(presetSlot2)) {
    presetSlot2 = customPresets[1];
  }
}

async function activateTarget(sim: SimDirectoryInfo): Promise<void> {
  updateGameState(sim);
  writeActiveTargetPath(sim.path);
  customPresets = Object.keys(PRESET_DEFAULTS);
  presetSlot1 = 'Natural Daylight';
  presetSlot2 = 'Crisp Cockpit';
  mergeSavedPresets(sim);

  const savedNames = sim.savedPresets.map((file) => file.replace(/\.ini$/i, ''));
  presetName = savedNames.includes('Natural Daylight')
    ? 'Natural Daylight'
    : savedNames[0] ?? 'Natural Daylight';
  look = { ...(PRESET_DEFAULTS[presetName] ?? PRESET_DEFAULTS['Natural Daylight']) };
  components = { ...DEFAULT_COMPONENTS };

  if (savedNames.includes(presetName)) {
    await applyPresetSelection(presetName);
  }
}

function updateGameState(sim: SimDirectoryInfo): void {
  activeSim = sim;
  gameLibrary = mergeGameLibrary([sim], gameLibrary);
}

async function applyPresetSelection(nextName: string): Promise<void> {
  presetName = nextName;
  if (activeSim?.path && window.prismpulse?.loadPresetIni) {
    try {
      const loaded = await window.prismpulse.loadPresetIni(activeSim.path, nextName);
      if (loaded.success) {
        if (loaded.look) look = { ...loaded.look };
        if (loaded.components) components = { ...components, ...loaded.components };
        return;
      }
    } catch (error: unknown) {
      statusMessage = error instanceof Error ? error.message : 'Failed to load profile.';
      statusTone = 'warning';
      return;
    }
  }
  if (PRESET_DEFAULTS[nextName]) {
    look = { ...PRESET_DEFAULTS[nextName] };
  }
}

function getTabHeading(tab: NavTab): string {
  switch (tab) {
    case 'library':
      return 'Game Library';
    case 'components':
      return 'Profile Options';
    case 'look':
      return 'Visual Presets';
    case 'diagnostics':
      return 'Health & Backups';
    case 'wizard':
      return 'Setup Wizard';
    default:
      return 'Game Profiles';
  }
}

function renderComponentRows(): string {
  return COMPONENT_META.map(
    (item) => `
      <div class="comp-row ${components[item.key] ? 'enabled' : ''}">
        <div class="comp-info">
          <div class="comp-title-line">
            <strong>${item.label}</strong>
            <span class="badge">${components[item.key] ? 'IN PROFILE' : 'OFF'}</span>
          </div>
          <div class="sub">${item.desc}</div>
        </div>
        <button
          type="button"
          class="${components[item.key] ? 'primary-btn' : 'secondary-btn'}"
          data-comp="${item.key}"
          aria-pressed="${components[item.key]}"
        >
          ${components[item.key] ? 'Remove' : 'Add to profile'}
        </button>
      </div>
    `,
  ).join('');
}

function renderLookEditor(allowNewPreset: boolean): string {
  const optionsHtml = customPresets
    .map((name) => `<option value="${name}">${name}</option>`)
    .join('');

  return `
    <div class="card banner">
      <h3>QUICK VISUAL PROFILES (SLOT 1 / SLOT 2)</h3>
      <p class="sub">Keep two preferred looks ready to switch for this simulator.</p>
      <div class="action-row" style="align-items:center;">
        <button type="button" class="${presetName === presetSlot1 ? 'primary-btn' : 'secondary-btn'}" id="use-slot-1-btn">
          Preset 1: ${presetSlot1}
        </button>
        <select class="sim-select" id="slot-1-picker">
          ${customPresets
            .map(
              (name) =>
                `<option value="${name}" ${presetSlot1 === name ? 'selected' : ''}>Slot 1: ${name}</option>`,
            )
            .join('')}
        </select>
        <button type="button" class="${presetName === presetSlot2 ? 'primary-btn' : 'secondary-btn'}" id="use-slot-2-btn">
          Preset 2: ${presetSlot2}
        </button>
        <select class="sim-select" id="slot-2-picker">
          ${customPresets
            .map(
              (name) =>
                `<option value="${name}" ${presetSlot2 === name ? 'selected' : ''}>Slot 2: ${name}</option>`,
            )
            .join('')}
        </select>
        <button type="button" class="secondary-btn" id="swap-slots-btn">Swap Active Slot</button>
      </div>
    </div>

    <div class="preset-bar">
      ${customPresets
        .map(
          (name) => `
            <button
              type="button"
              class="preset-btn ${presetName === name ? 'active' : ''}"
              data-preset="${name}"
            >
              ${name}
            </button>
          `,
        )
        .join('')}
    </div>

    <div class="card">
      <div class="preset-toolbar">
        <h3>ACTIVE LOOK: ${presetName.toUpperCase()}</h3>
        <div class="preset-actions">
          ${
            allowNewPreset
              ? `
                <input
                  id="new-preset-input"
                  class="text-input"
                  type="text"
                  placeholder="New preset name..."
                />
                <button type="button" class="secondary-btn" id="add-preset-btn">+ Add Preset</button>
              `
              : ''
          }
          <button type="button" class="secondary-btn" id="save-preset-btn">Save .INI Preset</button>
          <button type="button" class="secondary-btn" id="import-preset-btn">Import .INI Preset</button>
          <button type="button" class="secondary-btn" id="reset-look-btn">Reset to Default</button>
        </div>
      </div>

      <div class="slider-row">
        <span>CAS Sharpness</span>
        <div class="slider-controls">
          <input type="range" id="s-sharp" min="0" max="100" value="${look.sharpness}" />
          <span class="badge" id="v-sharp">${look.sharpness}</span>
        </div>
      </div>

      <div class="slider-row">
        <span>Vibrance Strength</span>
        <div class="slider-controls">
          <input type="range" id="s-vib" min="0" max="100" value="${look.vibrance}" />
          <span class="badge" id="v-vib">${look.vibrance}</span>
        </div>
      </div>

      <div class="slider-row">
        <span>Fake HDR Power</span>
        <div class="slider-controls">
          <input type="range" id="s-hdr" min="0" max="100" value="${look.hdrPower}" />
          <span class="badge" id="v-hdr">${look.hdrPower}</span>
        </div>
      </div>

      <div class="slider-row">
        <span>Atmospheric Contrast</span>
        <div class="slider-controls">
          <input type="range" id="s-con" min="0" max="100" value="${look.contrast}" />
          <span class="badge" id="v-con">${look.contrast}</span>
        </div>
      </div>

      <div class="slider-row">
        <span>Neural Render Strength</span>
        <div class="slider-controls">
          <input type="range" id="s-neu" min="0" max="100" value="${look.neuralStrength}" />
          <span class="badge" id="v-neu">${look.neuralStrength}</span>
        </div>
      </div>
    </div>
  `;
}

function renderTargetCard(): string {
  return `
    <div class="card">
      <h3>GAME PROFILE & SAFETY CHECK</h3>
      <div class="metric">${activeSim ? activeSim.name : 'No Simulator Selected'}</div>
      <p class="sub">${
        activeSim
          ? activeSim.path
          : 'Click Auto-Detect Sim or Browse to choose a simulator folder.'
      }</p>
      ${
        activeSim
          ? `
            <p class="sub" style="margin-top:10px;">
              UserCfg.opt: <strong>${activeSim.hasUserCfg ? 'Detected' : 'Not Detected'}</strong> ·
              PrismPulse profile: <strong>${activeSim.hasProfile ? 'Found' : 'Not Saved'}</strong> ·
              Saved profiles: <strong>${activeSim.savedPresets.length}</strong>
            </p>
          `
          : ''
      }
      ${
        activeSim?.simRunning
          ? `<p class="sub" style="color:#f87171; margin-top:8px;">Simulator is running — close it before saving or restoring a profile.</p>`
          : ''
      }
      ${
        activeSim?.hasAntiCheat
          ? `<p class="sub safety-warning">A protection-related filename was found. This basic filename check cannot determine compatibility or safety; verify with the simulator vendor before using third-party runtime tools.</p>`
          : ''
      }
      <div class="notice notice-info">
        <strong>Profile manager only.</strong> PrismPulse saves local settings and presets. It does not include or activate graphics, frame-generation, or neural-rendering runtime modules.
      </div>
      <div class="action-row">
        <button type="button" class="primary-btn" id="install-btn" ${isWorking || activeSim?.simRunning ? 'disabled' : ''}>${isWorking ? 'Saving...' : activeSim?.simRunning ? 'Close Simulator First' : 'Save Profile'}</button>
        <button type="button" class="secondary-btn" id="redetect-btn">Auto-Detect Sim</button>
        <button type="button" class="secondary-btn" id="open-folder-btn" ${
          activeSim ? '' : 'disabled'
        }>Open Folder</button>
      </div>
    </div>
  `;
}

function renderGameLibrary(): string {
  const cards = gameLibrary
    .map(
      (sim, index) => `
        <article class="card game-card ${activeSim?.path === sim.path ? 'active' : ''}">
          <div class="game-card-heading">
            <div class="game-card-title">
              <h2>${escapeHtml(sim.name)}</h2>
              <p class="game-path" title="${escapeHtml(sim.path)}">${escapeHtml(sim.path)}</p>
            </div>
            <span class="badge ${sim.simRunning ? 'badge-warning' : ''}">
              ${sim.simRunning ? 'RUNNING' : activeSim?.path === sim.path ? 'ACTIVE' : 'READY'}
            </span>
          </div>
          <div class="game-card-facts">
            <span>${sim.hasUserCfg ? 'UserCfg.opt found' : 'UserCfg.opt not found'}</span>
            <span>${sim.hasProfile ? 'Profile saved' : 'No profile saved'}</span>
            <span>${sim.savedPresets.length} saved preset${sim.savedPresets.length === 1 ? '' : 's'}</span>
          </div>
          ${
            sim.hasAntiCheat
              ? '<p class="safety-warning">A protection-related filename was found. This is not a compatibility or safety determination.</p>'
              : ''
          }
          <div class="action-row game-card-actions">
            <button type="button" class="primary-btn" data-library-select="${index}" aria-pressed="${activeSim?.path === sim.path}">
              ${activeSim?.path === sim.path ? 'Selected' : 'Open profile'}
            </button>
            <button type="button" class="secondary-btn" data-library-open="${index}">Open folder</button>
            <button type="button" class="secondary-btn" data-library-remove="${index}" aria-label="Remove ${escapeHtml(sim.name)} from the library">Forget game</button>
          </div>
        </article>
      `,
    )
    .join('');

  const unavailable = unavailableLibraryEntries
    .map(
      (entry, index) => `
        <div class="unavailable-game">
          <div>
            <strong>${escapeHtml(entry.path)}</strong>
            <p class="sub">${escapeHtml(entry.reason)}</p>
          </div>
          <button type="button" class="secondary-btn" data-library-remove-missing="${index}">Forget path</button>
        </div>
      `,
    )
    .join('');

  return `
    <div class="library-heading">
      <div>
        <h2>Your games</h2>
        <p class="sub">Saved on this PC · ${gameLibrary.length} folder${gameLibrary.length === 1 ? '' : 's'} in your library</p>
      </div>
    </div>
    ${
      cards
        ? `<div class="game-library-grid">${cards}</div>`
        : `
          <div class="card library-empty">
            <div class="library-empty-mark" aria-hidden="true">⌕</div>
            <h2>Your library is empty</h2>
            <p class="sub">Scan common simulator locations or add a game folder to start saving local profiles.</p>
            <div class="action-row">
              <button type="button" class="primary-btn" id="library-scan-empty">Scan for simulators</button>
              <button type="button" class="secondary-btn" id="library-add-empty">Add game folder</button>
            </div>
          </div>
        `
    }
    ${
      unavailable
        ? `
          <section class="unavailable-section">
            <h3>Unavailable folders</h3>
            <p class="sub">These saved paths could not be opened. They remain listed until you forget them.</p>
            ${unavailable}
          </section>
        `
        : ''
    }
    <div class="notice notice-info">
      PrismPulse manages local profiles and presets only. It does not install graphics, frame-generation, or neural-rendering components.
    </div>
  `;
}

function renderWizard(
  activeSteps: WizardStepConfig[],
  currentStep: WizardStepConfig,
  selectedOptionCount: number,
): string {
  const customizerPanel = showFlowCustomizer
    ? `
      <div class="card banner">
        <h3>CUSTOMIZE WIZARD STEPS</h3>
        <p class="sub">Toggle which steps appear in your setup flow.</p>
        <div class="action-row">
          ${wizardSteps
            .map(
              (s) => `
                <button
                  type="button"
                  class="${s.enabled ? 'primary-btn' : 'secondary-btn'}"
                  data-toggle-step="${s.id}"
                >
                  ${s.enabled ? '✓ ' : '+ '}${s.title}
                </button>
              `,
            )
            .join('')}
        </div>
      </div>
    `
    : '';

  const stepTabs = `
    <div class="step-header">
      <div class="preset-bar" style="margin-bottom:0;">
        ${activeSteps
          .map(
            (s, idx) => `
              <button
                type="button"
                class="preset-btn ${idx === stepIndex ? 'active' : ''}"
                data-goto-step="${idx}"
              >
                ${idx + 1}. ${s.title}
              </button>
            `,
          )
          .join('')}
      </div>
      <button type="button" class="secondary-btn" id="toggle-customize-btn">
        ${showFlowCustomizer ? 'Hide Flow Options' : 'Customize Steps'}
      </button>
    </div>
  `;

  let stepContent = '';

  if (currentStep.id === 'target') {
    stepContent = renderTargetCard();
  } else if (currentStep.id === 'components') {
    stepContent = `
      <div class="card banner">
        <h3>PROFILE OPTIONS (${selectedOptionCount} / 5 SELECTED)</h3>
        <p class="sub">These switches are saved to the selected profile; they do not install or activate runtime modules.</p>
      </div>
      ${renderComponentRows()}
    `;
  } else if (currentStep.id === 'look') {
    stepContent = `
      <div class="card banner">
        <h3>VISUAL PRESETS</h3>
        <p class="sub">Tune saved image values and switch between two local looks. Values are not applied in-game without a compatible runtime.</p>
      </div>
      ${renderLookEditor(true)}
    `;
  } else {
    const selectedNames = COMPONENT_META.filter((c) => components[c.key])
      .map((c) => c.label)
      .join(', ');

    stepContent = `
      <div class="cards-grid banner">
        <div class="card">
          <h3>TARGET</h3>
          <div class="metric">${activeSim ? activeSim.name : 'None'}</div>
          <p class="sub">${activeSim ? activeSim.path : 'Select a folder first'}</p>
        </div>
        <div class="card">
          <h3>ACTIVE PRESET</h3>
          <div class="metric">${presetName}</div>
          <p class="sub">Sharpness ${look.sharpness} · Vibrance ${look.vibrance} · HDR ${look.hdrPower} · Contrast ${look.contrast}</p>
        </div>
        <div class="card">
          <h3>PROFILE OPTIONS (${selectedOptionCount} SELECTED)</h3>
          <p class="sub">${selectedNames || 'No options selected'}</p>
        </div>
      </div>

      <div class="card">
        <h3>SAVE PROFILE OPTIONS</h3>
        <div class="slider-row">
          <span>Run system and profile checks after saving</span>
          <input type="checkbox" id="opt-diag-after" ${runDiagAfterInstall ? 'checked' : ''} />
        </div>
        <div class="slider-row" style="margin-bottom:14px;">
          <span>Open target folder after saving</span>
          <input type="checkbox" id="opt-open-after" ${openFolderAfterInstall ? 'checked' : ''} />
        </div>
        <button type="button" class="primary-btn" id="install-btn" ${isWorking || activeSim?.simRunning ? 'disabled' : ''}>${isWorking ? 'Saving...' : activeSim?.simRunning ? 'Close Simulator First' : 'Save Profile'}</button>
      </div>
    `;
  }

  const navFooter = `
    <div class="step-footer">
      <button
        type="button"
        class="secondary-btn"
        id="step-prev"
        ${stepIndex === 0 ? 'disabled' : ''}
      >
        ← Back
      </button>
      ${
        stepIndex < activeSteps.length - 1
          ? `<button type="button" class="primary-btn" id="step-next">Continue →</button>`
          : `<span></span>`
      }
    </div>
  `;

  return `${customizerPanel}${stepTabs}${stepContent}${navFooter}`;
}

function renderBody(
  activeSteps: WizardStepConfig[],
  currentStep: WizardStepConfig,
  selectedOptionCount: number,
): string {
  if (activeTab === 'library') {
    return renderGameLibrary();
  }

  if (activeTab === 'wizard') {
    return renderWizard(activeSteps, currentStep, selectedOptionCount);
  }

  if (activeTab === 'components') {
    return `
      <div class="card banner">
        <h3>PROFILE OPTIONS (${selectedOptionCount} / 5 SELECTED)</h3>
        <p class="sub">Choose which preferences to include when saving this simulator’s configuration.</p>
      </div>
      ${renderComponentRows()}
    `;
  }

  if (activeTab === 'look') {
    return renderLookEditor(true);
  }

  if (activeTab === 'diagnostics') {
    return `
      <div class="cards-grid banner">
        <div class="card">
          <h3>PROFILE BACKUPS</h3>
          <p class="sub">Restore the most recent saved configuration backup. If none exists, remove only PrismPulse-created configuration files.</p>
          <div class="action-row">
            <button type="button" class="secondary-btn" id="restore-keep-btn">Restore (Keep Presets)</button>
            <button type="button" class="danger-btn" id="restore-all-btn">Restore (Remove All)</button>
          </div>
        </div>
        <div class="card">
          <h3>SYSTEM HEALTH & INTEGRITY</h3>
          <p class="sub">Inspect system details, simulator process state, configuration integrity, and manifest.json. Settings are saved locally; runtime effects are not installed.</p>
          <div class="action-row">
            <button type="button" class="primary-btn" id="diag-btn">Run Diagnostics</button>
            <button type="button" class="secondary-btn" id="open-folder-btn" ${
              activeSim ? '' : 'disabled'
            }>Open Folder</button>
          </div>
        </div>
      </div>

      ${
        diagnosticsReport
          ? `
            <div class="card">
              <h3>DIAGNOSTICS OUTPUT</h3>
              <p class="sub">CPU: ${diagnosticsReport.cpu} · RAM: ${diagnosticsReport.ram} · GPU: ${diagnosticsReport.gpu}</p>
              <p class="sub" style="margin-top:6px;">Sim Running: ${diagnosticsReport.simRunning ? 'Yes' : 'No'} · Integrity: ${diagnosticsReport.integrityStatus}</p>
              <pre class="sub diag-pre">${diagnosticsReport.manifestInfo}</pre>
            </div>
          `
          : ''
      }
    `;
  }

  return `
    <div class="cards-grid banner">
      <div class="card">
        <h3>SELECTED TARGET</h3>
        <div class="metric">${activeSim ? activeSim.name : 'None'}</div>
        <div class="sub">${
          activeSim
            ? `${activeSim.hasProfile ? 'Profile saved' : 'No saved profile'} · Saved profiles: ${activeSim.savedPresets.length}`
            : 'Click Auto-Detect Sim or Browse'
        }</div>
      </div>

      <div class="card">
        <h3>PROFILE OPTIONS</h3>
        <div class="metric">${selectedOptionCount} / 5 selected</div>
        <div class="sub">Preset: ${presetName}</div>
        <div class="action-row">
          <button type="button" class="primary-btn" id="launch-wiz">Quick Setup</button>
        </div>
      </div>

      <div class="card">
        <h3>GAME LIBRARY</h3>
        <div class="metric">${gameLibrary.length}</div>
        <div class="sub">Saved on this PC · ${unavailableLibraryEntries.length} unavailable</div>
        <div class="action-row">
          <button type="button" class="secondary-btn" id="view-library-btn">Open Game Library</button>
        </div>
      </div>
    </div>
    ${renderTargetCard()}
  `;
}

function render(): void {
  const root = getRootElement();
  const activeSteps = getActiveSteps();
  if (stepIndex >= activeSteps.length) {
    stepIndex = activeSteps.length - 1;
  }
  const currentStep = activeSteps[stepIndex];
  const selectedOptionCount = Object.values(components).filter(Boolean).length;

  const statusText = activeSim
    ? activeSim.simRunning
      ? 'Simulator Running'
      : 'Ready to Configure'
    : 'No Folder Selected';

  const statusClass = activeSim?.simRunning ? 'status-warn' : 'status-ok';

  root.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <img class="brand-logo" src="${logoUrl}" width="40" height="40" alt="PrismPulse logo"/>
          <div>
            <h2>PRISMPULSE</h2>
            <span class="brand-tag">LOCAL PROFILE MANAGER</span>
          </div>
        </div>

        <nav class="nav-links">
          <button type="button" class="nav-btn ${activeTab === 'library' ? 'active' : ''}" data-tab="library">
            <span class="nav-icon" aria-hidden="true">▦</span><span>Game Library</span>
          </button>
          <button type="button" class="nav-btn ${activeTab === 'setup' ? 'active' : ''}" data-tab="setup">
            <span class="nav-icon" aria-hidden="true">⌂</span><span>Game Profiles</span>
          </button>
          <button type="button" class="nav-btn ${activeTab === 'components' ? 'active' : ''}" data-tab="components">
            <span class="nav-icon" aria-hidden="true">◈</span><span>Profile Options</span>
          </button>
          <button type="button" class="nav-btn ${activeTab === 'look' ? 'active' : ''}" data-tab="look">
            <span class="nav-icon" aria-hidden="true">◉</span><span>Visual Presets</span>
          </button>
          <button type="button" class="nav-btn ${activeTab === 'diagnostics' ? 'active' : ''}" data-tab="diagnostics">
            <span class="nav-icon" aria-hidden="true">◎</span><span>Health &amp; Backups</span>
          </button>
          <button type="button" class="nav-btn ${activeTab === 'wizard' ? 'active' : ''}" data-tab="wizard">
            <span class="nav-icon" aria-hidden="true">✦</span><span>Setup Wizard</span>
          </button>
        </nav>

        <div class="status-box">
          <small>ACTIVE TARGET</small>
          <div class="${statusClass}">
            <span class="status-dot"></span>${statusText}
          </div>
        </div>
      </aside>

      <main class="content">
        <div class="topbar">
          <div>
            <span class="topbar-eyebrow">PRISMPULSE · LOCAL CONFIGURATION</span>
            <h1>${
              activeTab === 'wizard'
                ? `Setup Wizard (${stepIndex + 1}/${activeSteps.length}: ${currentStep.title})`
                : getTabHeading(activeTab)
            }</h1>
            <p class="sub">${
              activeSim ? activeSim.path : 'Auto-detect a simulator or pick a folder'
            }</p>
          </div>

          <div class="topbar-controls">
            ${
              gameLibrary.length > 0
                ? `
                  <select class="sim-select" id="sim-picker">
                    ${gameLibrary
                      .map(
                        (s, idx) =>
                          `<option value="${idx}" ${
                            activeSim?.path === s.path ? 'selected' : ''
                          }>${s.name}</option>`,
                      )
                      .join('')}
                  </select>
                `
                : ''
            }
            <button type="button" class="secondary-btn" id="redetect-top-btn" ${isWorking ? 'disabled' : ''}>${isWorking ? 'Scanning...' : activeTab === 'library' ? 'Scan for Games' : 'Auto-Detect Sim'}</button>
            <button type="button" class="secondary-btn" id="open-top-folder-btn" ${
              activeSim ? '' : 'disabled'
            }>Open Folder</button>
            <button type="button" class="secondary-btn" id="browse-btn">${activeTab === 'library' ? 'Add Game Folder' : 'Browse'}</button>
          </div>
        </div>

        ${
          statusMessage
            ? `<div class="status-banner ${statusTone}" role="status" aria-live="polite">
                <span class="status-banner-dot"></span>
                <span>${statusMessage}</span>
                <button type="button" class="status-dismiss" id="dismiss-status" aria-label="Dismiss notification">×</button>
              </div>`
            : ''
        }

        ${renderBody(activeSteps, currentStep, selectedOptionCount)}
      </main>
    </div>
  `;

  bindEvents(root);
}

function bindEvents(root: HTMLElement): void {
  root.querySelector<HTMLButtonElement>('#dismiss-status')?.addEventListener('click', () => {
    statusMessage = '';
    statusTone = 'neutral';
    render();
  });

  root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTab = (btn.dataset.tab as NavTab) || 'setup';
      render();
    });
  });

  root.querySelector<HTMLButtonElement>('#launch-wiz')?.addEventListener('click', () => {
    activeTab = 'wizard';
    stepIndex = 0;
    render();
  });

  root.querySelector<HTMLButtonElement>('#view-library-btn')?.addEventListener('click', () => {
    activeTab = 'library';
    render();
  });

  root
    .querySelector<HTMLButtonElement>('#toggle-customize-btn')
    ?.addEventListener('click', () => {
      showFlowCustomizer = !showFlowCustomizer;
      render();
    });

  root.querySelectorAll<HTMLButtonElement>('[data-toggle-step]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.toggleStep as StepId;
      wizardSteps = wizardSteps.map((s) =>
        s.id === id ? { ...s, enabled: !s.enabled } : s,
      );
      stepIndex = 0;
      render();
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-goto-step]').forEach((btn) => {
    btn.addEventListener('click', () => {
      stepIndex = Number(btn.dataset.gotoStep) || 0;
      render();
    });
  });

  root.querySelector<HTMLButtonElement>('#step-prev')?.addEventListener('click', () => {
    if (stepIndex > 0) {
      stepIndex -= 1;
      render();
    }
  });

  root.querySelector<HTMLButtonElement>('#step-next')?.addEventListener('click', () => {
    const total = getActiveSteps().length;
    if (stepIndex < total - 1) {
      stepIndex += 1;
      render();
    }
  });

  root
    .querySelector<HTMLButtonElement>('#use-slot-1-btn')
    ?.addEventListener('click', async () => {
      await applyPresetSelection(presetSlot1);
      statusMessage = `Switched active preset to Slot 1 (${presetSlot1}).`;
      render();
    });

  root
    .querySelector<HTMLButtonElement>('#use-slot-2-btn')
    ?.addEventListener('click', async () => {
      await applyPresetSelection(presetSlot2);
      statusMessage = `Switched active preset to Slot 2 (${presetSlot2}).`;
      render();
    });

  root
    .querySelector<HTMLSelectElement>('#slot-1-picker')
    ?.addEventListener('change', (e) => {
      presetSlot1 = (e.target as HTMLSelectElement).value;
      render();
    });

  root
    .querySelector<HTMLSelectElement>('#slot-2-picker')
    ?.addEventListener('change', (e) => {
      presetSlot2 = (e.target as HTMLSelectElement).value;
      render();
    });

  root
    .querySelector<HTMLButtonElement>('#swap-slots-btn')
    ?.addEventListener('click', async () => {
      const next = presetName === presetSlot1 ? presetSlot2 : presetSlot1;
      await applyPresetSelection(next);
      statusMessage = `Swapped active preset to "${presetName}".`;
      render();
    });

  root
    .querySelector<HTMLButtonElement>('#add-preset-btn')
    ?.addEventListener('click', async () => {
      const input = root.querySelector<HTMLInputElement>('#new-preset-input');
      const trimmed = input?.value.trim() ?? '';
      if (!trimmed) return;

      if (!customPresets.includes(trimmed)) customPresets = [...customPresets, trimmed];
      presetName = trimmed;

      if (activeSim && window.prismpulse?.savePresetIni) {
        const saved = await window.prismpulse.savePresetIni(
          activeSim.path,
          trimmed,
          components,
          look,
        );
        statusMessage = saved.message;
        if (saved.updatedState) {
          updateGameState(saved.updatedState);
        }
      } else {
        statusMessage = `Added preset "${trimmed}" (select a target folder to save .ini to disk).`;
      }
      render();
    });

  root
    .querySelector<HTMLButtonElement>('#save-preset-btn')
    ?.addEventListener('click', async () => {
      if (!activeSim?.path || !window.prismpulse?.savePresetIni) {
        statusMessage = `Updated "${presetName}" look values in memory (select a folder to save .ini).`;
        render();
        return;
      }
      const saved = await window.prismpulse.savePresetIni(
        activeSim.path,
        presetName,
        components,
        look,
      );
      statusMessage = saved.message;
      if (saved.updatedState) {
        updateGameState(saved.updatedState);
        mergeSavedPresets(activeSim);
      }
      render();
    });

  root
    .querySelector<HTMLButtonElement>('#import-preset-btn')
    ?.addEventListener('click', async () => {
      if (!activeSim) {
        statusMessage = 'Select a target simulator folder before importing a preset.';
        render();
        return;
      }
      if (!window.prismpulse?.importPreset) {
        statusMessage = 'Preset import bridge is unavailable.';
        render();
        return;
      }

      const res = await window.prismpulse.importPreset(activeSim.path);
      statusMessage = res.message;
      if (res.updatedState) {
        updateGameState(res.updatedState);
        mergeSavedPresets(activeSim);
      }
      render();
    });

  root.querySelector<HTMLButtonElement>('#reset-look-btn')?.addEventListener('click', () => {
    const defaults = PRESET_DEFAULTS[presetName] ?? PRESET_DEFAULTS['Natural Daylight'];
    look = { ...defaults };
    statusMessage = `Reset look sliders to "${presetName}" default values.`;
    render();
  });

  root
    .querySelector<HTMLInputElement>('#opt-diag-after')
    ?.addEventListener('change', (e) => {
      runDiagAfterInstall = (e.target as HTMLInputElement).checked;
    });

  root
    .querySelector<HTMLInputElement>('#opt-open-after')
    ?.addEventListener('change', (e) => {
      openFolderAfterInstall = (e.target as HTMLInputElement).checked;
    });

  root
    .querySelector<HTMLSelectElement>('#sim-picker')
    ?.addEventListener('change', async (e) => {
      const idx = Number((e.target as HTMLSelectElement).value);
      if (gameLibrary[idx]) {
        await activateTarget(gameLibrary[idx]);
        render();
      }
    });

  root.querySelector<HTMLButtonElement>('#browse-btn')?.addEventListener('click', async () => {
    if (!window.prismpulse?.selectTargetFolder) {
      statusMessage = 'Folder picker bridge is unavailable.';
      statusTone = 'warning';
      render();
      return;
    }
    try {
      const picked = await window.prismpulse.selectTargetFolder();
      if (picked) {
        rememberGame(picked);
        await activateTarget(picked);
        statusMessage = `Added ${picked.name} to your game library.`;
        statusTone = 'success';
      }
    } catch (error: unknown) {
      statusMessage = error instanceof Error ? error.message : 'Could not add that game folder.';
      statusTone = 'warning';
    }
    render();
  });

  const forgetGame = async (targetPath: string, label: string) => {
    if (!window.confirm(`Forget "${label}" from the library? This will not delete files.`)) {
      return;
    }

    const activePath = activeSim?.path ?? readStoredActivePath();
    gameLibrary = gameLibrary.filter(
      (sim) => normalizeTargetPath(sim.path) !== normalizeTargetPath(targetPath),
    );
    unavailableLibraryEntries = unavailableLibraryEntries.filter(
      (entry) => normalizeTargetPath(entry.path) !== normalizeTargetPath(targetPath),
    );
    try {
      writeStoredLibraryPaths();
    } catch (error: unknown) {
      statusMessage =
        error instanceof Error ? error.message : 'Could not save the updated game library.';
      statusTone = 'warning';
      render();
      return;
    }

    if (activePath && normalizeTargetPath(activePath) === normalizeTargetPath(targetPath)) {
      activeSim = null;
      const next = gameLibrary[0];
      if (next) {
        await activateTarget(next);
      } else {
        writeActiveTargetPath(null);
        presetName = 'Natural Daylight';
        customPresets = Object.keys(PRESET_DEFAULTS);
        look = { ...PRESET_DEFAULTS[presetName] };
        components = { ...DEFAULT_COMPONENTS };
      }
    }

    statusMessage = `Forgot ${label}. The selected folder and its files were not changed.`;
    statusTone = 'neutral';
    render();
  };

  root.querySelectorAll<HTMLButtonElement>('[data-library-select]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const index = Number(btn.dataset.librarySelect);
      const sim = gameLibrary[index];
      if (!sim) return;
      await activateTarget(sim);
      statusMessage = `Selected ${sim.name}.`;
      statusTone = 'success';
      render();
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-library-open]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const sim = gameLibrary[Number(btn.dataset.libraryOpen)];
      if (!sim || !window.prismpulse?.openTargetFolder) return;
      try {
        await window.prismpulse.openTargetFolder(sim.path);
      } catch (error: unknown) {
        statusMessage = error instanceof Error ? error.message : 'Could not open that folder.';
        statusTone = 'warning';
        render();
      }
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-library-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const sim = gameLibrary[Number(btn.dataset.libraryRemove)];
      if (sim) await forgetGame(sim.path, sim.name);
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-library-remove-missing]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const entry = unavailableLibraryEntries[Number(btn.dataset.libraryRemoveMissing)];
      if (entry) await forgetGame(entry.path, entry.path);
    });
  });

  const handleRedetect = async () => {
    if (!window.prismpulse?.autoDetectAllSims || !window.prismpulse.inspectTargetFolder) {
      statusMessage = 'Game library bridge is unavailable.';
      statusTone = 'warning';
      render();
      return;
    }
    const activePath = activeSim?.path ?? readStoredActivePath();
    isWorking = true;
    statusMessage = 'Scanning simulator locations and saved game folders...';
    statusTone = 'neutral';
    render();
    try {
      await refreshGameLibrary();
      const selected = activePath
        ? gameLibrary.find(
            (sim) => normalizeTargetPath(sim.path) === normalizeTargetPath(activePath),
          )
        : undefined;
      if (selected) {
        await activateTarget(selected);
      } else if (!activePath && gameLibrary.length > 0) {
        await activateTarget(gameLibrary[0]);
      } else if (activePath) {
        activeSim = null;
      }
      statusMessage =
        unavailableLibraryEntries.length > 0
          ? `Found ${gameLibrary.length} folder(s); ${unavailableLibraryEntries.length} saved path(s) are unavailable.`
          : `Game library refreshed: ${gameLibrary.length} folder(s).`;
      statusTone =
        gameLibrary.length > 0 && unavailableLibraryEntries.length === 0
          ? 'success'
          : 'warning';
    } catch (error: unknown) {
      statusMessage = error instanceof Error ? error.message : 'Game library scan failed.';
      statusTone = 'warning';
    } finally {
      isWorking = false;
    }
    render();
  };

  root.querySelector<HTMLButtonElement>('#redetect-btn')?.addEventListener('click', handleRedetect);
  root
    .querySelector<HTMLButtonElement>('#redetect-top-btn')
    ?.addEventListener('click', handleRedetect);
  root.querySelector<HTMLButtonElement>('#library-scan-empty')?.addEventListener('click', handleRedetect);
  root.querySelector<HTMLButtonElement>('#library-add-empty')?.addEventListener('click', () => {
    root.querySelector<HTMLButtonElement>('#browse-btn')?.click();
  });

  root.querySelector<HTMLButtonElement>('#install-btn')?.addEventListener('click', async () => {
    if (!activeSim) {
      statusMessage = 'Select a simulator folder first.';
      statusTone = 'warning';
      render();
      return;
    }
    if (activeSim.simRunning) {
      statusMessage = 'Close the simulator before saving its profile.';
      statusTone = 'warning';
      render();
      return;
    }
    if (!window.prismpulse?.installPrismPulse) {
      statusMessage = 'Profile save bridge is unavailable.';
      statusTone = 'warning';
      render();
      return;
    }

    isWorking = true;
    statusMessage = 'Saving the selected simulator profile...';
    statusTone = 'neutral';
    render();

    try {
      const res = await window.prismpulse.installPrismPulse(activeSim.path, {
        presetName,
        components,
        look,
      });
      statusMessage = res.message;
      statusTone = res.success ? 'success' : 'warning';
      if (res.updatedState) updateGameState(res.updatedState);

      if (res.success) {
        if (runDiagAfterInstall && window.prismpulse.runDiagnostics) {
          diagnosticsReport = await window.prismpulse.runDiagnostics(activeSim.path);
        }
        if (openFolderAfterInstall && window.prismpulse.openTargetFolder) {
          await window.prismpulse.openTargetFolder(activeSim.path);
        }
      }
    } catch (error: unknown) {
      statusMessage = error instanceof Error ? error.message : 'Failed to apply setup.';
      statusTone = 'warning';
    } finally {
      isWorking = false;
    }
    render();
  });

  root.querySelectorAll<HTMLButtonElement>('[data-comp]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.comp as keyof ComponentSettings;
      if (!key) return;
      components = { ...components, [key]: !components[key] };
      render();
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const next = btn.dataset.preset;
      if (!next) return;
      await applyPresetSelection(next);
      render();
    });
  });

  const wireSlider = (id: string, key: keyof LookSettings, badgeId: string) => {
    root.querySelector<HTMLInputElement>(id)?.addEventListener('input', (e) => {
      const val = Number((e.target as HTMLInputElement).value);
      look = { ...look, [key]: val };
      const badge = root.querySelector(badgeId);
      if (badge) badge.textContent = String(val);
    });
  };

  wireSlider('#s-sharp', 'sharpness', '#v-sharp');
  wireSlider('#s-vib', 'vibrance', '#v-vib');
  wireSlider('#s-hdr', 'hdrPower', '#v-hdr');
  wireSlider('#s-con', 'contrast', '#v-con');
  wireSlider('#s-neu', 'neuralStrength', '#v-neu');

  root
    .querySelector<HTMLButtonElement>('#restore-keep-btn')
    ?.addEventListener('click', async () => {
      if (!activeSim || !window.prismpulse?.restoreOriginalFiles) return;
      try {
        const res = await window.prismpulse.restoreOriginalFiles(activeSim.path, true);
        statusMessage = res.message;
        statusTone = res.success ? 'success' : 'warning';
        if (res.updatedState) updateGameState(res.updatedState);
      } catch (error: unknown) {
        statusMessage = error instanceof Error ? error.message : 'Failed to restore configuration.';
        statusTone = 'warning';
      }
      render();
    });

  root
    .querySelector<HTMLButtonElement>('#restore-all-btn')
    ?.addEventListener('click', async () => {
      if (!activeSim || !window.prismpulse?.restoreOriginalFiles) return;
      try {
        const res = await window.prismpulse.restoreOriginalFiles(activeSim.path, false);
        statusMessage = res.message;
        statusTone = res.success ? 'success' : 'warning';
        if (res.updatedState) updateGameState(res.updatedState);
      } catch (error: unknown) {
        statusMessage = error instanceof Error ? error.message : 'Failed to restore configuration.';
        statusTone = 'warning';
      }
      render();
    });

  root.querySelector<HTMLButtonElement>('#diag-btn')?.addEventListener('click', async () => {
    if (!window.prismpulse?.runDiagnostics) {
      statusMessage = 'Diagnostics bridge is unavailable.';
      render();
      return;
    }
    try {
      diagnosticsReport = await window.prismpulse.runDiagnostics(activeSim?.path ?? '');
      statusMessage = 'Diagnostics completed.';
      statusTone = 'success';
    } catch (error: unknown) {
      statusMessage = error instanceof Error ? error.message : 'Failed to run diagnostics.';
      statusTone = 'warning';
    }
    render();
  });

  const handleOpenFolder = async () => {
    if (activeSim?.path && window.prismpulse?.openTargetFolder) {
      await window.prismpulse.openTargetFolder(activeSim.path);
    }
  };

  root.querySelector<HTMLButtonElement>('#open-folder-btn')?.addEventListener('click', handleOpenFolder);
  root
    .querySelector<HTMLButtonElement>('#open-top-folder-btn')
    ?.addEventListener('click', handleOpenFolder);
}

async function init(): Promise<void> {
  render();
  try {
    if (!window.prismpulse?.autoDetectAllSims || !window.prismpulse.inspectTargetFolder) {
      statusMessage = 'Game library bridge (window.prismpulse) is not available.';
      statusTone = 'warning';
      render();
      return;
    }
    const savedActivePath = readStoredActivePath();
    await refreshGameLibrary();
    const selected = savedActivePath
      ? gameLibrary.find(
          (sim) => normalizeTargetPath(sim.path) === normalizeTargetPath(savedActivePath),
        )
      : undefined;
    if (selected) {
      await activateTarget(selected);
    } else if (!savedActivePath && gameLibrary.length > 0) {
      await activateTarget(gameLibrary[0]);
    } else if (savedActivePath && unavailableLibraryEntries.length > 0) {
      statusMessage = 'The previously selected game folder is currently unavailable.';
      statusTone = 'warning';
    }
  } catch (err: unknown) {
    statusMessage =
      err instanceof Error ? err.message : 'Failed to load the game library.';
    statusTone = 'warning';
  }
  render();
}

init();
