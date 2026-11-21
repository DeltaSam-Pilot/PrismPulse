import './index.css';
import type {
  ComponentSettings,
  DiagnosticsReport,
  LookSettings,
  SimDirectoryInfo,
} from './preload';

type NavTab = 'wizard' | 'overview' | 'components' | 'look' | 'diagnostics';

interface WizardStepConfig {
  id: 'target' | 'components' | 'look' | 'actions';
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
};

const COMPONENT_META: {
  key: keyof ComponentSettings;
  label: string;
  desc: string;
}[] = [
  { key: 'core', label: 'Core Runtime', desc: 'Base runtime integration' },
  { key: 'optimfg', label: 'Frame Generation', desc: 'Frame generation controls for supported setups' },
  { key: 'effects', label: 'Image Effects & Shaders', desc: 'Post-processing shader pipeline and look presets' },
  { key: 'glassCockpit', label: 'Glass Cockpit Fix', desc: 'Cockpit display clarity fix for supported setups' },
  { key: 'neuralRender', label: 'Neural Rendering', desc: 'Optional neural rendering pass configuration' },
];

let activeTab: NavTab = 'wizard';
let detectedSims: SimDirectoryInfo[] = [];
let activeSim: SimDirectoryInfo | null = null;
let statusMessage = '';
let diagnosticsReport: DiagnosticsReport | null = null;

let showFlowCustomizer = false;
let stepIndex = 0;
let wizardSteps: WizardStepConfig[] = [
  { id: 'target', title: 'Target & Safety', enabled: true },
  { id: 'components', title: 'Components', enabled: true },
  { id: 'look', title: 'Preset & Look', enabled: true },
  { id: 'actions', title: 'Post-Install & Apply', enabled: true },
];

let customPresets: string[] = Object.keys(PRESET_DEFAULTS);
let presetName = 'Natural Daylight';
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

const root = document.querySelector<HTMLDivElement>('#app');

function getActiveSteps(): WizardStepConfig[] {
  const enabled = wizardSteps.filter((s) => s.enabled);
  return enabled.length > 0
    ? enabled
    : [{ id: 'actions', title: 'Post-Install & Apply', enabled: true }];
}

function mergeSavedPresets(sim: SimDirectoryInfo | null): void {
  if (!sim) return;
  for (const file of sim.savedPresets) {
    const cleanName = file.replace(/\.ini$/i, '');
    if (cleanName && !customPresets.includes(cleanName)) {
      customPresets = [...customPresets, cleanName];
    }
  }
}

async function init(): Promise<void> {
  const found = await window.prismpulse.autoDetectAllSims();
  detectedSims = found;
  if (found.length > 0) {
    activeSim = found[0];
    mergeSavedPresets(activeSim);
  }
  render();
}

function render(): void {
  if (!root) return;

  const activeSteps = getActiveSteps();
  if (stepIndex >= activeSteps.length) {
    stepIndex = activeSteps.length - 1;
  }
  const currentStep = activeSteps[stepIndex];
  const installedCompCount = Object.values(components).filter(Boolean).length;

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
            <span class="brand-tag">SHADER & TWEAK SUITE</span>
          </div>
        </div>

        <nav class="nav-links">
          <button class="nav-btn ${activeTab === 'wizard' ? 'active' : ''}" data-tab="wizard">Setup Wizard</button>
          <button class="nav-btn ${activeTab === 'overview' ? 'active' : ''}" data-tab="overview">Overview & Target</button>
          <button class="nav-btn ${activeTab === 'components' ? 'active' : ''}" data-tab="components">Components</button>
          <button class="nav-btn ${activeTab === 'look' ? 'active' : ''}" data-tab="look">Look Editor</button>
          <button class="nav-btn ${activeTab === 'diagnostics' ? 'active' : ''}" data-tab="diagnostics">Restore & Diagnostics</button>
        </nav>

        <div class="status-box">
          <small>TARGET STATUS</small>
          <div class="status-ok">${
            activeSim
              ? activeSim.simRunning
                ? 'Simulator Running'
                : 'Ready to Configure'
              : 'No Folder Selected'
          }</div>
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
            <p class="sub">${activeSim ? activeSim.path : 'Auto-detect a simulator or pick a folder'}</p>
          </div>

          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            ${
              detectedSims.length > 0
                ? `<select class="sim-select" id="sim-picker">
                    ${detectedSims
                      .map(
                        (s, idx) =>
                          `<option value="${idx}" ${activeSim?.path === s.path ? 'selected' : ''}>${s.name}</option>`,
                      )
                      .join('')}
                  </select>`
                : ''
            }
            <button class="secondary-btn" id="browse-btn">Browse Folder</button>
          </div>
        </div>

        ${
          statusMessage
            ? `<div class="card" style="margin-bottom:18px; padding:12px 16px; border-color:#22d3ee;"><strong>${statusMessage}</strong></div>`
            : ''
        }

        ${renderBody(activeSteps, currentStep, installedCompCount)}
      </main>
    </div>
  `;

  bindEvents();
}

function getTabHeading(tab: NavTab): string {
  switch (tab) {
    case 'components':
      return 'Components';
    case 'look':
      return 'Look Editor & Presets';
    case 'diagnostics':
      return 'Restore & System Diagnostics';
    default:
      return 'Simulator Target & Overview';
  }
}

function renderComponentRows(): string {
  return COMPONENT_META.map(
    (item) => `
      <div class="comp-row">
        <div>
          <strong>${item.label}</strong> <span class="badge">${components[item.key] ? 'ENABLED' : 'OFF'}</span>
          <div class="sub">${item.desc}</div>
        </div>
        <button class="${components[item.key] ? 'primary-btn' : 'secondary-btn'}" data-comp="${item.key}">
          ${components[item.key] ? 'Enabled' : 'Enable'}
        </button>
      </div>
    `,
  ).join('');
}

function renderLookEditor(allowNewPreset: boolean): string {
  return `
    <div class="preset-bar">
      ${customPresets
        .map(
          (name) =>
            `<button class="preset-btn ${presetName === name ? 'active' : ''}" data-preset="${name}">${name}</button>`,
        )
        .join('')}
    </div>

    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:12px; flex-wrap:wrap;">
        <h3>ACTIVE LOOK: ${presetName.toUpperCase()}</h3>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          ${
            allowNewPreset
              ? `<input
                  id="new-preset-input"
                  type="text"
                  placeholder="New preset name..."
                  style="background:#0a0d13; color:#f3f4f6; border:1px solid #262e42; border-radius:6px; padding:7px 10px; font-size:13px;"
                />
                <button class="secondary-btn" id="add-preset-btn">+ Add Preset</button>`
              : ''
          }
          <button class="secondary-btn" id="import-preset-btn">Import .INI Preset</button>
          <button class="secondary-btn" id="reset-look-btn">Reset Look Sliders to Preset Default</button>
        </div>
      </div>
      <div class="slider-row">
        <span>CAS Sharpness</span>
        <div>
          <input type="range" id="s-sharp" min="0" max="100" value="${look.sharpness}" />
          <span class="badge" id="v-sharp">${look.sharpness}</span>
        </div>
      </div>
      <div class="slider-row">
        <span>Vibrance Strength</span>
        <div>
          <input type="range" id="s-vib" min="0" max="100" value="${look.vibrance}" />
          <span class="badge" id="v-vib">${look.vibrance}</span>
        </div>
      </div>
      <div class="slider-row">
        <span>Fake HDR Power</span>
        <div>
          <input type="range" id="s-hdr" min="0" max="100" value="${look.hdrPower}" />
          <span class="badge" id="v-hdr">${look.hdrPower}</span>
        </div>
      </div>
      <div class="slider-row">
        <span>Atmospheric Contrast</span>
        <div>
          <input type="range" id="s-con" min="0" max="100" value="${look.contrast}" />
          <span class="badge" id="v-con">${look.contrast}</span>
        </div>
      </div>
      <div class="slider-row" style="border-bottom:none;">
        <span>Neural Render Strength</span>
        <div>
          <input type="range" id="s-neu" min="0" max="100" value="${look.neuralStrength}" />
          <span class="badge" id="v-neu">${look.neuralStrength}</span>
        </div>
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
      <div class="card" style="margin-bottom:16px;">
        <h3>CUSTOMIZE WIZARD STEPS</h3>
        <p class="sub" style="margin-bottom:12px;">Toggle which steps appear in your wizard flow.</p>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          ${wizardSteps
            .map(
              (s) => `
                <button class="${s.enabled ? 'primary-btn' : 'secondary-btn'}" data-toggle-step="${s.id}">
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
    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:16px; flex-wrap:wrap;">
      <div class="preset-bar" style="margin-bottom:0;">
        ${activeSteps
          .map(
            (s, idx) =>
              `<button class="preset-btn ${idx === stepIndex ? 'active' : ''}" data-goto-step="${idx}">${idx + 1}. ${s.title}</button>`,
          )
          .join('')}
      </div>
      <button class="secondary-btn" id="toggle-customize-btn">
        ${showFlowCustomizer ? 'Hide Flow Options' : 'Customize Steps'}
      </button>
    </div>
  `;

  let stepContent = '';

  if (currentStep.id === 'target') {
    stepContent = `
      <div class="card">
        <h3>TARGET SIMULATOR & SAFETY CHECK</h3>
        <div class="metric" style="margin-top:8px;">${activeSim ? activeSim.name : 'No Simulator Selected'}</div>
        <p class="sub" style="margin-top:4px;">${activeSim ? activeSim.path : 'Pick a simulator from the top bar or click Browse Folder.'}</p>
        ${
          activeSim
            ? `<p class="sub" style="margin-top:10px;">
                UserCfg.opt: <strong>${activeSim.hasUserCfg ? 'Detected' : 'Not Detected'}</strong> ·
                Existing Install: <strong>${activeSim.isInstalled ? 'Yes' : 'No'}</strong> ·
                Saved Presets: <strong>${activeSim.savedPresets.length}</strong>
              </p>`
            : ''
        }
        ${
          activeSim?.simRunning
            ? `<p class="sub" style="color:#f87171; margin-top:8px;">Simulator is running — close it before applying changes.</p>`
            : ''
        }
        ${
          activeSim?.hasAntiCheat
            ? `<p class="sub" style="color:#fbbf24; margin-top:8px;">Anti-cheat/protection indicator found in directory.</p>`
            : ''
        }
        <div style="display:flex; gap:10px; margin-top:16px;">
          <button class="secondary-btn" id="redetect-btn">Re-Scan Simulators</button>
          ${activeSim ? `<button class="secondary-btn" id="open-folder-btn">Open Folder</button>` : ''}
        </div>
      </div>
    `;
  } else if (currentStep.id === 'components') {
    stepContent = `
      <div class="card" style="margin-bottom:14px;">
        <h3>COMPONENTS (${installedCompCount} / 5 ENABLED)</h3>
        <p class="sub">Select the modules and fixes to include in your configuration.</p>
      </div>
      ${renderComponentRows()}
    `;
  } else if (currentStep.id === 'look') {
    stepContent = `
      <div class="card" style="margin-bottom:14px;">
        <h3>PRESET & LOOK SETTINGS</h3>
        <p class="sub">Switch presets, create or import .INI presets, or tune sliders.</p>
      </div>
      ${renderLookEditor(true)}
    `;
  } else {
    const enabledNames = COMPONENT_META.filter((c) => components[c.key])
      .map((c) => c.label)
      .join(', ');

    stepContent = `
      <div class="cards-grid" style="margin-bottom:16px;">
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
        <div class="slider-row" style="border-bottom:none; margin-bottom:14px;">
          <span>Open target folder in Explorer after install</span>
          <input type="checkbox" id="opt-open-after" ${openFolderAfterInstall ? 'checked' : ''} />
        </div>
        <button class="primary-btn" id="install-btn">Apply Setup</button>
      </div>
    `;
  }

  const navFooter = `
    <div style="display:flex; justify-content:space-between; margin-top:18px;">
      <button
        class="secondary-btn"
        id="step-prev"
        ${stepIndex === 0 ? 'disabled style="opacity:0.45; cursor:not-allowed;"' : ''}
      >
        ← Back
      </button>
      ${
        stepIndex < activeSteps.length - 1
          ? `<button class="primary-btn" id="step-next">Continue →</button>`
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
    return renderComponentRows();
  }

  if (activeTab === 'look') {
    return renderLookEditor(false);
  }

  if (activeTab === 'diagnostics') {
    return `
      <div class="cards-grid" style="margin-bottom:18px;">
        <div class="card">
          <h3>RESTORE ORIGINAL FILES</h3>
          <p class="sub" style="margin-bottom:14px;">Remove PrismPulse configuration and optionally keep saved INI presets.</p>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button class="secondary-btn" id="restore-keep-btn">Restore (Keep Presets)</button>
            <button class="danger-btn" id="restore-all-btn">Restore (Remove All)</button>
          </div>
        </div>
        <div class="card">
          <h3>SYSTEM & MANIFEST DIAGNOSTICS</h3>
          <p class="sub" style="margin-bottom:14px;">Inspect CPU, RAM, GPU, simulator process state, and manifest.json.</p>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button class="primary-btn" id="diag-btn">Run Diagnostics</button>
            <button class="secondary-btn" id="open-folder-btn">Open Target Folder</button>
          </div>
        </div>
      </div>

      ${
        diagnosticsReport
          ? `<div class="card">
              <h3>DIAGNOSTICS OUTPUT</h3>
              <p class="sub">CPU: ${diagnosticsReport.cpu} · RAM: ${diagnosticsReport.ram} · GPU: ${diagnosticsReport.gpu}</p>
              <p class="sub" style="margin-top:6px;">Sim Running: ${diagnosticsReport.simRunning ? 'Yes' : 'No'}</p>
              <pre class="sub" style="margin-top:10px; white-space:pre-wrap;">${diagnosticsReport.manifestInfo}</pre>
            </div>`
          : ''
      }
    `;
  }

  return `
    <div class="cards-grid">
      <div class="card">
        <h3>SELECTED TARGET</h3>
        <div class="metric">${activeSim ? activeSim.name : 'None'}</div>
        <div class="sub">${
          activeSim
            ? `${activeSim.isInstalled ? 'Installed' : 'Not Installed'} · Saved Presets: ${activeSim.savedPresets.length}`
            : 'Click Browse Folder or Auto-Detect'
        }</div>
      </div>

      <div class="card">
        <h3>ACTIVE COMPONENTS</h3>
        <div class="metric">${installedCompCount} / 5</div>
        <div class="sub">Preset: ${presetName}</div>
        <div style="margin-top:10px;">
          <button class="primary-btn" id="launch-wiz">Open Setup Wizard</button>
        </div>
      </div>

      <div class="card">
        <h3>DETECTED SIMULATORS</h3>
        <div class="metric">${detectedSims.length}</div>
        <div style="margin-top:10px;">
          <button class="secondary-btn" id="redetect-btn">Re-Scan Simulators</button>
        </div>
      </div>
    </div>
  `;
}

function bindEvents(): void {
  if (!root) return;

  root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab as NavTab;
      render();
    });
  });

  root.querySelector<HTMLButtonElement>('#launch-wiz')?.addEventListener('click', () => {
    activeTab = 'wizard';
    stepIndex = 0;
    render();
  });

  root.querySelector<HTMLButtonElement>('#toggle-customize-btn')?.addEventListener('click', () => {
    showFlowCustomizer = !showFlowCustomizer;
    render();
  });

  root.querySelectorAll<HTMLButtonElement>('[data-toggle-step]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.toggleStep as WizardStepConfig['id'];
      wizardSteps = wizardSteps.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s));
      stepIndex = 0;
      render();
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-goto-step]').forEach((btn) => {
    btn.addEventListener('click', () => {
      stepIndex = Number(btn.dataset.gotoStep);
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

  root.querySelector<HTMLButtonElement>('#add-preset-btn')?.addEventListener('click', async () => {
    const input = root.querySelector<HTMLInputElement>('#new-preset-input');
    const trimmed = input?.value.trim() ?? '';
    if (!trimmed) return;

    if (!customPresets.includes(trimmed)) {
      customPresets = [...customPresets, trimmed];
      PRESET_DEFAULTS[trimmed] = { ...look };
    }
    presetName = trimmed;

    if (activeSim) {
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

  root.querySelector<HTMLButtonElement>('#import-preset-btn')?.addEventListener('click', async () => {
    if (!activeSim) {
      statusMessage = 'Select a target simulator folder before importing a preset.';
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

  root.querySelector<HTMLInputElement>('#opt-diag-after')?.addEventListener('change', (e) => {
    runDiagAfterInstall = (e.target as HTMLInputElement).checked;
  });

  root.querySelector<HTMLInputElement>('#opt-open-after')?.addEventListener('change', (e) => {
    openFolderAfterInstall = (e.target as HTMLInputElement).checked;
  });

  root.querySelector<HTMLSelectElement>('#sim-picker')?.addEventListener('change', (e) => {
    const idx = Number((e.target as HTMLSelectElement).value);
    if (detectedSims[idx]) {
      activeSim = detectedSims[idx];
      mergeSavedPresets(activeSim);
      render();
    }
  });

  root.querySelector<HTMLButtonElement>('#browse-btn')?.addEventListener('click', async () => {
    const picked = await window.prismpulse.selectTargetFolder();
    if (picked) {
      activeSim = picked;
      mergeSavedPresets(activeSim);
      statusMessage = `Selected folder: ${picked.path}`;
      render();
    }
  });

  root.querySelector<HTMLButtonElement>('#redetect-btn')?.addEventListener('click', async () => {
    detectedSims = await window.prismpulse.autoDetectAllSims();
    if (detectedSims.length > 0 && !activeSim) {
      activeSim = detectedSims[0];
      mergeSavedPresets(activeSim);
    }
    statusMessage = `Found ${detectedSims.length} simulator folder(s).`;
    render();
  });

  root.querySelector<HTMLButtonElement>('#install-btn')?.addEventListener('click', async () => {
    if (!activeSim) {
      statusMessage = 'Select a target folder first.';
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
      if (runDiagAfterInstall) {
        diagnosticsReport = await window.prismpulse.runDiagnostics(activeSim.path);
      }
      if (openFolderAfterInstall) {
        await window.prismpulse.openTargetFolder(activeSim.path);
      }
    }
    render();
  });

  root.querySelectorAll<HTMLButtonElement>('[data-comp]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.comp as keyof ComponentSettings;
      components = { ...components, [key]: !components[key] };
      render();
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const next = btn.dataset.preset;
      if (!next) return;
      presetName = next;

      if (activeSim) {
        const loaded = await window.prismpulse.loadPresetIni(activeSim.path, next);
        if (loaded.success && loaded.look) {
          look = { ...loaded.look };
          render();
          return;
        }
      }

      if (PRESET_DEFAULTS[next]) {
        look = { ...PRESET_DEFAULTS[next] };
      }
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

  root.querySelector<HTMLButtonElement>('#restore-keep-btn')?.addEventListener('click', async () => {
    if (!activeSim) return;
    const res = await window.prismpulse.restoreOriginalFiles(activeSim.path, true);
    statusMessage = res.message;
    if (res.updatedState) activeSim = res.updatedState;
    render();
  });

  root.querySelector<HTMLButtonElement>('#restore-all-btn')?.addEventListener('click', async () => {
    if (!activeSim) return;
    const res = await window.prismpulse.restoreOriginalFiles(activeSim.path, false);
    statusMessage = res.message;
    if (res.updatedState) activeSim = res.updatedState;
    render();
  });

  root.querySelector<HTMLButtonElement>('#diag-btn')?.addEventListener('click', async () => {
    diagnosticsReport = await window.prismpulse.runDiagnostics(activeSim?.path ?? '');
    render();
  });

  root.querySelector<HTMLButtonElement>('#open-folder-btn')?.addEventListener('click', async () => {
    if (activeSim?.path) {
      await window.prismpulse.openTargetFolder(activeSim.path);
    }
  });
}

init();