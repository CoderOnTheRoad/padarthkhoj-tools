import { CifEditorPage } from './pages/CifEditor.js';
import { InputEditorPage } from './pages/InputEditor.js';
import { OutputProcessorPage } from './pages/OutputProcessor.js';
import { VisMultiCifGeneratorPage } from './pages/VisMultiCifGenerator.js';
import { IntermediateMakerPage } from './pages/IntermediateMaker.js';
import { BaderChargeAnalysisPage } from './pages/BaderChargeAnalysis.js';
import { FreeEnergyPlotterPage } from './pages/FreeEnergyPlotter.js';
import { ProtocolSelectorPage } from './pages/ProtocolSelector.js';
import { CustomPathwayBuilderPage } from './pages/CustomPathwayBuilder.js';
import { PdosAnalysisPage } from './pages/PdosAnalysis.js';
import { ScientificDosPlotterPage } from './pages/ScientificDosPlotter.js';
import { OrbitalMetricsCalculatorPage } from './pages/OrbitalMetricsCalculator.js';
import { ZpeTsCalculatorPage } from './pages/ZpeTsCalculator.js';
import { DeveloperProfilePage } from './pages/DeveloperProfile.js';

// ─── Global App State ─────────────────────────────────────────────────────────
const appState = {
  cifData: null,
  cifFilename: null,
  selectedAtom: -1,
  pendingProtocol: null,
  generatedInput: null,   // { text, filename } — passed from CIF Editor to Input Editor
  generatedInputs: null,  // DOS workflow: four coordinated editor files
};

// ─── Page Registry ────────────────────────────────────────────────────────────
const PAGE_CONFIG = {
  'cif-editor': {
    title: 'Structure-to-QE Studio',
    mode: 'CIF',
    modeClass: 'mode-cif',
    Factory: CifEditorPage,
  },
  'input-editor': {
    title: 'QE Input Studio',
    mode: '.in',
    modeClass: 'mode-in',
    Factory: InputEditorPage,
  },
  'output-processor': {
    title: 'QE Output Studio',
    mode: 'OUT',
    modeClass: 'mode-out',
    Factory: OutputProcessorPage,
  },
  'vis-multi-cif-generator': {
    title: 'Crystal Variant Generator',
    mode: 'VIS',
    modeClass: 'mode-vis',
    Factory: VisMultiCifGeneratorPage,
  },
  'intermediate-maker': {
    title: 'Preset Reaction Pathways',
    mode: 'INT',
    modeClass: 'mode-cif',
    Factory: IntermediateMakerPage,
  },
  'custom-pathway-builder': {
    title: 'Custom Pathway Designer',
    mode: 'CPB',
    modeClass: 'mode-cif',
    Factory: CustomPathwayBuilderPage,
  },
  'bader-charge-analysis': {
    title: 'Bader Charge Studio',
    mode: 'ACF',
    modeClass: 'mode-out',
    Factory: BaderChargeAnalysisPage,
  },
  'free-energy-plotter': {
    title: 'Free Energy Diagram Studio',
    mode: 'PLT',
    modeClass: 'mode-plt',
    Factory: FreeEnergyPlotterPage,
  },
  'pdos-analysis': {
    title: 'QE & VASP PDOS Analyzer',
    mode: 'PDOS',
    modeClass: 'mode-plt',
    Factory: PdosAnalysisPage,
  },
  'scientific-dos-plotter': {
    title: 'DOS Plotter',
    mode: 'FIG',
    modeClass: 'mode-plt',
    Factory: ScientificDosPlotterPage,
  },
  'orbital-metrics-calculator': {
    title: 'Orbital Metrics Calculator',
    mode: 'MET',
    modeClass: 'mode-plt',
    Factory: OrbitalMetricsCalculatorPage,
  },
  'zpe-ts-calculator': {
    title: 'ZPE & TS Calculator',
    mode: 'VIB',
    modeClass: 'mode-plt',
    Factory: ZpeTsCalculatorPage,
  },
  'developer-profile': {
    title: 'Developer',
    mode: 'DEV',
    modeClass: 'mode-cif',
    Factory: DeveloperProfilePage,
  },
  'protocol-selector': {
    title: 'Select Protocol',
    mode: 'PRT',
    modeClass: 'mode-cif',
    Factory: ProtocolSelectorPage,
  },
};

// ─── Router ───────────────────────────────────────────────────────────────────
let currentPage = null;

function navigate(pageId) {
  if (!PAGE_CONFIG[pageId]) return;
  const config = PAGE_CONFIG[pageId];
  const content = document.getElementById('page-content');

  // Destroy previous page
  if (currentPage && currentPage.destroy) currentPage.destroy();
  content.innerHTML = '';

  // Update sidebar active state
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === pageId);
  });

  // Update topbar
  document.getElementById('topbar-page-title').textContent = config.title;
  if (pageId !== 'cif-editor') {
    // Reset action button for non-CIF pages
    document.getElementById('topbar-action-btn').style.display = 'none';
    document.getElementById('topbar-mode').style.display = 'none';
    document.getElementById('topbar-breadcrumb').textContent = pageId === 'input-editor'
      ? (appState.generatedInput ? appState.generatedInput.filename : 'No file open')
      : 'Select a file and operation';
  }

  // Instantiate and render the page
  const page = new config.Factory(content, appState, navigate);
  currentPage = page;
  page.render();

  // Add fade-in
  content.classList.remove('fade-in');
  void content.offsetWidth; // reflow
  content.classList.add('fade-in');
}

// ─── Global Modal Events ──────────────────────────────────────────────────────
function setupGlobalModals() {
  document.getElementById('btn-proto-cancel').addEventListener('click', () => {
    document.getElementById('proto-modal').classList.remove('open');
  });

  document.getElementById('btn-elem-cancel').addEventListener('click', () => {
    document.getElementById('change-elem-modal').classList.remove('open');
  });

  // Close modals on overlay click
  ['proto-modal', 'change-elem-modal'].forEach(id => {
    document.getElementById(id).addEventListener('click', e => {
      if (e.target.id === id) document.getElementById(id).classList.remove('open');
    });
  });
}

// ─── Global Statusbar ─────────────────────────────────────────────────────────
function setupStatusbar() {
  const bar = document.createElement('div');
  bar.className = 'global-statusbar';
  bar.innerHTML = `
    <span class="status-item ok">
      <span class="status-dot ok"></span>QE Studio Ready
    </span>
    <span class="status-item" id="global-status">Quantum ESPRESSO Workflow Tool — v1.0.0</span>
  `;
  document.querySelector('.main-area').appendChild(bar);
}

// ─── Sidebar Navigation ───────────────────────────────────────────────────────
function setupSidebar() {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      navigate(el.dataset.page);
    });
  });
  document.getElementById('developer-top-button')?.addEventListener('click', () => navigate('developer-profile'));
}

// ─── Theme Management ──────────────────────────────────────────────────────────
function setupTheme() {
  const toggleBtn = document.getElementById('theme-toggle');
  const icon = toggleBtn.querySelector('.moon-icon');
  const styleBtn = document.getElementById('style-toggle');
  const styleIcon = styleBtn.querySelector('.style-icon');
  const textSizeBtn = document.getElementById('text-size-toggle');
  const textSizeIcon = textSizeBtn.querySelector('.text-size-icon');
  const textSizes = ['compact', 'standard', 'large', 'adaptive'];
  
  // Load preference
  const isLight = localStorage.getItem('qe-theme-light') === 'true';
  if (isLight) {
    document.documentElement.classList.add('light-mode');
    icon.textContent = '☀️';
  }
  const isNotebook = localStorage.getItem('padarthkhoj-style') === 'notebook';
  document.documentElement.classList.toggle('notebook-theme', isNotebook);
  styleBtn.setAttribute('aria-pressed', String(isNotebook));
  styleBtn.title = isNotebook ? 'Switch back to Classic style' : 'Switch to Scientific Notebook style';
  styleIcon.textContent = isNotebook ? '🖥' : '📖';

  styleBtn.addEventListener('click', () => {
    const enabled = document.documentElement.classList.toggle('notebook-theme');
    localStorage.setItem('padarthkhoj-style', enabled ? 'notebook' : 'classic');
    styleBtn.setAttribute('aria-pressed', String(enabled));
    styleBtn.title = enabled ? 'Switch back to Classic style' : 'Switch to Scientific Notebook style';
    styleIcon.textContent = enabled ? '🖥' : '📖';
    window.dispatchEvent(new CustomEvent('style-changed', { detail: { style: enabled ? 'notebook' : 'classic' } }));
  });

  const applyTextSize = value => {
    const size = textSizes.includes(value) ? value : 'standard';
    textSizes.forEach(item => document.documentElement.classList.toggle(`text-${item}`, item === size));
    const labels = { compact:'Compact', standard:'Standard', large:'Large', adaptive:'Adaptive' };
    const icons = { compact:'A⁻', standard:'A', large:'A⁺', adaptive:'A↔' };
    textSizeBtn.title = `Text size: ${labels[size]} · click to change`;
    textSizeBtn.setAttribute('aria-label', `Interface text size is ${labels[size]}. Click to change.`);
    textSizeIcon.textContent = icons[size];
    return size;
  };
  let textSize = applyTextSize(localStorage.getItem('padarthkhoj-text-size') || 'standard');
  textSizeBtn.addEventListener('click', () => {
    textSize = applyTextSize(textSizes[(textSizes.indexOf(textSize) + 1) % textSizes.length]);
    localStorage.setItem('padarthkhoj-text-size', textSize);
    window.dispatchEvent(new CustomEvent('text-size-changed', { detail: { size: textSize } }));
  });
  
  toggleBtn.addEventListener('click', () => {
    const isNowLight = document.documentElement.classList.toggle('light-mode');
    localStorage.setItem('qe-theme-light', isNowLight);
    icon.textContent = isNowLight ? '☀️' : '🌙';
    
    // Dispatch event so active components (like ThreeViewer) can update
    window.dispatchEvent(new CustomEvent('theme-changed', { detail: { isLight: isNowLight } }));
  });
}

function setupComfort() {
  const root=document.documentElement,backdrop=document.getElementById('comfort-backdrop');
  const typePresets={current:{page:17,panel:14,section:11,label:10,input:10,button:10,helper:9,table:10,filename:10,badge:9,editor:13,toolbar:10},standard:{page:20,panel:16,section:13,label:12,input:13,button:13,helper:11,table:12,filename:12,badge:10,editor:14,toolbar:11},comfortable:{page:22,panel:18,section:14,label:13,input:14,button:14,helper:12,table:13,filename:13,badge:11,editor:15,toolbar:12},presentation:{page:24,panel:20,section:16,label:14,input:16,button:16,helper:13,table:15,filename:15,badge:12,editor:17,toolbar:14},accessibility:{page:26,panel:22,section:18,label:16,input:18,button:18,helper:15,table:17,filename:17,badge:14,editor:19,toolbar:16}};
  const defaults={density:'standard',uploadtext:'standard',sidebar:'full',accent:'mineral',contrast:'standard',motion:'reduced',guidance:'standard',mono:'code',numbers:'tabular',sticky:true,typography:{enabled:false,preset:'current',sizes:{...typePresets.current}}};
  let saved;try{saved=JSON.parse(localStorage.getItem('padarthkhoj-comfort')||'{}');}catch{saved={};}let prefs={...defaults,...saved,typography:{...defaults.typography,...saved.typography,sizes:{...defaults.typography.sizes,...saved.typography?.sizes}}};
  const groups={density:['comfortable','standard','compact','dense'],uploadtext:['small','standard','large','adaptive'],sidebar:['full','compact','hidden'],accent:['mineral','teal','copper','indigo','burgundy','graphite'],contrast:['soft','standard','high'],motion:['full','reduced','none'],guidance:['beginner','standard','expert'],mono:['code','data','technical'],numbers:['standard','tabular','emphasized']};
  const apply=()=>{Object.entries(groups).forEach(([key,values])=>values.forEach(value=>root.classList.toggle(`${key}-${value}`,prefs[key]===value)));root.classList.toggle('sticky-actions',Boolean(prefs.sticky));root.classList.toggle('custom-typography',Boolean(prefs.typography.enabled));Object.entries(prefs.typography.sizes).forEach(([key,value])=>root.style.setProperty(`--type-${key}`,`${value}px`));localStorage.setItem('padarthkhoj-comfort',JSON.stringify(prefs));backdrop.querySelectorAll('[data-comfort]').forEach(control=>{const key=control.dataset.comfort;if(control.type==='checkbox')control.checked=Boolean(prefs[key]);else control.value=prefs[key];});backdrop.querySelector('#typography-enabled').checked=Boolean(prefs.typography.enabled);backdrop.querySelector('#typography-preset').value=prefs.typography.preset;backdrop.querySelectorAll('[data-type-size]').forEach(input=>input.value=prefs.typography.sizes[input.dataset.typeSize]);};
  const open=()=>{apply();backdrop.hidden=false;backdrop.querySelector('select,button')?.focus();};
  const close=()=>{backdrop.hidden=true;};
  document.getElementById('comfort-toggle').addEventListener('click',open);document.getElementById('comfort-float').addEventListener('click',open);document.getElementById('comfort-close').addEventListener('click',close);document.getElementById('comfort-done').addEventListener('click',close);backdrop.addEventListener('click',event=>{if(event.target===backdrop)close();});
  backdrop.querySelectorAll('[data-comfort]').forEach(control=>control.addEventListener('change',()=>{prefs[control.dataset.comfort]=control.type==='checkbox'?control.checked:control.value;apply();}));
  document.getElementById('comfort-reset').addEventListener('click',()=>{prefs={...defaults,typography:{...defaults.typography,sizes:{...typePresets.current}}};root.classList.remove('focus-mode');apply();});
  backdrop.querySelector('#typography-enabled').addEventListener('change',event=>{prefs.typography.enabled=event.target.checked;apply();});
  backdrop.querySelector('#typography-preset').addEventListener('change',event=>{const preset=event.target.value;prefs.typography.preset=preset;if(typePresets[preset])prefs.typography.sizes={...typePresets[preset]};apply();});
  backdrop.querySelectorAll('[data-type-size]').forEach(input=>input.addEventListener('input',()=>{const key=input.dataset.typeSize,value=Math.max(Number(input.min),Math.min(Number(input.max),Number(input.value)||Number(input.min)));prefs.typography.enabled=true;prefs.typography.preset='custom';prefs.typography.sizes[key]=value;apply();}));
  backdrop.querySelector('#typography-reset').addEventListener('click',()=>{prefs.typography={enabled:false,preset:'current',sizes:{...typePresets.current}};apply();});
  const focusButton=document.getElementById('comfort-focus');const syncFocus=()=>{focusButton.textContent=root.classList.contains('focus-mode')?'Exit focus mode':'Enter focus mode';};focusButton.addEventListener('click',()=>{root.classList.toggle('focus-mode');syncFocus();close();});
  window.addEventListener('keydown',event=>{if(event.key==='Escape'){if(!backdrop.hidden)close();else if(root.classList.contains('focus-mode')){root.classList.remove('focus-mode');syncFocus();}}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='b'){event.preventDefault();prefs.sidebar=prefs.sidebar==='hidden'?'full':'hidden';apply();}});
  apply();syncFocus();
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function init() {
  setupTheme();
  setupComfort();
  setupGlobalModals();
  setupStatusbar();
  setupSidebar();
  navigate('cif-editor');  // default page
}

init();
