import { parseQEOutput, generateCIF, generateAtomicPositions } from '../lib/qeParser.js';
import { cifToQE } from '../lib/cifToQE.js';
import { parseQEOut, patchInputFile, buildIN, hlCode, hlDiff } from '../lib/qeInputGenerator.js';

// ─── Shared helpers ───────────────────────────────────────────────────────────
function escapeHTML(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function dlBlob(content, name) {
  const blob = new Blob([content], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function readFileText(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = e => res(e.target.result);
    r.onerror = () => rej(new Error('Read failed'));
    r.readAsText(file);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// OUT → CIF Panel (QE output → CIF/ATOMIC_POSITIONS)
// ═══════════════════════════════════════════════════════════════════════════════

function renderLattice(p) {
  const { a, b, c, al, be, ga, vol } = p;
  return `
    <div class="qp-lat-grid">
      <div class="qp-lat-cell"><div class="qp-lat-label">a</div><div class="qp-lat-value">${a.toFixed(5)}</div><div class="qp-lat-unit">Å</div></div>
      <div class="qp-lat-cell"><div class="qp-lat-label">b</div><div class="qp-lat-value">${b.toFixed(5)}</div><div class="qp-lat-unit">Å</div></div>
      <div class="qp-lat-cell"><div class="qp-lat-label">c</div><div class="qp-lat-value">${c.toFixed(5)}</div><div class="qp-lat-unit">Å</div></div>
      <div class="qp-lat-cell"><div class="qp-lat-label">α</div><div class="qp-lat-value">${al.toFixed(4)}</div><div class="qp-lat-unit">°</div></div>
      <div class="qp-lat-cell"><div class="qp-lat-label">β</div><div class="qp-lat-value">${be.toFixed(4)}</div><div class="qp-lat-unit">°</div></div>
      <div class="qp-lat-cell"><div class="qp-lat-label">γ</div><div class="qp-lat-value">${ga.toFixed(4)}</div><div class="qp-lat-unit">°</div></div>
    </div>
    <div class="qp-vol-row">
      <span class="qp-vol-label">VOLUME</span>
      <span class="qp-vol-value">${vol.toFixed(4)}</span>
      <span class="qp-vol-unit">Å³</span>
    </div>`;
}

function renderVecs(vecs) {
  return `<table class="qp-vt">
    <thead><tr><th>Vec</th><th>x (Å)</th><th>y (Å)</th><th>z (Å)</th></tr></thead>
    <tbody>${vecs.map((v,i) => `<tr>
      <td><span class="qp-vec-lbl">a${i+1}</span></td>
      <td>${v[0].toFixed(8)}</td><td>${v[1].toFixed(8)}</td><td>${v[2].toFixed(8)}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

function renderAtoms(atoms) {
  return `<div class="qp-at-wrap"><table class="qp-at">
    <thead><tr><th>#</th><th>Elem</th><th>x</th><th>y</th><th>z</th></tr></thead>
    <tbody>${atoms.map((a,i) => `<tr>
      <td><span class="qp-ai">${i+1}</span></td>
      <td><span class="qp-ae">${escapeHTML(a.elem)}</span></td>
      <td>${a.x.toFixed(8)}</td><td>${a.y.toFixed(8)}</td><td>${a.z.toFixed(8)}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function renderStructurePanel(structure) {
  if (!structure) return `<div class="qp-no-data">No structure data found.</div>`;
  return `
    <div class="qp-grid2">
      <div class="qp-card">
        <div class="qp-card-head"><span class="qp-card-title">Lattice Parameters</span><span class="qp-ctag">angstrom</span></div>
        <div class="qp-card-body">${renderLattice(structure.params)}</div>
      </div>
      <div class="qp-card">
        <div class="qp-card-head"><span class="qp-card-title">Cell Vectors (Å)</span></div>
        <div class="qp-card-body">${renderVecs(structure.vecs)}</div>
      </div>
    </div>
    <div class="qp-card" style="margin-top:14px">
      <div class="qp-card-head">
        <span class="qp-card-title">Atomic Positions</span>
        <span class="qp-ctag">${structure.coordType}</span>
      </div>
      <div class="qp-card-body">${renderAtoms(structure.atoms)}</div>
    </div>`;
}

class OutToCifPanel {
  constructor(container) {
    this.container = container;
    this.files  = [];
    this.active = -1;
    this.filesExpanded = false;
    this._render();
  }

  _render() {
    this.container.innerHTML = `
      <div class="qp-layout">
        <div class="qp-sidebar">
          <div class="qp-sb-hd">
            <span class="qp-sb-title">Files</span>
            <span class="qp-sb-count" id="qp-sb-count">0</span>
          </div>
          <div class="qp-file-list" id="qp-file-list"></div>
          <div class="qp-sb-btns">
            <input type="file" id="qp-add-input" accept=".out,.log,.txt,.pwout" multiple style="display:none">
            <button class="qp-sb-btn qp-sb-add" id="qp-add-btn">+ Add files</button>
            <button class="qp-sb-btn qp-sb-zip" id="qp-zip-cif" disabled>↓ ZIP all CIFs</button>
            <button class="qp-sb-btn qp-sb-zip" id="qp-zip-pos" disabled>↓ ZIP all positions</button>
          </div>
        </div>
        <div class="qp-content">
          <div class="qp-drop-screen" id="qp-drop-screen">
            <div class="qp-dz" id="qp-dz">
              <input type="file" id="qp-file-input" accept=".out,.log,.txt,.pwout" multiple>
              <span class="qp-dz-ico">⚛</span>
              <div class="qp-dz-title">Drop QE output files here</div>
              <div class="qp-dz-sub">Upload <strong>.out</strong> files from vc-relax or relax calculations</div>
              <span class="qp-dz-ext">.out · .log · .pwout · .txt · multiple OK</span>
            </div>
          </div>
          <div class="qp-viewer" id="qp-viewer" style="display:none"></div>
        </div>
      </div>
    `;
    this._bindEvents();
  }

  _bindEvents() {
    const dz        = this.container.querySelector('#qp-dz');
    const fileInput = this.container.querySelector('#qp-file-input');
    const addInput  = this.container.querySelector('#qp-add-input');
    const addBtn    = this.container.querySelector('#qp-add-btn');

    fileInput.addEventListener('change', e => { if (e.target.files.length) this._addFiles(e.target.files); });
    addInput.addEventListener('change',  e => { if (e.target.files.length) { this._addFiles(e.target.files); e.target.value = ''; } });
    addBtn.addEventListener('click', () => addInput.click());
    dz.addEventListener('click',     () => fileInput.click());
    dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
    dz.addEventListener('drop', e => {
      e.preventDefault(); dz.classList.remove('drag-over');
      if (e.dataTransfer.files.length) this._addFiles(e.dataTransfer.files);
    });
    this.container.querySelector('#qp-zip-cif').addEventListener('click', () => this._zipAll('cif'));
    this.container.querySelector('#qp-zip-pos').addEventListener('click', () => this._zipAll('pos'));
  }

  async _addFiles(fileList) {
    const arr = Array.from(fileList);
    if (!arr.length) return;
    this.container.querySelector('#qp-drop-screen').style.display = 'none';
    this.container.querySelector('#qp-viewer').style.display = '';

    for (const file of arr) {
      if (this.files.find(f => f.name === file.name && f.size === file.size)) continue;
      const entry = { name: file.name, size: file.size, parsed: null, error: null, status: 'pending' };
      this.files.push(entry);
      const idx = this.files.length - 1;
      this._renderSidebar();
      if (this.active < 0) this._selectFile(idx);
      try {
        const text = await readFileText(file);
        entry.parsed = parseQEOutput(text);
        entry.status = entry.parsed.isRelaxed ? 'conv' : 'nconv';
      } catch (e) {
        entry.error = e.message;
        entry.status = 'err';
      }
      this._renderSidebar();
      if (this.active === idx) this._renderViewer(idx);
    }
    this._updateZipBtns();
  }

  _renderSidebar() {
    this.container.querySelector('#qp-sb-count').textContent = this.files.length;
    const host=this.container.querySelector('#qp-file-list');if(!this.files.length){host.innerHTML='';return;}host.innerHTML = `<div class="qp-compact-nav"><button data-qp-step="-1" ${this.active<=0?'disabled':''}>‹</button><select id="qp-active-file">${this.files.map((file,index)=>`<option value="${index}" ${index===this.active?'selected':''}>${escapeHTML(file.name)}</option>`).join('')}</select><button data-qp-step="1" ${this.active>=this.files.length-1?'disabled':''}>›</button><button id="qp-manage-files" class="${this.filesExpanded?'active':''}">☰</button></div><div class="qp-managed-list ${this.filesExpanded?'open':''}"><input id="qp-file-search" type="search" placeholder="Search outputs…">${this.files.map((f, i) => `
      <div class="qp-fi ${i === this.active ? 'active' : ''}" data-idx="${i}">
        <div class="qp-fi-dot ${f.status}"></div>
        <div class="qp-fi-name" title="${escapeHTML(f.name)}">${escapeHTML(f.name)}</div>
        <button class="qp-fi-rm" data-rm="${i}">✕</button>
      </div>`).join('')}</div>`;

    host.querySelector('#qp-active-file').addEventListener('change',event=>this._selectFile(Number(event.target.value)));
    host.querySelectorAll('[data-qp-step]').forEach(button=>button.addEventListener('click',()=>this._selectFile(this.active+Number(button.dataset.qpStep))));
    host.querySelector('#qp-manage-files').addEventListener('click',()=>{this.filesExpanded=!this.filesExpanded;this._renderSidebar();});
    host.querySelector('#qp-file-search').addEventListener('input',event=>{const query=event.target.value.trim().toLowerCase();host.querySelectorAll('.qp-fi').forEach(row=>row.hidden=!this.files[Number(row.dataset.idx)].name.toLowerCase().includes(query));});

    this.container.querySelectorAll('.qp-fi').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.closest('[data-rm]')) return;
        this._selectFile(parseInt(el.dataset.idx));
      });
    });
    this.container.querySelectorAll('[data-rm]').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); this._removeFile(parseInt(btn.dataset.rm)); });
    });
  }

  _selectFile(idx) { this.active = idx; this._renderSidebar(); this._renderViewer(idx); }

  _removeFile(idx) {
    this.files.splice(idx, 1);
    if (this.files.length === 0) {
      this.active = -1;
      this.container.querySelector('#qp-drop-screen').style.display = '';
      this.container.querySelector('#qp-viewer').style.display = 'none';
      this._renderSidebar(); return;
    }
    if (this.active >= this.files.length) this.active = this.files.length - 1;
    this._renderSidebar(); this._selectFile(this.active); this._updateZipBtns();
  }

  _renderViewer(idx) {
    const viewer = this.container.querySelector('#qp-viewer');
    const f = this.files[idx];
    if (!f) { viewer.innerHTML = '<div class="qp-empty">Select a file from the list</div>'; return; }
    if (f.status === 'pending') { viewer.innerHTML = '<div class="qp-proc"><div class="qp-spinner"></div> Parsing…</div>'; return; }
    if (f.status === 'err')     { viewer.innerHTML = `<div class="qp-err-box">⚠ ${escapeHTML(f.error || 'Could not parse file')}</div>`; return; }

    const p = f.parsed;
    const alertHTML = !p.isRelaxed ? `
      <div class="qp-alert">
        <span class="qp-alert-ico">⚠</span>
        <div>
          <strong class="qp-alert-title">Not fully relaxed</strong>
          <div class="qp-alert-body">${p.nSteps > 0
            ? `Did not converge after ${p.nSteps} step${p.nSteps !== 1 ? 's' : ''}. Showing latest available structure.`
            : 'No relaxation steps found.'}</div>
        </div>
      </div>` : '';

    let volBadge = '';
    if (p.initial && p.final) {
      const dv = (p.final.params.vol - p.initial.params.vol) / p.initial.params.vol * 100;
      const sign = dv >= 0 ? '+' : '';
      volBadge = `<span class="qp-vol-badge ${dv >= 0 ? 'pos' : 'neg'}">${sign}${dv.toFixed(2)}% vol</span>`;
    }

    const baseId = `qpv${idx}`;
    viewer.innerHTML = `
      <div class="qp-topbar">
        <span class="qp-file-badge">${escapeHTML(f.name)}</span>
        <span class="qp-steps-badge">${p.nSteps > 0 ? p.nSteps + ' step' + (p.nSteps !== 1 ? 's' : '') : escapeHTML(p.calcType)}</span>
        <button class="qp-clear-btn" id="qp-clear-btn">↩ Clear all</button>
      </div>
      ${alertHTML}
      <div class="qp-dl-bar">
        <button class="qp-dl-btn qp-dlp" id="${baseId}-dl-cif">↓ Save as CIF</button>
        <button class="qp-dl-btn qp-dls" id="${baseId}-dl-pos">↓ ATOMIC_POSITIONS (.txt)</button>
      </div>
      <div class="qp-tabs-wrap">
        <div class="qp-tabs-bar">
          <div class="qp-tab active" data-panel="${baseId}-init">
            <span class="qp-tab-dot accent"></span>Initial Structure
          </div>
          <div class="qp-tab" data-panel="${baseId}-final">
            <span class="qp-tab-dot green"></span>${p.isRelaxed ? 'Final Structure' : 'Latest Structure'} ${volBadge}
          </div>
        </div>
      </div>
      <div class="qp-panels">
        <div class="qp-panel active" id="${baseId}-init">${renderStructurePanel(p.initial)}</div>
        <div class="qp-panel" id="${baseId}-final">${renderStructurePanel(p.final)}</div>
      </div>`;

    viewer.querySelectorAll('.qp-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        viewer.querySelectorAll('.qp-tab').forEach(t => t.classList.remove('active'));
        viewer.querySelectorAll('.qp-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const panel = document.getElementById(tab.dataset.panel);
        if (panel) panel.classList.add('active');
      });
    });

    viewer.querySelector(`#${baseId}-dl-cif`).addEventListener('click', () => {
      if (!p.final) return;
      const sfx = p.isRelaxed ? '_final' : '_latest';
      dlBlob(generateCIF(p.final, f.name), f.name.replace(/\.(out|log|pwout|txt)$/i, '') + sfx + '.cif');
    });
    viewer.querySelector(`#${baseId}-dl-pos`).addEventListener('click', () => {
      if (!p.final) return;
      const sfx = p.isRelaxed ? '_final' : '_latest';
      dlBlob(generateAtomicPositions(p.final), f.name.replace(/\.(out|log|pwout|txt)$/i, '') + sfx + '_positions.txt');
    });
    viewer.querySelector('#qp-clear-btn').addEventListener('click', () => {
      this.files = []; this.active = -1;
      this.container.querySelector('#qp-drop-screen').style.display = '';
      this.container.querySelector('#qp-viewer').style.display = 'none';
      this._renderSidebar(); this._updateZipBtns();
    });
  }

  async _zipAll(type) {
    const done = this.files.filter(f => f.parsed && f.parsed.final);
    if (!done.length) return;
    let JSZip;
    try { JSZip = (await import('jszip')).default; }
    catch { alert('JSZip not available. Run: npm install jszip'); return; }
    const zip = new JSZip();
    for (const f of done) {
      const sfx  = f.parsed.isRelaxed ? '_final' : '_latest';
      const base = f.name.replace(/\.(out|log|pwout|txt)$/i, '');
      zip.file(
        type === 'cif' ? base + sfx + '.cif' : base + sfx + '_positions.txt',
        type === 'cif' ? generateCIF(f.parsed.final, f.name) : generateAtomicPositions(f.parsed.final)
      );
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = type === 'cif' ? 'qe_cifs.zip' : 'qe_positions.zip';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  _updateZipBtns() {
    const any = this.files.some(f => f.parsed && f.parsed.final);
    this.container.querySelector('#qp-zip-cif').disabled = !any;
    this.container.querySelector('#qp-zip-pos').disabled = !any;
  }

  destroy() {}
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXTRACT COORDINATES Panel (CIF → ATOMIC_POSITIONS)
// ═══════════════════════════════════════════════════════════════════════════════
class ExtractCoordsPanel {
  constructor(container) {
    this.container = container;
    this.files     = [];   // { file, name, result: null|{text,atomCount,species,cellStr,sg}, error: null }
    this.activeIdx = -1;
    this.filesExpanded = false;
    this._render();
  }

  _render() {
    this.container.innerHTML = `
      <div class="ec-layout">

        <!-- LEFT: Upload + Options + File list -->
        <div class="ec-left">

          <div>
            <div class="ec-section-label">Upload CIF Files</div>
            <div class="ec-dropzone" id="ec-dz">
              <input type="file" id="ec-file-input" multiple accept=".cif">
              <div class="ec-dz-icon">⚛</div>
              <div class="ec-dz-main">Drop .cif files here</div>
              <div class="ec-dz-sub">or click to browse · single &amp; bulk supported</div>
            </div>
          </div>

          <div>
            <div class="ec-section-label">Options</div>
            <div class="ec-options-block">
              <div class="ec-opt-row">
                <span class="ec-opt-label">Coordinate type</span>
                <select class="ec-select" id="ec-coord-type">
                  <option value="angstrom">Angstrom (default)</option>
                  <option value="crystal">Crystal (fractional)</option>
                </select>
              </div>
              <div class="ec-opt-row">
                <span class="ec-opt-label">Decimal places</span>
                <input class="ec-number" type="number" id="ec-decimals" value="8" min="4" max="14">
              </div>
            </div>
          </div>

          <div style="display:flex;flex-direction:column;gap:8px;flex:1;min-height:0;">
            <div class="ec-section-label">Queued Files (<span id="ec-file-count">0</span>)</div>
            <div class="ec-compact-nav"><button data-ec-step="-1">‹</button><select id="ec-active-file"><option>No files</option></select><button data-ec-step="1">›</button><button class="ec-queue-toggle" id="ec-queue-toggle">☰</button></div>
            <div class="ec-file-list compact-collapsed" id="ec-file-list-wrap">
              <div class="ec-file-list-header">
                <span>NAME</span>
                <button class="ec-clear-btn" id="ec-clear-btn">CLEAR ALL</button>
              </div>
              <div class="ec-file-items" id="ec-file-items">
                <div class="ec-empty-hint">No files loaded</div>
              </div>
            </div>
          </div>

          <div class="ec-actions">
            <button class="ec-btn ec-btn-primary" id="ec-convert-btn" disabled>Convert All</button>
            <button class="ec-btn ec-btn-secondary" id="ec-dl-all-btn" disabled>↓ ZIP All</button>
          </div>
        </div>

        <!-- RIGHT: Output preview -->
        <div class="ec-right">
          <div class="ec-output-header">
            <span class="ec-output-filename ec-empty" id="ec-output-filename">Select a file to preview output</span>
            <button class="ec-copy-btn" id="ec-copy-btn" style="display:none">COPY</button>
            <button class="ec-dl-single-btn" id="ec-dl-single-btn" style="display:none">↓ TXT</button>
          </div>
          <div class="ec-progress" id="ec-progress"><div class="ec-progress-bar" id="ec-progress-fill"></div></div>
          <div class="ec-stats-bar" id="ec-stats-bar" style="display:none">
            <div class="ec-stat">ATOMS <strong id="ec-stat-atoms">–</strong></div>
            <div class="ec-stat">SPECIES <strong id="ec-stat-species">–</strong></div>
            <div class="ec-stat">CELL <strong id="ec-stat-cell">–</strong></div>
            <div class="ec-stat">SG <strong id="ec-stat-sg">–</strong></div>
          </div>
          <div id="ec-output-area" class="ec-output-area">
            <div class="ec-placeholder" id="ec-placeholder">
              <span class="ec-placeholder-ico">⚛</span>
              <span>Upload and convert CIF files to see ATOMIC_POSITIONS output</span>
            </div>
          </div>
        </div>
      </div>
    `;
    this._bindEvents();
  }

  _bindEvents() {
    const dz        = this.container.querySelector('#ec-dz');
    const fileInput = this.container.querySelector('#ec-file-input');

    fileInput.addEventListener('change', e => this._addFiles(e.target.files));
    dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('ec-drag-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('ec-drag-over'));
    dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('ec-drag-over'); this._addFiles(e.dataTransfer.files); });

    this.container.querySelector('#ec-clear-btn').addEventListener('click',    () => this._clearAll());
    this.container.querySelector('#ec-queue-toggle').addEventListener('click',()=>{this.filesExpanded=!this.filesExpanded;this.container.querySelector('#ec-file-list-wrap').classList.toggle('compact-collapsed',!this.filesExpanded);this.container.querySelector('#ec-queue-toggle').textContent=`☰ ${this.filesExpanded?'Hide':'Manage'} queue (${this.files.length})`;});
    this.container.querySelector('#ec-active-file').addEventListener('change',event=>this._selectFile(Number(event.target.value)));
    this.container.querySelectorAll('[data-ec-step]').forEach(button=>button.addEventListener('click',()=>this._selectFile(Math.max(0,Math.min(this.files.length-1,this.activeIdx+Number(button.dataset.ecStep))))));
    this.container.querySelector('#ec-convert-btn').addEventListener('click',  () => this._convertAll());
    this.container.querySelector('#ec-dl-all-btn').addEventListener('click',   () => this._downloadAll());
    this.container.querySelector('#ec-copy-btn').addEventListener('click',     () => this._copyOutput());
    this.container.querySelector('#ec-dl-single-btn').addEventListener('click',() => this._downloadSingle());
  }

  _addFiles(fileList) {
    const arr = Array.from(fileList).filter(f => f.name.toLowerCase().endsWith('.cif'));
    for (const f of arr) {
      if (!this.files.find(s => s.name === f.name && s.file.size === f.size)) {
        this.files.push({ file: f, name: f.name, result: null, error: null });
      }
    }
    this._renderFileList();
    this._updateButtons();
    if (this.files.length && this.activeIdx < 0) this._selectFile(0);
  }

  _clearAll() {
    this.files = []; this.activeIdx = -1;
    this._renderFileList(); this._updateButtons(); this._showPlaceholder();
  }

  _selectFile(idx) {
    this.activeIdx = idx;
    this._renderFileList();
    const entry = this.files[idx];
    if (!entry) return;
    const fn = this.container.querySelector('#ec-output-filename');
    fn.className = 'ec-output-filename';
    fn.textContent = entry.name.replace(/\.cif$/i, '.txt');
    if (entry.error)        this._showError(entry.error);
    else if (entry.result)  this._showResult(entry.result);
    else                    this._showPlaceholder('Click "Convert All" to process this file');
  }

  _renderFileList() {
    this.container.querySelector('#ec-file-count').textContent = this.files.length;
    this.container.querySelector('#ec-queue-toggle').textContent=`☰ ${this.filesExpanded?'Hide':'Manage'} queue (${this.files.length})`;
    const selector=this.container.querySelector('#ec-active-file');selector.innerHTML=this.files.length?this.files.map((entry,index)=>`<option value="${index}" ${index===this.activeIdx?'selected':''}>${escapeHTML(entry.name)}</option>`).join(''):'<option>No files</option>';selector.disabled=!this.files.length;
    const items = this.container.querySelector('#ec-file-items');
    if (!this.files.length) { items.innerHTML = '<div class="ec-empty-hint">No files loaded</div>'; return; }
    items.innerHTML = '';
    this.files.forEach((entry, idx) => {
      const el = document.createElement('div');
      el.className = 'ec-file-item' + (idx === this.activeIdx ? ' active' : '');
      const statusCls = entry.error ? 'ec-status-error' : entry.result ? 'ec-status-ok' : 'ec-status-pending';
      const size = entry.file.size > 1024 ? (entry.file.size/1024).toFixed(1)+'KB' : entry.file.size+'B';
      el.innerHTML = `
        <div class="ec-file-status ${statusCls}"></div>
        <div class="ec-file-name" title="${escapeHTML(entry.name)}">${escapeHTML(entry.name)}</div>
        <div class="ec-file-size">${size}</div>`;
      el.addEventListener('click', () => this._selectFile(idx));
      items.appendChild(el);
    });
  }

  _updateButtons() {
    const c = this.container;
    c.querySelector('#ec-convert-btn').disabled = this.files.length === 0;
    c.querySelector('#ec-dl-all-btn').disabled  = !this.files.some(f => f.result);
  }

  // ── Output display ──────────────────────────────────────────────────────────
  _showPlaceholder(msg) {
    const area = this.container.querySelector('#ec-output-area');
    area.innerHTML = `<div class="ec-placeholder"><span class="ec-placeholder-ico">⚛</span><span>${msg || 'Upload and convert CIF files to see ATOMIC_POSITIONS output'}</span></div>`;
    this.container.querySelector('#ec-stats-bar').style.display = 'none';
    this.container.querySelector('#ec-copy-btn').style.display  = 'none';
    this.container.querySelector('#ec-dl-single-btn').style.display = 'none';
  }

  _showError(msg) {
    this.container.querySelector('#ec-output-area').innerHTML = `<div class="ec-error-box">⚠ ${escapeHTML(msg)}</div>`;
    this.container.querySelector('#ec-stats-bar').style.display = 'none';
    this.container.querySelector('#ec-copy-btn').style.display  = 'none';
    this.container.querySelector('#ec-dl-single-btn').style.display = 'none';
  }

  _showResult(result) {
    const c = this.container;
    c.querySelector('#ec-stats-bar').style.display       = 'flex';
    c.querySelector('#ec-stat-atoms').textContent        = result.atomCount;
    c.querySelector('#ec-stat-species').textContent      = result.species.join(', ');
    c.querySelector('#ec-stat-cell').textContent         = result.cellStr;
    c.querySelector('#ec-stat-sg').textContent           = result.sg;
    c.querySelector('#ec-copy-btn').style.display        = '';
    c.querySelector('#ec-dl-single-btn').style.display   = '';

    // Syntax highlight
    const lines = result.text.split('\n');
    let html = '';
    for (const line of lines) {
      if (!line.trim()) { html += '\n'; continue; }
      if (line.startsWith('ATOMIC')) {
        html += `<span class="ec-line-header">${escapeHTML(line)}</span>\n`;
      } else {
        const m = line.match(/^(\S+)\s+(.*)$/);
        if (m) html += `<span class="ec-line-elem">${escapeHTML(m[1])}</span>   <span class="ec-line-coord">${escapeHTML(m[2])}</span>\n`;
        else   html += escapeHTML(line) + '\n';
      }
    }
    c.querySelector('#ec-output-area').innerHTML = `<div class="ec-code-output">${html}</div>`;
  }

  // ── Conversion ──────────────────────────────────────────────────────────────
  async _convertAll() {
    const mode = this.container.querySelector('#ec-coord-type').value;
    const dp   = this.container.querySelector('#ec-decimals').value;
    this.container.querySelector('#ec-convert-btn').disabled = true;
    const prog = this.container.querySelector('#ec-progress');
    const fill = this.container.querySelector('#ec-progress-fill');
    prog.classList.add('active');
    fill.style.width = '0%';

    for (let i = 0; i < this.files.length; i++) {
      const entry = this.files[i];
      entry.result = null; entry.error = null;
      try {
        const text = await readFileText(entry.file);
        entry.result = cifToQE(text, mode, dp);
      } catch (e) {
        entry.error = e.message;
      }
      fill.style.width = ((i + 1) / this.files.length * 100) + '%';
      this._renderFileList();
      if (i === this.activeIdx) {
        if (entry.error) this._showError(entry.error);
        else             this._showResult(entry.result);
      }
    }

    // Select first successful if none shown
    if (this.activeIdx < 0 || (!this.files[this.activeIdx]?.result && !this.files[this.activeIdx]?.error)) {
      const first = this.files.findIndex(f => f.result);
      if (first >= 0) this._selectFile(first);
    } else {
      this._selectFile(this.activeIdx);
    }

    setTimeout(() => prog.classList.remove('active'), 600);
    this.container.querySelector('#ec-convert-btn').disabled = false;
    this._updateButtons();
  }

  // ── Downloads ───────────────────────────────────────────────────────────────
  _downloadSingle() {
    const entry = this.files[this.activeIdx];
    if (!entry?.result) return;
    dlBlob(entry.result.text, entry.name.replace(/\.cif$/i, '.txt'));
  }

  async _downloadAll() {
    const done = this.files.filter(f => f.result);
    if (!done.length) return;
    if (done.length === 1) { this.activeIdx = this.files.indexOf(done[0]); this._downloadSingle(); return; }
    let JSZip;
    try { JSZip = (await import('jszip')).default; }
    catch { alert('JSZip not available. Run: npm install jszip'); return; }
    const zip = new JSZip();
    for (const entry of done) zip.file(entry.name.replace(/\.cif$/i, '.txt'), entry.result.text);
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'qe_atomic_positions.zip'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  _copyOutput() {
    const entry = this.files[this.activeIdx];
    if (!entry?.result) return;
    const btn = this.container.querySelector('#ec-copy-btn');
    navigator.clipboard.writeText(entry.result.text).then(() => {
      btn.textContent = 'COPIED!';
      setTimeout(() => btn.textContent = 'COPY', 1500);
    });
  }

  destroy() {}
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTERRUPTED RUN FIXER PANEL (3-screen flow)
// ═══════════════════════════════════════════════════════════════════════════════
class FixerPanel {
  constructor(container) {
    this.container = container;
    this._mode  = null;   // 'combine' | 'reconstruct'
    this._files = { inText: null, inName: null, outText: null, outName: null };
    this._st    = { oldText: '', newText: '', filename: '', P: null, patchResult: null };
    this._renderModeScreen();
  }

  // ─── Screen 1: Mode Select ──────────────────────────────────────────────────
  _renderModeScreen() {
    this.container.innerHTML = `
      <div class="if-root">
        <div class="if-mode-screen" id="if-mode-screen">
          <div class="if-mode-title">Choose how to generate your updated .in file</div>
          <div class="if-mode-sub">Pick the workflow that matches what files you have available.</div>
          <div class="if-mode-cards">
            <div class="if-mode-card" id="if-card-combine">
              <span class="if-mc-icon">🔗</span>
              <div class="if-mc-title">Combine .in + .out</div>
              <div class="if-mc-desc">Upload your <strong>original .in file</strong> and the <strong>relaxation .out file</strong>. The app keeps your input exactly as-is and only updates <code>ATOMIC_POSITIONS</code> (and <code>CELL_PARAMETERS</code> for vc-relax) with the final relaxed values.</div>
              <span class="if-mc-tag if-chip if-cg">Recommended</span>
            </div>
            <div class="if-mode-card" id="if-card-reconstruct">
              <span class="if-mc-icon">⚙</span>
              <div class="if-mc-title">Reconstruct from .out only</div>
              <div class="if-mc-desc">Upload only the <strong>.out file</strong>. The app reads all parameters printed in the output header (cutoffs, smearing, k-points, species, etc.) and reconstructs a complete .in file from scratch with the final coordinates.</div>
              <span class="if-mc-tag if-chip if-cb">Auto</span>
            </div>
          </div>
        </div>
      </div>
    `;
    this.container.querySelector('#if-card-combine').addEventListener('click',     () => this._selectMode('combine'));
    this.container.querySelector('#if-card-reconstruct').addEventListener('click', () => this._selectMode('reconstruct'));
  }

  // ─── Screen 2: Upload ───────────────────────────────────────────────────────
  _selectMode(mode) {
    this._mode = mode;
    this._files = { inText: null, inName: null, outText: null, outName: null };
    this.container.querySelector('.if-root').innerHTML = `
      <div class="if-upload-screen" id="if-upload-screen">
        <div class="if-upload-title">
          <button class="if-back-btn" id="if-back-btn">&#8617; back</button>
          <span class="if-upload-label">${mode === 'combine' ? 'Upload original .in and relaxation .out' : 'Upload your QE output file'}</span>
        </div>

        ${mode === 'combine' ? `
          <div class="if-upload-row" id="if-upload-zone">
            <div class="if-dz" id="if-dz-in">
              <input type="file" id="if-in-input" accept=".in,.txt">
              <span class="if-dz-ico">📄</span>
              <div class="if-dz-t">Original .in file</div>
              <div class="if-dz-s">Your pw.x input file with all namelists</div>
              <div class="if-dz-loaded" id="if-in-filename">—</div>
            </div>
            <div class="if-dz" id="if-dz-out">
              <input type="file" id="if-out-input" accept=".out,.log,.pwout,.txt">
              <span class="if-dz-ico">📊</span>
              <div class="if-dz-t">Relaxation .out file</div>
              <div class="if-dz-s">pw.x output from relax or vc-relax</div>
              <div class="if-dz-loaded" id="if-out-filename">—</div>
            </div>
          </div>
        ` : `
          <div class="if-upload-row if-single" id="if-upload-zone">
            <div class="if-dz" id="if-dz-out-only">
              <input type="file" id="if-out-only-input" accept=".out,.log,.pwout,.txt">
              <span class="if-dz-ico">📊</span>
              <div class="if-dz-t">Drop your QE .out file</div>
              <div class="if-dz-s">relax or vc-relax pw.x output. The full .in will be reconstructed.</div>
              <div class="if-dz-loaded" id="if-out-only-filename">—</div>
            </div>
          </div>
        `}

        <button class="if-proceed-btn" id="if-proceed-btn" style="display:none">Generate &#8594;</button>

        <div class="if-upload-note">
          ${mode === 'combine'
            ? 'Only <b>ATOMIC_POSITIONS</b> (and <b>CELL_PARAMETERS</b> for vc-relax) will be updated. Everything else stays exactly as written.'
            : 'The full .in will be reconstructed from parameters printed in the output header (cutoffs, smearing, k-points, species, celldm, etc.).'}
        </div>
      </div>
    `;
    this._bindUploadEvents();
  }

  _bindUploadEvents() {
    const root = this.container;
    root.querySelector('#if-back-btn').addEventListener('click', () => this._renderModeScreen());
    root.querySelector('#if-proceed-btn').addEventListener('click', () => this._proceed());

    const markLoaded = (dzId, nameId, name) => {
      const dz = root.querySelector(`#${dzId}`);
      if (dz) dz.classList.add('if-dz-done');
      const lb = root.querySelector(`#${nameId}`);
      if (lb) { lb.textContent = '✓  ' + name; lb.style.display = 'block'; }
    };
    const checkProceed = () => {
      const ready = this._mode === 'combine'
        ? (this._files.inText && this._files.outText)
        : !!this._files.outText;
      const btn = root.querySelector('#if-proceed-btn');
      if (btn) btn.style.display = ready ? '' : 'none';
    };
    const makeDZ = (dzId, inputId, onLoad) => {
      const dz = root.querySelector(`#${dzId}`);
      const inp = root.querySelector(`#${inputId}`);
      if (!dz || !inp) return;
      inp.addEventListener('change', e => { if (e.target.files[0]) { onLoad(e.target.files[0]); checkProceed(); } });
      dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('if-drag-over'); });
      dz.addEventListener('dragleave', () => dz.classList.remove('if-drag-over'));
      dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('if-drag-over'); if (e.dataTransfer.files[0]) { onLoad(e.dataTransfer.files[0]); checkProceed(); } });
    };

    if (this._mode === 'combine') {
      makeDZ('if-dz-in', 'if-in-input', file => {
        readFileText(file).then(t => { this._files.inText = t; this._files.inName = file.name; markLoaded('if-dz-in', 'if-in-filename', file.name); checkProceed(); });
      });
      makeDZ('if-dz-out', 'if-out-input', file => {
        readFileText(file).then(t => { this._files.outText = t; this._files.outName = file.name; markLoaded('if-dz-out', 'if-out-filename', file.name); checkProceed(); });
      });
    } else {
      makeDZ('if-dz-out-only', 'if-out-only-input', file => {
        readFileText(file).then(t => { this._files.outText = t; this._files.outName = file.name; markLoaded('if-dz-out-only', 'if-out-only-filename', file.name); checkProceed(); });
      });
    }
  }

  // ─── Screen 3: Results ──────────────────────────────────────────────────────
  async _proceed() {
    let P, oldText, newText, patchResult = null;
    try {
      P = parseQEOut(this._files.outText);
      if (!P.alatAng) throw new Error('Could not parse lattice parameter (alat) from the .out file.');
      if (this._mode === 'combine') {
        oldText = this._files.inText;
        patchResult = patchInputFile(this._files.inText, P);
        newText = patchResult.text;
      } else {
        if (!P.initAtoms || !P.initAtoms.length) throw new Error('Could not find initial atomic positions (tau) in the .out file.');
        oldText = buildIN(P, true);
        newText = buildIN(P, false);
      }
    } catch (e) {
      alert('Error: ' + e.message);
      return;
    }
    this._st = { oldText, newText, filename: this._files.outName, P, patchResult };
    this._renderResults();
  }

  _renderResults() {
    const { oldText, newText, filename, P, patchResult } = this._st;
    const mode = this._mode;

    // Diff bar items
    const diffItems = [];
    if (P.finalAtoms) diffItems.push(`<span class="if-di"><span class="if-dd if-dy"></span><span class="if-dl">ATOMIC_POSITIONS</span>&nbsp;<span class="if-dv">${P.finalAtoms.length} atoms</span></span>`);
    if (P.finalVecs && P.isVCRelax) {
      let cellLabel = 'CELL_PARAMETERS updated';
      if (mode === 'combine' && patchResult) {
        const cm = patchResult.changes.cellMethod;
        if (cm === 'celldm') cellLabel = 'celldm(1..6) updated in &SYSTEM';
        else if (cm === 'ABC') cellLabel = 'A/B/C values updated in &SYSTEM';
        else if (cm === 'card') cellLabel = 'CELL_PARAMETERS card updated';
      }
      diffItems.push(`<span class="if-di"><span class="if-dd if-dg"></span><span class="if-dl">${cellLabel}</span></span>`);
    }
    if (P.vdw_corr && mode === 'reconstruct') diffItems.push(`<span class="if-di"><span class="if-dd if-db"></span><span class="if-dl">vdw_corr</span>&nbsp;<span class="if-dv">${P.vdw_corr}</span></span>`);
    if (mode === 'combine') diffItems.push(`<span class="if-di if-di-right"><span class="if-dl" style="color:var(--success)">→ all other settings preserved from original .in</span></span>`);

    const isRelaxed = P.isRelaxed;
    const infoFile = mode === 'combine'
      ? `${this._files.inName}  +  ${this._files.outName}`
      : filename;

    this.container.querySelector('.if-root').innerHTML = `
      <div class="if-results-screen">
        <div class="if-infobar">
          <span class="if-fname">${escapeHTML(infoFile)}</span>
          <span class="if-info-stats">${P.finalAtoms ? P.finalAtoms.length : (P.nat||0)} atoms · ${P.nSteps} ionic step${P.nSteps !== 1 ? 's' : ''}</span>
          <div class="if-info-right">
            <span class="if-chip if-cb">${escapeHTML(P.calcType)}</span>
            <span class="if-chip ${isRelaxed ? 'if-cg' : 'if-cr'}">${isRelaxed ? '✓ converged' : '⚠ not converged'}</span>
            <span class="if-chip ${mode === 'combine' ? 'if-cg' : 'if-cb'}">${mode === 'combine' ? 'combine' : 'reconstruct'}</span>
          </div>
        </div>
        ${!isRelaxed ? `<div class="if-warn-bar"><span>⚠</span><span>Did not converge after ${P.nSteps} step${P.nSteps !== 1 ? 's' : ''}. Using latest available structure.</span></div>` : ''}
        <div class="if-diff-bar">${diffItems.join('<span class="if-dot-sep">·</span>')}</div>
        <div class="if-editors">
          <div class="if-pane">
            <div class="if-pane-head">
              <span class="if-pane-title">${mode === 'combine' ? 'Original .in file' : 'Initial Structure'}</span>
              <span class="if-pane-badge if-pb-old">${mode === 'combine' ? 'your input' : 'original coords'}</span>
              <button class="if-copy-mini" id="if-copy-old">COPY</button>
            </div>
            <div class="if-code-area" id="if-code-old"></div>
          </div>
          <div class="if-pane">
            <div class="if-pane-head">
              <span class="if-pane-title">Updated Input</span>
              <span class="if-pane-badge if-pb-new">${isRelaxed ? 'final coords' : 'latest coords'}</span>
              <button class="if-copy-mini" id="if-copy-new">COPY</button>
            </div>
            <div class="if-code-area" id="if-code-new"></div>
          </div>
        </div>
        <div class="if-bottombar">
          <button class="if-dl-btn if-dl-p" id="if-dl-new">↓ Download updated .in</button>
          <button class="if-dl-btn if-dl-s" id="if-dl-old">↓ Download original .in</button>
          <button class="if-reset-btn" id="if-reset-btn">↩ Start over</button>
        </div>
      </div>
    `;

    // Fill code areas
    this.container.querySelector('#if-code-old').innerHTML = hlCode(oldText);
    this.container.querySelector('#if-code-new').innerHTML = hlDiff(oldText, newText);

    // Buttons
    this.container.querySelector('#if-copy-old').addEventListener('click', () => {
      navigator.clipboard.writeText(oldText).then(() => this._toast('Copied ✓'));
    });
    this.container.querySelector('#if-copy-new').addEventListener('click', () => {
      navigator.clipboard.writeText(newText).then(() => this._toast('Copied ✓'));
    });

    const base = (this._files.outName || 'output').replace(/\.(out|log|pwout|txt)$/i, '');
    this.container.querySelector('#if-dl-new').addEventListener('click', () => {
      dlBlob(newText, base + '_updated.in');
      this._toast('Updated .in downloaded ✓');
    });
    this.container.querySelector('#if-dl-old').addEventListener('click', () => {
      const nameBase = mode === 'combine'
        ? (this._files.inName || 'original').replace(/\.in$/i, '')
        : base;
      dlBlob(oldText, nameBase + '_original.in');
      this._toast('Original .in downloaded ✓');
    });

    this.container.querySelector('#if-reset-btn').addEventListener('click', () => {
      this._mode = null;
      this._files = { inText: null, inName: null, outText: null, outName: null };
      this._renderModeScreen();
    });
  }

  _toast(msg) {
    let t = this.container.querySelector('.if-toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'if-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('if-toast-show');
    setTimeout(() => t.classList.remove('if-toast-show'), 2100);
  }

  destroy() {
    const t = document.querySelector('.if-toast');
    if (t) t.remove();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// OutputProcessorPage
// ═══════════════════════════════════════════════════════════════════════════════
export class OutputProcessorPage {
  constructor(container, appState) {
    this.container = container;
    this.appState  = appState;
    this.activeTab = 0;
    this._outToCifPanel      = null;
    this._extractCoordsPanel = null;
    this._fixerPanel         = null;
  }

  render() {
    const tabs = ['OUT → CIF', 'Extract Coordinates', 'Interrupted Run Fixer'];
    this.container.innerHTML = `
      <div class="output-layout">
        <div class="tabs-bar" id="out-tabs-bar">
          ${tabs.map((label, i) => `
            <button class="tab-btn ${i === this.activeTab ? 'active' : ''}" data-tab="${i}">${label}</button>
          `).join('')}
        </div>
        <div id="out-tab-body" class="output-tab-content"></div>
      </div>
    `;

    this._renderCurrentTab();

    this.container.querySelector('#out-tabs-bar').addEventListener('click', e => {
      const btn = e.target.closest('[data-tab]');
      if (!btn) return;
      this.activeTab = parseInt(btn.dataset.tab);
      this.container.querySelectorAll('.tab-btn').forEach((b, i) =>
        b.classList.toggle('active', i === this.activeTab));
      this._renderCurrentTab();
    });
  }

  _renderCurrentTab() {
    const body = this.container.querySelector('#out-tab-body');
    // destroy previous sub-panel
    if (this._fixerPanel) { this._fixerPanel.destroy(); this._fixerPanel = null; }
    body.innerHTML = '';

    if (this.activeTab === 0) {
      this._outToCifPanel = new OutToCifPanel(body);
    } else if (this.activeTab === 1) {
      this._extractCoordsPanel = new ExtractCoordsPanel(body);
    } else {
      this._fixerPanel = new FixerPanel(body);
    }
  }

  destroy() {
    if (this._outToCifPanel)      this._outToCifPanel.destroy();
    if (this._extractCoordsPanel) this._extractCoordsPanel.destroy();
    if (this._fixerPanel)         this._fixerPanel.destroy();
  }
}
