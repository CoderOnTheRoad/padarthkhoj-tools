import { parseCSV, groupRows, getSubBranches, PALETTE } from '../lib/freeEnergyParser.js';
import { PlotEngine, defaultStyleConfig, defaultAxisConfig, computeGhosts, normConn, connToKey, parseSegKey } from '../lib/freeEnergyPlot.js';
import { InteractionLayer } from '../lib/freeEnergyInteraction.js';
import { bulkExport, canvasToBlob, downloadBlob, downloadZIP, computePixelDims } from '../lib/freeEnergyExport.js';

// ─── Central state factory ────────────────────────────────────────────────────
function createState() {
  return {
    rows:        [],
    styleConfig: defaultStyleConfig(),
    axisConfig:  defaultAxisConfig(),
    exportConfig: {
      dpi: 300, widthIn: 6, heightIn: 4, widthPx: 1800, heightPx: 1200,
      unitMode: 'inch', background: 'white', mode: 'combined', prefix: '',
    },
    activeTab: 'data',
    annotations: [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
export class FreeEnergyPlotterPage {
  constructor(container, appState) {
    this.container     = container;
    this.appState      = appState;
    this._state        = createState();
    this._engine       = null;
    this._interact     = null;
    this._ro           = null;
    // Multi-file tab system
    this._plotTabs     = [];   // [{name, state}]
    this._activeTabIdx = -1;   // -1 = manual/no file tabs

    this._onThemeChanged = () => {
      if (this._engine) this._refreshPlot();
    };
  }

  // ─── Main render ─────────────────────────────────────────────────────────────
  render() {
    this.container.innerHTML = `
      <div class="fep-layout" id="fep-layout">

        <!-- SIDEBAR -->
        <div class="fep-sidebar" id="fep-sidebar">
          <!-- File-plot tab bar (hidden until files are loaded) -->
          <div class="fep-file-tab-bar hidden" id="fep-file-tab-bar"></div>
          <!-- Data / Style / Export tabs -->
          <div class="fep-tabs">
            <button class="fep-tab active" data-tab="data">Data</button>
            <button class="fep-tab"        data-tab="style">Style</button>
            <button class="fep-tab"        data-tab="export">Export</button>
          </div>
          <div class="fep-tab-body" id="fep-tab-body"></div>
        </div>

        <!-- SPLITTER -->
        <div class="fep-splitter" id="fep-splitter"><div class="fep-splitter-grip"></div></div>

        <!-- PLOT AREA -->
        <div class="fep-plot-area" id="fep-plot-area">
          <div class="fep-toolbar" id="fep-toolbar">
            <span class="fep-tb-hint">Click line: select &nbsp;·&nbsp; Dbl-click: style &nbsp;·&nbsp; Right-click/Del: delete &nbsp;·&nbsp; Drag socket ●: new line &nbsp;·&nbsp; Drag ◆: reroute endpoint</span>
            <div class="fep-tb-sep"></div>
            <button class="fep-tb-btn" id="fep-add-text-btn" title="Add draggable text label to canvas">＋ Add Text</button>
            <button class="fep-tb-btn" id="fep-reset-elem-btn" title="Remove all individual element color overrides">Reset element colors</button>
          </div>

          <canvas id="fep-canvas" oncontextmenu="return false"></canvas>
          <div class="fep-annotation-layer" id="fep-annotation-layer"></div>
          <div class="fep-tooltip" id="fep-tooltip" style="display:none"></div>
          <div class="fep-palette-popup" id="fep-palette-popup" style="display:none"></div>

          <div class="fep-plot-hint" id="fep-plot-hint">
            Upload a CSV or enter data in the Data tab to begin plotting
          </div>
        </div>

      </div>
    `;

    this._bindStaticEvents();
    this._renderTab();
    this._initCanvas();
    this._setupSplitter();

    const addTextBtn = this.container.querySelector('#fep-add-text-btn');
    if (addTextBtn) {
      addTextBtn.addEventListener('click', () => {
        this._addAnnotation(0.5, 0.5); // Add in center
      });
    }

    window.addEventListener('theme-changed', this._onThemeChanged);
  }

  // ─── Tab switching ────────────────────────────────────────────────────────────
  _bindStaticEvents() {
    this.container.querySelectorAll('.fep-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this._state.activeTab = btn.dataset.tab;
        this.container.querySelectorAll('.fep-tab').forEach(b => b.classList.toggle('active', b === btn));
        this._renderTab();
      });
    });
  }

  _renderTab() {
    const body = this.container.querySelector('#fep-tab-body');
    body.innerHTML = '';
    if      (this._state.activeTab === 'data')   this._buildDataTab(body);
    else if (this._state.activeTab === 'style')  this._buildStyleTab(body);
    else if (this._state.activeTab === 'export') this._buildExportTab(body);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  DATA TAB
  // ═══════════════════════════════════════════════════════════════════════════
  _buildDataTab(body) {
    const sc  = this._state.styleConfig;
    const sbs = getSubBranches(this._state.rows);

    body.innerHTML = `
      <div class="fep-section">
        <div class="fep-sh"><span class="fep-si">⬇</span><span class="fep-st">Upload CSV</span></div>
        <div class="fep-dropzone" id="fep-dz">
          <input type="file" id="fep-file-inp" accept=".csv,.txt" multiple>
          <span class="fep-dz-ico">📂</span>
          <div class="fep-dz-t">Drop CSV files here</div>
          <div class="fep-dz-s">branch · sub-branch · energy (3 columns)</div>
        </div>
      </div>

      <div class="fep-section">
        <div class="fep-sh">
          <span class="fep-si">✎</span><span class="fep-st">Manual Data</span>
          <span class="fep-sh-meta">branch  sb  energy</span>
        </div>
        <textarea class="fep-textarea" id="fep-manual" rows="11"
          placeholder="1  a  0.0&#10;2  a  2.1&#10;3  a -1.5&#10;3  b  3.0&#10;4  a  4.2&#10;4  b  2.0&#10;5  a -0.8&#10;6  a -2.1&#10;6  b  3.2"></textarea>
        <div class="fep-row" style="gap:6px;margin-top:6px">
          <button class="fep-btn fep-btn-p" id="fep-parse-btn">Parse &amp; Plot</button>
          <button class="fep-btn fep-btn-s" id="fep-clear-btn">Clear</button>
        </div>
      </div>

      <div class="fep-section">
        <div class="fep-sh"><span class="fep-si">⇌</span><span class="fep-st">Branch Continuity</span></div>
        <label class="fep-ck-row">
          <input type="checkbox" id="fep-cont-chk" ${sc.continuity ? 'checked' : ''}>
          Auto-connect sub-branches to main
        </label>
        <div class="fep-row" style="margin-top:6px">
          <span class="fep-lbl">Main branch</span>
          <select class="fep-sel" id="fep-main-branch">
            <option value="">auto</option>
            ${sbs.map(sb => `<option value="${sb}" ${sc.mainBranch === sb ? 'selected' : ''}>${sb}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="fep-section" id="fep-data-preview-section" style="display:none">
        <div class="fep-sh">
          <span class="fep-si">◈</span><span class="fep-st">Data Preview</span>
          <span class="fep-badge" id="fep-row-count"></span>
        </div>
        <div class="fep-preview-wrap" id="fep-preview-wrap"></div>
      </div>
    `;

    const dz  = body.querySelector('#fep-dz');
    const inp = body.querySelector('#fep-file-inp');
    inp.addEventListener('change', e => this._loadFiles([...e.target.files]));
    dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('fep-drag'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('fep-drag'));
    dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('fep-drag'); this._loadFiles([...e.dataTransfer.files]); });

    body.querySelector('#fep-parse-btn').addEventListener('click', () => {
      this._applyRows(parseCSV(body.querySelector('#fep-manual').value));
    });
    body.querySelector('#fep-clear-btn').addEventListener('click', () => {
      body.querySelector('#fep-manual').value = '';
      this._applyRows([]);
    });
    body.querySelector('#fep-cont-chk').addEventListener('change', e => {
      this._state.styleConfig.continuity = e.target.checked;
      this._refreshPlot();
    });
    body.querySelector('#fep-main-branch').addEventListener('change', e => {
      this._state.styleConfig.mainBranch = e.target.value || null;
      this._refreshPlot();
    });

    if (this._state.rows.length) {
      body.querySelector('#fep-manual').value =
        this._state.rows.map(r => `${r.branch}\t${r.subBranch}\t${r.energy}`).join('\n');
      this._renderPreview(body);
    }
  }

  // One tab per file — each retains its own complete state
  async _loadFiles(files) {
    for (const f of files) {
      const rows = parseCSV(await f.text());
      if (!rows.length) continue;
      this._createPlotTab(f.name, rows);
    }
  }

  _createPlotTab(name, rows) {
    // Strip extension for display
    const label = name.replace(/\.[^.]+$/, '');
    const state = createState();
    state.rows  = rows;
    // Auto-assign branch colours
    getSubBranches(rows).forEach((sb, i) => {
      state.styleConfig.branchStyles[sb] = { color: PALETTE[i % PALETTE.length] };
    });
    this._plotTabs.push({ name: label, state });
    this._rerenderFileTabBar();
    // Auto-switch to the newly added tab
    this._switchPlotTab(this._plotTabs.length - 1);
  }

  _switchPlotTab(idx) {
    this._activeTabIdx = idx;
    this._state = this._plotTabs[idx].state;
    this._rerenderFileTabBar();
    // Re-render the sidebar content to reflect the new tab's data
    this._renderTab();
    this._refreshPlot();
    const hint = this.container.querySelector('#fep-plot-hint');
    if (hint) hint.style.display = this._state.rows.length ? 'none' : '';
  }

  _rerenderFileTabBar() {
    const bar = this.container.querySelector('#fep-file-tab-bar');
    if (!bar) return;
    if (!this._plotTabs.length) { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    if(this._plotTabs.length>5){bar.innerHTML=`<div class="fep-compact-files"><button data-file-step="-1" ${this._activeTabIdx<=0?'disabled':''}>‹</button><select id="fep-active-file">${this._plotTabs.map((tab,index)=>`<option value="${index}" ${index===this._activeTabIdx?'selected':''}>${tab.name}</option>`).join('')}</select><button data-file-step="1" ${this._activeTabIdx>=this._plotTabs.length-1?'disabled':''}>›</button><span>${this._plotTabs.length} files</span><button data-close-current title="Close current dataset">×</button></div>`;bar.querySelector('#fep-active-file').addEventListener('change',event=>this._switchPlotTab(Number(event.target.value)));bar.querySelectorAll('[data-file-step]').forEach(button=>button.addEventListener('click',()=>this._switchPlotTab(this._activeTabIdx+Number(button.dataset.fileStep))));bar.querySelector('[data-close-current]').addEventListener('click',()=>this._closePlotTab(this._activeTabIdx));return;}
    bar.innerHTML = this._plotTabs.map((tab, i) => `
      <button class="fep-file-tab ${i === this._activeTabIdx ? 'active' : ''}" data-idx="${i}" title="${tab.name}">
        <span>${tab.name}</span>
        <span class="fep-file-tab-close" data-close="${i}" title="Close tab">✕</span>
      </button>
    `).join('');
    // Bind tab clicks
    bar.querySelectorAll('.fep-file-tab').forEach(btn => {
      btn.addEventListener('click', e => {
        const closeBtn = e.target.closest('[data-close]');
        if (closeBtn) {
          e.stopPropagation();
          const closeIdx = Number(closeBtn.dataset.close);
          this._closePlotTab(closeIdx);
          return;
        }
        this._switchPlotTab(Number(btn.dataset.idx));
      });
    });
  }

  _closePlotTab(idx) {
    this._plotTabs.splice(idx, 1);
    if (!this._plotTabs.length) {
      // Back to manual mode
      this._activeTabIdx = -1;
      this._state = createState();
      this._rerenderFileTabBar();
      this._renderTab();
      this._refreshPlot();
      return;
    }
    // Switch to nearest remaining tab
    const newIdx = Math.min(idx, this._plotTabs.length - 1);
    this._switchPlotTab(newIdx);
  }

  _applyRows(rows) {
    this._state.rows = rows;
    const sbs = getSubBranches(rows);
    sbs.forEach((sb, i) => {
      if (!this._state.styleConfig.branchStyles[sb])
        this._state.styleConfig.branchStyles[sb] = { color: PALETTE[i % PALETTE.length] };
    });
    this._refreshPlot();
    const tabBody = this.container.querySelector('#fep-tab-body');
    if (tabBody && this._state.activeTab === 'data') this._renderPreview(tabBody);
  }

  _renderPreview(body) {
    const rows = this._state.rows;
    const sec  = body.querySelector('#fep-data-preview-section');
    const wrap = body.querySelector('#fep-preview-wrap');
    const cnt  = body.querySelector('#fep-row-count');
    if (!sec || !wrap) return;
    if (!rows.length)  { sec.style.display = 'none'; return; }
    sec.style.display = '';
    if (cnt) cnt.textContent = `${rows.length} rows`;
    const grouped = groupRows(rows);
    let html = `<table class="fep-table"><thead><tr><th>#</th><th>SB</th><th>Step</th><th>Energy</th></tr></thead><tbody>`;
    let n = 0;
    for (const [sb, pts] of grouped) {
      pts.forEach(pt => {
        html += `<tr>
          <td class="fep-td-n">${++n}</td>
          <td class="fep-td-sb">${sb}</td>
          <td>${pt.branch}</td>
          <td class="fep-td-e">${(+pt.energy).toFixed(4)}</td>
        </tr>`;
      });
    }
    html += '</tbody></table>';
    wrap.innerHTML = html;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  STYLE TAB
  // ═══════════════════════════════════════════════════════════════════════════
  _buildStyleTab(body) {
    const sc  = this._state.styleConfig;
    const ac  = this._state.axisConfig;
    const sbs = getSubBranches(this._state.rows);

    const axisSect = (side, label) => {
      const cfg = ac[side];
      const isY = side==='left' || side==='right';
      const rangeLabel = isY ? 'Auto Y' : 'Auto X';
      const minId = isY ? `ax-${side}-ymin` : `ax-${side}-xmin`;
      const maxId = isY ? `ax-${side}-ymax` : `ax-${side}-xmax`;
      
      return `
        <div class="fep-subsect">
          <b class="fep-sub-title">${label}</b>
          <label class="fep-ck-row"><input type="checkbox" id="ax-${side}-show" ${cfg.show?'checked':''}> Show axis</label>
          <label class="fep-ck-row"><input type="checkbox" id="ax-${side}-ticks" ${cfg.showTicks?'checked':''}> Major ticks</label>
          <label class="fep-ck-row"><input type="checkbox" id="ax-${side}-minor" ${cfg.showMinorTicks?'checked':''}> Minor ticks</label>
          <label class="fep-ck-row"><input type="checkbox" id="ax-${side}-lbls" ${cfg.showLabels?'checked':''}> Tick labels</label>
          <div class="fep-row">
            <span class="fep-lbl">Maj len</span>
            <input class="fep-inp fep-inp-sm" type="number" id="ax-${side}-tlen" value="${cfg.tickLen}" min="1" max="20">
            <span class="fep-lbl">Min len</span>
            <input class="fep-inp fep-inp-sm" type="number" id="ax-${side}-mlen" value="${cfg.minorTickLen}" min="1" max="20">
          </div>
          <div class="fep-row">
            <span class="fep-lbl">Direction</span>
            <select class="fep-sel" id="ax-${side}-dir">
              <option value="out" ${cfg.tickDir==='out'?'selected':''}>Out</option>
              <option value="in"  ${cfg.tickDir==='in' ?'selected':''}>In</option>
            </select>
          </div>
          <label class="fep-ck-row"><input type="checkbox" id="ax-${side}-auto" ${cfg.auto?'checked':''}> ${rangeLabel}</label>
          <div class="fep-row" id="ax-${side}-range" style="${cfg.auto?'display:none':''}">
            <span class="fep-lbl">Min</span><input class="fep-inp fep-inp-sm" id="${minId}" value="${cfg.min??''}">
            <span class="fep-lbl">Max</span><input class="fep-inp fep-inp-sm" id="${maxId}" value="${cfg.max??''}">
          </div>
          <div class="fep-row">
            <span class="fep-lbl">Interval</span>
            <input class="fep-inp fep-inp-sm" id="ax-${side}-maj" placeholder="auto" value="${cfg.majInterval??''}">
          </div>
          <div class="fep-row">
            <span class="fep-lbl">Decimals</span>
            <select class="fep-sel" id="ax-${side}-dec">
              <option value="" ${cfg.decimals==null?'selected':''}>Auto</option>
              <option value="0" ${cfg.decimals===0?'selected':''}>0</option>
              <option value="1" ${cfg.decimals===1?'selected':''}>1</option>
              <option value="2" ${cfg.decimals===2?'selected':''}>2</option>
              <option value="3" ${cfg.decimals===3?'selected':''}>3</option>
              <option value="4" ${cfg.decimals===4?'selected':''}>4</option>
            </select>
          </div>
          <div class="fep-row">
            <span class="fep-lbl">Label</span>
            <input class="fep-inp" id="ax-${side}-label" value="${cfg.label??''}">
          </div>
        </div>`;
    };

    let templateHtml = '';
    if (this._plotTabs.length > 1) {
      templateHtml = `
        <div class="fep-section" style="background: rgba(0, 212, 255, 0.03); border-bottom: 1px solid var(--border-hi)">
          <div class="fep-sh"><span class="fep-si">⧉</span><span class="fep-st">Style Template</span></div>
          <button class="fep-btn fep-btn-p fep-btn-full" id="fep-apply-template-btn">Apply Current Style as Template…</button>
        </div>`;
    }

    const fc = sc.fontConfig || {
      axisLabel:  { family: 'Space Grotesk', size: 13.5, weight: 'normal', color: null },
      tickNumber: { family: 'JetBrains Mono', size: 11.5, weight: 'normal', color: null },
      legend:     { family: 'JetBrains Mono', size: 10.5, weight: 'normal', color: null },
      legendPos:  'top-right'
    };

    body.innerHTML = `
      ${templateHtml}

      ${this._accordion('Axes — Bottom / Top', 'axbt', axisSect('bottom','▼ Bottom') + axisSect('top','▲ Top'))}
      ${this._accordion('Axes — Left / Right', 'axlr', axisSect('left','◀ Left') + axisSect('right','▶ Right'))}

      ${this._accordion('Line Style', 'line', `
        <div class="fep-row">
          <span class="fep-lbl">Type</span>
          <select class="fep-sel" id="ls-type">
            <option value="dashed" ${sc.lineType==='dashed'?'selected':''}>Dashed</option>
            <option value="solid"  ${sc.lineType==='solid' ?'selected':''}>Solid</option>
            <option value="dotted" ${sc.lineType==='dotted'?'selected':''}>Dotted</option>
          </select>
        </div>
        <div class="fep-row">
          <span class="fep-lbl">Width</span>
          <input class="fep-inp fep-inp-sm" type="number" id="ls-width" value="${sc.lineWidth}" step="0.5" min="0.5" max="8">
        </div>
        <div class="fep-row">
          <span class="fep-lbl">Bar width</span>
          <input type="range" id="ls-barw" value="${sc.barWidth}" min="0.1" max="0.9" step="0.05" style="flex:1">
          <span id="ls-barw-val" style="min-width:30px;font-size:0.65rem">${sc.barWidth}</span>
        </div>
      `)}

      ${this._accordion('Point Style', 'pt', `
        <div class="fep-row">
          <span class="fep-lbl">Shape</span>
          <select class="fep-sel" id="pt-shape">
            <option value="circle"   ${sc.pointShape==='circle'  ?'selected':''}>Circle</option>
            <option value="square"   ${sc.pointShape==='square'  ?'selected':''}>Square</option>
            <option value="triangle" ${sc.pointShape==='triangle'?'selected':''}>Triangle</option>
            <option value="diamond"  ${sc.pointShape==='diamond' ?'selected':''}>Diamond</option>
            <option value="none"     ${sc.pointShape==='none'    ?'selected':''}>None</option>
          </select>
        </div>
        <div class="fep-row">
          <span class="fep-lbl">Size</span>
          <input class="fep-inp fep-inp-sm" type="number" id="pt-size" value="${sc.pointSize}" min="2" max="24">
        </div>
        <div class="fep-row">
          <span class="fep-lbl">Border</span>
          <input class="fep-inp fep-inp-sm" type="number" id="pt-border" value="${sc.pointBorder}" step="0.5" min="0" max="5">
        </div>
      `)}

      ${this._accordion('Branch Colors', 'bc', `
        <div id="fep-branch-colors">
          ${sbs.length ? sbs.map((sb, i) => {
              const bsc = sc.branchStyles[sb] || {};
              const col = bsc.color || PALETTE[i % PALETTE.length];
              return `
                <div class="fep-bc-row">
                  <span class="fep-bc-label">${sb}</span>
                  <input type="color" class="fep-color-inp" id="bc-${sb}" data-sb="${sb}" value="${col}">
                  <select class="fep-sel fep-sel-xs" id="bcl-${sb}" data-sb="${sb}">
                    <option value="">def</option>
                    <option value="solid"  ${bsc.lineType==='solid' ?'selected':''}>solid</option>
                    <option value="dashed" ${bsc.lineType==='dashed'?'selected':''}>dashed</option>
                    <option value="dotted" ${bsc.lineType==='dotted'?'selected':''}>dotted</option>
                  </select>
                  <select class="fep-sel fep-sel-xs" id="bcs-${sb}" data-sb="${sb}">
                    <option value="">shape↑</option>
                    <option value="circle"   ${bsc.pointShape==='circle'  ?'selected':''}>●</option>
                    <option value="square"   ${bsc.pointShape==='square'  ?'selected':''}>■</option>
                    <option value="triangle" ${bsc.pointShape==='triangle'?'selected':''}>▲</option>
                    <option value="diamond"  ${bsc.pointShape==='diamond' ?'selected':''}>◆</option>
                    <option value="none"     ${bsc.pointShape==='none'    ?'selected':''}>✕</option>
                  </select>
                </div>`;
            }).join('') : '<div class="fep-empty">Load data first</div>'}
        </div>
      `)}

      ${this._accordion('Legend', 'leg', `
        <label class="fep-ck-row"><input type="checkbox" id="leg-show" ${sc.showLegend?'checked':''}> Show legend</label>
        <label class="fep-ck-row"><input type="checkbox" id="sc-grid"  ${sc.gridLines ?'checked':''}> Grid lines</label>
        ${sbs.map(sb => `
          <div class="fep-row">
            <span class="fep-lbl">${sb}</span>
            <input class="fep-inp" data-sb="${sb}" id="ll-${sb}" placeholder="custom label…" value="${sc.legendLabels[sb]||''}">
          </div>`).join('')}
      `)}

      ${this._accordion('Typography', 'typo', `
        <div class="fep-subsect">
          <b class="fep-sub-title">Axis Labels</b>
          <div class="fep-row">
            <span class="fep-lbl">Family</span>
            <select class="fep-sel" id="typo-ax-fam">
              <option value="Space Grotesk">Space Grotesk</option>
              <option value="JetBrains Mono">JetBrains Mono</option>
              <option value="Arial">Arial</option>
              <option value="Helvetica">Helvetica</option>
              <option value="Times New Roman">Times New Roman</option>
              <option value="Georgia">Georgia</option>
            </select>
          </div>
          <div class="fep-row">
            <span class="fep-lbl">Size</span>
            <input class="fep-inp fep-inp-sm" type="number" id="typo-ax-sz" step="0.5" min="6" max="36">
            <span class="fep-lbl">Weight</span>
            <select class="fep-sel" id="typo-ax-wt">
              <option value="normal">Normal</option>
              <option value="bold">Bold</option>
              <option value="italic">Italic</option>
              <option value="bold italic">Bold Italic</option>
            </select>
          </div>
          <div class="fep-row">
            <span class="fep-lbl">Color</span>
            <input type="color" class="fep-color-inp" id="typo-ax-cl" style="flex:1">
            <button class="fep-btn fep-btn-xs" id="typo-ax-cl-reset">Auto</button>
          </div>
        </div>

        <div class="fep-subsect" style="margin-top:12px">
          <b class="fep-sub-title">Tick Labels</b>
          <div class="fep-row">
            <span class="fep-lbl">Family</span>
            <select class="fep-sel" id="typo-tk-fam">
              <option value="Space Grotesk">Space Grotesk</option>
              <option value="JetBrains Mono">JetBrains Mono</option>
              <option value="Arial">Arial</option>
              <option value="Helvetica">Helvetica</option>
              <option value="Times New Roman">Times New Roman</option>
              <option value="Georgia">Georgia</option>
            </select>
          </div>
          <div class="fep-row">
            <span class="fep-lbl">Size</span>
            <input class="fep-inp fep-inp-sm" type="number" id="typo-tk-sz" step="0.5" min="6" max="36">
            <span class="fep-lbl">Weight</span>
            <select class="fep-sel" id="typo-tk-wt">
              <option value="normal">Normal</option>
              <option value="bold">Bold</option>
              <option value="italic">Italic</option>
              <option value="bold italic">Bold Italic</option>
            </select>
          </div>
          <div class="fep-row">
            <span class="fep-lbl">Color</span>
            <input type="color" class="fep-color-inp" id="typo-tk-cl" style="flex:1">
            <button class="fep-btn fep-btn-xs" id="typo-tk-cl-reset">Auto</button>
          </div>
        </div>

        <div class="fep-subsect" style="margin-top:12px">
          <b class="fep-sub-title">Legend Text</b>
          <div class="fep-row">
            <span class="fep-lbl">Family</span>
            <select class="fep-sel" id="typo-lg-fam">
              <option value="Space Grotesk">Space Grotesk</option>
              <option value="JetBrains Mono">JetBrains Mono</option>
              <option value="Arial">Arial</option>
              <option value="Helvetica">Helvetica</option>
              <option value="Times New Roman">Times New Roman</option>
              <option value="Georgia">Georgia</option>
            </select>
          </div>
          <div class="fep-row">
            <span class="fep-lbl">Size</span>
            <input class="fep-inp fep-inp-sm" type="number" id="typo-lg-sz" step="0.5" min="6" max="36">
            <span class="fep-lbl">Weight</span>
            <select class="fep-sel" id="typo-lg-wt">
              <option value="normal">Normal</option>
              <option value="bold">Bold</option>
              <option value="italic">Italic</option>
              <option value="bold italic">Bold Italic</option>
            </select>
          </div>
          <div class="fep-row">
            <span class="fep-lbl">Color</span>
            <input type="color" class="fep-color-inp" id="typo-lg-cl" style="flex:1">
            <button class="fep-btn fep-btn-xs" id="typo-lg-cl-reset">Auto</button>
          </div>
          <div class="fep-row" style="margin-top:6px">
            <span class="fep-lbl">Position</span>
            <select class="fep-sel" id="typo-lg-pos">
              <option value="top-right">Top-Right</option>
              <option value="top-left">Top-Left</option>
              <option value="bottom-right">Bottom-Right</option>
              <option value="bottom-left">Bottom-Left</option>
              <option value="custom">Custom (Drag)</option>
            </select>
          </div>
        </div>
      `)}
    `;

    // Populate typography values
    const setSel = (id, val) => { const el = body.querySelector(`#${id}`); if (el) el.value = val || ''; };
    const setNum = (id, val) => { const el = body.querySelector(`#${id}`); if (el) el.value = val != null ? val : ''; };
    
    setSel('typo-ax-fam', fc.axisLabel?.family);
    setNum('typo-ax-sz',  fc.axisLabel?.size);
    setSel('typo-ax-wt',  fc.axisLabel?.weight);
    setSel('typo-ax-cl',  fc.axisLabel?.color || '#c8d6e5');

    setSel('typo-tk-fam', fc.tickNumber?.family);
    setNum('typo-tk-sz',  fc.tickNumber?.size);
    setSel('typo-tk-wt',  fc.tickNumber?.weight);
    setSel('typo-tk-cl',  fc.tickNumber?.color || '#c8d6e5');

    setSel('typo-lg-fam', fc.legend?.family);
    setNum('typo-lg-sz',  fc.legend?.size);
    setSel('typo-lg-wt',  fc.legend?.weight);
    setSel('typo-lg-cl',  fc.legend?.color || '#c8d6e5');
    setSel('typo-lg-pos', fc.legendPos);

    this._bindStyleEvents(body);
  }

  _accordion(title, id, content) {
    return `
      <div class="fep-section fep-acc" id="fep-acc-${id}">
        <div class="fep-acc-head" data-acc="${id}">
          <span>${title}</span><span class="fep-acc-arrow">▾</span>
        </div>
        <div class="fep-acc-body">${content}</div>
      </div>`;
  }

  _bindStyleEvents(body) {
    body.querySelectorAll('.fep-acc-head').forEach(h => {
      h.addEventListener('click', () => {
        const b = body.querySelector(`#fep-acc-${h.dataset.acc} .fep-acc-body`);
        const a = h.querySelector('.fep-acc-arrow');
        b.classList.toggle('fep-acc-collapsed');
        a.style.transform = b.classList.contains('fep-acc-collapsed') ? 'rotate(-90deg)' : '';
      });
    });

    const upd = () => this._refreshPlot();
    const SIDES = ['bottom','top','left','right'];

    SIDES.forEach(side => {
      this._ckBind(body, `ax-${side}-show`,  v => { this._state.axisConfig[side].show          = v; upd(); });
      this._ckBind(body, `ax-${side}-ticks`, v => { this._state.axisConfig[side].showTicks      = v; upd(); });
      this._ckBind(body, `ax-${side}-minor`, v => { this._state.axisConfig[side].showMinorTicks = v; upd(); });
      this._ckBind(body, `ax-${side}-lbls`,  v => { this._state.axisConfig[side].showLabels     = v; upd(); });
      this._inpBind(body, `ax-${side}-tlen`, v => { this._state.axisConfig[side].tickLen       = Number(v)||6; upd(); });
      this._inpBind(body, `ax-${side}-mlen`, v => { this._state.axisConfig[side].minorTickLen  = Number(v)||3; upd(); });
      this._selBind(body, `ax-${side}-dir`,  v => { this._state.axisConfig[side].tickDir       = v; upd(); });
      this._inpBind(body, `ax-${side}-label`,v => { this._state.axisConfig[side].label         = v; upd(); });

      const autoChk  = body.querySelector(`#ax-${side}-auto`);
      const rangeRow = body.querySelector(`#ax-${side}-range`);
      if (autoChk) autoChk.addEventListener('change', () => {
        this._state.axisConfig[side].auto = autoChk.checked;
        if (rangeRow) rangeRow.style.display = autoChk.checked ? 'none' : '';
        upd();
      });

      const isY = side==='left' || side==='right';
      const minId = isY ? `ax-${side}-ymin` : `ax-${side}-xmin`;
      const maxId = isY ? `ax-${side}-ymax` : `ax-${side}-xmax`;

      this._inpBind(body, minId, v => { this._state.axisConfig[side].min = v ? Number(v) : null; upd(); });
      this._inpBind(body, maxId, v => { this._state.axisConfig[side].max = v ? Number(v) : null; upd(); });
      this._inpBind(body, `ax-${side}-maj`,  v => { this._state.axisConfig[side].majInterval = v ? Number(v) : null; upd(); });

      // Decimals dropdown
      const decSel = body.querySelector(`#ax-${side}-dec`);
      if (decSel) decSel.addEventListener('change', () => {
        this._state.axisConfig[side].decimals = decSel.value !== '' ? Number(decSel.value) : null;
        upd();
      });
    });

    this._selBind(body, 'ls-type',  v => { this._state.styleConfig.lineType  = v;            upd(); });
    this._inpBind(body, 'ls-width', v => { this._state.styleConfig.lineWidth  = Number(v)||2; upd(); });
    const barwI = body.querySelector('#ls-barw'), barwV = body.querySelector('#ls-barw-val');
    if (barwI) barwI.addEventListener('input', () => {
      this._state.styleConfig.barWidth = Number(barwI.value);
      if (barwV) barwV.textContent = Number(barwI.value).toFixed(2);
      upd();
    });

    this._selBind(body, 'pt-shape',  v => { this._state.styleConfig.pointShape  = v;            upd(); });
    this._inpBind(body, 'pt-size',   v => { this._state.styleConfig.pointSize   = Number(v)||7; upd(); });
    this._inpBind(body, 'pt-border', v => { this._state.styleConfig.pointBorder = Number(v)||1.8;upd(); });

    body.querySelectorAll('.fep-color-inp').forEach(inp => {
      inp.addEventListener('input', () => {
        const sb = inp.dataset.sb;
        this._ensureBranchStyle(sb); this._state.styleConfig.branchStyles[sb].color = inp.value; upd();
      });
    });
    body.querySelectorAll('[id^="bcl-"]').forEach(sel => {
      sel.addEventListener('change', () => {
        const sb = sel.dataset.sb;
        this._ensureBranchStyle(sb); this._state.styleConfig.branchStyles[sb].lineType = sel.value||null; upd();
      });
    });
    body.querySelectorAll('[id^="bcs-"]').forEach(sel => {
      sel.addEventListener('change', () => {
        const sb = sel.dataset.sb;
        this._ensureBranchStyle(sb); this._state.styleConfig.branchStyles[sb].pointShape = sel.value||null; upd();
      });
    });

    this._ckBind(body, 'leg-show', v => { this._state.styleConfig.showLegend = v; upd(); });
    this._ckBind(body, 'sc-grid',  v => { this._state.styleConfig.gridLines  = v; upd(); });
    body.querySelectorAll('[id^="ll-"]').forEach(inp => {
      inp.addEventListener('input', () => {
        this._state.styleConfig.legendLabels[inp.dataset.sb] = inp.value; upd();
      });
    });

    // Typography bindings
    const fc = this._state.styleConfig.fontConfig;
    if (fc) {
      const bindTypo = (id, targetObj, key, isNum = false) => {
        const el = body.querySelector(`#${id}`);
        if (el) {
          el.addEventListener(isNum ? 'input' : 'change', () => {
            targetObj[key] = isNum ? Number(el.value) : el.value;
            upd();
          });
        }
      };

      bindTypo('typo-ax-fam', fc.axisLabel, 'family');
      bindTypo('typo-ax-sz',  fc.axisLabel, 'size', true);
      bindTypo('typo-ax-wt',  fc.axisLabel, 'weight');
      const axColorInp = body.querySelector('#typo-ax-cl');
      if (axColorInp) {
        axColorInp.addEventListener('input', () => {
          fc.axisLabel.color = axColorInp.value;
          upd();
        });
      }
      const axColorReset = body.querySelector('#typo-ax-cl-reset');
      if (axColorReset) {
        axColorReset.addEventListener('click', () => {
          fc.axisLabel.color = null;
          if (axColorInp) axColorInp.value = '#c8d6e5';
          upd();
        });
      }

      bindTypo('typo-tk-fam', fc.tickNumber, 'family');
      bindTypo('typo-tk-sz',  fc.tickNumber, 'size', true);
      bindTypo('typo-tk-wt',  fc.tickNumber, 'weight');
      const tkColorInp = body.querySelector('#typo-tk-cl');
      if (tkColorInp) {
        tkColorInp.addEventListener('input', () => {
          fc.tickNumber.color = tkColorInp.value;
          upd();
        });
      }
      const tkColorReset = body.querySelector('#typo-tk-cl-reset');
      if (tkColorReset) {
        tkColorReset.addEventListener('click', () => {
          fc.tickNumber.color = null;
          if (tkColorInp) tkColorInp.value = '#c8d6e5';
          upd();
        });
      }

      bindTypo('typo-lg-fam', fc.legend, 'family');
      bindTypo('typo-lg-sz',  fc.legend, 'size', true);
      bindTypo('typo-lg-wt',  fc.legend, 'weight');
      const lgColorInp = body.querySelector('#typo-lg-cl');
      if (lgColorInp) {
        lgColorInp.addEventListener('input', () => {
          fc.legend.color = lgColorInp.value;
          upd();
        });
      }
      const lgColorReset = body.querySelector('#typo-lg-cl-reset');
      if (lgColorReset) {
        lgColorReset.addEventListener('click', () => {
          fc.legend.color = null;
          if (lgColorInp) lgColorInp.value = '#c8d6e5';
          upd();
        });
      }

      const lgPosSel = body.querySelector('#typo-lg-pos');
      if (lgPosSel) {
        lgPosSel.addEventListener('change', () => {
          fc.legendPos = lgPosSel.value;
          if (fc.legendPos !== 'custom') {
            fc.legendX = null;
            fc.legendY = null;
          }
          upd();
        });
      }
    }

    // Style Template button trigger
    const tplBtn = body.querySelector('#fep-apply-template-btn');
    if (tplBtn) {
      tplBtn.addEventListener('click', () => {
        this._buildTemplateModal();
      });
    }
  }

  _ensureBranchStyle(sb) {
    if (!this._state.styleConfig.branchStyles[sb]) this._state.styleConfig.branchStyles[sb] = {};
  }
  _ckBind  (b, id, fn) { const el = b.querySelector(`#${id}`); if (el) el.addEventListener('change', () => fn(el.checked)); }
  _selBind (b, id, fn) { const el = b.querySelector(`#${id}`); if (el) el.addEventListener('change', () => fn(el.value)); }
  _inpBind (b, id, fn) { const el = b.querySelector(`#${id}`); if (el) el.addEventListener('input',  () => fn(el.value)); }

  // ═══════════════════════════════════════════════════════════════════════════
  //  EXPORT TAB
  // ═══════════════════════════════════════════════════════════════════════════
  _buildExportTab(body) {
    const ec = this._state.exportConfig;
    body.innerHTML = `
      <div class="fep-section">
        <div class="fep-sh"><span class="fep-si">⚙</span><span class="fep-st">Resolution</span></div>
        <div class="fep-row">
          <span class="fep-lbl">DPI</span>
          <select class="fep-sel" id="exp-dpi">
            <option value="72"   ${ec.dpi===72  ?'selected':''}>72</option>
            <option value="150"  ${ec.dpi===150 ?'selected':''}>150</option>
            <option value="300"  ${ec.dpi===300 ?'selected':''}>300</option>
            <option value="600"  ${ec.dpi===600 ?'selected':''}>600</option>
            <option value="custom">Custom…</option>
          </select>
          <input class="fep-inp fep-inp-sm" id="exp-dpi-custom" type="number" min="30" max="1200"
            value="${ec.dpi}" style="${[72,150,300,600].includes(ec.dpi)?'display:none':''}">
        </div>
        <div class="fep-row">
          <span class="fep-lbl">Units</span>
          <select class="fep-sel" id="exp-unit">
            <option value="inch" ${ec.unitMode==='inch'?'selected':''}>Inches</option>
            <option value="px"   ${ec.unitMode==='px'  ?'selected':''}>Pixels</option>
          </select>
        </div>
        <div id="exp-inch-row" class="fep-row" style="${ec.unitMode==='px'?'display:none':''}">
          <span class="fep-lbl">W (in)</span>
          <input class="fep-inp fep-inp-sm" type="number" id="exp-w-in" value="${ec.widthIn}"  step="0.5" min="1">
          <span class="fep-lbl">H (in)</span>
          <input class="fep-inp fep-inp-sm" type="number" id="exp-h-in" value="${ec.heightIn}" step="0.5" min="1">
        </div>
        <div id="exp-px-row" class="fep-row" style="${ec.unitMode==='inch'?'display:none':''}">
          <span class="fep-lbl">W (px)</span>
          <input class="fep-inp fep-inp-sm" type="number" id="exp-w-px" value="${ec.widthPx}" min="100">
          <span class="fep-lbl">H (px)</span>
          <input class="fep-inp fep-inp-sm" type="number" id="exp-h-px" value="${ec.heightPx}" min="100">
        </div>
        <div class="fep-px-preview" id="exp-size-info"></div>
      </div>

      <div class="fep-section">
        <div class="fep-sh"><span class="fep-si">◈</span><span class="fep-st">Mode</span></div>
        <label class="fep-ck-row"><input type="radio" name="exp-mode" value="combined" ${ec.mode==='combined'?'checked':''}> Combined</label>
        <label class="fep-ck-row"><input type="radio" name="exp-mode" value="each"     ${ec.mode==='each'    ?'checked':''}> Each branch</label>
        <label class="fep-ck-row"><input type="radio" name="exp-mode" value="both"     ${ec.mode==='both'    ?'checked':''}> Both (ZIP)</label>
      </div>

      <div class="fep-section">
        <div class="fep-sh"><span class="fep-si">⬡</span><span class="fep-st">Background</span></div>
        <label class="fep-ck-row"><input type="radio" name="exp-bg" value="white"       ${ec.background==='white'      ?'checked':''}> White</label>
        <label class="fep-ck-row"><input type="radio" name="exp-bg" value="transparent" ${ec.background==='transparent'?'checked':''}> Transparent</label>
        <label class="fep-ck-row"><input type="radio" name="exp-bg" value="dark"        ${ec.background==='dark'       ?'checked':''}> Dark</label>
        <div class="fep-row" style="margin-top:8px">
          <span class="fep-lbl">Prefix</span>
          <input class="fep-inp" id="exp-prefix" placeholder="e.g. ORR_" value="${ec.prefix}">
        </div>
      </div>

      <div class="fep-section">
        <div class="fep-sh"><span class="fep-si">↓</span><span class="fep-st">Export</span></div>
        <button class="fep-btn fep-btn-p fep-btn-full" id="exp-single-btn">Export Current View (PNG)</button>
        <button class="fep-btn fep-btn-z fep-btn-full" id="exp-bulk-btn">Bulk Export (Branches ZIP)</button>
        ${this._plotTabs.length > 1 ? `
        <div class="fep-exp-divider"></div>
        <button class="fep-btn fep-btn-all fep-btn-full" id="exp-all-btn">
          ⬇ Export All ${this._plotTabs.length} Plots (ZIP)
        </button>` : ''}
        <div class="fep-progress" id="exp-progress" style="display:none">
          <div class="fep-progress-bar" id="exp-progress-fill"></div>
          <div class="fep-progress-msg" id="exp-progress-msg"></div>
        </div>
      </div>
    `;
    this._bindExportEvents(body);
    this._updateSizeInfo(body);
  }

  _bindExportEvents(body) {
    const ec  = this._state.exportConfig;
    const upd = () => this._updateSizeInfo(body);
    const dpiSel = body.querySelector('#exp-dpi'), dpiCus = body.querySelector('#exp-dpi-custom');
    dpiSel.addEventListener('change', () => {
      if (dpiSel.value === 'custom') dpiCus.style.display = '';
      else { dpiCus.style.display = 'none'; ec.dpi = Number(dpiSel.value); } upd();
    });
    dpiCus.addEventListener('input', () => { ec.dpi = Number(dpiCus.value)||300; upd(); });
    const unitSel = body.querySelector('#exp-unit');
    unitSel.addEventListener('change', () => {
      ec.unitMode = unitSel.value;
      body.querySelector('#exp-inch-row').style.display = ec.unitMode === 'px' ? 'none' : '';
      body.querySelector('#exp-px-row').style.display   = ec.unitMode === 'inch' ? 'none' : '';
      upd();
    });
    [['exp-w-in','widthIn'],['exp-h-in','heightIn'],['exp-w-px','widthPx'],['exp-h-px','heightPx']].forEach(([id,k]) => {
      const el = body.querySelector(`#${id}`);
      if (el) el.addEventListener('input', () => { ec[k] = Number(el.value)||0; upd(); });
    });
    body.querySelectorAll('[name="exp-mode"]').forEach(r => r.addEventListener('change', () => { if (r.checked) ec.mode = r.value; }));
    body.querySelectorAll('[name="exp-bg"]'  ).forEach(r => r.addEventListener('change', () => { if (r.checked) ec.background = r.value; }));
    body.querySelector('#exp-prefix').addEventListener('input', e => { ec.prefix = e.target.value; });

    body.querySelector('#exp-single-btn').addEventListener('click', async () => {
      if (!this._engine) return;
      const { w, h } = computePixelDims(ec);
      this._engine.setAnnotations(this._state.annotations);
      const blob = await canvasToBlob(this._engine.renderToOffscreen(w, h, ec.background === 'dark'));
      downloadBlob(blob, `${ec.prefix||''}free_energy.png`);
    });
    body.querySelector('#exp-bulk-btn').addEventListener('click', async () => {
      if (!this._engine || !this._state.rows.length) { alert('No data'); return; }
      const prog = body.querySelector('#exp-progress');
      const fill = body.querySelector('#exp-progress-fill');
      const msg  = body.querySelector('#exp-progress-msg');
      if (prog) prog.style.display = '';
      await bulkExport(this._engine, this._state.rows, ec, (m, d, t) => {
        if (msg)  msg.textContent = m;
        if (fill) fill.style.width = t ? `${(d/t)*100}%` : '100%';
      });
      setTimeout(() => { if (prog) prog.style.display = 'none'; }, 2500);
    });
    const allBtn = body.querySelector('#exp-all-btn');
    if (allBtn) {
      allBtn.addEventListener('click', () => this._exportAllTabsZip(body));
    }
  }

  _updateSizeInfo(body) {
    const ec  = this._state.exportConfig;
    const inf = body.querySelector('#exp-size-info');
    if (!inf) return;
    const { w, h } = computePixelDims(ec);
    inf.textContent = `Output: ${w} × ${h} px  (${ec.dpi} DPI)`;
  }

  // ─── Export ALL file-tabs as a single ZIP ─────────────────────────────────────────
  async _exportAllTabsZip(body) {
    if (!this._plotTabs.length) return;
    const prog = body.querySelector('#exp-progress');
    const fill = body.querySelector('#exp-progress-fill');
    const msg  = body.querySelector('#exp-progress-msg');
    const setProgress = (text, done, total) => {
      if (msg)  msg.textContent = text;
      if (fill) fill.style.width = total ? `${(done / total) * 100}%` : '100%';
    };
    if (prog) prog.style.display = '';

    // Use the current tab's export resolution/background settings as the global config
    const ec = this._state.exportConfig;
    const { w, h } = computePixelDims(ec);
    const darkMode  = ec.background === 'dark';
    const prefix    = ec.prefix || '';

    const files  = [];
    const total  = this._plotTabs.length;

    // Create a hidden offscreen canvas used only for rendering each tab
    const offCanvas = document.createElement('canvas');

    for (let i = 0; i < total; i++) {
      const tab = this._plotTabs[i];
      setProgress(`Rendering “${tab.name}” — plot ${i + 1} of ${total}…`, i, total);
      await new Promise(r => setTimeout(r, 0)); // yield to keep UI responsive

      // Build a temporary PlotEngine for this tab's state
      const tmpEngine = new PlotEngine(offCanvas);
      const { rows, styleConfig, axisConfig } = tab.state;
      const ghosts = (styleConfig.continuity && rows.length)
        ? computeGhosts(rows, styleConfig.mainBranch)
        : [];
      tmpEngine.setData(rows);
      tmpEngine.setStyle(styleConfig);
      tmpEngine.setAxis(axisConfig);
      tmpEngine.setGhosts(ghosts);
      tmpEngine.setAnnotations(tab.state.annotations);

      const renderedCanvas = tmpEngine.renderToOffscreen(w, h, darkMode);
      const blob = await canvasToBlob(renderedCanvas);
      files.push({ name: `${prefix}${tab.name}.png`, blob });
    }

    setProgress('Bundling ZIP…', total, total);
    const zipName = `${prefix}free_energy_all_plots.zip`;
    await downloadZIP(files, zipName);
    setProgress(`Done! — ${total} plots saved to ${zipName}`, total, total);
    setTimeout(() => { if (prog) prog.style.display = 'none'; }, 3000);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  CANVAS + ENGINE + INTERACTION
  // ═══════════════════════════════════════════════════════════════════════════
  _initCanvas() {
    const canvas = this.container.querySelector('#fep-canvas');
    if (!canvas) return;
    this._engine = new PlotEngine(canvas);

    const area = this.container.querySelector('#fep-plot-area');
    this._ro = new ResizeObserver(() => this._refreshPlot());
    this._ro.observe(area);

    this._interact = new InteractionLayer(canvas, this._engine, {
      onBranchClick:       (sb, ox, oy)            => this._showPalette('branch', sb, null, ox, oy),
      onElementClick:      (type, key, sb, ox, oy) => this._showPalette(type, sb, key, ox, oy),
      onConnectionReRoute: (info)                  => this._onConnectionReRoute(info),
      onConnectionDelete:  (info)                  => this._onConnectionDelete(info),
      onConnectionAdd:     (info)                  => this._onConnectionAdd(info),
      onEmptyDblClick:     (xFrac, yFrac)          => this._addAnnotation(xFrac, yFrac),
      onLegendMoved:       ()                      => {
        const sel = this.container.querySelector('#typo-lg-pos');
        if (sel) sel.value = 'custom';
      }
    });

    const resetBtn = this.container.querySelector('#fep-reset-elem-btn');
    if (resetBtn) resetBtn.addEventListener('click', () => {
      this._state.styleConfig.elementStyles =
        { points: {}, segments: {}, pointSizes: {}, barWidths: {}, segmentWidths: {}, segmentTypes: {} };
      this._state.styleConfig.connections = null;   // also reset re-routed connections
      this._refreshPlot();
    });

    this._refreshPlot();
  }

  // ─── Palette popup ────────────────────────────────────────────────────────
  /**
   * @param {'branch'|'point'|'segment'} mode
   * @param {string}      subBranch
   * @param {string|null} elementKey  null for branch; 'sb|branch' (2-part) or 6-part segKey
   * @param {number}      ox   CSS px in plot area
   * @param {number}      oy
   */
  _showPalette(mode, subBranch, elementKey, ox, oy) {
    const sc    = this._state.styleConfig;
    const popup = this.container.querySelector('#fep-palette-popup');
    if (!popup) return;

    const isElement = mode !== 'branch';
    const isPoint   = mode === 'point';
    const isSeg     = mode === 'segment';
    const sbs       = getSubBranches(this._state.rows);
    const es        = sc.elementStyles || {};
    if (!es.segmentTypes) es.segmentTypes = {};

    // ── Resolve current colour ─────────────────────────────────────────────
    const palIdx  = sbs.indexOf(subBranch) % PALETTE.length;
    const brColor = sc.branchStyles?.[subBranch]?.color || PALETTE[palIdx >= 0 ? palIdx : 0] || '#4f87ff';
    let currentColor = brColor;
    if (isElement && elementKey) {
      const isPointKey = elementKey.split('|').length === 2;
      currentColor = (isPointKey ? es.points?.[elementKey] : es.segments?.[elementKey]) || brColor;
    }

    // ── Resolve current width ──────────────────────────────────────────────
    const brLW      = sc.branchStyles?.[subBranch]?.lineWidth ?? sc.lineWidth ?? 2;
    const brPS      = sc.branchStyles?.[subBranch]?.pointSize ?? sc.pointSize ?? 7;
    let   currentW  = brLW;
    let   currentPS = brPS;
    if (isElement && elementKey) {
      const isPointKey = elementKey.split('|').length === 2;
      if (isPointKey) {
        currentW  = es.barWidths?.[elementKey]  ?? brLW * 1.4;
        currentPS = es.pointSizes?.[elementKey] ?? brPS;
      } else {
        currentW  = es.segmentWidths?.[elementKey] ?? brLW * 0.8;
      }
    }

    // ── Resolve current segment line type ─────────────────────────────────
    const brLT      = sc.branchStyles?.[subBranch]?.lineType || sc.lineType || 'dashed';
    const currentST = (isSeg && elementKey) ? (es.segmentTypes?.[elementKey] || brLT) : brLT;

    // ── Title ───────────────────────────────────────────────────────────────
    const parts = elementKey?.split('|') ?? [];
    let title;
    if (!isElement) {
      title = `Branch · ${subBranch}`;
    } else if (isPoint) {
      title = `Point · ${parts[0]} step ${parts[1]}`;
    } else {
      // 6-part segKey: fromSb|from|fromEdge|toSb|to|toEdge
      const [fSb, fBr, fEdge, tSb, tBr, tEdge] = parts;
      title = fSb === tSb
        ? `${fSb} [${fBr}·${fEdge} → ${tBr}·${tEdge}]`
        : `${fSb}[${fBr}·${fEdge}] → ${tSb}[${tBr}·${tEdge}]`;
    }

    // ── Width controls (context-sensitive) ────────────────────────────────
    const lineTypeSelect = (id, val) => `
      <select class="fep-sel fep-sel-xs" id="${id}" style="font-size:0.62rem">
        <option value="dashed"  ${val==='dashed' ?'selected':''}>Dashed</option>
        <option value="solid"   ${val==='solid'  ?'selected':''}>Solid</option>
        <option value="dotted"  ${val==='dotted' ?'selected':''}>Dotted</option>
      </select>`;
    const widthControls = !isElement
      ? `<!-- branch: line-type + line-width + point-size -->
         <div class="fep-pal-width-row">
           <label class="fep-pal-clbl">Style</label>
           ${lineTypeSelect('fep-pal-lt', brLT)}
         </div>
         <div class="fep-pal-width-row">
           <label class="fep-pal-clbl">Line W</label>
           <input type="range" id="fep-pal-lw" min="0.5" max="8" step="0.25" value="${brLW.toFixed(2)}">
           <span class="fep-pal-wval" id="fep-pal-lw-val">${brLW.toFixed(1)}</span>
         </div>
         <div class="fep-pal-width-row">
           <label class="fep-pal-clbl">Pt size</label>
           <input type="range" id="fep-pal-ps" min="2" max="20" step="0.5" value="${brPS.toFixed(1)}">
           <span class="fep-pal-wval" id="fep-pal-ps-val">${brPS.toFixed(1)}</span>
         </div>`
      : isPoint
        ? `<!-- point: bar-width + marker-size -->
           <div class="fep-pal-width-row">
             <label class="fep-pal-clbl">Bar W</label>
             <input type="range" id="fep-pal-lw" min="0.5" max="10" step="0.25" value="${currentW.toFixed(2)}">
             <span class="fep-pal-wval" id="fep-pal-lw-val">${currentW.toFixed(1)}</span>
           </div>
           <div class="fep-pal-width-row">
             <label class="fep-pal-clbl">Mrkr sz</label>
             <input type="range" id="fep-pal-ps" min="2" max="20" step="0.5" value="${currentPS.toFixed(1)}">
             <span class="fep-pal-wval" id="fep-pal-ps-val">${currentPS.toFixed(1)}</span>
           </div>`
        : `<!-- segment: line-type + connector width -->
           <div class="fep-pal-width-row">
             <label class="fep-pal-clbl">Style</label>
             ${lineTypeSelect('fep-pal-lt', currentST)}
           </div>
           <div class="fep-pal-width-row">
             <label class="fep-pal-clbl">Line W</label>
             <input type="range" id="fep-pal-lw" min="0.5" max="8" step="0.25" value="${currentW.toFixed(2)}">
             <span class="fep-pal-wval" id="fep-pal-lw-val">${currentW.toFixed(1)}</span>
           </div>`;

    popup.innerHTML = `
      <div class="fep-pal-header">
        <span class="fep-pal-title">${title}</span>
        <button class="fep-pal-close">✕</button>
      </div>
      <div class="fep-pal-swatches">
        ${PALETTE.map(col =>
          `<button class="fep-pal-swatch ${col === currentColor ? 'active' : ''}"
            style="background:${col}" data-color="${col}" title="${col}"></button>`
        ).join('')}
      </div>
      <div class="fep-pal-custom">
        <label class="fep-pal-clbl">Custom</label>
        <input type="color" id="fep-pal-inp" value="${currentColor}">
      </div>
      <div class="fep-pal-widths">
        ${widthControls}
      </div>
      ${isElement ? `<button class="fep-pal-reset">↺ Reset to branch</button>` : ''}
      ${isSeg && elementKey ? `<button class="fep-pal-delete-conn" id="fep-pal-del-conn">🗑 Delete Connection</button>` : ''}
    `;

    // Position near click
    const plotArea = this.container.querySelector('#fep-plot-area');
    const popH     = isPoint || !isElement ? 310 : 270;
    popup.style.left    = Math.max(4, Math.min(ox + 12, plotArea.clientWidth  - 210)) + 'px';
    popup.style.top     = Math.max(4, Math.min(oy - 10, plotArea.clientHeight - popH)) + 'px';
    popup.style.display = '';

    // ── Wire events ────────────────────────────────────────────────────────
    const applyColor = color => this._applyStyle('color', color, mode, subBranch, elementKey);
    const applyLW    = v     => this._applyStyle('lw',    v,     mode, subBranch, elementKey);
    const applyPS    = v     => this._applyStyle('ps',    v,     mode, subBranch, elementKey);
    const applyLT    = v     => this._applyStyle('lt',    v,     mode, subBranch, elementKey);

    popup.querySelectorAll('.fep-pal-swatch').forEach(sw => {
      sw.addEventListener('click', e => {
        e.stopPropagation();
        popup.querySelectorAll('.fep-pal-swatch').forEach(s => s.classList.remove('active'));
        sw.classList.add('active');
        popup.querySelector('#fep-pal-inp').value = sw.dataset.color;
        applyColor(sw.dataset.color);
      });
    });
    popup.querySelector('#fep-pal-inp').addEventListener('input', e => {
      e.stopPropagation(); applyColor(e.target.value);
    });

    const lwSlider = popup.querySelector('#fep-pal-lw');
    if (lwSlider) {
      const lwVal = popup.querySelector('#fep-pal-lw-val');
      lwSlider.addEventListener('input', e => {
        e.stopPropagation();
        const v = Number(e.target.value);
        if (lwVal) lwVal.textContent = v.toFixed(1);
        applyLW(v);
      });
    }
    const psSlider = popup.querySelector('#fep-pal-ps');
    if (psSlider) {
      const psVal = popup.querySelector('#fep-pal-ps-val');
      psSlider.addEventListener('input', e => {
        e.stopPropagation();
        const v = Number(e.target.value);
        if (psVal) psVal.textContent = v.toFixed(1);
        applyPS(v);
      });
    }

    popup.querySelector('.fep-pal-reset')?.addEventListener('click', e => {
      e.stopPropagation();
      this._clearElementStyle(elementKey);
      this._hidePalette();
    });

    // Delete Connection button (segment mode only)
    popup.querySelector('#fep-pal-del-conn')?.addEventListener('click', e => {
      e.stopPropagation();
      this._hidePalette();
      if (elementKey) this._onConnectionDelete({ segKey: elementKey });
    });

    // Line type selector
    const ltSel = popup.querySelector('#fep-pal-lt');
    if (ltSel) {
      ltSel.addEventListener('change', e => { e.stopPropagation(); applyLT(ltSel.value); });
    }

    popup.querySelector('.fep-pal-close').addEventListener('click', e => {
      e.stopPropagation(); this._hidePalette();
    });
    popup.addEventListener('click', e => e.stopPropagation());

    const closeHandler = () => { this._hidePalette(); document.removeEventListener('click', closeHandler); };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
  }

  _hidePalette() {
    const popup = this.container.querySelector('#fep-palette-popup');
    if (popup) popup.style.display = 'none';
  }

  /**
   * Apply a style property to a branch or individual element.
   * @param {'color'|'lw'|'ps'} prop
   * @param {any}    value
   * @param {'branch'|'point'|'segment'} mode
   * @param {string} subBranch
   * @param {string|null} elementKey
   */
  _applyStyle(prop, value, mode, subBranch, elementKey) {
    const sc = this._state.styleConfig;
    // Ensure sub-dicts exist
    if (!sc.elementStyles) sc.elementStyles = {};
    ['points','segments','pointSizes','barWidths','segmentWidths','segmentTypes'].forEach(k => {
      if (!sc.elementStyles[k]) sc.elementStyles[k] = {};
    });

    if (mode === 'branch') {
      if (!sc.branchStyles[subBranch]) sc.branchStyles[subBranch] = {};
      if (prop === 'color') {
        sc.branchStyles[subBranch].color = value;
        // Sync colour input in Style tab if visible
        if (this._state.activeTab === 'style') {
          const inp = this.container.querySelector(`#bc-${subBranch}`);
          if (inp) inp.value = value;
        }
      } else if (prop === 'lw') {
        sc.branchStyles[subBranch].lineWidth = Number(value);
      } else if (prop === 'ps') {
        sc.branchStyles[subBranch].pointSize = Number(value);
      } else if (prop === 'lt') {
        sc.branchStyles[subBranch].lineType = value;
      }
    } else if (mode === 'point' && elementKey) {
      if (prop === 'color')  sc.elementStyles.points[elementKey]    = value;
      else if (prop === 'lw') sc.elementStyles.barWidths[elementKey] = Number(value);
      else if (prop === 'ps') sc.elementStyles.pointSizes[elementKey]= Number(value);
    } else if (mode === 'segment' && elementKey) {
      if (prop === 'color')   sc.elementStyles.segments[elementKey]      = value;
      else if (prop === 'lw') sc.elementStyles.segmentWidths[elementKey] = Number(value);
      else if (prop === 'lt') sc.elementStyles.segmentTypes[elementKey]  = value;
    }
    this._refreshPlot();
  }

  _clearElementStyle(elementKey) {
    if (!elementKey) return;
    const sc = this._state.styleConfig;
    const partCount = elementKey.split('|').length;
    if (partCount === 2) { // 'sb|branch' — point key
      delete sc.elementStyles?.points?.[elementKey];
      delete sc.elementStyles?.barWidths?.[elementKey];
      delete sc.elementStyles?.pointSizes?.[elementKey];
    } else { // 6-part segment key: 'fromSb|from|fromEdge|toSb|to|toEdge'
      delete sc.elementStyles?.segments?.[elementKey];
      delete sc.elementStyles?.segmentWidths?.[elementKey];
      delete sc.elementStyles?.segmentTypes?.[elementKey];
    }
    this._refreshPlot();
  }

  // ─── Connection re-routing ────────────────────────────────────────────────
  // segKey format: 'fromSb|from|fromEdge|toSb|to|toEdge'  (6 parts)
  _onConnectionReRoute({ segKey, side, newBranch, newSubBranch, newEdge }) {
    const sc = this._state.styleConfig;
    if (!sc.connections) sc.connections = this._engine.initConnectionsFromData();

    const parsed = parseSegKey(segKey);
    if (!parsed) return;
    const { fromSb, from: fromB, toSb, to: toB } = parsed;

    const idx = sc.connections.findIndex(c => {
      const n = normConn(c);
      return n.fromSb === fromSb && n.from === fromB && n.toSb === toSb && n.to === toB;
    });
    if (idx < 0) return;

    const conn = { ...normConn(sc.connections[idx]) };
    const fixedBranch = side === 'from' ? conn.to   : conn.from;
    const fixedSb     = side === 'from' ? conn.toSb : conn.fromSb;
    if (Number(newBranch) === fixedBranch && newSubBranch === fixedSb) return; // self-loop

    if (side === 'from') {
      conn.fromSb   = newSubBranch;
      conn.from     = Number(newBranch);
      conn.fromEdge = newEdge || 'right';
    } else {
      conn.toSb   = newSubBranch;
      conn.to     = Number(newBranch);
      conn.toEdge = newEdge || 'left';
    }

    // Migrate element styles to new key
    const newKey = connToKey(conn);
    const es = sc.elementStyles;
    if (es?.segments?.[segKey])      { es.segments[newKey]      = es.segments[segKey];      delete es.segments[segKey]; }
    if (es?.segmentWidths?.[segKey]) { es.segmentWidths[newKey] = es.segmentWidths[segKey]; delete es.segmentWidths[segKey]; }
    if (es?.segmentTypes?.[segKey])  { es.segmentTypes[newKey]  = es.segmentTypes[segKey];  delete es.segmentTypes[segKey]; }

    sc.connections[idx] = conn;
    this._refreshPlot();
  }

  // ─── Delete a connector (right-click / Delete key / popup button) ────────
  _onConnectionDelete({ segKey }) {
    const sc = this._state.styleConfig;
    if (!sc.connections) sc.connections = this._engine.initConnectionsFromData();

    const parsed = parseSegKey(segKey);
    if (!parsed) return;
    const { fromSb, from: fromB, toSb, to: toB } = parsed;

    sc.connections = sc.connections.filter(c => {
      const n = normConn(c);
      return !(n.fromSb === fromSb && n.from === fromB && n.toSb === toSb && n.to === toB);
    });
    const es = sc.elementStyles;
    delete es?.segments?.[segKey];
    delete es?.segmentWidths?.[segKey];
    delete es?.segmentTypes?.[segKey];
    // Clear selection if it was the deleted segment
    if (this._engine?.getSelectedSegKey() === segKey) {
      this._engine.setSelectedSegKey(null);
    }
    this._refreshPlot();
  }

  // ─── Add a new connector (socket-drag) ───────────────────────────────────
  _onConnectionAdd({ fromSb, from, fromEdge, toSb, to, toEdge }) {
    const sc = this._state.styleConfig;
    if (!sc.connections) sc.connections = this._engine.initConnectionsFromData();

    const newConn = normConn({ fromSb, from: Number(from), fromEdge: fromEdge || 'right', toSb, to: Number(to), toEdge: toEdge || 'left' });
    const newKey  = connToKey(newConn);
    // Prevent exact duplicate keys
    if (sc.connections.some(c => connToKey(normConn(c)) === newKey)) return;

    sc.connections.push(newConn);
    this._refreshPlot();
  }

  // ─── Refresh plot ─────────────────────────────────────────────────────────
  _refreshPlot() {
    if (!this._engine) return;
    const sc   = this._state.styleConfig;
    const rows = this._state.rows;
    const ghosts = (sc.continuity && rows.length)
      ? computeGhosts(rows, sc.mainBranch)
      : [];
    this._engine.setData(rows);
    this._engine.setStyle(sc);
    this._engine.setAxis(this._state.axisConfig);
    this._engine.setGhosts(ghosts);
    this._engine.setAnnotations(this._state.annotations);
    const isDark = document.documentElement.classList.contains('light-mode') === false;
    this._engine.render(isDark);

    const hint = this.container.querySelector('#fep-plot-hint');
    if (hint) hint.style.display = rows.length ? 'none' : '';

    this._renderAnnotations();
  }

  // ─── Splitter ─────────────────────────────────────────────────────────────
  _setupSplitter() {
    const splitter = this.container.querySelector('#fep-splitter');
    const layout   = this.container.querySelector('#fep-layout');
    let drag = null;
    const onMove = e => {
      if (!drag) return;
      const newW = Math.max(260, Math.min(520, e.clientX - layout.getBoundingClientRect().left));
      drag.sidebar.style.width = newW + 'px';
      if (this._engine) {
        const isDark = document.documentElement.classList.contains('light-mode') === false;
        this._engine.render(isDark);
      }
    };
    const onUp = () => {
      drag = null;
      document.body.style.cursor = document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    splitter.addEventListener('mousedown', e => {
      e.preventDefault();
      drag = { sidebar: this.container.querySelector('#fep-sidebar') };
      document.body.style.cursor     = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  }

  // ─── Template Style Application ───────────────────────────────────────────
  _buildTemplateModal() {
    // Remove existing if any
    const existing = document.querySelector('.fep-modal-backdrop');
    if (existing) existing.remove();
    
    const backdrop = document.createElement('div');
    backdrop.className = 'fep-modal-backdrop';
    
    const currentTab = this._plotTabs[this._activeTabIdx];
    const otherTabs = this._plotTabs.filter((t, i) => i !== this._activeTabIdx);
    
    backdrop.innerHTML = `
      <div class="fep-modal-dialog">
        <div class="fep-modal-header">
          <span class="fep-modal-title">Apply Style Template</span>
          <button class="fep-modal-close-btn">✕</button>
        </div>
        <div class="fep-modal-body">
          <p class="fep-modal-subtitle">
            Copy the styling configurations of the current plot <strong>“${currentTab.name}”</strong> as a template to other plots.
          </p>
          
          <div class="fep-modal-section-title">1. Select Properties to Apply</div>
          <div class="fep-modal-checklist">
            <label class="fep-ck-row">
              <input type="checkbox" id="tmpl-cat-all" checked>
              <strong>All Styling Properties</strong>
            </label>
            <div style="margin-left: 20px; display: flex; flex-direction: column; gap: 6px;">
              <label class="fep-ck-row">
                <input type="checkbox" class="tmpl-cat-sub" value="axis" checked>
                Axis Styles & Scale (major ticks, ticks display, tick length/dir)
              </label>
              <label class="fep-ck-row">
                <input type="checkbox" class="tmpl-cat-sub" value="style" checked>
                Line & Point Styles (line width/type, bar width, shape/size/border)
              </label>
              <label class="fep-ck-row">
                <input type="checkbox" class="tmpl-cat-sub" value="color" checked>
                Branch &amp; Segment Colors (colors + per-connection colors by matching connection)
              </label>
              <label class="fep-ck-row">
                <input type="checkbox" class="tmpl-cat-sub" value="legend" checked>
                Legend (visibility, custom branch labels, position)
              </label>
              <label class="fep-ck-row">
                <input type="checkbox" class="tmpl-cat-sub" value="typography" checked>
                Typography (fonts, sizes, colors for axes and labels)
              </label>
              <label class="fep-ck-row">
                <input type="checkbox" class="tmpl-cat-sub" value="annotations" checked>
                Draggable Annotations — Copy all (text + position + style)
              </label>
              <label class="fep-ck-row" style="margin-left: 14px;">
                <input type="checkbox" class="tmpl-cat-sub" value="annStyle" checked>
                &nbsp;↳ Apply text style only (font, size, bold/italic, color) to existing annotations
              </label>
            </div>
          </div>
          
          <div class="fep-modal-section-title">2. Select Target Plots</div>
          <div class="fep-modal-checklist">
            <label class="fep-ck-row">
              <input type="checkbox" id="tmpl-target-all" checked>
              <strong>All Other Plots (${otherTabs.length})</strong>
            </label>
            <div style="margin-left: 20px; display: flex; flex-direction: column; gap: 6px;" id="tmpl-targets-list">
              ${this._plotTabs.map((t, idx) => {
                if (idx === this._activeTabIdx) return '';
                return `
                  <label class="fep-ck-row">
                    <input type="checkbox" class="tmpl-target-sub" value="${idx}" checked>
                    ${t.name}
                  </label>
                `;
              }).join('')}
            </div>
          </div>
        </div>
        <div class="fep-modal-footer">
          <button class="fep-btn fep-btn-s" id="tmpl-btn-cancel">Cancel</button>
          <button class="fep-btn fep-btn-p" id="tmpl-btn-apply">Apply Template</button>
        </div>
      </div>
    `;
    
    // Bind all elements/events inside the modal
    const closeBtn = backdrop.querySelector('.fep-modal-close-btn');
    const cancelBtn = backdrop.querySelector('#tmpl-btn-cancel');
    const applyBtn = backdrop.querySelector('#tmpl-btn-apply');
    const catAll = backdrop.querySelector('#tmpl-cat-all');
    const catSubs = backdrop.querySelectorAll('.tmpl-cat-sub');
    const targetAll = backdrop.querySelector('#tmpl-target-all');
    const targetSubs = backdrop.querySelectorAll('.tmpl-target-sub');
    
    const closeModal = () => backdrop.remove();
    
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) closeModal();
    });
    
    // Handle All category checkbox
    catAll.addEventListener('change', () => {
      catSubs.forEach(cb => cb.checked = catAll.checked);
    });
    catSubs.forEach(cb => {
      cb.addEventListener('change', () => {
        const allChecked = Array.from(catSubs).every(c => c.checked);
        catAll.checked = allChecked;
      });
    });
    
    // Handle All targets checkbox
    targetAll.addEventListener('change', () => {
      targetSubs.forEach(cb => cb.checked = targetAll.checked);
    });
    targetSubs.forEach(cb => {
      cb.addEventListener('change', () => {
        const allChecked = Array.from(targetSubs).every(c => c.checked);
        targetAll.checked = allChecked;
      });
    });
    
    applyBtn.addEventListener('click', () => {
      const selectedCats = Array.from(catSubs).filter(c => c.checked).map(c => c.value);
      const selectedTargets = Array.from(targetSubs).filter(c => c.checked).map(c => Number(c.value));
      
      if (!selectedCats.length) {
        alert('Please select at least one property category to apply.');
        return;
      }
      if (!selectedTargets.length) {
        alert('Please select at least one target plot.');
        return;
      }
      
      this._applyStyleTemplate(selectedCats, selectedTargets);
      closeModal();
    });
    
    document.body.appendChild(backdrop);
  }

  _applyStyleTemplate(categories, targetIndices) {
    const srcState = this._state;
    targetIndices.forEach(idx => {
      const destState = this._plotTabs[idx].state;
      
      if (categories.includes('axis')) {
        const newAxis = JSON.parse(JSON.stringify(srcState.axisConfig));
        for (const side of ['bottom', 'top', 'left', 'right']) {
          if (destState.axisConfig[side]) {
            newAxis[side].label = destState.axisConfig[side].label;
          }
        }
        destState.axisConfig = newAxis;
      }
      
      if (categories.includes('style')) {
        destState.styleConfig.lineType = srcState.styleConfig.lineType;
        destState.styleConfig.lineWidth = srcState.styleConfig.lineWidth;
        destState.styleConfig.barWidth = srcState.styleConfig.barWidth;
        destState.styleConfig.pointShape = srcState.styleConfig.pointShape;
        destState.styleConfig.pointSize = srcState.styleConfig.pointSize;
        destState.styleConfig.pointBorder = srcState.styleConfig.pointBorder;
        destState.styleConfig.continuity = srcState.styleConfig.continuity;
        destState.styleConfig.mainBranch = srcState.styleConfig.mainBranch;
      }
      
      if (categories.includes('color')) {
        // Copy branch-level styles for matching sub-branch labels
        for (const sb in srcState.styleConfig.branchStyles) {
          if (!destState.styleConfig.branchStyles[sb]) {
            destState.styleConfig.branchStyles[sb] = {};
          }
          const srcBs = srcState.styleConfig.branchStyles[sb];
          if (srcBs.color !== undefined)      destState.styleConfig.branchStyles[sb].color      = srcBs.color;
          if (srcBs.lineType !== undefined)   destState.styleConfig.branchStyles[sb].lineType   = srcBs.lineType;
          if (srcBs.pointShape !== undefined) destState.styleConfig.branchStyles[sb].pointShape = srcBs.pointShape;
        }
        // Copy per-segment element colors for matching connection keys
        const srcSeg = srcState.styleConfig.elementStyles?.segmentTypes || {};
        if (!destState.styleConfig.elementStyles) destState.styleConfig.elementStyles = {};
        if (!destState.styleConfig.elementStyles.segmentTypes) destState.styleConfig.elementStyles.segmentTypes = {};
        for (const key in srcSeg) {
          // key format: "fromSb|from|toSb|to" — only copy if same connection exists in dest
          destState.styleConfig.elementStyles.segmentTypes[key] = {
            ...destState.styleConfig.elementStyles.segmentTypes[key],
            ...srcSeg[key]
          };
        }
      }

      if (categories.includes('legend')) {
        // Copy legend visibility
        destState.styleConfig.showLegend = srcState.styleConfig.showLegend;
        // Copy custom legend labels only for branches that exist in the destination
        const destBranches = new Set((destState.rows || []).map(r => r.subBranch));
        if (!destState.styleConfig.legendLabels) destState.styleConfig.legendLabels = {};
        for (const sb in srcState.styleConfig.legendLabels) {
          if (!destBranches.size || destBranches.has(sb)) {
            destState.styleConfig.legendLabels[sb] = srcState.styleConfig.legendLabels[sb];
          }
        }
        // Copy legend font + position from fontConfig
        if (!destState.styleConfig.fontConfig) destState.styleConfig.fontConfig = {};
        const srcFc = srcState.styleConfig.fontConfig;
        if (srcFc.legend)    destState.styleConfig.fontConfig.legend    = JSON.parse(JSON.stringify(srcFc.legend));
        if (srcFc.legendPos) destState.styleConfig.fontConfig.legendPos = srcFc.legendPos;
        if (srcFc.legendX != null) destState.styleConfig.fontConfig.legendX = srcFc.legendX;
        if (srcFc.legendY != null) destState.styleConfig.fontConfig.legendY = srcFc.legendY;
      }

      if (categories.includes('typography')) {
        // Copy axis/label fonts but preserve legend fields (handled by 'legend' category above)
        const srcFc = srcState.styleConfig.fontConfig || {};
        const destFc = destState.styleConfig.fontConfig || {};
        destState.styleConfig.fontConfig = {
          ...destFc,
          // Keep these names aligned with the renderer and Typography controls.
          // The old tickNum/axisLbl keys were never read, so their sizes did not
          // propagate when a template was applied to other plots.
          tickNumber: srcFc.tickNumber
            ? JSON.parse(JSON.stringify(srcFc.tickNumber))
            : destFc.tickNumber,
          axisLabel: srcFc.axisLabel
            ? JSON.parse(JSON.stringify(srcFc.axisLabel))
            : destFc.axisLabel,
          // Only copy legend typography if 'legend' category is NOT selected (avoid double-apply)
          ...(categories.includes('legend') ? {} : {
            legend:    srcFc.legend    ? JSON.parse(JSON.stringify(srcFc.legend)) : destFc.legend,
            legendPos: srcFc.legendPos || destFc.legendPos,
            legendX:   srcFc.legendX  ?? destFc.legendX,
            legendY:   srcFc.legendY  ?? destFc.legendY,
          })
        };
      }

      if (categories.includes('annotations')) {
        destState.annotations = JSON.parse(JSON.stringify(srcState.annotations));
      } else if (categories.includes('annStyle')) {
        // Apply text style from source's first annotation to all existing annotations in dest
        const srcAnns = srcState.annotations || [];
        if (srcAnns.length > 0) {
          const refStyle = {
            fontFamily:  srcAnns[0].fontFamily  || 'Inter',
            fontSize:    srcAnns[0].fontSize    || 14,
            fontWeight:  srcAnns[0].fontWeight  || 'normal',
            fontStyle:   srcAnns[0].fontStyle   || 'normal',
            color:       srcAnns[0].color       || '#ff4d4f',
          };
          (destState.annotations || []).forEach(ann => {
            Object.assign(ann, refStyle);
          });
        }
      }
    });
    // Refresh current plot so style tab shows updated values immediately
    this._refreshPlot();
    // Visual feedback
    alert('Style template successfully applied to selected plots.');
  }

  // ─── Annotations overlay rendering ────────────────────────────────────────
  _renderAnnotations() {
    const layer = this.container.querySelector('#fep-annotation-layer');
    if (!layer) return;
    layer.innerHTML = '';
    
    const canvas = this.container.querySelector('#fep-canvas');
    if (!canvas || !this._engine || !this._engine._layout) return;
    const { margin, plotW, plotH, W, H } = this._engine._layout;
    
    const anns = this._state.annotations || [];
    anns.forEach(ann => {
      const div = document.createElement('div');
      div.className = 'fep-ann-box';
      div.dataset.annId = ann.id;
      
      const leftFrac = (margin.left + ann.x * plotW) / W;
      const topFrac = (margin.top + ann.y * plotH) / H;
      
      div.style.left = `${leftFrac * 100}%`;
      div.style.top = `${topFrac * 100}%`;
      
      div.innerHTML = `
        <div class="fep-ann-header" contenteditable="false">
          <span class="fep-ann-drag-handle" title="Drag to reposition">✦ Drag</span>
          <button class="fep-ann-btn-del" title="Delete annotation">✕</button>
        </div>
        <div class="fep-ann-text" contenteditable="true" style="
          font-family: ${ann.fontFamily || 'Inter'};
          font-size: ${ann.fontSize || 14}px;
          font-weight: ${ann.fontWeight || 'normal'};
          font-style: ${ann.fontStyle || 'normal'};
          color: ${ann.color || '#ff4d4f'};
        ">${ann.text}</div>
      `;
      
      const txt = div.querySelector('.fep-ann-text');
      const handle = div.querySelector('.fep-ann-drag-handle');
      let isDragging = false;
      let startX, startY;
      let startLeft, startTop;
      
      const onMouseDown = e => {
        e.preventDefault();
        e.stopPropagation();
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = div.getBoundingClientRect();
        const layerRect = layer.getBoundingClientRect();
        startLeft = rect.left - layerRect.left;
        startTop = rect.top - layerRect.top;
        div.classList.add('editing');
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      };
      
      const onMouseMove = e => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const layerRect = layer.getBoundingClientRect();
        
        const targetLeftPx = startLeft + dx;
        const targetTopPx = startTop + dy;
        
        const ax = (targetLeftPx / layerRect.width) * W;
        const ay = (targetTopPx / layerRect.height) * H;
        
        const xFrac = Math.max(0, Math.min(1, (ax - margin.left) / plotW));
        const yFrac = Math.max(0, Math.min(1, (ay - margin.top) / plotH));
        
        ann.x = xFrac;
        ann.y = yFrac;
        
        const currentLeftFrac = (margin.left + xFrac * plotW) / W;
        const currentTopFrac = (margin.top + yFrac * plotH) / H;
        
        div.style.left = `${currentLeftFrac * 100}%`;
        div.style.top = `${currentTopFrac * 100}%`;
      };
      
      const onMouseUp = () => {
        isDragging = false;
        div.classList.remove('editing');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        this._refreshPlot();
      };
      
      handle.addEventListener('mousedown', onMouseDown);
      
      txt.addEventListener('input', () => {
        ann.text = txt.innerText;
      });
      txt.addEventListener('blur', () => {
        ann.text = txt.innerText;
        div.classList.remove('editing');
        this._refreshPlot();
      });
      txt.addEventListener('focus', () => {
        div.classList.add('editing');
        this._showAnnotationFormatter(ann, div);
      });
      
      div.querySelector('.fep-ann-btn-del').addEventListener('mousedown', e => {
        e.preventDefault(); // prevent blur from rebuilding DOM before deletion
        e.stopPropagation();
        this._state.annotations = this._state.annotations.filter(a => a.id !== ann.id);
        this._refreshPlot();
      });
      
      layer.appendChild(div);
    });
  }

  _addAnnotation(xFrac, yFrac) {
    if (!this._state.annotations) this._state.annotations = [];
    const newAnn = {
      id: 'ann_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      text: 'Double click to edit',
      x: xFrac,
      y: yFrac,
      fontSize: 14,
      fontFamily: 'Inter',
      fontStyle: 'normal',
      fontWeight: 'normal',
      color: '#ff4d4f'
    };
    this._state.annotations.push(newAnn);
    this._refreshPlot();
    
    setTimeout(() => {
      const el = this.container.querySelector(`[data-ann-id="${newAnn.id}"] .fep-ann-text`);
      if (el) {
        el.focus();
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }, 50);
  }

  _showAnnotationFormatter(ann, div) {
    const hdr = div.querySelector('.fep-ann-header');
    if (!hdr) return;
    if (hdr.querySelector('.fep-ann-format-tools')) return;
    
    const tools = document.createElement('div');
    tools.className = 'fep-ann-format-tools';
    tools.style.display = 'inline-flex';
    tools.style.alignItems = 'center';
    tools.style.gap = '4px';
    tools.style.marginLeft = '6px';
    tools.style.borderLeft = '1px solid var(--border)';
    tools.style.paddingLeft = '6px';
    
    tools.innerHTML = `
      <select class="fep-sel fep-sel-xs ann-font" style="font-size: 0.6rem; padding: 2px 4px; height: 20px; line-height: 1;">
        <option value="Inter" ${ann.fontFamily==='Inter'?'selected':''}>Inter</option>
        <option value="Space Grotesk" ${ann.fontFamily==='Space Grotesk'?'selected':''}>Space Grotesk</option>
        <option value="JetBrains Mono" ${ann.fontFamily==='JetBrains Mono'?'selected':''}>Mono</option>
        <option value="system-ui" ${ann.fontFamily==='system-ui'?'selected':''}>System</option>
      </select>
      <input type="number" class="fep-inp ann-size" style="width: 38px; font-size: 0.6rem; padding: 2px; height: 20px; text-align: center" value="${ann.fontSize || 14}" min="8" max="48">
      <button class="fep-btn fep-btn-s ann-bold" style="padding: 2px 6px; font-size: 0.6rem; height: 20px; background: ${ann.fontWeight==='bold'?'var(--accent)':'rgba(255,255,255,0.06)'}; color: ${ann.fontWeight==='bold'?'#000':'#fff'}">B</button>
      <button class="fep-btn fep-btn-s ann-italic" style="padding: 2px 6px; font-size: 0.6rem; height: 20px; background: ${ann.fontStyle==='italic'?'var(--accent)':'rgba(255,255,255,0.06)'}; color: ${ann.fontStyle==='italic'?'#000':'#fff'}">I</button>
      <input type="color" class="ann-color" style="width: 20px; height: 20px; padding:0; border:none; background:transparent; cursor:pointer;" value="${ann.color || '#ff4d4f'}">
      <button class="fep-ann-btn-del ann-delete-toolbar" style="padding: 2px 6px; font-size: 0.6rem; height: 20px; margin-left: 4px; border-left: 1px solid var(--border); padding-left: 8px;" title="Delete this annotation">🗑</button>
    `;
    
    const txt = div.querySelector('.fep-ann-text');
    
    const fontSel = tools.querySelector('.ann-font');
    fontSel.addEventListener('change', () => {
      ann.fontFamily = fontSel.value;
      txt.style.fontFamily = ann.fontFamily;
      this._refreshPlot();
    });
    
    const sizeInp = tools.querySelector('.ann-size');
    sizeInp.addEventListener('input', () => {
      ann.fontSize = Number(sizeInp.value) || 14;
      txt.style.fontSize = ann.fontSize + 'px';
      this._refreshPlot();
    });
    
    const boldBtn = tools.querySelector('.ann-bold');
    boldBtn.addEventListener('click', e => {
      e.stopPropagation();
      ann.fontWeight = ann.fontWeight === 'bold' ? 'normal' : 'bold';
      txt.style.fontWeight = ann.fontWeight;
      boldBtn.style.background = ann.fontWeight === 'bold' ? 'var(--accent)' : 'rgba(255,255,255,0.06)';
      boldBtn.style.color = ann.fontWeight === 'bold' ? '#000' : '#fff';
      this._refreshPlot();
    });
    
    const italicBtn = tools.querySelector('.ann-italic');
    italicBtn.addEventListener('click', e => {
      e.stopPropagation();
      ann.fontStyle = ann.fontStyle === 'italic' ? 'normal' : 'italic';
      txt.style.fontStyle = ann.fontStyle;
      italicBtn.style.background = ann.fontStyle === 'italic' ? 'var(--accent)' : 'rgba(255,255,255,0.06)';
      italicBtn.style.color = ann.fontStyle === 'italic' ? '#000' : '#fff';
      this._refreshPlot();
    });
    
    const colorInp = tools.querySelector('.ann-color');
    colorInp.addEventListener('input', () => {
      ann.color = colorInp.value;
      txt.style.color = ann.color;
      this._refreshPlot();
    });

    const deleteBtn = tools.querySelector('.ann-delete-toolbar');
    deleteBtn.addEventListener('mousedown', e => {
      e.preventDefault(); // prevent blur from rebuilding DOM before deletion
      e.stopPropagation();
      this._state.annotations = this._state.annotations.filter(a => a.id !== ann.id);
      this._refreshPlot();
    });
    
    hdr.appendChild(tools);
  }

  destroy() {
    window.removeEventListener('theme-changed', this._onThemeChanged);
    if (this._ro)       { this._ro.disconnect(); this._ro = null; }
    if (this._interact) { this._interact.dispose(); this._interact = null; }
    this._engine = null;
  }
}
