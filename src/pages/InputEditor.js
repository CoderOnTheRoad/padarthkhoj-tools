import { BAND_K_POINT_OPTIONS, BAND_PATH_PRESETS, generateBaderWorkflow, generateBandsWorkflow, generateChargeWorkflow, generateDOSWorkflow, generatePWWorkflow, generateQEInput, generateVibrationalWorkflow, getSuggestedBandPath, IBRAV_OPTIONS, OCCUPATION_OPTIONS, SMEARING_OPTIONS } from '../lib/qeGenerator.js';
import { getPseudosForElement } from '../data/pseudos.js';
import { getIbravLabel } from '../lib/cifSymmetry.js';

export class InputEditorPage {
  constructor(container, appState) {
    this.container = container;
    this.appState = appState;
    this.files = [];    // [{ name, content }]
    this.activeIdx = 0;
    this._sidebarWidth = 300;
    this._onSplitterMove = event => this._resizeSidebarFromPointer(event.clientX);
    this._onSplitterUp = () => this._stopSidebarResize();
  }

  render() {
    // DOS protocol produces four coordinated files that share one params object.
    if (this.appState.generatedInputs?.length) {
      const incoming = this.appState.generatedInputs;
      const sharedParams = incoming[0].params || { speciesParams: {} };
      incoming.forEach(item => {
        if (this.files.some(f => f.name === item.filename)) return;
        this.files.push({
          name: item.filename,
          content: item.text,
          protocolId: item.protocolId,
          cifData: item.cifData,
          params: sharedParams,
          workflowId: item.workflowId,
        });
      });
      this.activeIdx = Math.max(0, this.files.findIndex(f => f.workflowId === incoming[0].workflowId));
      this.appState.generatedInputs = null;
    }

    // Pre-populate from generated input if available
    if (this.appState.generatedInput && !this.files.find(f => f.name === this.appState.generatedInput.filename)) {
      this.files.push({ 
        name: this.appState.generatedInput.filename, 
        content: this.appState.generatedInput.text,
        protocolId: this.appState.generatedInput.protocolId,
        cifData: this.appState.generatedInput.cifData,
        params: {
          speciesParams: {},
          ...(this.appState.generatedInput.params || {})
        }
      });
      this.activeIdx = this.files.length - 1;
      this.appState.generatedInput = null;
    }

    this.container.innerHTML = `
      <div class="input-editor-layout">

        <!-- Upload strip -->
        <div style="padding:10px 16px; border-bottom:1px solid var(--border); background:var(--bg-panel); display:flex; align-items:center; gap:10px; flex-shrink:0;">
          <div class="drop-zone" id="in-drop-zone" style="padding:10px 20px; flex-direction:row; gap:12px; width:auto; flex:1; border-radius:var(--radius-sm);">
            <div class="drop-icon" style="font-size:1.4rem; margin:0;">⌨</div>
            <div>
              <div class="drop-main" style="font-size:0.82rem; text-align:left;">Upload .in or .pwi files</div>
              <div class="drop-sub" style="text-align:left;">Drag, drop or click — multiple files supported</div>
            </div>
            <div class="drop-tags" style="margin:0;"><span class="tag tag-in">.in</span><span class="tag tag-in">.pwi</span></div>
          </div>
          <input type="file" id="in-file-input" accept=".in,.pwi" multiple style="display:none">
          <button class="btn btn-ghost" id="btn-new-in-file">+ New File</button>
          <button class="btn btn-primary" id="btn-download-in" style="display:${this.files.length ? '' : 'none'}">↓ Download</button>
        </div>

        <!-- FILE TABS -->
        <div class="file-tabs-bar" id="file-tabs-bar">
          ${this._renderTabsHTML()}
          <div class="file-tab-add" id="btn-add-tab" title="New blank file">+</div>
        </div>

        <div class="editor-main-container flex-1 overflow-hidden flex flex-row">
          <!-- EDITOR BODY -->
          <div class="editor-area flex-1" id="editor-area">
            ${this.files.length === 0 ? this._emptyState() : `
              <div class="line-numbers" id="line-numbers">1</div>
              <textarea id="editor-textarea" spellcheck="false" autocorrect="off" autocapitalize="off">${this._escapeHTML(this.files[this.activeIdx]?.content || '')}</textarea>
            `}
          </div>

          <!-- RESIZABLE DIVIDER -->
          ${this.files.length ? `<div class="editor-splitter" id="editor-splitter" role="separator" aria-label="Resize editor and protocol settings" aria-orientation="vertical" aria-valuemin="220" aria-valuenow="${this._sidebarWidth}" tabindex="0" title="Drag to resize; use left/right arrow keys">
            <div class="splitter-dots"></div>
          </div>` : ''}

          <!-- SIDEBAR PANEL -->
          ${this._renderSidebar()}
        </div>

        <!-- STATUS BAR -->
        <div class="editor-statusbar">
          <span class="editor-status-item" id="ln-col-info">Ln 1, Col 1</span>
          <span class="editor-status-item" id="line-count-info">${this.files[this.activeIdx] ? this.files[this.activeIdx].content.split('\n').length + ' lines' : '0 lines'}</span>
          <span class="editor-status-item" style="margin-left:auto; opacity:0.6">Ctrl+S — Download active file</span>
        </div>
      </div>
    `;

    this._bindEvents();
    this._bindSidebarEvents();
    this._setupEditorSplitter();
    this._refreshLineNumbers();
  }

  _renderSidebar() {
    const file = this.files[this.activeIdx];
    if (!file) return '';

    const p = file.params || {};
    if (file.protocolId === 'dos-post' || file.protocolId === 'dos-submit') {
      return this._renderDOSUtilitySidebar(file, p);
    }
    if (file.protocolId === 'bands-post' || file.protocolId === 'bands-submit') return this._renderBandsPostSidebar(file, p);
    if (file.protocolId === 'charge-post' || file.protocolId === 'charge-submit') return this._renderChargeUtilitySidebar(file, p);
    if (file.protocolId === 'bader-all' || file.protocolId === 'bader-valence' || file.protocolId === 'bader-submit') return this._renderBaderUtilitySidebar(file, p);
    if (file.protocolId === 'phonon-hess' || file.protocolId === 'phonon-ph' || file.protocolId === 'phonon-dyn' || file.protocolId === 'phonon-submit') return this._renderVibrationalUtilitySidebar(file, p);
    if (file.protocolId === 'scf-submit' || file.protocolId === 'relax-submit') return this._renderPWSubmitSidebar(file);
    const cifData = file.cifData;
    const uniqueElems = cifData ? [...new Set(cifData.atoms.map(a => a.sym))] : [];

    return `
      <div class="editor-sidebar" style="width:${this._sidebarWidth}px">
        <div class="sidebar-header">
          <span class="sidebar-title">Protocol Settings</span>
          <span class="tag tag-proto">${file.protocolId || 'manual'}</span>
        </div>
        
        <div class="sidebar-content">
          ${!file.protocolId ? `
            <div style="padding:20px; text-align:center; color:var(--text-dim); font-size:0.8rem;">
              No protocol active for this file. Sidebar settings are only available for files generated via Protocol Selector.
            </div>
          ` : `
            <div class="sidebar-section">
              <div class="section-title">LATTICE / IBRAV</div>
              <div class="field">
                <label style="font-size:0.7rem;">ibrav — Bravais Lattice Index</label>
                <select data-param="ibrav" id="ibrav-select" style="font-family:var(--font-mono); font-size:0.78rem;">
                  ${IBRAV_OPTIONS.map(o => `<option value="${o.value}" ${String(p.ibrav) === String(o.value) ? 'selected' : ''}>${o.label}</option>`).join('')}
                </select>
                <div style="font-size:0.67rem; color:var(--text-dim); margin-top:5px; line-height:1.5;">
                  Detected: <strong style="color:var(--accent)">${file.cifData?.symmetry ? getIbravLabel(file.cifData.symmetry.ibrav ?? 0) : 'N/A'}</strong>
                  ${file.cifData?.symmetry?.sgName ? `<br>Space Group: <strong>${file.cifData.symmetry.sgName}</strong>` : ''}
                  ${file.cifData?.symmetry?.itNumber ? ` (IT #${file.cifData.symmetry.itNumber})` : ''}
                </div>
              </div>
            </div>

            <div class="sidebar-section">
              <div class="section-title">CONTROL</div>
              <div class="field">
                <label>prefix</label>
                <input type="text" data-param="prefix" value="${p.prefix || ''}" placeholder="pwscf">
              </div>
              <div class="field">
                <label>outdir</label>
                <input type="text" data-param="outdir" value="${p.outdir || ''}" placeholder="./tmp">
              </div>
              <div class="field">
                <label>pseudo_dir</label>
                <input type="text" data-param="pseudo_dir" value="${p.pseudo_dir || ''}" placeholder="./upf_files">
              </div>
              <div class="field-row">
                <div class="field">
                  <label>nstep</label>
                  <input type="number" data-param="nstep" value="${p.nstep || ''}" placeholder="200">
                </div>
                <div class="field">
                  <label>forc_conv_thr</label>
                  <input type="text" data-param="forc_conv_thr" value="${p.forc_conv_thr || ''}" placeholder="7.77876e-04">
                </div>
              </div>
              ${!file.workflowId || file.workflowId?.startsWith('pw-') || file.protocolId === 'dos-scf' || file.protocolId === 'bands-scf' || file.protocolId === 'charge-scf' || file.protocolId === 'bader-scf' || file.protocolId === 'phonon-scf' ? `<div class="field">
                <label>${file.workflowId ? 'SCF occupations' : 'occupations'}</label>
                <select data-param="occupations">
                  ${OCCUPATION_OPTIONS.map(option => `
                    <option value='${option.value}' ${(p.occupations === option.value || (!p.occupations && option.value === '"smearing"')) ? 'selected' : ''}>
                      ${option.label}
                    </option>
                  `).join('')}
                </select>
                <div style="font-size:0.62rem; color:var(--text-dim); margin-top:4px; line-height:1.4;">
                  Fixed is intended for gapped insulators. Tetrahedra requires a uniform automatically generated k-point grid.
                </div>
              </div>` : ''}
            </div>

            ${file.workflowId?.startsWith('dos-') ? `
              <div class="sidebar-section">
                <div class="section-title">DOS WORKFLOW — IMPORTANT</div>
                <div style="font-size:0.67rem; color:var(--text-dim); line-height:1.5; margin-bottom:10px;">
                  These settings regenerate all four workflow files. Keep prefix/outdir identical. Convergence-test k meshes and nbnd before production use.
                </div>
                ${file.protocolId === 'dos-scf' ? `<div class="field-row">
                  <div class="field"><label>SCF kx</label><input type="number" min="1" data-param="scfKx" value="${p.scfKx}"></div>
                  <div class="field"><label>SCF ky</label><input type="number" min="1" data-param="scfKy" value="${p.scfKy}"></div>
                  <div class="field"><label>SCF kz</label><input type="number" min="1" data-param="scfKz" value="${p.scfKz}"></div>
                </div>` : ''}
                ${file.protocolId === 'dos-nscf' ? `<div class="field-row">
                  <div class="field"><label>NSCF kx</label><input type="number" min="1" data-param="nscfKx" value="${p.nscfKx}"></div>
                  <div class="field"><label>NSCF ky</label><input type="number" min="1" data-param="nscfKy" value="${p.nscfKy}"></div>
                  <div class="field"><label>NSCF kz</label><input type="number" min="1" data-param="nscfKz" value="${p.nscfKz}"></div>
                </div>
                <div class="field">
                  <label>nbnd — NSCF bands</label>
                  <input type="number" min="1" data-param="nbnd" value="${p.nbnd}">
                  <div style="font-size:0.62rem; color:var(--text-dim); margin-top:4px;">Default: 4 × number of atoms. Increase carefully if the required unoccupied states are not covered.</div>
                </div>
                <div class="field">
                  <label>NSCF occupations</label>
                  <select data-param="nscfOccupations">
                    ${OCCUPATION_OPTIONS.map(option => `
                      <option value='${option.value}' ${p.nscfOccupations === option.value ? 'selected' : ''}>${option.label}</option>
                    `).join('')}
                  </select>
                  <div style="font-size:0.62rem; color:var(--text-dim); margin-top:4px;">DOS default: Blöchl tetrahedra. Use the alternatives only when scientifically appropriate.</div>
                </div>` : ''}
              </div>
            ` : ''}

            ${file.workflowId?.startsWith('bands-') ? `
              <div class="sidebar-section">
                <div class="section-title">BANDS WORKFLOW — IMPORTANT</div>
                <div style="font-size:0.67rem; color:var(--text-dim); line-height:1.5; margin-bottom:10px;">
                  Keep prefix/outdir identical across all three files. Verify that the selected symmetry path belongs to this Bravais lattice.
                </div>
                ${file.protocolId === 'bands-scf' ? `<div class="field-row">
                  <div class="field"><label>SCF kx</label><input type="number" min="1" data-param="scfKx" value="${p.scfKx}"></div>
                  <div class="field"><label>SCF ky</label><input type="number" min="1" data-param="scfKy" value="${p.scfKy}"></div>
                  <div class="field"><label>SCF kz</label><input type="number" min="1" data-param="scfKz" value="${p.scfKz}"></div>
                </div>` : ''}
                ${file.protocolId === 'bands-nscf' ? `
                  <div class="field"><label>NSCF occupations</label><select data-param="nscfOccupations">
                    ${OCCUPATION_OPTIONS.map(option => `<option value='${option.value}' ${p.nscfOccupations === option.value ? 'selected' : ''}>${option.label}</option>`).join('')}
                  </select></div>
                  <div class="field"><label>NSCF smearing</label><select data-param="nscfSmearing">
                    ${SMEARING_OPTIONS.map(option => `<option value='${option.value}' ${p.nscfSmearing === option.value ? 'selected' : ''}>${option.label}</option>`).join('')}
                  </select><div style="font-size:0.62rem; color:var(--text-dim); margin-top:4px;">Default: Gaussian. Used when occupations='smearing'.</div></div>
                  ${this._renderBandPathBuilder(p)}
                ` : ''}
              </div>
            ` : ''}

            ${file.workflowId?.startsWith('charge-') || file.workflowId?.startsWith('bader-') ? `
              <div class="sidebar-section">
                <div class="section-title">${file.workflowId.startsWith('bader-') ? 'BADER CHARGE WORKFLOW' : 'CHARGE DENSITY WORKFLOW'}</div>
                <div style="font-size:0.67rem; color:var(--text-dim); line-height:1.5; margin-bottom:10px;">This SCF creates the saved charge density consumed by pp.x. Convergence-test the mesh and cutoffs before production use.</div>
                <div class="field-row">
                  <div class="field"><label>SCF kx</label><input type="number" min="1" data-param="scfKx" value="${p.scfKx}"></div>
                  <div class="field"><label>SCF ky</label><input type="number" min="1" data-param="scfKy" value="${p.scfKy}"></div>
                  <div class="field"><label>SCF kz</label><input type="number" min="1" data-param="scfKz" value="${p.scfKz}"></div>
                </div>
              </div>
            ` : ''}

            ${file.workflowId?.startsWith('phonon-') ? `
              <div class="sidebar-section"><div class="section-title">VIBRATIONAL WORKFLOW</div>
                <div style="font-size:0.67rem; color:var(--text-dim); line-height:1.5; margin-bottom:10px;">The Hessian step is generated and executed only for DFT-D3. Changing vdw_corr regenerates the Hessian, phonon, and submit files accordingly.</div>
                <div class="field-row"><div class="field"><label>SCF kx</label><input type="number" min="1" data-param="scfKx" value="${p.scfKx}"></div><div class="field"><label>SCF ky</label><input type="number" min="1" data-param="scfKy" value="${p.scfKy}"></div><div class="field"><label>SCF kz</label><input type="number" min="1" data-param="scfKz" value="${p.scfKz}"></div></div>
                ${/['"]dft-d3['"]/i.test(p.vdw_corr || '') ? `<div class="field"><label>dftd3_threebody</label><select data-param="dftd3_threebody"><option value=".false." ${p.dftd3_threebody !== '.true.' ? 'selected' : ''}>.false. (recommended for Hessian)</option><option value=".true." ${p.dftd3_threebody === '.true.' ? 'selected' : ''}>.true. (verify QE support)</option></select></div>` : ''}
              </div>
            ` : ''}

            ${file.workflowId?.startsWith('pw-') ? `<div class="sidebar-section"><div class="section-title">K-POINT MESH</div><div class="field-row"><div class="field"><label>kx</label><input type="number" min="1" data-param="kx" value="${p.kx}"></div><div class="field"><label>ky</label><input type="number" min="1" data-param="ky" value="${p.ky}"></div><div class="field"><label>kz</label><input type="number" min="1" data-param="kz" value="${p.kz}"></div></div><div style="font-size:0.62rem; color:var(--text-dim); line-height:1.45;">Convergence-test this automatic mesh for the actual system.</div></div>` : ''}

            <div class="sidebar-section">
              <div class="section-title">SYSTEM</div>
              <div class="field-row">
                <div class="field">
                  <label>ecutwfc (Ry)</label>
                  <input type="text" data-param="ecutwfc" value="${p.ecutwfc || ''}" placeholder="40.0000e+01">
                </div>
                <div class="field">
                  <label>ecutrho (Ry)</label>
                  <input type="text" data-param="ecutrho" value="${p.ecutrho || ''}" placeholder="4.0000e+02">
                </div>
              </div>
              <div class="field-row">
                <div class="field">
                  <label>nspin</label>
                  <select data-param="nspin">
                    <option value="1" ${p.nspin == '1' ? 'selected' : ''}>1 (non-polarized)</option>
                    <option value="2" ${p.nspin == '2' || !p.nspin ? 'selected' : ''}>2 (polarized)</option>
                  </select>
                </div>
                ${!file.workflowId || file.workflowId?.startsWith('pw-') || file.protocolId === 'dos-scf' || file.protocolId === 'bands-scf' || file.protocolId === 'bands-nscf' || file.protocolId === 'charge-scf' || file.protocolId === 'bader-scf' || file.protocolId === 'phonon-scf' ? `<div class="field">
                  <label>degauss</label>
                  <input type="text" data-param="degauss" value="${p.degauss || ''}" placeholder="1.00000e-02">
                </div>` : '<div class="field"></div>'}
              </div>
              <div class="field">
                <label>vdw_corr</label>
                <select data-param="vdw_corr">
                  <option value='"dft-d3"' ${p.vdw_corr === '"dft-d3"' || !p.vdw_corr ? 'selected' : ''}>DFT-D3</option>
                  <option value='""' ${p.vdw_corr === '""' ? 'selected' : ''}>None</option>
                  <option value='"grimme-d2"' ${p.vdw_corr === '"grimme-d2"' ? 'selected' : ''}>Grimme-D2</option>
                  <option value='"xdm"' ${p.vdw_corr === '"xdm"' || p.vdw_corr === "'xdm'" ? 'selected' : ''}>XDM</option>
                </select>
              </div>
              ${/["']xdm["']/i.test(p.vdw_corr || '') ? `
                <div style="font-size:0.65rem; color:var(--text-dim); line-height:1.45; margin-bottom:8px;">
                  PBE, B86bPBE, PW86PBE, and BLYP use QE's built-in XDM coefficients. Leave both overrides blank unless you have validated parameters for another functional.
                </div>
                <div class="field-row">
                  <div class="field">
                    <label>xdm_a1 (optional)</label>
                    <input type="text" data-param="xdm_a1" value="${p.xdm_a1 || ''}" placeholder="QE default">
                  </div>
                  <div class="field">
                    <label>xdm_a2 Å (optional)</label>
                    <input type="text" data-param="xdm_a2" value="${p.xdm_a2 || ''}" placeholder="QE default">
                  </div>
                </div>
              ` : ''}
              ${!file.workflowId || file.workflowId?.startsWith('pw-') || file.protocolId === 'dos-scf' || file.protocolId === 'bands-scf' || file.protocolId === 'bands-nscf' || file.protocolId === 'charge-scf' || file.protocolId === 'bader-scf' || file.protocolId === 'phonon-scf' ? `<div class="field">
                <label>smearing</label>
                <select data-param="smearing">
                  ${SMEARING_OPTIONS.map(option => `
                    <option value='${option.value}' ${(p.smearing === option.value || (!p.smearing && option.value === '"gaussian"')) ? 'selected' : ''}>
                      ${option.label}
                    </option>
                  `).join('')}
                </select>
                <div style="font-size:0.62rem; color:var(--text-dim); margin-top:4px; line-height:1.4;">
                  Used only with occupations='smearing'. Always convergence-test degauss for energies, forces, and metallic occupations.
                </div>
              </div>` : ''}
            </div>

            <div class="sidebar-section">
              <div class="section-title">SPECIES SETTINGS</div>
              ${uniqueElems.length === 0 ? `
                <div style="font-size:0.7rem; color:var(--text-dim); font-style:italic;">No species data found for this file.</div>
              ` : `
                <div style="display:flex; flex-direction:column; gap:12px;">
                  ${uniqueElems.map(sym => {
                    const sp = (p.speciesParams && p.speciesParams[sym]) || {};
                    const availablePseudos = getPseudosForElement(sym);
                    const selectedPseudo = availablePseudos.includes(sp.pseudo) ? sp.pseudo : availablePseudos[0];
                    return `
                      <div class="species-card">
                        <div class="species-header">
                          <span class="species-badge">${sym}</span>
                          <span class="species-name">${sym} settings</span>
                        </div>
                        <div class="field">
                          <label>Pseudopotential</label>
                          <select data-species="${sym}" data-field="pseudo" style="display: block !important;" ${availablePseudos.length ? '' : 'disabled'}>
                            ${availablePseudos.length
                              ? availablePseudos.map(ps => `<option value="${ps}" ${selectedPseudo === ps ? 'selected' : ''}>${ps}</option>`).join('')
                              : '<option disabled selected>No allowed pseudopotential available</option>'}
                          </select>
                        </div>
                        ${p.nspin == '2' || !p.nspin ? `
                          <div class="field">
                            <label>Starting Magnetization</label>
                            <input type="text" data-species="${sym}" data-field="mag" value="${sp.mag || ''}" placeholder="0.00000e+00">
                          </div>
                        ` : ''}
                      </div>
                    `;
                  }).join('')}
                </div>
              `}
            </div>

            <div style="margin-top:auto; padding:12px; background:var(--bg-panel); border-radius:var(--radius-sm); border:1px solid var(--border);">
              <div style="font-size:0.65rem; color:var(--text-dim); line-height:1.4">
                Changing these values will re-generate the input file content. Manual changes in the editor will be overwritten if you modify these settings.
              </div>
            </div>
          `}
        </div>
      </div>
    `;
  }

  _renderDOSUtilitySidebar(file, p) {
    if (file.protocolId === 'dos-submit') {
      return `
        <div class="editor-sidebar" style="width:${this._sidebarWidth}px">
          <div class="sidebar-header"><span class="sidebar-title">Submit Script</span><span class="tag tag-proto">dos-submit</span></div>
          <div class="sidebar-content">
            <div class="sidebar-section">
              <div class="section-title">EXECUTION ORDER</div>
              <div style="font-size:0.72rem; color:var(--text-dim); line-height:1.65;">
                This tab has no QE parameter dropdowns. It runs SCF → NSCF → DOS sequentially. Add only the scheduler, module, MPI, or launcher commands required by your computing environment.
              </div>
            </div>
          </div>
        </div>`;
    }

    return `
      <div class="editor-sidebar" style="width:${this._sidebarWidth}px">
        <div class="sidebar-header"><span class="sidebar-title">DOS Settings</span><span class="tag tag-proto">dos-post</span></div>
        <div class="sidebar-content">
          <div class="sidebar-section">
            <div class="section-title">SHARED — DO NOT MISMATCH</div>
            <div class="field"><label>prefix</label><input type="text" data-param="prefix" value="${p.prefix || ''}"></div>
            <div class="field"><label>outdir</label><input type="text" data-param="outdir" value="${p.outdir || ''}"></div>
            <div style="font-size:0.62rem; color:var(--text-dim); line-height:1.45;">These must match the SCF and NSCF files exactly.</div>
          </div>
          <div class="sidebar-section">
            <div class="section-title">DOS ENERGY GRID</div>
            <div class="field-row">
              <div class="field"><label>Emin (eV)</label><input type="text" data-param="dosEmin" value="${p.dosEmin}"></div>
              <div class="field"><label>Emax (eV)</label><input type="text" data-param="dosEmax" value="${p.dosEmax}"></div>
            </div>
            <div class="field"><label>DeltaE (eV)</label><input type="text" data-param="dosDeltaE" value="${p.dosDeltaE}"></div>
            <div style="font-size:0.62rem; color:var(--text-dim); line-height:1.45;">These tags are optional. A smaller DeltaE gives a finer grid and a larger output file.</div>
          </div>
        </div>
      </div>`;
  }

  _renderBandPathBuilder(p) {
    return `<div style="margin-top:12px;">
      <div class="field">
        <label>Suggested path for detected lattice</label>
        <select data-band-preset>
          ${BAND_PATH_PRESETS.map(preset => `<option value="${preset.id}" ${p.bandPathPreset === preset.id ? 'selected' : ''}>${preset.name}${p.bandPathPreset === preset.id ? ' — selected' : ''}</option>`).join('')}
        </select>
      </div>
      <div style="font-size:0.64rem; color:#f59e0b; line-height:1.5; padding:8px; border:1px solid rgba(245,158,11,.35); border-radius:6px; margin-bottom:10px;">
        ⚠ Suggested paths are starting points only. Cross-verify the path, labels, coordinates, and cell convention with published literature or a trusted Brillouin-zone resource for this material.
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:7px;">
        <label style="font-size:0.7rem;">K_POINTS crystal_b path</label>
        <button type="button" class="btn btn-ghost" data-k-action="add" style="padding:3px 8px; font-size:0.65rem;">+ Point</button>
      </div>
      ${(p.kPath || []).map((point, index) => `<div style="display:grid; grid-template-columns:24px 1fr 62px 26px; gap:5px; align-items:center; margin-bottom:6px;">
        <span style="font-size:0.65rem; color:var(--text-dim);">${index + 1}</span>
        <select data-k-index="${index}" data-k-field="label" title="High-symmetry point">
          ${BAND_K_POINT_OPTIONS.map(option => `<option value="${option.label}" ${point.label === option.label ? 'selected' : ''}>${option.name} (${option.x.toFixed(3)}, ${option.y.toFixed(3)}, ${option.z.toFixed(3)})</option>`).join('')}
        </select>
        <input type="number" min="1" data-k-index="${index}" data-k-field="points" value="${point.points}" title="Interpolated points to the next vertex">
        <button type="button" data-k-action="remove" data-k-index="${index}" title="Remove point" style="height:28px; border:1px solid var(--border); border-radius:5px; background:var(--bg-panel); color:var(--text-dim);">×</button>
      </div>`).join('')}
      <div style="font-size:0.62rem; color:var(--text-dim); line-height:1.45;">The number is the interpolation count/weight to the next point. At least two path vertices are required.</div>
    </div>`;
  }

  _renderBandsPostSidebar(file, p) {
    if (file.protocolId === 'bands-submit') {
      return `<div class="editor-sidebar" style="width:${this._sidebarWidth}px">
        <div class="sidebar-header"><span class="sidebar-title">Submit Script</span><span class="tag tag-proto">bands-submit</span></div>
        <div class="sidebar-content"><div class="sidebar-section"><div class="section-title">EXECUTION ORDER</div>
          <div style="font-size:0.72rem; color:var(--text-dim); line-height:1.65;">This tab has no QE parameter dropdowns. It runs SCF → band-path NSCF → bands.x sequentially. Add only the scheduler, module, MPI, or launcher commands required by your computing environment.</div>
        </div></div>
      </div>`;
    }
    return `<div class="editor-sidebar" style="width:${this._sidebarWidth}px">
      <div class="sidebar-header"><span class="sidebar-title">Bands Settings</span><span class="tag tag-proto">bands-post</span></div>
      <div class="sidebar-content">
        <div class="sidebar-section"><div class="section-title">&amp;BANDS</div>
          <div class="field"><label>prefix</label><input type="text" data-param="prefix" value="${p.prefix || ''}"></div>
          <div class="field"><label>outdir</label><input type="text" data-param="outdir" value="${p.outdir || ''}"></div>
          <div class="field"><label>filband</label><input type="text" data-param="filband" value="${p.filband || ''}"></div>
          <div style="font-size:0.62rem; color:var(--text-dim); line-height:1.45;">Run this file with bands.x. Prefix and outdir must match both pw.x stages; filband is the output file written by bands.x.</div>
        </div>
      </div>
    </div>`;
  }

  _renderChargeUtilitySidebar(file, p) {
    if (file.protocolId === 'charge-submit') {
      return `<div class="editor-sidebar" style="width:${this._sidebarWidth}px">
        <div class="sidebar-header"><span class="sidebar-title">Submit Script</span><span class="tag tag-proto">charge-submit</span></div>
        <div class="sidebar-content"><div class="sidebar-section"><div class="section-title">EXECUTION ORDER</div>
          <div style="font-size:0.72rem; color:var(--text-dim); line-height:1.65;">This tab has no QE parameter controls. It runs the SCF with pw.x and then charge-density post-processing with pp.x. Add only locally required scheduler, module, MPI, or launcher commands.</div>
        </div></div>
      </div>`;
    }
    return `<div class="editor-sidebar" style="width:${this._sidebarWidth}px">
      <div class="sidebar-header"><span class="sidebar-title">Charge Density Settings</span><span class="tag tag-proto">charge-post</span></div>
      <div class="sidebar-content">
        <div class="sidebar-section"><div class="section-title">&amp;INPUTPP</div>
          <div class="field"><label>prefix</label><input type="text" data-param="prefix" value="${p.prefix || ''}"></div>
          <div class="field"><label>outdir</label><input type="text" data-param="outdir" value="${p.outdir || ''}"></div>
          <div class="field"><label>filplot</label><input type="text" data-param="chargeFilplot" value="${p.chargeFilplot || ''}"></div>
          <div class="field"><label>plot_num</label><input type="number" data-param="chargePlotNum" value="${p.chargePlotNum}"></div>
          <div style="font-size:0.62rem; color:var(--text-dim); line-height:1.45;">Default plot_num=0 generates total electron density. Change it only after checking the pp.x documentation for the intended quantity.</div>
        </div>
        <div class="sidebar-section"><div class="section-title">&amp;PLOT</div>
          <div class="field-row"><div class="field"><label>nfile</label><input type="number" min="1" data-param="chargeNfile" value="${p.chargeNfile}"></div><div class="field"><label>iflag</label><input type="number" data-param="chargeIflag" value="${p.chargeIflag}"></div></div>
          <div class="field"><label>output_format</label><input type="number" data-param="chargeOutputFormat" value="${p.chargeOutputFormat}"></div>
          <div class="field"><label>fileout</label><input type="text" data-param="chargeFileout" value="${p.chargeFileout || ''}"></div>
          <div style="font-size:0.62rem; color:var(--text-dim); line-height:1.45;">Defaults iflag=3 and output_format=6 produce a 3D Gaussian cube file. Keep the .cube extension when using format 6.</div>
        </div>
      </div>
    </div>`;
  }

  _renderBaderUtilitySidebar(file, p) {
    if (file.protocolId === 'bader-submit') {
      return `<div class="editor-sidebar" style="width:${this._sidebarWidth}px">
        <div class="sidebar-header"><span class="sidebar-title">Submit Script</span><span class="tag tag-proto">bader-submit</span></div>
        <div class="sidebar-content"><div class="sidebar-section"><div class="section-title">EXECUTION ORDER</div>
          <div style="font-size:0.72rem; color:var(--text-dim); line-height:1.65;">Runs SCF with pw.x, then the all-electron and valence-density inputs with pp.x. The resulting cube files are inputs for an external Bader program; this script does not run the Bader executable itself.</div>
        </div></div>
      </div>`;
    }
    const isAll = file.protocolId === 'bader-all';
    const filplotKey = isAll ? 'allFilplot' : 'valenceFilplot';
    const fileoutKey = isAll ? 'allFileout' : 'valenceFileout';
    return `<div class="editor-sidebar" style="width:${this._sidebarWidth}px">
      <div class="sidebar-header"><span class="sidebar-title">${isAll ? 'All-Electron Density' : 'Valence Density'}</span><span class="tag tag-proto">${file.protocolId}</span></div>
      <div class="sidebar-content">
        <div class="sidebar-section"><div class="section-title">&amp;INPUTPP</div>
          <div class="field"><label>prefix</label><input type="text" data-param="prefix" value="${p.prefix || ''}"></div>
          <div class="field"><label>outdir</label><input type="text" data-param="outdir" value="${p.outdir || ''}"></div>
          <div class="field"><label>filplot</label><input type="text" data-param="${filplotKey}" value="${p[filplotKey] || ''}"></div>
          <div class="field"><label>plot_num</label><input type="text" value="${isAll ? '21 — all-electron density' : '0 — valence density'}" disabled></div>
          <div style="font-size:0.62rem; color:var(--text-dim); line-height:1.45;">The Bader workflow fixes plot_num to ${isAll ? '21 for reconstructed all-electron density' : '0 for valence electron density'}, following the uploaded examples.</div>
        </div>
        <div class="sidebar-section"><div class="section-title">&amp;PLOT</div>
          <div class="field-row"><div class="field"><label>nfile</label><input type="number" min="1" data-param="baderNfile" value="${p.baderNfile}"></div><div class="field"><label>iflag</label><input type="number" data-param="baderIflag" value="${p.baderIflag}"></div></div>
          <div class="field"><label>output_format</label><input type="number" data-param="baderOutputFormat" value="${p.baderOutputFormat}"></div>
          <div class="field"><label>fileout</label><input type="text" data-param="${fileoutKey}" value="${p[fileoutKey] || ''}"></div>
          <div style="font-size:0.62rem; color:var(--text-dim); line-height:1.45;">Defaults iflag=3 and output_format=6 produce the 3D Gaussian cube required by common Bader workflows.</div>
        </div>
      </div>
    </div>`;
  }

  _renderVibrationalUtilitySidebar(file, p) {
    if (file.protocolId === 'phonon-submit') {
      return `<div class="editor-sidebar" style="width:${this._sidebarWidth}px"><div class="sidebar-header"><span class="sidebar-title">Submit Script</span><span class="tag tag-proto">phonon-submit</span></div><div class="sidebar-content"><div class="sidebar-section"><div class="section-title">EXECUTION ORDER</div><div style="font-size:0.72rem; color:var(--text-dim); line-height:1.65;">Runs pw.x → ${p.usesD3 ? 'd3hess.x → ' : ''}ph.x → dynmat.x. The d3hess.x command is included only when the SCF uses DFT-D3.</div></div></div></div>`;
    }
    if (file.protocolId === 'phonon-hess') {
      return `<div class="editor-sidebar" style="width:${this._sidebarWidth}px"><div class="sidebar-header"><span class="sidebar-title">DFT-D3 Hessian</span><span class="tag tag-proto">phonon-hess</span></div><div class="sidebar-content"><div class="sidebar-section"><div class="section-title">&amp;INPUT — d3hess.x</div>
        ${p.usesD3 ? `<div class="field"><label>prefix</label><input type="text" data-param="prefix" value="${p.prefix || ''}"></div><div class="field"><label>outdir</label><input type="text" data-param="outdir" value="${p.outdir || ''}"></div><div class="field"><label>filhess</label><input type="text" data-param="hessFile" value="${p.hessFile || ''}"></div><div class="field"><label>step (optional)</label><input type="text" data-param="hessStep" value="${p.hessStep || ''}" placeholder="QE default"></div><div style="font-size:0.62rem; color:var(--text-dim); line-height:1.45;">filhess must match dftd3_hess in the ph.x input.</div>` : `<div style="font-size:0.72rem; color:#f59e0b; line-height:1.6;">Hessian generation is disabled because the SCF vdw_corr is not DFT-D3. Select DFT-D3 on the SCF tab to enable it.</div>`}
      </div></div></div>`;
    }
    if (file.protocolId === 'phonon-ph') {
      return `<div class="editor-sidebar" style="width:${this._sidebarWidth}px"><div class="sidebar-header"><span class="sidebar-title">Phonon Settings</span><span class="tag tag-proto">phonon-ph</span></div><div class="sidebar-content"><div class="sidebar-section"><div class="section-title">&amp;INPUTPH — ph.x</div>
        <div class="field"><label>prefix</label><input type="text" data-param="prefix" value="${p.prefix || ''}"></div><div class="field"><label>outdir</label><input type="text" data-param="outdir" value="${p.outdir || ''}"></div><div class="field"><label>tr2_ph</label><input type="text" data-param="phTr2" value="${p.phTr2}"></div><div class="field"><label>fildyn</label><input type="text" data-param="dynFile" value="${p.dynFile || ''}"></div>
        <div class="field-row"><div class="field"><label>qx</label><input type="text" data-param="qx" value="${p.qx}"></div><div class="field"><label>qy</label><input type="text" data-param="qy" value="${p.qy}"></div><div class="field"><label>qz</label><input type="text" data-param="qz" value="${p.qz}"></div></div>
        <div style="font-size:0.62rem; color:var(--text-dim); line-height:1.45;">Default q=(0,0,0) computes Γ-point vibrational modes. For DFT-D3, dftd3_hess is inserted automatically and matches the Hessian file.</div>
      </div></div></div>`;
    }
    return `<div class="editor-sidebar" style="width:${this._sidebarWidth}px"><div class="sidebar-header"><span class="sidebar-title">Dynmat Settings</span><span class="tag tag-proto">phonon-dyn</span></div><div class="sidebar-content"><div class="sidebar-section"><div class="section-title">&amp;INPUT — dynmat.x</div><div class="field"><label>fildyn</label><input type="text" data-param="dynFile" value="${p.dynFile || ''}"></div><div class="field"><label>asr</label><select data-param="dynAsr"><option value="crystal" ${p.dynAsr === 'crystal' ? 'selected' : ''}>crystal</option><option value="simple" ${p.dynAsr === 'simple' ? 'selected' : ''}>simple</option><option value="one-dim" ${p.dynAsr === 'one-dim' ? 'selected' : ''}>one-dim</option><option value="zero-dim" ${p.dynAsr === 'zero-dim' ? 'selected' : ''}>zero-dim</option><option value="no" ${p.dynAsr === 'no' ? 'selected' : ''}>no</option></select></div><div style="font-size:0.62rem; color:var(--text-dim); line-height:1.45;">Default asr='crystal'. Choose the acoustic sum rule appropriate to the system dimensionality.</div></div></div></div>`;
  }

  _renderPWSubmitSidebar(file) {
    const isSCF = file.protocolId === 'scf-submit';
    return `<div class="editor-sidebar" style="width:${this._sidebarWidth}px"><div class="sidebar-header"><span class="sidebar-title">Submit Script</span><span class="tag tag-proto">${file.protocolId}</span></div><div class="sidebar-content"><div class="sidebar-section"><div class="section-title">${isSCF ? 'SCF' : 'STRUCTURAL RELAXATION'}</div><div style="font-size:0.72rem; color:var(--text-dim); line-height:1.65;">Runs the generated ${isSCF ? 'SCF' : 'structural-relaxation'} input with pw.x and records output using tee. Add only the scheduler, module, MPI, or launcher commands required by your computing environment.</div></div></div></div>`;
  }

  _escapeHTML(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  _emptyState() {
    return `
      <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; color:var(--text-dim); font-family:var(--font-mono); font-size:0.82rem;">
        <div style="font-size:3rem; opacity:0.3;">⌨</div>
        <div>No files open — upload a file or create a new one</div>
      </div>
    `;
  }

  _renderTabsHTML() {
    if(this.files.length>6)return `<div class="input-compact-files"><button data-file-idx="${Math.max(0,this.activeIdx-1)}" ${this.activeIdx<=0?'disabled':''}>‹</button><select id="input-active-file">${this.files.map((file,index)=>`<option value="${index}" ${index===this.activeIdx?'selected':''}>${this._escapeHTML(file.name)}</option>`).join('')}</select><button data-file-idx="${Math.min(this.files.length-1,this.activeIdx+1)}" ${this.activeIdx>=this.files.length-1?'disabled':''}>›</button><span>${this.files.length} files</span><button class="file-tab-close" data-close-idx="${this.activeIdx}" title="Close active file">×</button></div>`;
    return this.files.map((f, i) => `
      <div class="file-tab ${i === this.activeIdx ? 'active' : ''}" data-file-idx="${i}">
        <span>${f.name}</span>
        <span class="file-tab-close" data-close-idx="${i}">✕</span>
      </div>
    `).join('');
  }

  _bindEvents() {
    const dropZone = this.container.querySelector('#in-drop-zone');
    const fileInput = this.container.querySelector('#in-file-input');

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault(); dropZone.classList.remove('drag-over');
      this._handleFiles(Array.from(e.dataTransfer.files));
    });
    fileInput.addEventListener('change', e => { this._handleFiles(Array.from(e.target.files)); });

    this.container.querySelector('#btn-new-in-file')?.addEventListener('click', () => {
      this._addFile(this._uniqueName('untitled.in'), '&CONTROL\n  calculation = \'scf\'\n/\n');
    });
    this.container.querySelector('#btn-add-tab')?.addEventListener('click', () => {
      this._addFile(this._uniqueName('untitled.in'), '&CONTROL\n  calculation = \'scf\'\n/\n');
    });

    const ta = this.container.querySelector('#editor-textarea');
    if (ta) {
      ta.addEventListener('input', () => {
        if (this.files[this.activeIdx]) {
          this.files[this.activeIdx].content = ta.value;
        }
        this._refreshLineNumbers();
      });
      ta.addEventListener('scroll', () => {
        const ln = this.container.querySelector('#line-numbers');
        if (ln) ln.scrollTop = ta.scrollTop;
      });
      ta.addEventListener('keydown', e => {
        if (e.ctrlKey && e.key === 's') { e.preventDefault(); this._downloadActive(); }
      });
    }

    this.container.querySelector('#btn-download-in')?.addEventListener('click', () => this._downloadActive());

    // Tab clicks — use event delegation
    this.container.querySelector('#file-tabs-bar').addEventListener('click', e => {
      const closeIdx = e.target.closest('[data-close-idx]');
      if (closeIdx) { this._closeFile(parseInt(closeIdx.dataset.closeIdx)); return; }
      const tab = e.target.closest('[data-file-idx]');
      if (tab) { this._switchTab(parseInt(tab.dataset.fileIdx)); }
    });
    this.container.querySelector('#input-active-file')?.addEventListener('change',e=>this._switchTab(Number(e.target.value)));
  }

  _setupEditorSplitter() {
    const splitter = this.container.querySelector('#editor-splitter');
    if (!splitter) return;
    splitter.addEventListener('mousedown', event => {
      event.preventDefault();
      this._splitterDrag = true;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', this._onSplitterMove);
      window.addEventListener('mouseup', this._onSplitterUp);
    });
    splitter.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const step = event.shiftKey ? 50 : 20;
      this._applySidebarWidth(this._sidebarWidth + (event.key === 'ArrowLeft' ? step : -step));
    });
    splitter.addEventListener('dblclick', () => this._applySidebarWidth(300));
    this._applySidebarWidth(this._sidebarWidth);
  }

  _resizeSidebarFromPointer(clientX) {
    if (!this._splitterDrag) return;
    const layout = this.container.querySelector('.editor-main-container');
    if (!layout) return;
    const rect = layout.getBoundingClientRect();
    this._applySidebarWidth(rect.right - clientX);
  }

  _applySidebarWidth(requestedWidth) {
    const layout = this.container.querySelector('.editor-main-container');
    const sidebar = this.container.querySelector('.editor-sidebar');
    const splitter = this.container.querySelector('#editor-splitter');
    if (!layout || !sidebar || !splitter) return;
    const minSidebar = 220;
    const minEditor = 320;
    const maxSidebar = Math.max(minSidebar, layout.getBoundingClientRect().width - minEditor - 7);
    this._sidebarWidth = Math.round(Math.max(minSidebar, Math.min(maxSidebar, requestedWidth)));
    sidebar.style.width = `${this._sidebarWidth}px`;
    splitter.setAttribute('aria-valuenow', String(this._sidebarWidth));
  }

  _stopSidebarResize() {
    this._splitterDrag = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', this._onSplitterMove);
    window.removeEventListener('mouseup', this._onSplitterUp);
  }

  _bindSidebarEvents() {
    const sidebar = this.container.querySelector('.editor-sidebar');
    if (!sidebar) return;

    const inputs = sidebar.querySelectorAll('input[data-param], select[data-param], input[data-species], select[data-species]');
    inputs.forEach(inp => {
      inp.addEventListener('change', () => {
        const file = this.files[this.activeIdx];
        if (!file) return;

        if (inp.dataset.param) {
          const key = inp.dataset.param;
          file.params[key] = inp.value;
        } else if (inp.dataset.species) {
          const sym = inp.dataset.species;
          const field = inp.dataset.field;
          if (!file.params.speciesParams) file.params.speciesParams = {};
          if (!file.params.speciesParams[sym]) file.params.speciesParams[sym] = {};
          
          if (field === 'pseudo') {
            file.params.speciesParams[sym].pseudo = inp.value;
          } else {
            file.params.speciesParams[sym][field] = inp.value;
          }
        }

        // Re-generate the active file, or all files in a coordinated workflow.
        if (file.workflowId) {
          this._regenerateWorkflow(file);
        } else {
          file.content = generateQEInput(file.protocolId, file.cifData, file.params);
        }
        
        // Update editor
        const ta = this.container.querySelector('#editor-textarea');
        if (ta) ta.value = file.content;
        this._refreshLineNumbers();

        // If nspin or something that affects species UI changed, re-render sidebar partially?
        // For simplicity, re-render the whole thing if it's a major change, but let's just re-render sidebar for now.
        if (inp.dataset.param === 'nspin' || inp.dataset.param === 'vdw_corr' || inp.dataset.param === 'occupations') {
          this.render();
        }
      });
    });

    sidebar.querySelectorAll('[data-k-field]').forEach(input => {
      input.addEventListener('change', () => {
        const file = this.files[this.activeIdx];
        const index = parseInt(input.dataset.kIndex);
        const point = file?.params?.kPath?.[index];
        if (!point) return;
        if (input.dataset.kField === 'label') {
          const selected = BAND_K_POINT_OPTIONS.find(option => option.label === input.value);
          if (selected) Object.assign(point, { label: selected.label, x: selected.x, y: selected.y, z: selected.z });
        } else {
          point.points = Math.max(1, parseInt(input.value) || 20);
        }
        this._regenerateWorkflow(file);
        this.render();
      });
    });

    sidebar.querySelector('[data-band-preset]')?.addEventListener('change', event => {
      const file = this.files[this.activeIdx];
      if (!file) return;
      const suggestion = getSuggestedBandPath(file.cifData, event.target.value);
      file.params.bandPathPreset = suggestion.presetId;
      file.params.kPath = suggestion.kPath;
      this._regenerateWorkflow(file);
      this.render();
    });

    sidebar.querySelectorAll('[data-k-action]').forEach(button => {
      button.addEventListener('click', () => {
        const file = this.files[this.activeIdx];
        if (!file?.params?.kPath) return;
        if (button.dataset.kAction === 'add') {
          const gamma = BAND_K_POINT_OPTIONS[0];
          file.params.kPath.push({ label: gamma.label, x: gamma.x, y: gamma.y, z: gamma.z, points: 20 });
        } else if (file.params.kPath.length > 2) {
          file.params.kPath.splice(parseInt(button.dataset.kIndex), 1);
        }
        this._regenerateWorkflow(file);
        this.render();
      });
    });
  }

  _handleFiles(files) {
    files.forEach(f => {
      const reader = new FileReader();
      reader.onload = ev => this._addFile(f.name, ev.target.result);
      reader.readAsText(f);
    });
  }

  _regenerateWorkflow(file) {
    const workflow = file.workflowId.startsWith('bands-')
      ? generateBandsWorkflow(file.cifData, file.params)
      : file.workflowId.startsWith('charge-')
        ? generateChargeWorkflow(file.cifData, file.params)
        : file.workflowId.startsWith('bader-')
          ? generateBaderWorkflow(file.cifData, file.params)
          : file.workflowId.startsWith('phonon-')
            ? generateVibrationalWorkflow(file.cifData, file.params)
            : file.workflowId.startsWith('pw-')
              ? generatePWWorkflow(file.protocolId, file.cifData, file.params)
              : generateDOSWorkflow(file.cifData, file.params);
    Object.assign(file.params, workflow.params);
    workflow.files.forEach(generated => {
      const existing = this.files.find(f => f.workflowId === file.workflowId && f.name === generated.filename);
      if (existing) {
        existing.content = generated.text;
        existing.protocolId = generated.protocolId;
        existing.params = file.params;
      }
    });
  }

  _addFile(name, content, meta = {}) {
    // Avoid duplicates by name
    const existing = this.files.findIndex(f => f.name === name);
    if (existing >= 0) { this._switchTab(existing); return; }
    this.files.push({ 
      name, 
      content, 
      ...meta,
      params: meta.params || {}
    });
    this.activeIdx = this.files.length - 1;
    this.render();
  }

  _uniqueName(base) {
    const ext  = base.lastIndexOf('.') >= 0 ? base.slice(base.lastIndexOf('.')) : '';
    const stem = base.lastIndexOf('.') >= 0 ? base.slice(0, base.lastIndexOf('.')) : base;
    if (!this.files.find(f => f.name === base)) return base;
    let n = 1;
    while (this.files.find(f => f.name === `${stem}_${n}${ext}`)) n++;
    return `${stem}_${n}${ext}`;
  }

  _switchTab(idx) {
    // Save current textarea content
    const ta = this.container.querySelector('#editor-textarea');
    if (ta && this.files[this.activeIdx]) {
      this.files[this.activeIdx].content = ta.value;
    }
    this.activeIdx = idx;
    this.render();
  }

  _closeFile(idx) {
    this.files.splice(idx, 1);
    this.activeIdx = Math.min(this.activeIdx, this.files.length - 1);
    if (this.activeIdx < 0) this.activeIdx = 0;
    this.render();
  }

  _refreshLineNumbers() {
    const ta = this.container.querySelector('#editor-textarea');
    const ln = this.container.querySelector('#line-numbers');
    const lc = this.container.querySelector('#line-count-info');
    if (!ta || !ln) return;
    const lines = ta.value.split('\n').length;
    ln.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
    if (lc) lc.textContent = lines + ' lines';
  }

  _downloadActive() {
    const file = this.files[this.activeIdx];
    if (!file) return;
    const ta = this.container.querySelector('#editor-textarea');
    const content = ta ? ta.value : file.content;
    const blob = new Blob([content], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
  }

  destroy() { this._stopSidebarResize(); }
}
