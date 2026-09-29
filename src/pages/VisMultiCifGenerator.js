import { VisSelectViewer }   from '../components/VisSelectViewer.js';
import {
  parseCIF,
  generateCombinations,
  countCombinations,
  applyCombination,
  buildFilename,
  exportZIP,
  COMMON_ELEMENTS,
} from '../lib/cifGenerator.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function readFileText(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = e => res(e.target.result);
    r.onerror = () => rej(new Error('Read error'));
    r.readAsText(file);
  });
}

// Per-selection-order badge colours (must match VisSelectViewer SEL_COLORS)
const BADGE_COLORS = [
  { bg: 'rgba(0,212,255,0.18)',   border: 'rgba(0,212,255,.45)',   text: '#00d4ff' },
  { bg: 'rgba(167,139,250,0.18)', border: 'rgba(167,139,250,.45)', text: '#a78bfa' },
  { bg: 'rgba(52,211,153,0.18)',  border: 'rgba(52,211,153,.45)',  text: '#34d399' },
  { bg: 'rgba(251,191,36,0.18)',  border: 'rgba(251,191,36,.45)',  text: '#fbbf24' },
  { bg: 'rgba(248,113,113,0.18)', border: 'rgba(248,113,113,.45)', text: '#f87171' },
  { bg: 'rgba(96,165,250,0.18)',  border: 'rgba(96,165,250,.45)',  text: '#60a5fa' },
  { bg: 'rgba(244,114,182,0.18)', border: 'rgba(244,114,182,.45)', text: '#f472b6' },
  { bg: 'rgba(74,222,128,0.18)',  border: 'rgba(74,222,128,.45)',  text: '#4ade80' },
];
function getBadgeStyle(order) {
  const c = BADGE_COLORS[order % BADGE_COLORS.length];
  return `background:${c.bg};border:1px solid ${c.border};color:${c.text};`;
}

const COMBO_WARN = 500;

// ═══════════════════════════════════════════════════════════════════════════════
// VisMultiCifGeneratorPage
// ═══════════════════════════════════════════════════════════════════════════════
export class VisMultiCifGeneratorPage {
  constructor(container, appState) {
    this.container = container;
    this.appState  = appState;

    this._state = {
      filename:      null,
      rawText:       null,
      parsed:        null,
      selectedOrder: [],        // atomIdx in selection order
      substitutions: new Map(), // atomIdx → string[]
      generated:     [],
      generating:    false,
    };

    this._viewer = null;

    this._themeListener = (e) => {
      if (this._viewer) {
        this._viewer.setTheme(e.detail.isLight);
      }
    };
    window.addEventListener('theme-changed', this._themeListener);
  }

  render() {
    this.container.innerHTML = `
      <div class="vg-layout">

        <!-- ══ LEFT: 3D Viewer ══ -->
        <div class="vg-viewer-col" id="vg-viewer-col">

          <!-- Upload overlay (shown when no structure loaded) -->
          <div class="vg-upload-overlay" id="vg-upload-overlay">
            <div class="vg-dz" id="vg-dz">
              <input type="file" id="vg-file-input" accept=".cif">
              <span class="vg-dz-ico">⬡</span>
              <div class="vg-dz-title">Drop a CIF file to begin</div>
              <div class="vg-dz-sub">or click to browse — .cif format</div>
            </div>
          </div>

          <!-- Canvas (hidden until file loaded) -->
          <canvas id="vg-canvas" style="display:none"></canvas>

          <!-- Viewer HUD overlays -->
          <div class="vg-hud" id="vg-hud" style="display:none">
            <div class="vg-hud-file" id="vg-hud-file"></div>
            <div class="vg-hud-sel"  id="vg-hud-sel">No atoms selected — click atoms to select</div>
          </div>

          <!-- Controls hint -->
          <div class="vg-hint" id="vg-hint" style="display:none">
            <b>Controls</b><br>
            <span class="vg-hint-line">Left drag — Rotate</span>
            <span class="vg-hint-line">Right drag — Pan</span>
            <span class="vg-hint-line">Scroll — Zoom</span>
            <span class="vg-hint-line vg-hint-sel">Click atom — Toggle select</span>
          </div>

          <!-- Viewer toolbar -->
          <div class="vg-toolbar" id="vg-toolbar" style="display:none">
            <button class="vg-tb-btn" id="vg-sel-all">Select All</button>
            <button class="vg-tb-btn" id="vg-sel-none">Clear</button>
            <button class="vg-tb-btn vg-tb-new" id="vg-load-new">↑ Load New CIF</button>
          </div>

        </div>

        <!-- ══ SPLITTER ══ -->
        <div class="vg-h-splitter" id="vg-h-splitter" role="separator" aria-label="Resize CIF viewer and options panel" aria-orientation="vertical" aria-valuemin="300" tabindex="0" title="Drag to resize; use left/right arrow keys">
          <div class="vg-splitter-dots"></div>
        </div>

        <!-- ══ RIGHT COLUMN ══ -->
        <div class="vg-right-col" id="vg-right-col">

          <!-- Selection List -->
          <div class="vg-panel" id="vg-sel-panel">
            <div class="vg-panel-head">
              <span class="vg-panel-icon">◈</span>
              <span class="vg-panel-title">Selected Atoms</span>
              <span class="vg-panel-meta" id="vg-sel-count">0 selected</span>
            </div>
            <div class="vg-sel-list" id="vg-sel-list">
              <div class="vg-empty">Select atoms by clicking them in the 3D view</div>
            </div>
          </div>

          <!-- Substitution Panel -->
          <div class="vg-panel" id="vg-sub-panel">
            <div class="vg-panel-head">
              <span class="vg-panel-icon">⚗</span>
              <span class="vg-panel-title">Substitutions</span>
              <span class="vg-panel-meta" id="vg-sub-meta"></span>
            </div>
            <div id="vg-sub-body">
              <div class="vg-empty">Select atoms first</div>
            </div>
          </div>

          <!-- Generation Control -->
          <div class="vg-panel" id="vg-ctrl-panel">
            <div class="vg-panel-head">
              <span class="vg-panel-icon">⚙</span>
              <span class="vg-panel-title">Generate</span>
            </div>
            <div id="vg-ctrl-body">
              <div class="vg-empty">Load a CIF to start</div>
            </div>
          </div>

        </div>
      </div>
    `;

    this._bindStaticEvents();
    this._setupSplitter();
  }

  // ─── Static events (upload, toolbar) ────────────────────────────────────────
  _bindStaticEvents() {
    const dz    = this.container.querySelector('#vg-dz');
    const inp   = this.container.querySelector('#vg-file-input');

    inp.addEventListener('change', e => { if (e.target.files[0]) this._loadFile(e.target.files[0]); });
    dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('vg-drag-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('vg-drag-over'));
    dz.addEventListener('drop', e => {
      e.preventDefault(); dz.classList.remove('vg-drag-over');
      if (e.dataTransfer.files[0]) this._loadFile(e.dataTransfer.files[0]);
    });

    // Toolbar (rendered hidden until file loaded)
    this.container.querySelector('#vg-sel-all').addEventListener('click',  () => {
      if (this._viewer) {
        this._viewer.selectAll();
        this._state.selectedOrder = this._viewer.getSelectedIndices();
        this._refreshRight();
      }
    });
    this.container.querySelector('#vg-sel-none').addEventListener('click', () => {
      if (this._viewer) {
        this._viewer.clearSelection();
        this._state.selectedOrder = [];
        this._state.substitutions.clear();
        this._refreshRight();
      }
    });
    this.container.querySelector('#vg-load-new').addEventListener('click', () => {
      inp.value = '';
      inp.click();
    });
  }

  // ─── File load ──────────────────────────────────────────────────────────────
  async _loadFile(file) {
    if (!file.name.toLowerCase().endsWith('.cif')) { alert('Please upload a .cif file'); return; }
    try {
      const text   = await readFileText(file);
      const parsed = parseCIF(text);
      if (!parsed.atoms.length) { alert('No atom_site loop found in this CIF file'); return; }

      this._state.filename      = file.name;
      this._state.rawText       = text;
      this._state.parsed        = parsed;
      this._state.selectedOrder = [];
      this._state.substitutions.clear();
      this._state.generated     = [];

      this._initViewer(parsed);
      this._refreshRight();
    } catch (e) {
      alert('Parse error: ' + e.message);
    }
  }

  _initViewer(parsed) {
    // Show canvas, hide overlay
    const overlay  = this.container.querySelector('#vg-upload-overlay');
    const canvas   = this.container.querySelector('#vg-canvas');
    const hud      = this.container.querySelector('#vg-hud');
    const hint     = this.container.querySelector('#vg-hint');
    const toolbar  = this.container.querySelector('#vg-toolbar');

    overlay.style.display = 'none';
    canvas.style.display  = '';
    hud.style.display     = '';
    hint.style.display    = '';
    toolbar.style.display = '';

    // Dispose old viewer
    if (this._viewer) { this._viewer.dispose(); this._viewer = null; }

    this._viewer = new VisSelectViewer(canvas);
    this._viewer.buildStructure(parsed);

    this._viewer.onSelectionChange = (indices) => {
      this._state.selectedOrder = indices;
      this._refreshRight();
      this._updateHUD();
    };

    // HUD file info
    this.container.querySelector('#vg-hud-file').textContent =
      `${this._state.filename}  ·  ${parsed.atoms.length} atoms  ·  ${parsed.coordType}`;
    this._updateHUD();
  }

  _updateHUD() {
    const hud  = this.container.querySelector('#vg-hud-sel');
    const sel  = this._state.selectedOrder;
    const parsed = this._state.parsed;
    if (!hud) return;
    if (!sel.length) {
      hud.innerHTML = '<span style="color:var(--text-dim)">No atoms selected — click atoms to select</span>';
    } else {
      const badges = sel.map((idx, ord) => {
        const a = parsed.atoms[idx];
        return `<span class="vg-hud-badge" style="${getBadgeStyle(ord)}">${esc(a.element)}<sub>${idx+1}</sub></span>`;
      }).join('');
      hud.innerHTML = `<span style="color:var(--text-dim);font-size:0.65rem">Selected:</span> ${badges}`;
    }
  }

  // ─── Right column rendering ──────────────────────────────────────────────────
  _refreshRight() {
    this._renderSelList();
    this._renderSubPanel();
    this._renderControls();
  }

  _renderSelList() {
    const { parsed, selectedOrder } = this._state;
    const count = this.container.querySelector('#vg-sel-count');
    if (count) count.textContent = `${selectedOrder.length} selected`;
    const list  = this.container.querySelector('#vg-sel-list');
    if (!list) return;

    if (!selectedOrder.length) {
      list.innerHTML = '<div class="vg-empty">Select atoms by clicking them in the 3D view</div>';
      return;
    }

    list.innerHTML = selectedOrder.map((idx, ord) => {
      const a   = parsed.atoms[idx];
      const col = BADGE_COLORS[ord % BADGE_COLORS.length];
      return `
        <div class="vg-sel-item" data-idx="${idx}" style="border-left:3px solid ${col.text};">
          <span class="vg-sel-ord" style="background:${col.bg};color:${col.text};border-color:${col.border}">${ord+1}</span>
          <span class="vg-sel-elem" style="color:${col.text}">${esc(a.element)}</span>
          <span class="vg-sel-label">${esc(a.label)}</span>
          <span class="vg-sel-coords">${esc(a.x.slice(0,7))}  ${esc(a.y.slice(0,7))}  ${esc(a.z.slice(0,7))}</span>
          <button class="vg-sel-rm" data-idx="${idx}" title="Deselect">✕</button>
        </div>`;
    }).join('');

    // Deselect buttons
    list.querySelectorAll('.vg-sel-rm').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        if (this._viewer) this._viewer._toggleAtom(idx);
        // state and UI updated via onSelectionChange callback
      });
    });

    // Hover preview in 3D
    list.querySelectorAll('.vg-sel-item').forEach(row => {
      const idx = parseInt(row.dataset.idx);
      row.addEventListener('mouseenter', () => { if (this._viewer) this._viewer.highlightHover(idx); });
      row.addEventListener('mouseleave', () => { if (this._viewer) this._viewer.highlightHover(-1); });
    });
  }

  _renderSubPanel() {
    const { parsed, selectedOrder, substitutions } = this._state;
    const meta = this.container.querySelector('#vg-sub-meta');
    const body = this.container.querySelector('#vg-sub-body');
    if (!body) return;

    if (!parsed || !selectedOrder.length) {
      if (meta) meta.textContent = '';
      body.innerHTML = '<div class="vg-empty">Select atoms first</div>';
      return;
    }

    const withSubs = [...substitutions.values()].filter(s => s.length > 0).length;
    if (meta) meta.textContent = `${withSubs} configured`;

    body.innerHTML = selectedOrder.map((idx, ord) => {
      const a    = parsed.atoms[idx];
      const subs = substitutions.get(idx) || [];
      const col  = BADGE_COLORS[ord % BADGE_COLORS.length];
      return `
        <div class="vg-sub-row" data-id="${idx}">
          <div class="vg-sub-head">
            <span class="vg-sub-num" style="background:${col.bg};color:${col.text};border-color:${col.border}">${ord+1}</span>
            <span class="vg-sub-elem" style="color:${col.text}">${esc(a.element)}</span>
            <span class="vg-sub-lbl">${esc(a.label)}</span>
            <span class="vg-sub-arrow">→</span>
          </div>
          <div class="vg-sub-tags" id="vg-tags-${idx}">
            ${subs.map(s => `
              <span class="vg-tag" style="${getBadgeStyle(ord)}">
                ${esc(s)}
                <button class="vg-tag-rm" data-atom="${idx}" data-elem="${esc(s)}" title="Remove">✕</button>
              </span>`).join('')}
            <div class="vg-inp-wrap">
              <input class="vg-elem-inp" id="vg-inp-${idx}" data-id="${idx}"
                placeholder="+ element…" list="vg-dl-${idx}" autocomplete="off">
              <datalist id="vg-dl-${idx}">
                ${COMMON_ELEMENTS.map(e => `<option value="${e}">`).join('')}
              </datalist>
            </div>
          </div>
          <div class="vg-quick-row">
            ${['C','N','O','Si','P','S','Fe','Co','Ni','Cu','Zn','Mn'].map(e =>
              `<button class="vg-qbtn" data-atom="${idx}" data-elem="${e}">${e}</button>`).join('')}
          </div>
        </div>`;
    }).join('');

    // Remove tag
    body.querySelectorAll('.vg-tag-rm').forEach(btn => {
      btn.addEventListener('click', () => {
        const atomId = parseInt(btn.dataset.atom);
        const elem   = btn.dataset.elem;
        const curr   = this._state.substitutions.get(atomId) || [];
        this._state.substitutions.set(atomId, curr.filter(e => e !== elem));
        if (!this._state.substitutions.get(atomId).length) this._state.substitutions.delete(atomId);
        this._renderSubPanel(); this._renderControls();
      });
    });

    // Text input
    body.querySelectorAll('.vg-elem-inp').forEach(inp => {
      const id = parseInt(inp.dataset.id);
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); this._addSub(id, inp.value.trim()); inp.value = ''; }
      });
      inp.addEventListener('change', () => { this._addSub(id, inp.value.trim()); inp.value = ''; });
    });

    // Quick buttons
    body.querySelectorAll('.vg-qbtn').forEach(btn => {
      btn.addEventListener('click', () => this._addSub(parseInt(btn.dataset.atom), btn.dataset.elem));
    });
  }

  _addSub(atomId, raw) {
    if (!raw) return;
    const elem = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    if (!COMMON_ELEMENTS.includes(elem)) return;
    const curr = this._state.substitutions.get(atomId) || [];
    if (curr.includes(elem)) return;
    this._state.substitutions.set(atomId, [...curr, elem]);
    this._renderSubPanel(); this._renderControls();
  }

  _renderControls() {
    const { parsed, selectedOrder, substitutions, generated } = this._state;
    const body = this.container.querySelector('#vg-ctrl-body');
    if (!body) return;

    if (!parsed) { body.innerHTML = '<div class="vg-empty">Load a CIF to start</div>'; return; }

    const configs = selectedOrder.map(id => ({
      atomId: id,
      element: parsed.atoms[id]?.element,
      substitutions: substitutions.get(id) || [],
    }));

    const count      = countCombinations(configs);
    const isOverflow = count > COMBO_WARN;
    const canGen     = count > 0;

    // Breakdown formula
    const active = configs.filter(c => c.substitutions.length > 0);
    const breakHTML = active.length
      ? `<div class="vg-breakdown">
          ${active.map((c, i) => {
            const a   = parsed.atoms[c.atomId];
            const ord = selectedOrder.indexOf(c.atomId);
            const col = BADGE_COLORS[ord % BADGE_COLORS.length];
            return `
              ${i > 0 ? '<span class="vg-bx">×</span>' : ''}
              <span class="vg-brow">
                <span class="vg-belem" style="color:${col.text}">${esc(a.element)}</span>
                →&nbsp;<span class="vg-bsubs">[${c.substitutions.join(', ')}]</span>
                <span class="vg-bcnt">×${c.substitutions.length}</span>
              </span>`;
          }).join('')}
          <span class="vg-bx">=</span>
          <strong class="vg-btotal">${count.toLocaleString()}</strong>
        </div>`
      : '';

    const summaryHTML = generated.length
      ? `<div class="vg-summary">
           <div class="vg-summary-row">
             <span class="vg-sum-ico">✓</span>
             <span><strong>${generated.length}</strong> structure${generated.length !== 1 ? 's' : ''} ready</span>
           </div>
           <div class="vg-preview-list">
             ${generated.slice(0, 5).map(f => `<span class="vg-preview-item">${esc(f.name)}</span>`).join('')}
             ${generated.length > 5 ? `<span class="vg-preview-more">+${generated.length-5} more…</span>` : ''}
           </div>
         </div>`
      : '';

    body.innerHTML = `
      <div class="vg-counter ${isOverflow ? 'vg-ctr-warn' : count > 0 ? 'vg-ctr-ok' : ''}">
        <div class="vg-ctr-num">${count === 0 ? '—' : count.toLocaleString()}</div>
        <div class="vg-ctr-lbl">${count === 0 ? 'No substitutions defined' : `combination${count !== 1 ? 's' : ''}`}</div>
        ${isOverflow ? `<div class="vg-ctr-warn-msg">⚠ Large number — may be slow</div>` : ''}
      </div>
      ${breakHTML}
      <div class="vg-gen-actions" id="vg-gen-actions">
        <button class="vg-btn vg-btn-p" id="vg-gen-btn" ${!canGen ? 'disabled' : ''}>
          <span>⚙</span> Generate ${count > 0 ? count.toLocaleString() : ''} Structures
        </button>
        ${generated.length ? `
          <button class="vg-btn vg-btn-z" id="vg-dl-btn">
            <span>↓</span> Download ZIP (${generated.length} files)
          </button>` : ''}
      </div>
      ${summaryHTML}
    `;

    const genBtn = body.querySelector('#vg-gen-btn');
    if (genBtn) genBtn.addEventListener('click', () => this._doGenerate(configs));
    const dlBtn = body.querySelector('#vg-dl-btn');
    if (dlBtn) dlBtn.addEventListener('click', () => this._doDownload());
  }

  // ─── Generation ──────────────────────────────────────────────────────────────
  async _doGenerate(configs) {
    const s = this._state;
    if (!s.parsed || s.generating) return;

    const combos = generateCombinations(configs);
    if (!combos.length) return;

    s.generating = true;
    s.generated  = [];

    const genBtn = this.container.querySelector('#vg-gen-btn');
    if (genBtn) { genBtn.disabled = true; genBtn.innerHTML = '<span class="vg-spinner"></span> Generating…'; }

    const CHUNK = 50;
    for (let i = 0; i < combos.length; i += CHUNK) {
      const slice = combos.slice(i, i + CHUNK);
      for (let j = 0; j < slice.length; j++) {
        const combo   = slice[j];
        const content = applyCombination(s.parsed, combo, s.filename);
        const name    = buildFilename(i + j, combo, s.parsed.atoms, s.filename);
        s.generated.push({ name, content });
      }
      await new Promise(r => setTimeout(r, 0));
    }

    s.generating = false;
    this._renderControls();
  }

  async _doDownload() {
    const s = this._state;
    if (!s.generated.length) return;
    try {
      await exportZIP(
        s.generated,
        `qe_vis_gen_${(s.filename || 'output').replace(/\.cif$/i, '')}.zip`
      );
    } catch (e) {
      alert('ZIP error: ' + e.message);
    }
  }

  // ─── Horizontal splitter (viewer | right panel) ───────────────────────────
  _setupSplitter() {
    const splitter = this.container.querySelector('#vg-h-splitter');
    let drag = null;

    const applyWidth = (viewerWidth, totalWidth) => {
      const viewerCol = this.container.querySelector('#vg-viewer-col');
      const rightCol = this.container.querySelector('#vg-right-col');
      const splitterWidth = splitter.getBoundingClientRect().width || 6;
      const minimumViewer = Math.min(300, Math.max(180, totalWidth * .35));
      const minimumRight = Math.min(260, Math.max(220, totalWidth * .3));
      const maximumViewer = Math.max(minimumViewer, totalWidth - minimumRight - splitterWidth);
      const nextViewer = Math.max(minimumViewer, Math.min(maximumViewer, viewerWidth));
      const nextRight = Math.max(minimumRight, totalWidth - nextViewer - splitterWidth);
      viewerCol.style.flex = `0 0 ${nextViewer}px`;
      rightCol.style.flex = `0 0 ${nextRight}px`;
      splitter.setAttribute('aria-valuenow', String(Math.round(nextViewer)));
      this._viewer?.resizeRenderer();
    };

    const onMove = e => {
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      applyWidth(drag.startVW + dx, drag.totalW);
    };
    const onUp = () => {
      drag = null;
      splitter.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (this._viewer) this._viewer.resizeRenderer();
    };

    splitter.addEventListener('mousedown', e => {
      e.preventDefault();
      const layout    = this.container.querySelector('.vg-layout');
      const viewerCol = this.container.querySelector('#vg-viewer-col');
      const rightCol  = this.container.querySelector('#vg-right-col');
      drag = {
        startX:   e.clientX,
        totalW:   layout.getBoundingClientRect().width,
        startVW:  viewerCol.getBoundingClientRect().width,
        viewerCol, rightCol,
      };
      splitter.classList.add('dragging');
      document.body.style.cursor     = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
    splitter.addEventListener('keydown', e => {
      if (!['ArrowLeft','ArrowRight','Home'].includes(e.key)) return;
      e.preventDefault();
      const layout = this.container.querySelector('.vg-layout');
      const viewerCol = this.container.querySelector('#vg-viewer-col');
      const totalWidth = layout.getBoundingClientRect().width;
      const currentWidth = viewerCol.getBoundingClientRect().width;
      applyWidth(e.key === 'Home' ? totalWidth * .55 : currentWidth + (e.key === 'ArrowLeft' ? -24 : 24), totalWidth);
    });
    splitter.addEventListener('dblclick', () => {
      const totalWidth = this.container.querySelector('.vg-layout').getBoundingClientRect().width;
      applyWidth(totalWidth * .55, totalWidth);
    });
  }

  destroy() {
    if (this._themeListener) {
      window.removeEventListener('theme-changed', this._themeListener);
    }
    if (this._viewer) { this._viewer.dispose(); this._viewer = null; }
  }
}
