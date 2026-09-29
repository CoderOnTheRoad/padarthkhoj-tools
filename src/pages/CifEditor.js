import { ThreeViewer } from '../components/ThreeViewer.js';
import { parseCIF, exportCIF } from '../lib/cifParser.js';
import { ELEMENTS, ELEM_KEYS } from '../data/elements.js';
import { escapeHTML } from '../lib/html.js';

export class CifEditorPage {
  constructor(container, appState, onNavigate) {
    this.container = container;
    this.appState = appState;
    this.onNavigate = onNavigate;
    this.viewer = null;
    this.pendingElem = null;

    // Drag state
    this._hDrag = null;
    this._onMouseMoveH = this._onMouseMoveH.bind(this);
    this._onMouseUpH   = this._onMouseUpH.bind(this);
    this._onDocumentClick = e => {
      if (!e.target.closest('#cif-context-menu')) this._hideContextMenu();
    };
  }

  render() {
    this.container.innerHTML = `
      <div class="cif-layout h-full overflow-hidden flex flex-col" id="cif-root">

        <!-- UPPER AREA: viewer + splitter + right panel -->
        <div class="cif-upper" id="cif-upper">

          <!-- 3D VIEWER -->
          <div class="cif-viewer-col" id="cif-viewer-col">
            <!-- Upload overlay (shown when no structure loaded) -->
            <div class="cif-upload-overlay" id="cif-upload-overlay">
              <div class="cif-dz" id="cif-drop-zone">
                <input type="file" id="cif-file-input" accept=".cif">
                <span class="cif-dz-ico">⬡</span>
                <div class="cif-dz-title">Drop a CIF file to begin</div>
                <div class="cif-dz-sub">or click to browse — .cif format</div>
              </div>
            </div>

            <canvas id="three-canvas" style="display:none;"></canvas>
            <div class="viewer-overlay" id="viewer-overlay" style="display:none;">
              <div class="viewer-badge" id="cell-info"><b>No structure loaded</b></div>
              <div class="viewer-badge" id="atom-count-badge" style="display:none"></div>
            </div>
            <div class="sel-info" id="sel-info" style="display:none;">
              <div class="sel-elem" id="sel-elem">—</div>
              <div class="sel-coords" id="sel-coords"></div>
            </div>
            <div class="viewer-controls-hint" id="viewer-controls-hint" style="display:none;">
              <b style="color:var(--text-mid)">Controls</b><br>
              Left drag — Rotate<br>Right drag — Pan<br>Scroll — Zoom<br>Click atom — Select
            </div>
            <div class="atom-toolbar" id="atom-toolbar" style="display:none;">
              <button class="atom-btn" id="btn-change-elem" disabled>⚗ Change Element</button>
              <button class="atom-btn danger" id="btn-delete-atom" disabled>✕ Delete Atom</button>
            </div>
            
            <!-- Context Menu (hidden by default) -->
            <div id="cif-context-menu" class="cif-context-menu" style="display:none; position:absolute; z-index:100;">
              <div class="ctx-item" id="ctx-freeze">❄️ Freeze / Unfreeze</div>
              <div class="ctx-item" id="ctx-change">⚗ Change Element</div>
              <div class="ctx-item danger" id="ctx-delete">✕ Delete</div>
            </div>
          </div>

          <!-- HORIZONTAL RESIZE HANDLE -->
          <div class="cif-h-splitter" id="cif-h-splitter" title="Drag to resize">
            <div class="splitter-dots"></div>
          </div>

          <!-- RIGHT CONTROL PANEL -->
          <div class="cif-control-panel" id="cif-control-panel" style="display: flex; flex-direction: column; background: var(--bg-panel); height: 100%; border-left: 1px solid var(--border); width: 300px;">

            <div class="panel-section-header" style="flex-shrink:0; border-bottom: 1px solid var(--border); padding: 14px 18px; background: var(--bg-deep);">
              <span class="panel-section-title" style="font-weight: 700; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent);">Atom List</span>
            </div>
            
            <div id="atom-list-container" style="flex:1; overflow: hidden; display: flex; flex-direction: column; background: var(--bg-deep);">
              <div class="atom-list" id="atom-list" style="flex:1; overflow-y:auto; padding: 8px;">
                <div class="text-dim text-sm" style="padding:40px 16px; text-align:center; font-family:var(--font-mono); opacity: 0.6;">Load a structure to see atoms</div>
              </div>
            </div>

            <!-- Proceed action -->
            <div style="padding: 20px; border-top: 1px solid var(--border); flex-shrink:0; background: var(--bg-deep); display: flex; justify-content: flex-end;">
              <button class="btn btn-primary" id="btn-create-input" style="padding: 14px 28px; font-size: 1rem; font-weight: 700; border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); transition: all 0.2s;" disabled>
                Create Input File →
              </button>
            </div>

          </div>
        </div>

      </div>
    `;

    this._bindEvents();
    this._setupCollapsible();
    this._setupHSplitter();

    // Listen for theme changes globally
    this._themeListener = (e) => {
      if (this.viewer) {
        this.viewer.setTheme(e.detail.isLight);
      }
    };
    window.addEventListener('theme-changed', this._themeListener);
  }

  // ─── Collapsible Sections ────────────────────────────────────────────────────
  _setupCollapsible() {
    this.container.querySelectorAll('.panel-section-header').forEach(header => {
      header.style.cursor = 'pointer';
      header.addEventListener('click', () => {
        const section = this.container.querySelector(`#${header.dataset.target}`);
        if (!section) return;
        const body = section.querySelector('.panel-section-body');
        const icon = header.querySelector('.panel-collapse-icon');
        const isCollapsed = section.classList.toggle('panel-collapsed');
        body.style.maxHeight = isCollapsed ? '0px' : '';
        body.style.overflow = isCollapsed ? 'hidden' : '';
        body.style.paddingTop = isCollapsed ? '0' : '';
        body.style.paddingBottom = isCollapsed ? '0' : '';
        icon.style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
      });
    });
  }

  // ─── Horizontal Splitter (viewer | right panel) ──────────────────────────────
  _setupHSplitter() {
    const splitter = this.container.querySelector('#cif-h-splitter');
    splitter.addEventListener('mousedown', e => {
      e.preventDefault();
      const layout = this.container.querySelector('#cif-upper');
      const viewerCol = this.container.querySelector('#cif-viewer-col');
      const rightPanel = this.container.querySelector('#cif-control-panel');
      const totalW = layout.getBoundingClientRect().width;
      const startX = e.clientX;
      const startViewerW = viewerCol.getBoundingClientRect().width;

      this._hDrag = { layout, viewerCol, rightPanel, totalW, startX, startViewerW };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', this._onMouseMoveH);
      window.addEventListener('mouseup', this._onMouseUpH);
    });
  }

  _onMouseMoveH(e) {
    if (!this._hDrag) return;
    const { viewerCol, rightPanel, totalW, startX, startViewerW } = this._hDrag;
    const splitterW = 6;
    const dx = e.clientX - startX;
    const MIN_VIEWER = 280;
    const MIN_PANEL  = 200;
    let newViewerW = Math.max(MIN_VIEWER, Math.min(totalW - MIN_PANEL - splitterW, startViewerW + dx));
    viewerCol.style.flex  = 'none';
    viewerCol.style.width = newViewerW + 'px';
    rightPanel.style.flex  = 'none';
    rightPanel.style.width = (totalW - newViewerW - splitterW) + 'px';
  }

  _onMouseUpH() {
    this._hDrag = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', this._onMouseMoveH);
    window.removeEventListener('mouseup', this._onMouseUpH);
    if (this.viewer) this.viewer.handleResize();
  }

  // ─── Vertical Splitter (upper | bottom panel) ────────────────────────────────
  _setupVSplitter() {
    const splitter = this.container.querySelector('#cif-v-splitter');
    splitter.addEventListener('mousedown', e => {
      e.preventDefault();
      const root = this.container.querySelector('#cif-root');
      const upper = this.container.querySelector('#cif-upper');
      const bottom = this.container.querySelector('#cif-bottom');
      const totalH = root.getBoundingClientRect().height;
      const startY = e.clientY;
      const startUpperH = upper.getBoundingClientRect().height;

      this._vDrag = { upper, bottom, totalH, startY, startUpperH };
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', this._onMouseMoveV);
      window.addEventListener('mouseup', this._onMouseUpV);
    });
  }

  // ─── Events ──────────────────────────────────────────────────────────────────
  _bindEvents() {
    const dropZone = this.container.querySelector('#cif-drop-zone');
    const fileInput = this.container.querySelector('#cif-file-input');
    const viewerCol = this.container.querySelector('#cif-viewer-col');

    dropZone.addEventListener('click', () => fileInput.click());
    
    // Bind drag and drop to the entire viewer column
    viewerCol.addEventListener('dragover', e => { e.preventDefault(); viewerCol.classList.add('drag-over'); });
    viewerCol.addEventListener('dragleave', () => viewerCol.classList.remove('drag-over'));
    viewerCol.addEventListener('drop', e => {
      e.preventDefault(); viewerCol.classList.remove('drag-over');
      const f = e.dataTransfer.files[0]; if (f) this._loadFile(f);
    });
    
    fileInput.addEventListener('change', e => { if (e.target.files[0]) this._loadFile(e.target.files[0]); });

    this.container.querySelector('#btn-change-elem').addEventListener('click', () => this._openChangeElem());
    this.container.querySelector('#btn-delete-atom').addEventListener('click', () => this._deleteAtom());
    this.container.querySelector('#btn-create-input').addEventListener('click', () => {
      this.onNavigate('protocol-selector');
    });

    // Context Menu bindings
    this.container.querySelector('#ctx-freeze').addEventListener('click', () => this._toggleFreeze());
    this.container.querySelector('#ctx-change').addEventListener('click', () => this._openChangeElem());
    this.container.querySelector('#ctx-delete').addEventListener('click', () => this._deleteAtom());
    
    // Hide context menu on general click
    document.addEventListener('click', this._onDocumentClick);
  }

  _showContextMenu(x, y) {
    const menu = this.container.querySelector('#cif-context-menu');
    menu.style.display = 'block';
    // Ensure it doesn't go off-screen
    const rect = this.container.querySelector('#cif-viewer-col').getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    let left = x - rect.left;
    let top = y - rect.top;
    if (left + menuRect.width > rect.width) left = rect.width - menuRect.width;
    if (top + menuRect.height > rect.height) top = rect.height - menuRect.height;
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';

    // Update label based on state
    if (this.appState.selectedAtoms && this.appState.selectedAtoms.length > 0) {
      const allFixed = this.appState.selectedAtoms.every(i => this.appState.cifData.atoms[i].fixed);
      menu.querySelector('#ctx-freeze').textContent = allFixed ? '🔥 Unfreeze' : '❄️ Freeze';
    }
  }

  _hideContextMenu() {
    const menu = this.container.querySelector('#cif-context-menu');
    if (menu) menu.style.display = 'none';
  }

  _loadFile(file) {
    const reader = new FileReader();
    reader.onload = ev => {
      const parsed = parseCIF(ev.target.result);
      if (!parsed) { alert('Could not parse CIF. Please check the file.'); return; }
      this.appState.cifData = parsed;
      this.appState.cifText = ev.target.result;
      this.appState.cifFilename = file.name;
      document.getElementById('topbar-breadcrumb').textContent = file.name;
      document.getElementById('topbar-mode').textContent = 'CIF';
      document.getElementById('topbar-mode').className = 'topbar-mode mode-cif';
      document.getElementById('topbar-mode').style.display = '';
      document.getElementById('topbar-action-btn').textContent = '↓ Export CIF';
      document.getElementById('topbar-action-btn').style.display = '';
      document.getElementById('topbar-action-btn').onclick = () => this._exportCIF();
      document.getElementById('sidebar-status-text').textContent = file.name;
      this.container.querySelector('#btn-create-input').disabled = false;
      this._initViewer();
    };
    reader.readAsText(file);
  }

  _initViewer() {
    this.container.querySelector('#cif-upload-overlay').style.display = 'none';
    this.container.querySelector('#three-canvas').style.display = 'block';
    this.container.querySelector('#viewer-overlay').style.display = 'flex';
    this.container.querySelector('#viewer-controls-hint').style.display = 'block';
    this.container.querySelector('#atom-toolbar').style.display = 'flex';

    if (this.viewer) this.viewer.dispose();
    const canvas = this.container.querySelector('#three-canvas');
    this.viewer = new ThreeViewer(canvas);
    this.viewer.onSelectAtomCallback = (indices) => this._onAtomSelect(indices);
    this.viewer.onContextMenuCallback = (e) => this._showContextMenu(e.clientX, e.clientY);
    this.viewer.buildStructure(this.appState.cifData);
    this._updateCellInfo();
    this._buildAtomList();
  }

  _onAtomSelect(indices) {
    this.appState.selectedAtoms = indices || [];
    const selInfo = this.container.querySelector('#sel-info');
    const btnChange = this.container.querySelector('#btn-change-elem');
    const btnDelete = this.container.querySelector('#btn-delete-atom');

    if (this.appState.selectedAtoms.length > 0) {
      if (this.appState.selectedAtoms.length === 1) {
        const idx = this.appState.selectedAtoms[0];
        const atom = this.appState.cifData.atoms[idx];
        this.container.querySelector('#sel-elem').textContent = atom.sym;
        this.container.querySelector('#sel-coords').innerHTML =
          `fx:${atom.fx.toFixed(4)} fy:${atom.fy.toFixed(4)} fz:${atom.fz.toFixed(4)}<br>#${idx+1} — ${atom.label}${atom.fixed ? ' (Fixed)' : ''}`;
      } else {
        this.container.querySelector('#sel-elem').textContent = 'Multi';
        this.container.querySelector('#sel-coords').innerHTML = `${this.appState.selectedAtoms.length} atoms selected`;
      }
      selInfo.style.display = 'block';
      btnChange.disabled = false;
      btnDelete.disabled = false;
    } else {
      selInfo.style.display = 'none';
      btnChange.disabled = true;
      btnDelete.disabled = true;
      this._hideContextMenu();
    }
    
    this.container.querySelectorAll('.atom-row').forEach((r, i) => {
      r.classList.toggle('selected', this.appState.selectedAtoms.includes(i));
    });
  }

  _toggleFreeze() {
    this._hideContextMenu();
    if (!this.appState.selectedAtoms || this.appState.selectedAtoms.length === 0) return;
    
    const allFixed = this.appState.selectedAtoms.every(i => this.appState.cifData.atoms[i].fixed);
    const newState = !allFixed;
    
    this.appState.selectedAtoms.forEach(idx => {
      this.appState.cifData.atoms[idx].fixed = newState;
    });
    
    this.viewer.buildStructure(this.appState.cifData);
    this._buildAtomList();
    
    // Reselect
    this.appState.selectedAtoms.forEach(idx => this.viewer.selectAtom(idx, true));
  }

  _deleteAtom() {
    this._hideContextMenu();
    if (!this.appState.selectedAtoms || this.appState.selectedAtoms.length === 0) return;
    
    // Sort descending to avoid index shifting issues during splice
    const sortedIndices = [...this.appState.selectedAtoms].sort((a, b) => b - a);
    sortedIndices.forEach(idx => {
      this.appState.cifData.atoms.splice(idx, 1);
    });
    
    this.appState.selectedAtoms = [];
    this.viewer.buildStructure(this.appState.cifData);
    this._updateCellInfo();
    this._buildAtomList();
    this._onAtomSelect([]);
  }

  _openChangeElem() {
    this._hideContextMenu();
    if (!this.appState.selectedAtoms || this.appState.selectedAtoms.length === 0) return;
    
    // Use first selected atom's symbol as pending
    this.pendingElem = this.appState.cifData.atoms[this.appState.selectedAtoms[0]].sym;
    
    const grid = document.getElementById('elem-grid');
    grid.innerHTML = '';
    ELEM_KEYS.forEach(sym => {
      const btn = document.createElement('button');
      btn.className = 'elem-btn' + (sym === this.pendingElem ? ' selected' : '');
      btn.textContent = sym;
      btn.addEventListener('click', () => {
        grid.querySelectorAll('.elem-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.pendingElem = sym;
      });
      grid.appendChild(btn);
    });
    
    document.getElementById('change-elem-modal').classList.add('open');
    document.getElementById('btn-elem-apply').onclick = () => {
      if (this.appState.selectedAtoms.length > 0 && this.pendingElem) {
        this.appState.selectedAtoms.forEach(idx => {
          const atom = this.appState.cifData.atoms[idx];
          atom.sym = this.pendingElem;
          atom.label = this.pendingElem;
        });
        
        this.viewer.buildStructure(this.appState.cifData);
        this._buildAtomList();
        this.appState.selectedAtoms.forEach(idx => this.viewer.selectAtom(idx, true));
      }
      document.getElementById('change-elem-modal').classList.remove('open');
    };
  }

  _buildAtomList() {
    const list = this.container.querySelector('#atom-list');
    list.innerHTML = '';
    this.appState.cifData.atoms.forEach((atom, idx) => {
      const el = ELEMENTS[atom.sym] || { color: '#aaa' };
      const row = document.createElement('div');
      row.className = 'atom-row' + (atom.fixed ? ' fixed-atom' : '');
      row.innerHTML = `
        <div class="atom-dot" style="background:${el.color}"></div>
        <span class="atom-sym">${escapeHTML(atom.sym)}</span>
        <span class="atom-idx">#${idx+1} – ${escapeHTML(atom.label)}</span>
        ${atom.fixed ? '<span class="atom-fixed-badge">❄️</span>' : ''}
      `;
      row.addEventListener('click', (e) => { 
        if (this.viewer) {
          const multi = e.shiftKey || e.ctrlKey || e.metaKey;
          this.viewer.selectAtom(idx, multi);
        }
      });
      list.appendChild(row);
    });
  }

  _updateCellInfo() {
    const { a, b, c, alpha, beta, gamma } = this.appState.cifData.cell;
    const sym = this.appState.cifData.symmetry;
    const deg = v => (v * 180 / Math.PI).toFixed(1);
    let info = `<b>Cell</b> a=${a.toFixed(3)} b=${b.toFixed(3)} c=${c.toFixed(3)} Å<br>α=${deg(alpha)}° β=${deg(beta)}° γ=${deg(gamma)}°`;
    if (sym) {
      if (sym.sgName)   info += `<br><span style="opacity:0.7">SG: <b>${escapeHTML(sym.sgName)}</b>${sym.itNumber ? ` (#${sym.itNumber})` : ''}</span>`;
      if (sym.lattice)  info += `<br><span style="opacity:0.7">Lattice: <b>${escapeHTML(sym.lattice)}</b> · ibrav=<b>${sym.ibrav ?? 0}</b></span>`;
    }
    this.container.querySelector('#cell-info').innerHTML = info;
    const badge = this.container.querySelector('#atom-count-badge');
    badge.style.display = '';
    badge.textContent = `${this.appState.cifData.atoms.length} atoms · ${[...new Set(this.appState.cifData.atoms.map(a => a.sym))].join(' ')}`;
  }

  _exportCIF() {
    const text = exportCIF(this.appState);
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (this.appState.cifFilename || 'structure').replace('.cif', '_edited.cif');
    a.click();
  }

  destroy() {
    window.removeEventListener('mousemove', this._onMouseMoveH);
    window.removeEventListener('mouseup', this._onMouseUpH);
    document.removeEventListener('click', this._onDocumentClick);
    if (this._themeListener) {
      window.removeEventListener('theme-changed', this._themeListener);
    }
    if (this.viewer) this.viewer.dispose();
  }
}
