import {
  buildPdosExportFilename,
  parseAtomNumberSelection,
  parsePdosUpload,
  pdosResultToCsv,
  summarizePdosRecords,
  sumPdosRecords,
} from '../lib/pdosAnalysis.js';
import { escapeHTML } from '../lib/html.js';

function downloadText(text, filename, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const COLORS = ['#30a8ff', '#ff6b6b', '#38d996', '#ffc857', '#b48cff', '#ff8c42', '#42d4d4', '#f472b6'];
const COLOR_TEMPLATES = Object.freeze({
  scientific: COLORS,
  colorblind: ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#E69F00', '#56B4E9', '#F0E442', '#000000'],
  contrast: ['#0057FF', '#FF2D2D', '#00B86B', '#9C27FF', '#FF8A00', '#00A6A6', '#E6007A', '#6B7B00'],
  warmcool: ['#2166AC', '#B2182B', '#67A9CF', '#EF8A62', '#053061', '#67001F', '#D1E5F0', '#FDDBC7'],
  monochrome: ['#111111', '#3B3B3B', '#626262', '#858585', '#A3A3A3', '#BDBDBD', '#D0D0D0', '#E2E2E2'],
});

export class PdosAnalysisPage {
  constructor(container) {
    this.container = container;
    this.records = [];
    this.uploads = [];
    this.vaspSpeciesMap = null;
    this.vaspStructureAtomCount = null;
    this.failures = [];
    this.result = null;
    this.selectedAtoms = new Set();
    this.selectedSpecies = new Set();
    this.selectionMode = 'all';
    this.selectedOrbitals = new Set();
    this.hiddenChannels = new Set();
    this.channelColors = new Map();
    this.viewRange = null;
    this._plotGeometry = null;
    this.exportBase = 'padarthkhoj_all_atoms_all_orbitals_pdos';
    this.vaspMaterialName = '';
    this.lastExportSelection = null;
    this._resizeObserver = null;
    this.filesExpanded = false;
    this._onTheme = () => this._draw();
  }

  render() {
    this.container.innerHTML = `
      <div class="pdos-layout">
        <aside class="pdos-controls" id="pdos-controls">
          <div class="pdos-heading">
            <div><h2>QE &amp; VASP PDOS Analyzer</h2><p>Sum and visualize atom-, species-, and orbital-resolved DOS</p></div>
            <span class="pdos-private">Local processing</span>
          </div>

          <section class="pdos-card">
            <div class="pdos-section-title"><span>1</span> Upload PDOS files</div>
            <label class="pdos-dropzone" id="pdos-dropzone">
              <input id="pdos-files" type="file" multiple>
              <strong>Drop QE PDOS or VASP files here</strong>
              <small>QE PDOS files · DOSCAR · optional POSCAR/CONTCAR</small>
            </label>
            <div class="pdos-file-summary" id="pdos-file-summary">No files loaded</div>
            <button class="pdos-button secondary hidden" id="pdos-manage-files">☰ View uploaded files</button>
            <div class="pdos-file-list compact-collapsed" id="pdos-file-list"></div>
            <button class="pdos-button subtle hidden" id="pdos-clear">Clear all files</button>
            <label class="pdos-field pdos-vasp-name hidden" id="pdos-vasp-name-wrap"><span>Material name <em>optional</em></span>
              <input id="pdos-vasp-name" type="text" placeholder="e.g. Fe2O3_surface">
              <small>Used in exported CSV and PNG filenames instead of “DOSCAR”.</small>
            </label>
          </section>

          <section class="pdos-card hidden" id="pdos-selection-card">
            <div class="pdos-section-title"><span>2</span> Select contributions</div>
            <label class="pdos-field"><span>Contribution source</span>
              <select id="pdos-selection-mode">
                <option value="all">All detected atoms</option>
                <option value="species">Specific species</option>
                <option value="manual">Type atom numbers</option>
                <option value="detected">Choose detected atoms</option>
              </select>
            </label>
            <div class="pdos-selection-panel hidden" id="pdos-species-panel">
              <div class="pdos-label">Select one or more species</div>
              <div class="pdos-chip-list" id="pdos-species"></div>
            </div>
            <div class="pdos-selection-panel hidden" id="pdos-manual-panel">
              <label class="pdos-field"><span>Atom numbers</span>
                <input id="pdos-manual-atoms" type="text" placeholder="e.g. 1, 4, 7-12">
                <small>Use commas and inclusive ranges. Atom numbering follows the QE PDOS filenames.</small>
              </label>
            </div>
            <div class="pdos-selection-panel hidden" id="pdos-detected-panel">
              <div class="pdos-label">Detected atoms</div>
              <div class="pdos-chip-list" id="pdos-atoms"></div>
              <div class="pdos-inline-actions">
                <button class="pdos-link" data-atom-action="all">Select all</button>
                <button class="pdos-link" data-atom-action="none">Clear</button>
              </div>
            </div>
            <div class="pdos-label">Orbital channels</div>
            <div class="pdos-chip-list" id="pdos-orbitals"></div>
          </section>

          <section class="pdos-card hidden" id="pdos-settings-card">
            <div class="pdos-section-title"><span>3</span> Energy and display</div>
            <label class="pdos-field"><span>Energy reference / Fermi energy (eV)</span>
              <input id="pdos-fermi" type="number" value="0" step="0.01">
              <small>This value is subtracted from every energy point.</small>
            </label>
            <label class="pdos-check"><input id="pdos-negative-spin" type="checkbox" checked> Draw spin-down below zero</label>
            <button class="pdos-button primary" id="pdos-run">Generate PDOS</button>
          </section>

          <section class="pdos-card pdos-cli-card">
            <div class="pdos-section-title"><span>⌘</span> PKDOS command-line tool</div>
            <div class="pdos-cli-badges">
              <span>Quantum ESPRESSO only</span><span>Python 3.10+</span><span>Local / HPC</span>
            </div>
            <p><strong>PKDOS CLI</strong> is the downloadable terminal companion for processing the per-atom and per-wavefunction PDOS files produced by Quantum ESPRESSO <code>projwfc.x</code>.</p>
            <ul>
              <li>Scans QE <code>*.pdos_atm#...(species)_wfc#...(orbital)</code> files.</li>
              <li>Creates <code>pkdos_summary.txt</code> with detected atoms, species and orbitals.</li>
              <li>Sums <code>s</code>, <code>p</code>, <code>d</code> or <code>f</code> contributions for all files, selected atoms or selected species.</li>
              <li>Applies a user-entered Fermi-energy shift and checks compatible energy grids.</li>
              <li>Writes processed tables such as <code>tot_dos_s.csv</code> for plotting elsewhere.</li>
            </ul>
            <div class="pdos-cli-note"><strong>Important:</strong> the downloadable CLI currently supports Quantum ESPRESSO PDOS files only. VASP DOSCAR/POSCAR analysis is available in this browser module, not in PKDOS CLI.</div>
            <a class="pdos-button secondary" href="./downloads/pkdos-cli.zip" download>Download PKDOS CLI</a>
            <div class="pdos-cli-commands">
              <span>Install inside the extracted folder</span>
              <code>python -m pip install .</code>
              <span>Discover QE PDOS files</span>
              <code>pkdos summary</code>
              <span>Start the interactive summation menu</span>
              <code>pkdos sum</code>
            </div>
          </section>
        </aside>

        <div class="pdos-splitter" id="pdos-splitter" title="Drag to resize"><span></span></div>

        <main class="pdos-workspace">
          <div class="pdos-toolbar">
            <div id="pdos-result-title"><strong>PDOS plot</strong><span>Upload files to begin</span></div>
            <div class="pdos-toolbar-actions">
              <label class="pdos-palette-control">Colors
                <select id="pdos-palette" disabled>
                  <option value="scientific">Scientific</option>
                  <option value="colorblind">Colorblind friendly</option>
                  <option value="contrast">High contrast</option>
                  <option value="warmcool">Warm / cool</option>
                  <option value="monochrome">Monochrome</option>
                  <option value="custom" disabled>Custom</option>
                </select>
              </label>
              <button class="pdos-button subtle" id="pdos-reset-view" disabled>Reset view</button>
              <button class="pdos-button subtle" id="pdos-csv" disabled>Download CSV</button>
              <button class="pdos-button subtle" id="pdos-png" disabled>Save PNG</button>
            </div>
          </div>
          <div class="pdos-message" id="pdos-message">
            <div class="pdos-empty-icon">∿</div>
            <h3>Projected density of states</h3>
            <p>Upload Quantum ESPRESSO <code>projwfc.x</code> files or a VASP <code>DOSCAR</code>. Files stay in this browser.</p>
          </div>
          <div class="pdos-plot-wrap hidden" id="pdos-plot-wrap"><canvas id="pdos-canvas"></canvas></div>
          <div class="pdos-legend hidden" id="pdos-legend"></div>
          <section class="pdos-table-card hidden" id="pdos-table-card">
            <div class="pdos-table-heading"><strong>Numerical preview</strong><span id="pdos-table-note"></span></div>
            <div class="pdos-table-wrap"><table id="pdos-table"></table></div>
          </section>
        </main>
      </div>`;

    this._bind();
    this._setupSplitter();
    this._resizeObserver = new ResizeObserver(() => this._draw());
    this._resizeObserver.observe(this.container.querySelector('#pdos-plot-wrap'));
    window.addEventListener('theme-changed', this._onTheme);
  }

  _bind() {
    const input = this.container.querySelector('#pdos-files');
    const dropzone = this.container.querySelector('#pdos-dropzone');
    input.addEventListener('change', event => this._loadFiles([...event.target.files]));
    dropzone.addEventListener('dragover', event => { event.preventDefault(); dropzone.classList.add('dragging'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragging'));
    dropzone.addEventListener('drop', event => {
      event.preventDefault(); dropzone.classList.remove('dragging'); this._loadFiles([...event.dataTransfer.files]);
    });
    this.container.querySelector('#pdos-clear').addEventListener('click', () => this._clear());
    this.container.querySelector('#pdos-manage-files').addEventListener('click', () => { this.filesExpanded=!this.filesExpanded; this._renderLoaded(); });
    this.container.querySelector('#pdos-vasp-name').addEventListener('input', event => {
      this.vaspMaterialName = event.target.value.trim();
      if (this.result && this.lastExportSelection) this._updateExportBase(this.lastExportSelection);
    });
    this.container.querySelector('#pdos-run').addEventListener('click', () => this._analyse());
    this.container.querySelector('#pdos-selection-mode').addEventListener('change', event => {
      this.selectionMode = event.target.value;
      this._updateSelectionPanels();
    });
    this.container.querySelector('#pdos-negative-spin').addEventListener('change', () => this._draw());
    this.container.querySelector('#pdos-palette').addEventListener('change', event => this._applyColorTemplate(event.target.value));
    this.container.querySelector('#pdos-reset-view').addEventListener('click', () => { this.viewRange = null; this._draw(); });
    this.container.querySelector('#pdos-csv').addEventListener('click', () => {
      if (this.result) downloadText(pdosResultToCsv(this.result), `${this.exportBase}.csv`, 'text/csv');
    });
    this.container.querySelector('#pdos-png').addEventListener('click', () => {
      const canvas = this.container.querySelector('#pdos-canvas');
      canvas.toBlob(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob); const a = document.createElement('a');
        a.href = url; a.download = `${this.exportBase}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1500);
      }, 'image/png');
    });
    const canvas = this.container.querySelector('#pdos-canvas');
    canvas.addEventListener('wheel', event => {
      if (!this.result || !this._plotGeometry) return;
      event.preventDefault();
      const { pad, plotW, xMin, xMax } = this._plotGeometry;
      const rect = canvas.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left - pad.l) / plotW));
      const anchor = xMin + fraction * (xMax - xMin);
      const factor = event.deltaY > 0 ? 1.18 : 0.84;
      this.viewRange = { min: anchor - (anchor - xMin) * factor, max: anchor + (xMax - anchor) * factor };
      this._draw();
    }, { passive: false });
    canvas.addEventListener('pointerdown', event => {
      if (!this.result || !this._plotGeometry) return;
      canvas.setPointerCapture(event.pointerId);
      const startX = event.clientX;
      const startRange = { min: this._plotGeometry.xMin, max: this._plotGeometry.xMax };
      const move = moveEvent => {
        const shift = -(moveEvent.clientX - startX) / this._plotGeometry.plotW * (startRange.max - startRange.min);
        this.viewRange = { min: startRange.min + shift, max: startRange.max + shift };
        this._draw();
      };
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerup', () => canvas.removeEventListener('pointermove', move), { once: true });
    });
  }

  async _loadFiles(files) {
    for (const file of files) {
      if (this.uploads.some(upload => upload.filename === file.name)) continue;
      try {
        const parsed = parsePdosUpload(file.name, await file.text());
        if (parsed.companionType === 'vasp-structure') {
          this.vaspSpeciesMap = parsed.speciesByAtom;
          this.vaspStructureAtomCount = parsed.atomCount;
        }
        this.records.push(...parsed.records);
        this.uploads.push({ filename: file.name, sourceCode: parsed.sourceCode, companionType: parsed.companionType || null, recordCount: parsed.records.length, spinMode: parsed.records[0]?.spinMode, fermiEnergy: parsed.fermiEnergy, atomCount: parsed.atomCount, warning: parsed.warning });
        if (Number.isFinite(parsed.fermiEnergy)) this.container.querySelector('#pdos-fermi').value = String(parsed.fermiEnergy);
        this._applyVaspSpeciesMap();
      }
      catch (error) { this.failures.push({ filename: file.name, message: error.message }); }
    }
    this._renderLoaded();
  }

  _renderLoaded() {
    const summaryEl = this.container.querySelector('#pdos-file-summary');
    const list = this.container.querySelector('#pdos-file-list');
    const clear = this.container.querySelector('#pdos-clear');
    const hasAny = this.uploads.length || this.failures.length;
    clear.classList.toggle('hidden', !hasAny);
    const manage=this.container.querySelector('#pdos-manage-files');manage.classList.toggle('hidden',!hasAny);manage.innerHTML=`☰ ${this.filesExpanded?'Hide':'View'} uploaded files <b>${this.uploads.length+this.failures.length}</b>`;list.classList.toggle('compact-collapsed',!this.filesExpanded);
    const hasDoscar = this.uploads.some(upload => upload.sourceCode === 'VASP');
    this.container.querySelector('#pdos-vasp-name-wrap').classList.toggle('hidden', !hasDoscar);
    this.container.querySelector('#pdos-vasp-name').value = this.vaspMaterialName;
    summaryEl.innerHTML = `<strong>${this.uploads.length}</strong> file${this.uploads.length === 1 ? '' : 's'} recognized · ${this.records.length} orbital records${this.failures.length ? ` · <b class="pdos-error-text">${this.failures.length} rejected</b>` : ''}`;
    list.innerHTML = [
      ...this.uploads.map((upload, index) => `<div class="pdos-file ${upload.warning ? 'warn' : 'ok'}"><span>${upload.warning ? '⚠' : '✓'}</span><div><strong>${escapeHTML(upload.filename)}</strong><small>${escapeHTML(upload.sourceCode)}${upload.companionType ? ` · ${upload.atomCount} atoms · species mapping` : ` · ${upload.spinMode} · ${upload.recordCount} orbital records${Number.isFinite(upload.fermiEnergy) ? ` · EF ${upload.fermiEnergy} eV` : ''}`}</small>${upload.warning ? `<small class="pdos-upload-warning">${escapeHTML(upload.warning)}</small>` : ''}</div><button data-remove-upload="${index}" title="Remove">×</button></div>`),
      ...this.failures.map((failure, index) => `<div class="pdos-file bad"><span>!</span><div><strong>${escapeHTML(failure.filename)}</strong><small>${escapeHTML(failure.message)}</small></div><button data-remove-failure="${index}" title="Remove">×</button></div>`),
    ].join('');
    list.querySelectorAll('[data-remove-upload]').forEach(button => button.addEventListener('click', () => {
      const [removed] = this.uploads.splice(Number(button.dataset.removeUpload), 1);
      this.records = this.records.filter(record => record.sourceFilename !== removed.filename);
      if (removed.sourceCode === 'VASP') this.vaspMaterialName = '';
      if (removed.companionType === 'vasp-structure') {
        this.vaspSpeciesMap = null;
        this.vaspStructureAtomCount = null;
      }
      this._applyVaspSpeciesMap();
      this._renderLoaded();
    }));
    list.querySelectorAll('[data-remove-failure]').forEach(button => button.addEventListener('click', () => {
      this.failures.splice(Number(button.dataset.removeFailure), 1); this._renderLoaded();
    }));
    const ready = this.records.length > 0;
    this.container.querySelector('#pdos-selection-card').classList.toggle('hidden', !ready);
    this.container.querySelector('#pdos-settings-card').classList.toggle('hidden', !ready);
    if (ready) this._renderSelectors();
  }

  _renderSelectors() {
    const summary = summarizePdosRecords(this.records);
    const knownSpecies = summary.species.filter(species => species !== 'Unknown');
    const currentAtoms = new Set(summary.atoms.map(atom => atom.atomNumber));
    if (!this.selectedAtoms.size) currentAtoms.forEach(atom => this.selectedAtoms.add(atom));
    this.selectedAtoms = new Set([...this.selectedAtoms].filter(atom => currentAtoms.has(atom)));
    const currentSpecies = new Set(knownSpecies);
    this.selectedSpecies = new Set([...this.selectedSpecies].filter(species => currentSpecies.has(species)));
    if (!this.selectedSpecies.size && knownSpecies.length) this.selectedSpecies.add(knownSpecies[0]);
    if (!this.selectedOrbitals.size) summary.orbitals.forEach(orbital => this.selectedOrbitals.add(orbital));
    this.selectedOrbitals = new Set([...this.selectedOrbitals].filter(orbital => summary.orbitals.includes(orbital)));

    const atoms = this.container.querySelector('#pdos-atoms');
    atoms.innerHTML = summary.atoms.map(atom => `<label class="pdos-chip"><input type="checkbox" value="${atom.atomNumber}" ${this.selectedAtoms.has(atom.atomNumber) ? 'checked' : ''}><span>${atom.atomNumber} · ${escapeHTML(atom.species)}</span></label>`).join('');
    atoms.querySelectorAll('input').forEach(input => input.addEventListener('change', () => {
      if (input.checked) this.selectedAtoms.add(Number(input.value)); else this.selectedAtoms.delete(Number(input.value));
    }));
    this.container.querySelectorAll('[data-atom-action]').forEach(button => button.onclick = () => {
      this.selectedAtoms.clear();
      if (button.dataset.atomAction === 'all') summary.atoms.forEach(atom => this.selectedAtoms.add(atom.atomNumber));
      this._renderSelectors();
    });
    const species = this.container.querySelector('#pdos-species');
    species.innerHTML = knownSpecies.length ? knownSpecies.map(name => `<label class="pdos-chip species"><input type="checkbox" value="${escapeHTML(name)}" ${this.selectedSpecies.has(name) ? 'checked' : ''}><span>${escapeHTML(name)}</span></label>`).join('') : '<small class="pdos-selection-note">Species labels are unavailable in DOSCAR alone. Use atom numbers.</small>';
    species.querySelectorAll('input').forEach(input => input.addEventListener('change', () => {
      if (input.checked) this.selectedSpecies.add(input.value); else this.selectedSpecies.delete(input.value);
    }));
    const orbitals = this.container.querySelector('#pdos-orbitals');
    orbitals.innerHTML = summary.orbitals.map(orbital => `<label class="pdos-chip orbital"><input type="checkbox" value="${orbital}" ${this.selectedOrbitals.has(orbital) ? 'checked' : ''}><span>${orbital}</span></label>`).join('');
    orbitals.querySelectorAll('input').forEach(input => input.addEventListener('change', () => {
      if (input.checked) this.selectedOrbitals.add(input.value); else this.selectedOrbitals.delete(input.value);
    }));
    this.container.querySelector('#pdos-selection-mode').value = this.selectionMode;
    this.container.querySelector('#pdos-selection-mode').querySelector('option[value="species"]').disabled = !knownSpecies.length;
    if (this.selectionMode === 'species' && !knownSpecies.length) {
      this.selectionMode = 'manual';
      this.container.querySelector('#pdos-selection-mode').value = 'manual';
    }
    this._updateSelectionPanels();
  }

  _applyVaspSpeciesMap() {
    const vaspRecords = this.records.filter(record => record.sourceCode === 'VASP');
    const doscarUpload = this.uploads.find(upload => upload.sourceCode === 'VASP');
    const structureUpload = this.uploads.find(upload => upload.companionType === 'vasp-structure');
    if (!vaspRecords.length) return;
    const ionCount = new Set(vaspRecords.map(record => record.atomNumber)).size;
    if (!this.vaspSpeciesMap) {
      vaspRecords.forEach(record => { record.species = 'Unknown'; });
      if (doscarUpload) doscarUpload.warning = 'For species contributions, also upload the matching POSCAR or CONTCAR. Atom-number selection is available now.';
      return;
    }
    if (this.vaspStructureAtomCount !== ionCount) {
      vaspRecords.forEach(record => { record.species = 'Unknown'; });
      const warning = `Structure contains ${this.vaspStructureAtomCount} atoms but DOSCAR contains ${ionCount} ions; species mapping was not applied.`;
      if (doscarUpload) doscarUpload.warning = warning;
      if (structureUpload) structureUpload.warning = warning;
      return;
    }
    vaspRecords.forEach(record => { record.species = this.vaspSpeciesMap.get(record.atomNumber) || 'Unknown'; });
    if (doscarUpload) doscarUpload.warning = null;
    if (structureUpload) structureUpload.warning = null;
  }

  _updateSelectionPanels() {
    this.container.querySelector('#pdos-species-panel').classList.toggle('hidden', this.selectionMode !== 'species');
    this.container.querySelector('#pdos-manual-panel').classList.toggle('hidden', this.selectionMode !== 'manual');
    this.container.querySelector('#pdos-detected-panel').classList.toggle('hidden', this.selectionMode !== 'detected');
  }

  _resolveSelectedAtoms() {
    const available = new Set(this.records.map(record => record.atomNumber));
    if (this.selectionMode === 'all') return available;
    if (this.selectionMode === 'species') {
      if (!this.selectedSpecies.size) throw new Error('Select at least one species');
      return new Set(this.records.filter(record => this.selectedSpecies.has(record.species)).map(record => record.atomNumber));
    }
    if (this.selectionMode === 'manual') {
      const requested = parseAtomNumberSelection(this.container.querySelector('#pdos-manual-atoms').value);
      const missing = requested.filter(number => !available.has(number));
      if (missing.length) throw new Error(`Atom numbers not found in uploaded PDOS files: ${missing.join(', ')}`);
      return new Set(requested);
    }
    if (!this.selectedAtoms.size) throw new Error('Select at least one atom');
    return new Set(this.selectedAtoms);
  }

  _analyse() {
    try {
      const selectedAtoms = this._resolveSelectedAtoms();
      if (!this.selectedOrbitals.size) throw new Error('Select at least one orbital');
      const selected = this.records.filter(record => selectedAtoms.has(record.atomNumber) && this.selectedOrbitals.has(record.orbital));
      const fermiEnergy = Number(this.container.querySelector('#pdos-fermi').value);
      if (!Number.isFinite(fermiEnergy)) throw new Error('Enter a valid energy reference');
      this.result = sumPdosRecords(selected, { fermiEnergy });
      this.lastExportSelection = { selectedAtoms: [...selectedAtoms].sort((a, b) => a - b) };
      this._updateExportBase(this.lastExportSelection);
      this.viewRange = null;
      this.hiddenChannels.clear();
      Object.keys(this.result.channels).forEach((name, index) => {
        if (!this.channelColors.has(name)) this.channelColors.set(name, COLORS[index % COLORS.length]);
      });
      this._showResult(selected, fermiEnergy);
    } catch (error) { this._showError(error.message); }
  }

  _showError(message) {
    const panel = this.container.querySelector('#pdos-message');
    panel.classList.remove('hidden'); panel.classList.add('error');
    panel.innerHTML = `<div class="pdos-empty-icon">!</div><h3>Cannot generate PDOS</h3><p>${escapeHTML(message)}</p>`;
  }

  _updateExportBase({ selectedAtoms }) {
    const sourceFilenames = this.uploads.filter(upload => !upload.companionType).map(upload =>
      upload.sourceCode === 'VASP' && this.vaspMaterialName ? this.vaspMaterialName : upload.filename);
    this.exportBase = buildPdosExportFilename({
      sourceFilenames,
      selectionMode: this.selectionMode,
      atomNumbers: selectedAtoms,
      species: [...this.selectedSpecies].sort(),
      orbitals: [...this.selectedOrbitals].sort(),
    }).replace(/\.csv$/, '');
    const csvButton = this.container.querySelector('#pdos-csv');
    if (csvButton) csvButton.title = `Download ${this.exportBase}.csv`;
  }

  _showResult(selected, fermiEnergy) {
    this.container.querySelector('#pdos-message').classList.add('hidden');
    this.container.querySelector('#pdos-message').classList.remove('error');
    this.container.querySelector('#pdos-plot-wrap').classList.remove('hidden');
    this.container.querySelector('#pdos-legend').classList.remove('hidden');
    this.container.querySelector('#pdos-table-card').classList.remove('hidden');
    ['#pdos-reset-view', '#pdos-csv', '#pdos-png', '#pdos-palette'].forEach(selector => { this.container.querySelector(selector).disabled = false; });
    const title = this.container.querySelector('#pdos-result-title');
    title.innerHTML = `<strong>Summed PDOS</strong><span>${selected.length} files · ${this.result.pointCount || this.result.energy.length} points · E<sub>ref</sub> = ${fermiEnergy} eV</span>`;
    this._renderLegend(); this._renderTable(); this._draw();
  }

  _renderLegend() {
    const names = Object.keys(this.result.channels);
    const legend = this.container.querySelector('#pdos-legend');
    legend.innerHTML = names.map((name, i) => {
      const color = this.channelColors.get(name) || COLORS[i % COLORS.length];
      return `<span class="pdos-legend-item ${this.hiddenChannels.has(name) ? 'muted' : ''}">
        <input type="color" data-channel-color="${escapeHTML(name)}" value="${color}" title="Change ${escapeHTML(name)} line color">
        <button data-channel="${escapeHTML(name)}" title="Show or hide ${escapeHTML(name)}">${escapeHTML(name)}</button>
      </span>`;
    }).join('');
    legend.querySelectorAll('[data-channel]').forEach(button => button.addEventListener('click', () => {
      const name = button.dataset.channel;
      if (this.hiddenChannels.has(name)) this.hiddenChannels.delete(name); else this.hiddenChannels.add(name);
      this._renderLegend(); this._draw();
    }));
    legend.querySelectorAll('[data-channel-color]').forEach(input => input.addEventListener('input', () => {
      this.channelColors.set(input.dataset.channelColor, input.value);
      const palette = this.container.querySelector('#pdos-palette');
      palette.querySelector('option[value="custom"]').disabled = false;
      palette.value = 'custom';
      this._draw();
    }));
  }

  _applyColorTemplate(templateName) {
    const colors = COLOR_TEMPLATES[templateName];
    if (!colors || !this.result) return;
    Object.keys(this.result.channels).forEach((name, index) => this.channelColors.set(name, colors[index % colors.length]));
    this._renderLegend();
    this._draw();
  }

  _renderTable() {
    const names = Object.keys(this.result.channels);
    const count = Math.min(20, this.result.energy.length);
    const rows = [];
    for (let i = 0; i < count; i += 1) rows.push(`<tr><td>${this.result.energy[i].toFixed(6)}</td>${names.map(name => `<td>${this.result.channels[name][i].toExponential(5)}</td>`).join('')}</tr>`);
    this.container.querySelector('#pdos-table').innerHTML = `<thead><tr><th>Energy (eV)</th>${names.map(name => `<th>${escapeHTML(name)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody>`;
    this.container.querySelector('#pdos-table-note').textContent = `First ${count} of ${this.result.energy.length} rows`;
  }

  _draw() {
    if (!this.result) return;
    const canvas = this.container.querySelector('#pdos-canvas');
    const wrap = this.container.querySelector('#pdos-plot-wrap');
    if (!canvas || !wrap || wrap.classList.contains('hidden')) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(360, wrap.clientWidth); const height = Math.max(360, wrap.clientHeight);
    canvas.width = width * dpr; canvas.height = height * dpr; canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
    const light = document.documentElement.classList.contains('light-mode');
    const bg = light ? '#ffffff' : '#080d15'; const fg = light ? '#172231' : '#d9e4f0'; const grid = light ? '#dce5ed' : '#243243';
    ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
    const pad = { l: 68, r: 26, t: 24, b: 56 }; const plotW = width - pad.l - pad.r; const plotH = height - pad.t - pad.b;
    const xs = this.result.energy; const allNames = Object.keys(this.result.channels);
    const names = allNames.filter(name => !this.hiddenChannels.has(name));
    const negativeDown = this.container.querySelector('#pdos-negative-spin').checked && this.result.spinMode === 'spin';
    const plotted = names.map(name => this.result.channels[name].map(v => negativeDown && name.endsWith('_down') ? -v : v));
    let xMin = this.viewRange?.min ?? Math.min(...xs); let xMax = this.viewRange?.max ?? Math.max(...xs); if (xMin === xMax) { xMin -= 1; xMax += 1; }
    const visibleIndices = xs.map((x, index) => ({ x, index })).filter(item => item.x >= xMin && item.x <= xMax).map(item => item.index);
    const allY = plotted.flatMap(values => visibleIndices.map(index => values[index]));
    let yMin = Math.min(0, ...allY); let yMax = Math.max(0, ...allY);
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMin === yMax) { yMin = 0; yMax = 1; }
    const yPad = (yMax - yMin) * 0.08; yMin -= yPad; yMax += yPad;
    const px = x => pad.l + (x - xMin) / (xMax - xMin) * plotW;
    const py = y => pad.t + (yMax - y) / (yMax - yMin) * plotH;
    this._plotGeometry = { pad, plotW, xMin, xMax };
    ctx.font = '12px JetBrains Mono, monospace'; ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i += 1) {
      const x = pad.l + plotW * i / 5; const value = xMin + (xMax - xMin) * i / 5;
      ctx.strokeStyle = grid; ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + plotH); ctx.stroke();
      ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.fillText(value.toFixed(2), x, pad.t + plotH + 22);
      const y = pad.t + plotH * i / 5; const yValue = yMax - (yMax - yMin) * i / 5;
      ctx.strokeStyle = grid; ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + plotW, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(yValue.toPrecision(3), pad.l - 9, y + 4);
    }
    if (xMin <= 0 && xMax >= 0) { ctx.strokeStyle = '#ffb020'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px(0), pad.t); ctx.lineTo(px(0), pad.t + plotH); ctx.stroke(); }
    if (yMin < 0) { ctx.strokeStyle = light ? '#6b7785' : '#8290a0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pad.l, py(0)); ctx.lineTo(pad.l + plotW, py(0)); ctx.stroke(); }
    plotted.forEach((values, curveIndex) => {
      const channelName = names[curveIndex];
      ctx.strokeStyle = this.channelColors.get(channelName) || COLORS[allNames.indexOf(channelName) % COLORS.length]; ctx.lineWidth = 2; ctx.beginPath(); let started = false;
      values.forEach((value, index) => {
        if (xs[index] < xMin || xs[index] > xMax) return;
        const x = px(xs[index]); const y = py(value);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }); ctx.stroke();
    });
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.font = '13px Inter, sans-serif'; ctx.fillText('Energy − reference (eV)', pad.l + plotW / 2, height - 14);
    ctx.save(); ctx.translate(17, pad.t + plotH / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('Projected density of states', 0, 0); ctx.restore();
  }

  _setupSplitter() {
    const splitter = this.container.querySelector('#pdos-splitter'); const controls = this.container.querySelector('#pdos-controls'); const layout = this.container.querySelector('.pdos-layout');
    splitter.addEventListener('pointerdown', event => {
      splitter.setPointerCapture(event.pointerId); document.body.classList.add('pdos-resizing');
      const move = moveEvent => { const rect = layout.getBoundingClientRect(); controls.style.width = `${Math.max(310, Math.min(rect.width * .55, moveEvent.clientX - rect.left))}px`; };
      const up = () => { splitter.removeEventListener('pointermove', move); document.body.classList.remove('pdos-resizing'); };
      splitter.addEventListener('pointermove', move); splitter.addEventListener('pointerup', up, { once: true });
    });
  }

  _clear() {
    this.filesExpanded = false;
    this.records = []; this.uploads = []; this.failures = []; this.vaspSpeciesMap = null; this.vaspStructureAtomCount = null; this.vaspMaterialName = ''; this.lastExportSelection = null; this.result = null; this.selectedAtoms.clear(); this.selectedSpecies.clear(); this.selectedOrbitals.clear(); this.hiddenChannels.clear(); this.channelColors.clear(); this.viewRange = null; this.selectionMode = 'all';
    this.container.querySelector('#pdos-palette').value = 'scientific';
    this.container.querySelector('#pdos-palette').disabled = true;
    this.container.querySelector('#pdos-files').value = '';
    this.container.querySelector('#pdos-plot-wrap').classList.add('hidden'); this.container.querySelector('#pdos-legend').classList.add('hidden'); this.container.querySelector('#pdos-table-card').classList.add('hidden');
    const message = this.container.querySelector('#pdos-message'); message.classList.remove('hidden', 'error'); message.innerHTML = '<div class="pdos-empty-icon">∿</div><h3>Projected density of states</h3><p>Upload Quantum ESPRESSO <code>projwfc.x</code> files or a VASP <code>DOSCAR</code>. Files stay in this browser.</p>';
    this._renderLoaded();
  }

  destroy() { this._resizeObserver?.disconnect(); window.removeEventListener('theme-changed', this._onTheme); }
}
