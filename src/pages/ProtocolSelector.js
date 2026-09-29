import { PROTOCOLS, IBRAV_OPTIONS, generateBaderWorkflow, generateBandsWorkflow, generateChargeWorkflow, generateDOSWorkflow, generatePWWorkflow, generateQEInput, generateVibrationalWorkflow } from '../lib/qeGenerator.js';
import { getIbravLabel } from '../lib/cifSymmetry.js';

export class ProtocolSelectorPage {
  constructor(container, appState, onNavigate) {
    this.container = container;
    this.appState  = appState;
    this.onNavigate = onNavigate;
    this._pendingProto = null;
    this._ibravOverride = null;  // null = use auto-detected
  }

  render() {
    const sym = this.appState.cifData?.symmetry;

    this.container.innerHTML = `
      <div class="h-full flex flex-col p-6 max-w-5xl mx-auto overflow-y-auto w-full fade-in" style="gap:24px;">

        <!-- Detected Symmetry Banner -->
        ${sym ? this._renderSymBanner(sym) : ''}

        <!-- Title -->
        <div style="text-align: center;">
          <h2 style="font-size: 1.5rem; font-weight: 600; color: var(--text); margin-bottom: 8px;">Select a Calculation Protocol</h2>
          <p style="color: var(--text-dim); font-size: 0.9rem;">Choose the type of Quantum ESPRESSO calculation to set up for your structure.</p>
        </div>

        <!-- Protocol Grid -->
        <div class="protocols-grid" id="ps-grid"></div>

        <!-- ibrav Override Panel (shown after protocol selected) -->
        <div id="ibrav-panel" style="display:none; background:var(--bg-panel); border:1px solid var(--border); border-radius:12px; padding:24px; margin-top:8px;">
          <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
            <div style="font-size:1.2rem;">⚙️</div>
            <div>
              <div style="font-weight:700; font-size:0.95rem; color:var(--text);">ibrav — Bravais Lattice Index</div>
              <div style="font-size:0.75rem; color:var(--text-dim);">Auto-detected from space group. You can override before generating the input file.</div>
            </div>
          </div>

          <div style="display:flex; gap:16px; align-items:flex-start; flex-wrap:wrap;">
            <!-- Auto-detected info -->
            <div style="flex:1; min-width:220px; background:var(--bg-deep); border-radius:8px; padding:14px; border:1px solid var(--border);">
              <div style="font-size:0.7rem; text-transform:uppercase; letter-spacing:0.08em; color:var(--accent); margin-bottom:8px;">Auto-Detected</div>
              <div id="ibrav-auto-label" style="font-family:var(--font-mono); font-size:0.82rem; color:var(--text); line-height:1.6;"></div>
            </div>

            <!-- Override selector -->
            <div style="flex:1; min-width:220px; background:var(--bg-deep); border-radius:8px; padding:14px; border:1px solid var(--border);">
              <div style="font-size:0.7rem; text-transform:uppercase; letter-spacing:0.08em; color:var(--accent); margin-bottom:8px;">Override ibrav</div>
              <select id="ibrav-select" style="width:100%; background:var(--bg-panel); color:var(--text); border:1px solid var(--border); border-radius:6px; padding:6px 8px; font-family:var(--font-mono); font-size:0.8rem;">
                <option value="auto">↩ Keep auto-detected</option>
                ${IBRAV_OPTIONS.map(o => `<option value="${o.value}">${o.label}</option>`).join('')}
              </select>
              <div id="ibrav-override-note" style="font-size:0.7rem; color:var(--text-dim); margin-top:6px; display:none;">
                ⚠ Overriding ibrav will recompute celldm values. Verify CELL_PARAMETERS if ibrav=0.
              </div>
            </div>

            <!-- K-points override -->
            <div style="flex:1; min-width:220px; background:var(--bg-deep); border-radius:8px; padding:14px; border:1px solid var(--border);">
              <div style="font-size:0.7rem; text-transform:uppercase; letter-spacing:0.08em; color:var(--accent); margin-bottom:8px;">K-Points Mesh (automatic)</div>
              <div style="display:flex; gap:8px;">
                <div style="flex:1; text-align:center;">
                  <div style="font-size:0.65rem; color:var(--text-dim); margin-bottom:4px;">kx</div>
                  <input id="kx-input" type="number" min="1" value="" placeholder="auto" style="width:100%; text-align:center; background:var(--bg-panel); color:var(--text); border:1px solid var(--border); border-radius:6px; padding:5px; font-family:var(--font-mono); font-size:0.82rem;">
                </div>
                <div style="flex:1; text-align:center;">
                  <div style="font-size:0.65rem; color:var(--text-dim); margin-bottom:4px;">ky</div>
                  <input id="ky-input" type="number" min="1" value="" placeholder="auto" style="width:100%; text-align:center; background:var(--bg-panel); color:var(--text); border:1px solid var(--border); border-radius:6px; padding:5px; font-family:var(--font-mono); font-size:0.82rem;">
                </div>
                <div style="flex:1; text-align:center;">
                  <div style="font-size:0.65rem; color:var(--text-dim); margin-bottom:4px;">kz</div>
                  <input id="kz-input" type="number" min="1" value="" placeholder="auto" style="width:100%; text-align:center; background:var(--bg-panel); color:var(--text); border:1px solid var(--border); border-radius:6px; padding:5px; font-family:var(--font-mono); font-size:0.82rem;">
                </div>
              </div>
              <div style="font-size:0.65rem; color:var(--text-dim); margin-top:6px;">Leave blank for auto (separation = 0.07 Å⁻¹)</div>
            </div>

            <!-- Coordinate format -->
            <div style="flex:1; min-width:220px; background:var(--bg-deep); border-radius:8px; padding:14px; border:1px solid var(--border);">
              <div style="font-size:0.7rem; text-transform:uppercase; letter-spacing:0.08em; color:var(--accent); margin-bottom:8px;">Atomic Positions Format</div>
              <select id="coord-format" style="width:100%; background:var(--bg-panel); color:var(--text); border:1px solid var(--border); border-radius:6px; padding:6px 8px; font-family:var(--font-mono); font-size:0.8rem;">
                <option value="angstrom">ATOMIC_POSITIONS {angstrom}</option>
                <option value="crystal">ATOMIC_POSITIONS {crystal}</option>
              </select>
              <div style="font-size:0.65rem; color:var(--text-dim); margin-top:6px;">
                angstrom = Cartesian coordinates in Å<br>
                crystal = fractional coordinates (a, b, c)
              </div>
            </div>
          </div>

          <!-- Action buttons -->
          <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:20px;">
            <button class="btn btn-ghost" id="btn-ibrav-cancel">← Back</button>
            <button class="btn btn-primary" id="btn-ibrav-confirm" style="padding:10px 28px;">
              Generate Input File →
            </button>
          </div>
        </div>

      </div>
    `;

    this._buildProtocolGrid();
    this._bindEvents();
    if (sym) this._populateIbravInfo(sym);
  }

  // ─── Symmetry banner ─────────────────────────────────────────────────────────
  _renderSymBanner(sym) {
    const itNum = sym.itNumber || '–';
    const lat   = sym.lattice  || '–';
    const sg    = sym.sgName   || '–';
    const ibravDesc = (sym.ibrav !== undefined) ? getIbravLabel(sym.ibrav) : '–';
    const cell  = sym.cell;

    const fmtCell = cell && !isNaN(cell.a)
      ? `a=${cell.a.toFixed(4)} Å,  b=${cell.b.toFixed(4)} Å,  c=${cell.c.toFixed(4)} Å,  α=${cell.alpha.toFixed(2)}°,  β=${cell.beta.toFixed(2)}°,  γ=${cell.gamma.toFixed(2)}°`
      : '';

    return `
      <div style="background: linear-gradient(135deg, rgba(0,212,255,0.08), rgba(124,58,237,0.06));
                  border:1px solid rgba(0,212,255,0.25); border-radius:12px; padding:18px 24px;
                  display:flex; gap:24px; flex-wrap:wrap; align-items:flex-start;">
        <div style="font-size:2rem; opacity:0.6;">🔬</div>
        <div style="flex:1; min-width:240px;">
          <div style="font-size:0.7rem; text-transform:uppercase; letter-spacing:0.1em; color:var(--accent); margin-bottom:8px; font-weight:700;">Detected Crystallographic Info</div>
          <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:8px 24px; font-family:var(--font-mono); font-size:0.8rem; color:var(--text);">
            <div><span style="color:var(--text-dim)">Space Group: </span><strong>${sg}</strong></div>
            <div><span style="color:var(--text-dim)">IT Number: </span><strong>${itNum}</strong></div>
            <div><span style="color:var(--text-dim)">Lattice System: </span><strong style="text-transform:capitalize">${lat}</strong></div>
            <div><span style="color:var(--text-dim)">ibrav: </span><strong>${ibravDesc}</strong></div>
            ${fmtCell ? `<div style="grid-column:1/-1; color:var(--text-dim); font-size:0.75rem; margin-top:4px;">${fmtCell}</div>` : ''}
          </div>
        </div>
      </div>`;
  }

  // ─── Protocol grid ───────────────────────────────────────────────────────────
  _buildProtocolGrid() {
    const grid = this.container.querySelector('#ps-grid');
    PROTOCOLS.forEach(p => {
      const card = document.createElement('div');
      card.className = 'protocol-card';
      card.style.setProperty('--card-color', p.color);
      card.innerHTML = `
        <div class="proto-name">${p.name}</div>
        <div class="proto-desc">${p.desc}</div>
        <div class="proto-tag">${p.tag}</div>
        <span class="proto-arrow">→</span>
      `;
      card.addEventListener('click', () => this._selectProtocol(p));
      grid.appendChild(card);
    });
  }

  // ─── When a protocol card is clicked ─────────────────────────────────────────
  _selectProtocol(proto) {
    if (!this.appState.cifData) {
      alert('No structure loaded. Please open Structure-to-QE Studio and load a CIF file first.');
      return;
    }
    this._pendingProto = proto;

    const confirm = this.container.querySelector('#btn-ibrav-confirm');
    if (confirm) confirm.textContent = proto.id === 'dos' ? 'Generate 4 DOS Files →' : 'Generate Input File →';

    // Highlight selected card
    this.container.querySelectorAll('.protocol-card').forEach(c => c.classList.remove('active'));
    event?.target?.closest('.protocol-card')?.classList.add('active');

    // Show ibrav panel
    const panel = this.container.querySelector('#ibrav-panel');
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

    this._populateIbravInfo(this.appState.cifData?.symmetry);
  }

  // ─── Populate ibrav info panel ────────────────────────────────────────────────
  _populateIbravInfo(sym) {
    const labelEl = this.container.querySelector('#ibrav-auto-label');
    const select  = this.container.querySelector('#ibrav-select');
    if (!labelEl || !select) return;

    if (sym) {
      const ibrav = sym.ibrav !== undefined ? sym.ibrav : 0;
      labelEl.innerHTML = `
        <div>ibrav = <strong>${ibrav}</strong></div>
        <div style="color:var(--text-dim)">${getIbravLabel(ibrav)}</div>
        <div style="margin-top:6px; color:var(--text-dim)">Lattice: <strong style="color:var(--text)">${sym.lattice || '–'}</strong></div>
        <div style="color:var(--text-dim)">K-Points: <strong style="color:var(--text)">${sym.kpts ? `${sym.kpts.kx}×${sym.kpts.ky}×${sym.kpts.kz}` : '–'}</strong> (auto)</div>
        ${sym.celldm ? Object.entries(sym.celldm).filter(([,v])=>Math.abs(v)>1e-12).map(([k,v])=>`<div style="color:var(--text-dim)">celldm(${k}) = <strong style="color:var(--text)">${v.toFixed(8)}</strong></div>`).join('') : ''}
      `;

      // Auto-fill K-point inputs with detected values
      if (sym.kpts) {
        const kxi = this.container.querySelector('#kx-input');
        const kyi = this.container.querySelector('#ky-input');
        const kzi = this.container.querySelector('#kz-input');
        if (kxi) kxi.placeholder = sym.kpts.kx;
        if (kyi) kyi.placeholder = sym.kpts.ky;
        if (kzi) kzi.placeholder = sym.kpts.kz;
      }
    } else {
      labelEl.innerHTML = `<div style="color:var(--text-dim)">No symmetry data detected. Using ibrav=0 (CELL_PARAMETERS).</div>`;
    }
  }

  // ─── Events ───────────────────────────────────────────────────────────────────
  _bindEvents() {
    const select = this.container.querySelector('#ibrav-select');
    if (select) {
      select.addEventListener('change', () => {
        const note = this.container.querySelector('#ibrav-override-note');
        if (select.value === 'auto') {
          this._ibravOverride = null;
          if (note) note.style.display = 'none';
        } else {
          this._ibravOverride = parseInt(select.value);
          if (note) note.style.display = 'block';
        }
      });
    }



    const cancelBtn = this.container.querySelector('#btn-ibrav-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        const panel = this.container.querySelector('#ibrav-panel');
        if (panel) panel.style.display = 'none';
        this._pendingProto = null;
        this.container.querySelectorAll('.protocol-card').forEach(c => c.classList.remove('active'));
      });
    }

    const confirmBtn = this.container.querySelector('#btn-ibrav-confirm');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => this._generate());
    }
  }

  // ─── Generate input file and navigate ────────────────────────────────────────
  _generate() {
    const proto = this._pendingProto;
    if (!proto || !this.appState.cifData) return;

    const sym     = this.appState.cifData.symmetry;
    const baseName = (this.appState.cifFilename || 'structure').replace('.cif', '');
    const prefix  = ['dos', 'band', 'charge', 'bader', 'phonon'].includes(proto.id) ? `'${baseName}'` : `'${baseName}_${proto.id}'`;
    const fname   = `${baseName}_${proto.id}.in`;

    // K-points: read overrides or use auto
    const kxInput = this.container.querySelector('#kx-input');
    const kyInput = this.container.querySelector('#ky-input');
    const kzInput = this.container.querySelector('#kz-input');
    const kx = kxInput?.value ? parseInt(kxInput.value) : undefined;
    const ky = kyInput?.value ? parseInt(kyInput.value) : undefined;
    const kz = kzInput?.value ? parseInt(kzInput.value) : undefined;

    // ibrav override
    const ibravOverride = this._ibravOverride;

    // Coordinate format
    const coordSelect = this.container.querySelector('#coord-format');
    const coordFormat = coordSelect ? coordSelect.value : 'angstrom';

    // Build generation params
    const genParams = {
      prefix,
      ibrav: ibravOverride !== null && ibravOverride !== undefined ? ibravOverride : undefined,
      kx, ky, kz,
      coordFormat,
    };

    if (this.appState.cifData) this.appState.cifData.filename = this.appState.cifFilename;

    if (proto.id === 'dos') {
      const workflow = generateDOSWorkflow(this.appState.cifData, {
        ...genParams,
        baseName,
        prefix,
        scfKx: kx,
        scfKy: ky,
        scfKz: kz,
        speciesParams: {},
      });
      const workflowId = `dos-${baseName}`;
      this.appState.generatedInputs = workflow.files.map(file => ({
        ...file,
        cifData: this.appState.cifData,
        params: workflow.params,
        workflowId,
      }));
      this.appState.generatedInput = null;
      this.onNavigate('input-editor');
      return;
    }

    if (proto.id === 'band') {
      const workflow = generateBandsWorkflow(this.appState.cifData, {
        ...genParams,
        baseName,
        prefix,
        scfKx: kx,
        scfKy: ky,
        scfKz: kz,
        speciesParams: {},
      });
      const workflowId = `bands-${baseName}`;
      this.appState.generatedInputs = workflow.files.map(file => ({
        ...file,
        cifData: this.appState.cifData,
        params: workflow.params,
        workflowId,
      }));
      this.appState.generatedInput = null;
      this.onNavigate('input-editor');
      return;
    }

    if (proto.id === 'charge') {
      const workflow = generateChargeWorkflow(this.appState.cifData, {
        ...genParams, baseName, prefix,
        scfKx: kx, scfKy: ky, scfKz: kz,
        speciesParams: {},
      });
      const workflowId = `charge-${baseName}`;
      this.appState.generatedInputs = workflow.files.map(file => ({
        ...file, cifData: this.appState.cifData, params: workflow.params, workflowId,
      }));
      this.appState.generatedInput = null;
      this.onNavigate('input-editor');
      return;
    }

    if (proto.id === 'bader') {
      const workflow = generateBaderWorkflow(this.appState.cifData, {
        ...genParams, baseName, prefix,
        scfKx: kx, scfKy: ky, scfKz: kz,
        speciesParams: {},
      });
      const workflowId = `bader-${baseName}`;
      this.appState.generatedInputs = workflow.files.map(file => ({
        ...file, cifData: this.appState.cifData, params: workflow.params, workflowId,
      }));
      this.appState.generatedInput = null;
      this.onNavigate('input-editor');
      return;
    }

    if (proto.id === 'phonon') {
      const workflow = generateVibrationalWorkflow(this.appState.cifData, {
        ...genParams, baseName, prefix,
        scfKx: kx, scfKy: ky, scfKz: kz,
        speciesParams: {},
      });
      const workflowId = `phonon-${baseName}`;
      this.appState.generatedInputs = workflow.files.map(file => ({
        ...file, cifData: this.appState.cifData, params: workflow.params, workflowId,
      }));
      this.appState.generatedInput = null;
      this.onNavigate('input-editor');
      return;
    }

    if (proto.id === 'scf' || proto.id === 'relax') {
      const workflow = generatePWWorkflow(proto.id, this.appState.cifData, {
        ...genParams, baseName, prefix, speciesParams: {},
      });
      const workflowId = `pw-${proto.id}-${baseName}`;
      this.appState.generatedInputs = workflow.files.map(file => ({
        ...file, cifData: this.appState.cifData, params: workflow.params, workflowId,
      }));
      this.appState.generatedInput = null;
      this.onNavigate('input-editor');
      return;
    }

    const template = generateQEInput(proto.id, this.appState.cifData, genParams);

    this.appState.generatedInput = {
      text:       template,
      filename:   fname,
      protocolId: proto.id,
      cifData:    this.appState.cifData,
      params: {
        prefix,
        ibrav:    ibravOverride !== null && ibravOverride !== undefined ? ibravOverride : (sym?.ibrav ?? 0),
        kx, ky, kz,
        speciesParams: {},
      },
    };

    this.onNavigate('input-editor');
  }

  destroy() {}
}
