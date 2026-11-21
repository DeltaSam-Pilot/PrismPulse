import './index.css';
import type {
  ComponentSettings,
  DiagnosticsReport,
  LookSettings,
  SimDirectoryInfo,
} from './preload';

type NavTab = 'setup' | 'components' | 'look' | 'diagnostics' | 'wizard';
type StepId = 'target' | 'components' | 'look' | 'actions';

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

const COMPONENT_META: {
  key: keyof ComponentSettings;
  label: string;
  desc: string;
}[] = [
  { key: 'core', label: 'Core Runtime', desc: 'Base runtime integration and manifest tracking' },
  {
    key: 'optimfg',
    label: 'OptiMFG / Frame Gen',
    desc: 'Frame generation controls for supported setups',
  },
  {
    key: 'effects',
    label: 'Image Effects & Shaders',
    desc: 'Post-processing shader pipeline and .INI presets',
  },
  {
    key: 'glassCockpit',
    label: 'Glass Cockpit Fix',
    desc: 'Cockpit display clarity fix for supported setups',
  },
  {
    key: 'neuralRender',
    label: 'Neural Rendering',
    desc: 'Optional neural rendering pass configuration',
  },
];

let activeTab: NavTab = 'setup';
let detectedSims: SimDirectoryInfo[] = [];
let activeSim: SimDirectoryInfo | null = null;
let statusMessage = '';
let diagnosticsReport: DiagnosticsReport | null = null;

let showFlowCustomizer = false;
let stepIndex = 0;
let wizardSteps: WizardStepConfig[] = [
  { id: 'target', title: 'Target & Safety', enabled: true },
  { id: 'components', title: 'Components & MFG', enabled: true },
  { id: 'look', title: 'Look & Presets', enabled: true },
  { id: 'actions', title: 'Apply & Verify', enabled: true },
];

let customPresets: string[] = Object.keys(PRESET_DEFAULTS);
let presetName = 'Natural Daylight';
let presetSlot1 = 'Natural Daylight';
let presetSlot2 = 'Crisp Cockpit';
let openFolderAfterInstall = false;
let runDiagAfterInstall = true;

let components: ComponentSettings = {
  core: true,
  optimfg: true,
  effects: true,
  glassCockpit: false,
  neuralRender: false,
};

let look: LookSettings = { ...PRESET_DEFAULTS['Natural Daylight'] };

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
    : [{ id: 'actions', title: 'Apply & Verify', enabled: true }];
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

async function applyPresetSelection(nextName: string): Promise<void> {
  presetName = nextName;
  if (activeSim?.path && window.prismpulse?.loadPresetIni) {
    const loaded = await window.prismpulse.loadPresetIni(activeSim.path, nextName);
    if (loaded.success && loaded.look) {
      look = { ...loaded.look };
      return;
    }
  }
  if (PRESET_DEFAULTS[nextName]) {
    look = { ...PRESET_DEFAULTS[nextName] };
  }
}

function getTabHeading(tab: NavTab): string {
  switch (tab) {
    case 'components':
      return 'Components & MFG';
    case 'look':
      return 'Look Editor & Presets';
    case 'diagnostics':
      return 'Diagnostics & Verify';
    case 'wizard':
      return 'Setup Wizard';
    default:
      return 'Per-Game Setup';
  }
}

function renderComponentRows(): string {
  return COMPONENT_META.map(
    (item) => `
      <div class="comp-row">
        <div>
          <strong>${item.label}</strong>
          <span class="badge">${components[item.key] ? 'ENABLED' : 'OFF'}</span>
          <div class="sub">${item.desc}</div>
        </div>
        <button
          type="button"
          class="${components[item.key] ? 'primary-btn' : 'secondary-btn'}"
          data-comp="${item.key}"
        >
          ${components[item.key] ? 'Enabled' : 'Enable'}
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
      <h3>QUICK PRESET SWAPPING (PRESET 1 / PRESET 2)</h3>
      <p class="sub">Assign two presets to toggle quickly between visual profiles.</p>
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
      <h3>TARGET SIMULATOR & SAFETY CHECK</h3>
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
              Existing Install: <strong>${activeSim.isInstalled ? 'Yes' : 'No'}</strong> ·
              Saved Presets: <strong>${activeSim.savedPresets.length}</strong>
            </p>
          `
          : ''
      }
      ${
        activeSim?.simRunning
          ? `<p class="sub" style="color:#f87171; margin-top:8px;">Simulator is running — close it before installing or restoring.</p>`
          : ''
      }
      ${
        activeSim?.hasAntiCheat
          ? `<p class="sub" style="color:#fbbf24; margin-top:8px;">Protection/anti-cheat indicator found in directory — verify compatibility before installing.</p>`
          : ''
      }
      <div class="action-row">
        <button type="button" class="primary-btn" id="install-btn">Apply Setup</button>
        <button type="button" class="secondary-btn" id="redetect-btn">Auto-Detect Sim</button>
        <button type="button" class="secondary-btn" id="open-folder-btn" ${
          activeSim ? '' : 'disabled'
        }>Open Folder</button>
      </div>
    </div>
  `;
}

function renderWizard(
  activeSteps: WizardStepConfig[],
  currentStep: WizardStepConfig,
  installedCompCount: number,
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
        <h3>COMPONENTS & MFG (${installedCompCount} / 5 ENABLED)</h3>
        <p class="sub">Select the runtime modules, frame generation, and visual fixes for this target.</p>
      </div>
      ${renderComponentRows()}
    `;
  } else if (currentStep.id === 'look') {
    stepContent = `
      <div class="card banner">
        <h3>LOOK & PRESETS</h3>
        <p class="sub">Choose a preset, configure Preset 1 / Preset 2 slots, or adjust sliders.</p>
      </div>
      ${renderLookEditor(true)}
    `;
  } else {
    const enabledNames = COMPONENT_META.filter((c) => components[c.key])
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
          <h3>ENABLED MODULES (${installedCompCount})</h3>
          <p class="sub">${enabledNames || 'None enabled'}</p>
        </div>
      </div>

      <div class="card">
        <h3>POST-INSTALL OPTIONS & APPLY</h3>
        <div class="slider-row">
          <span>Run system & manifest diagnostics after install</span>
          <input type="checkbox" id="opt-diag-after" ${runDiagAfterInstall ? 'checked' : ''} />
        </div>
        <div class="slider-row" style="margin-bottom:14px;">
          <span>Open target folder in Explorer after install</span>
          <input type="checkbox" id="opt-open-after" ${openFolderAfterInstall ? 'checked' : ''} />
        </div>
        <button type="button" class="primary-btn" id="install-btn">Apply Setup</button>
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
  installedCompCount: number,
): string {
  if (activeTab === 'wizard') {
    return renderWizard(activeSteps, currentStep, installedCompCount);
  }

  if (activeTab === 'components') {
    return `
      <div class="card banner">
        <h3>COMPONENTS & MFG (${installedCompCount} / 5 ENABLED)</h3>
        <p class="sub">Toggle modules for the active simulator target before applying setup.</p>
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
          <h3>RESTORE ORIGINAL FILES</h3>
          <p class="sub">Remove PrismPulse configuration and optionally keep saved INI presets.</p>
          <div class="action-row">
            <button type="button" class="secondary-btn" id="restore-keep-btn">Restore (Keep Presets)</button>
            <button type="button" class="danger-btn" id="restore-all-btn">Restore (Remove All)</button>
          </div>
        </div>
        <div class="card">
          <h3>SYSTEM & MANIFEST DIAGNOSTICS</h3>
          <p class="sub">Inspect CPU, RAM, GPU, simulator process state, and manifest.json.</p>
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
              <p class="sub" style="margin-top:6px;">Sim Running: ${diagnosticsReport.simRunning ? 'Yes' : 'No'}</p>
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
            ? `${activeSim.isInstalled ? 'Installed' : 'Not Installed'} · Saved Presets: ${activeSim.savedPresets.length}`
            : 'Click Auto-Detect Sim or Browse'
        }</div>
      </div>

      <div class="card">
        <h3>ACTIVE COMPONENTS</h3>
        <div class="metric">${installedCompCount} / 5</div>
        <div class="sub">Preset: ${presetName}</div>
        <div class="action-row">
          <button type="button" class="primary-btn" id="launch-wiz">Setup Wizard</button>
        </div>
      </div>

      <div class="card">
        <h3>DETECTED SIMULATORS</h3>
        <div class="metric">${detectedSims.length}</div>
        <div class="sub">Slots: ${presetSlot1} / ${presetSlot2}</div>
        <div class="action-row">
          <button type="button" class="secondary-btn" id="redetect-btn">Auto-Detect Sim</button>
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
  const installedCompCount = Object.values(components).filter(Boolean).length;

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
          <svg class="brand-logo" width="32" height="32" viewBox="0 0 32 32" fill="none">
            <rect x="2" y="2" width="28" height="28" rx="8" fill="#181d2c" stroke="#22d3ee" stroke-width="2"/>
            <path d="M9 20L16 10L23 20H9Z" stroke="#22d3ee" stroke-width="2" stroke-linejoin="round"/>
          </svg>
          <div>
            <h2>PRISMPULSE</h2>
            <span class="brand-tag">FUSION RUNTIME</span>
          </div>
        </div>

        <nav class="nav-links">
          <button type="button" class="nav-btn ${activeTab === 'setup' ? 'active' : ''}" data-tab="setup">Per-Game Setup</button>
          <button type="button" class="nav-btn ${activeTab === 'components' ? 'active' : ''}" data-tab="components">Components & MFG</button>
          <button type="button" class="nav-btn ${activeTab === 'look' ? 'active' : ''}" data-tab="look">Look Editor & Presets</button>
          <button type="button" class="nav-btn ${activeTab === 'diagnostics' ? 'active' : ''}" data-tab="diagnostics">Diagnostics & Verify</button>
          <button type="button" class="nav-btn ${activeTab === 'wizard' ? 'active' : ''}" data-tab="wizard">Setup Wizard</button>
        </nav>

        <div class="status-box">
          <small>TARGET STATUS</small>
          <div class="${statusClass}">${statusText}</div>
        </div>
      </aside>

      <main class="content">
        <div class="topbar">
          <div>
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
              detectedSims.length > 0
                ? `
                  <select class="sim-select" id="sim-picker">
                    ${detectedSims
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
            <button type="button" class="secondary-btn" id="redetect-top-btn">Auto-Detect Sim</button>
            <button type="button" class="secondary-btn" id="open-top-folder-btn" ${
              activeSim ? '' : 'disabled'
            }>Open Folder</button>
            <button type="button" class="secondary-btn" id="browse-btn">Browse</button>
          </div>
        </div>

        ${
          statusMessage
            ? `<div class="card banner"><strong>${statusMessage}</strong></div>`
            : ''
        }

        ${renderBody(activeSteps, currentStep, installedCompCount)}
      </main>
    </div>
  `;

  bindEvents(root);
}

function bindEvents(root: HTMLElement): void {
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

      if (!customPresets.includes(trimmed)) {
        customPresets = [...customPresets, trimmed];
        PRESET_DEFAULTS[trimmed] = { ...look };
      }
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
          activeSim = saved.updatedState;
        }
      } else {
        statusMessage = `Added preset "${trimmed}" (select a target folder to save .ini to disk).`;
      }
      render();
    });

  root
    .querySelector<HTMLButtonElement>('#save-preset-btn')
    ?.addEventListener('click', async () => {
      PRESET_DEFAULTS[presetName] = { ...look };
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
        activeSim = saved.updatedState;
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
        activeSim = res.updatedState;
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
    ?.addEventListener('change', (e) => {
      const idx = Number((e.target as HTMLSelectElement).value);
      if (detectedSims[idx]) {
        activeSim = detectedSims[idx];
        mergeSavedPresets(activeSim);
        render();
      }
    });

  root.querySelector<HTMLButtonElement>('#browse-btn')?.addEventListener('click', async () => {
    if (!window.prismpulse?.selectTargetFolder) {
      statusMessage = 'Folder picker bridge is unavailable.';
      render();
      return;
    }
    const picked = await window.prismpulse.selectTargetFolder();
    if (picked) {
      activeSim = picked;
      mergeSavedPresets(activeSim);
      statusMessage = `Selected folder: ${picked.path}`;
      render();
    }
  });

  const handleRedetect = async () => {
    if (!window.prismpulse?.autoDetectAllSims) {
      statusMessage = 'Auto-detect bridge is unavailable.';
      render();
      return;
    }
    detectedSims = await window.prismpulse.autoDetectAllSims();
    if (detectedSims.length > 0 && !activeSim) {
      activeSim = detectedSims[0];
      mergeSavedPresets(activeSim);
    }
    statusMessage = `Found ${detectedSims.length} simulator folder(s).`;
    render();
  };

  root.querySelector<HTMLButtonElement>('#redetect-btn')?.addEventListener('click', handleRedetect);
  root
    .querySelector<HTMLButtonElement>('#redetect-top-btn')
    ?.addEventListener('click', handleRedetect);

  root.querySelector<HTMLButtonElement>('#install-btn')?.addEventListener('click', async () => {
    if (!activeSim) {
      statusMessage = 'Select a target folder first.';
      render();
      return;
    }
    if (!window.prismpulse?.installPrismPulse) {
      statusMessage = 'Install bridge is unavailable.';
      render();
      return;
    }

    const res = await window.prismpulse.installPrismPulse(activeSim.path, {
      presetName,
      components,
      look,
    });
    statusMessage = res.message;
    if (res.updatedState) activeSim = res.updatedState;

    if (res.success) {
      if (runDiagAfterInstall && window.prismpulse.runDiagnostics) {
        diagnosticsReport = await window.prismpulse.runDiagnostics(activeSim.path);
      }
      if (openFolderAfterInstall && window.prismpulse.openTargetFolder) {
        await window.prismpulse.openTargetFolder(activeSim.path);
      }
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
      const res = await window.prismpulse.restoreOriginalFiles(activeSim.path, true);
      statusMessage = res.message;
      if (res.updatedState) activeSim = res.updatedState;
      render();
    });

  root
    .querySelector<HTMLButtonElement>('#restore-all-btn')
    ?.addEventListener('click', async () => {
      if (!activeSim || !window.prismpulse?.restoreOriginalFiles) return;
      const res = await window.prismpulse.restoreOriginalFiles(activeSim.path, false);
      statusMessage = res.message;
      if (res.updatedState) activeSim = res.updatedState;
      render();
    });

  root.querySelector<HTMLButtonElement>('#diag-btn')?.addEventListener('click', async () => {
    if (!window.prismpulse?.runDiagnostics) {
      statusMessage = 'Diagnostics bridge is unavailable.';
      render();
      return;
    }
    diagnosticsReport = await window.prismpulse.runDiagnostics(activeSim?.path ?? '');
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
    if (!window.prismpulse?.autoDetectAllSims) {
      statusMessage = 'Preload bridge (window.prismpulse) is not available.';
      render();
      return;
    }
    const found = await window.prismpulse.autoDetectAllSims();
    detectedSims = found;
    if (found.length > 0) {
      activeSim = found[0];
      mergeSavedPresets(activeSim);
    }
  } catch (err: unknown) {
    statusMessage =
      err instanceof Error ? err.message : 'Failed to auto-detect simulators.';
  }
  render();
}

init();
