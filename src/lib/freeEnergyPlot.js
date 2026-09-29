// ═══════════════════════════════════════════════════════════════════════════════
// Free Energy Plotter — Canvas Rendering Engine (v5)
// ═══════════════════════════════════════════════════════════════════════════════
import { groupRows, getUniqueBranches, getYRange, niceInterval, PALETTE } from './freeEnergyParser.js';

const MARGIN_BASE = { top: 48, right: 48, bottom: 68, left: 78 };

export function defaultStyleConfig() {
  return {
    barWidth: 0.35, lineType: 'dashed', lineWidth: 2.0,
    pointShape: 'circle', pointSize: 7, pointBorder: 1.8,
    showLegend: true, legendLabels: {}, branchStyles: {},
    gridLines: false, continuity: true, mainBranch: null,
    connections: null,   // null = auto; [{fromSb,from,fromEdge,toSb,to,toEdge},...] = explicit
    elementStyles: { points:{}, segments:{}, pointSizes:{}, barWidths:{}, segmentWidths:{}, segmentTypes:{} },
    fontConfig: {
      axisLabel:  { family: 'Space Grotesk', size: 13.5, weight: 'normal', color: null },
      tickNumber: { family: 'JetBrains Mono', size: 11.5, weight: 'normal', color: null },
      legend:     { family: 'JetBrains Mono', size: 10.5, weight: 'normal', color: null },
      legendPos:  'top-right',
      legendX:    null,
      legendY:    null,
    },
  };
}

export function defaultAxisConfig() {
  return {
    bottom: { show:true,  showTicks:true,  showMinorTicks:false, showLabels:true,  tickLen:6, minorTickLen:3, tickDir:'in', decimals:null, majInterval:null, minInterval:null, auto:true, min:null, max:null, label:'Reaction Coordinate' },
    top:    { show:false, showTicks:false, showMinorTicks:false, showLabels:false, tickLen:4, minorTickLen:2, tickDir:'in', decimals:null, majInterval:null, minInterval:null, auto:true, min:null, max:null, label:null },
    left:   { show:true,  showTicks:true,  showMinorTicks:true,  showLabels:true,  tickLen:6, minorTickLen:3, tickDir:'in', decimals:null, majInterval:null, minInterval:null, auto:true, min:null, max:null, label:'Free Energy (eV)' },
    right:  { show:false, showTicks:false, showMinorTicks:false, showLabels:false, tickLen:4, minorTickLen:2, tickDir:'in', decimals:null, majInterval:null, minInterval:null, auto:true, min:null, max:null, label:null },
  };
}

export function migrateAxisConfig(ac) {
  if (ac && ac.bottom) {
    // Forward migration: ensure new fields exist on already-migrated configs
    ['bottom','top','left','right'].forEach(s => {
      if (ac[s] && ac[s].decimals === undefined) ac[s].decimals = null;
    });
    return ac;
  }
  const def = defaultAxisConfig();
  if (!ac) return def;
  if (ac.x) {
    const s = ac.x.position === 'top' ? 'top' : 'bottom';
    Object.assign(def[s], { 
      show: ac.x.showAxis??true, showTicks: ac.x.showTicks??true, showLabels: ac.x.showLabels??true, 
      tickLen: ac.x.tickLen??6, tickDir: ac.x.tickDir??'in', label: ac.x.label??'Reaction Coordinate',
      auto: ac.x.auto??true, min: ac.x.min??null, max: ac.x.max??null, majInterval: ac.x.majInterval??null,
      decimals: null
    });
  }
  if (ac.y) {
    const s = ac.y.position === 'right' ? 'right' : 'left';
    Object.assign(def[s], { show: ac.y.showAxis??true, showTicks: ac.y.showTicks??true, showLabels: ac.y.showLabels??true, tickLen: ac.y.tickLen??6, tickDir: ac.y.tickDir??'in', auto: ac.y.auto??true, min: ac.y.min??null, max: ac.y.max??null, majInterval: ac.y.majInterval??null, label: ac.y.label??'Free Energy (eV)', decimals: null });
  }
  return def;
}

export function computeGhosts(rows, mainBranch) {
  const grouped = groupRows(rows);
  const sbs = [...grouped.keys()].sort();
  if (!sbs.length) return [];
  const main = mainBranch || sbs[0];
  const mainPts = grouped.get(main);
  if (!mainPts?.length) return [];
  const getBefore = b => mainPts.reduce((best, p) => p.branch < b && (!best || p.branch > best.branch) ? p : best, null);
  const getAfter  = b => mainPts.reduce((best, p) => p.branch > b && (!best || p.branch < best.branch) ? p : best, null);
  const ghosts = [];
  for (const [sb, pts] of grouped) {
    if (sb === main || !pts.length) continue;
    const first = pts[0], last = pts[pts.length - 1];
    const before = getBefore(first.branch);
    if (before) ghosts.push({ subBranch: sb, from: { branch: before.branch, energy: before.energy }, to: { branch: first.branch, energy: first.energy } });
    const mainLast = mainPts[mainPts.length - 1].branch;
    if (last.branch < mainLast) {
      const after = getAfter(last.branch);
      if (after) ghosts.push({ subBranch: sb, from: { branch: last.branch, energy: last.energy }, to: { branch: after.branch, energy: after.energy } });
    }
  }
  return ghosts;
}

// ── Normalize any connection to {fromSb,from,fromEdge,toSb,to,toEdge} ──────────
export function normConn(c) {
  const fromSb = c.fromSb ?? c.sb;
  const toSb   = c.toSb   ?? c.sb;
  const from   = Number(c.from);
  const to     = Number(c.to);
  // Auto-detect edges if missing
  let fromEdge = c.fromEdge;
  let toEdge   = c.toEdge;
  if (!fromEdge || !toEdge) {
    if (from < to) { fromEdge = fromEdge || 'right'; toEdge = toEdge || 'left'; }
    else           { fromEdge = fromEdge || 'left';  toEdge = toEdge || 'right'; }
  }
  return { fromSb, from, fromEdge, toSb, to, toEdge };
}

// ── Build a canonical segment key from a normalized connection ───────────────
export function connToKey(c) {
  const n = normConn(c);
  return `${n.fromSb}|${n.from}|${n.fromEdge}|${n.toSb}|${n.to}|${n.toEdge}`;
}

// ── Legacy 4-part key → normalized object ────────────────────────────────────
export function parseSegKey(sk) {
  const parts = sk.split('|');
  if (parts.length === 6) {
    const [fromSb, from, fromEdge, toSb, to, toEdge] = parts;
    return { fromSb, from: Number(from), fromEdge, toSb, to: Number(to), toEdge };
  }
  // Legacy 4-part support
  if (parts.length === 4) {
    const [fromSb, from, toSb, to] = parts;
    return normConn({ fromSb, from: Number(from), toSb, to: Number(to) });
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
export class PlotEngine {
  constructor(canvas) {
    this.canvas          = canvas;
    this.ctx             = canvas.getContext('2d');
    this.rows            = [];
    this.styleConfig     = defaultStyleConfig();
    this.axisConfig      = defaultAxisConfig();
    this._hitTargets     = [];   // [{cx,cy,subBranch,branch,energy,ptKey,leftCx,leftCy,rightCx,rightCy}]
    this._segTargets     = [];   // connector hit data
    this._socketTargets  = [];   // [{cx,cy,subBranch,branch,edge}]  — stick end sockets
    this._ghosts         = [];
    this._layout         = null;
    this._epDrag         = null;
    this._newConnDrag    = null;
    this._hoverSocket    = null;   // { subBranch, branch, edge, cx, cy }
    this._selectedSegKey = null;   // segKey of the currently selected connector
    this._annotations    = [];
  }

  setData(rows)          { this.rows         = rows; }
  setStyle(cfg)          { this.styleConfig  = cfg; }
  setAxis(cfg)           { this.axisConfig   = migrateAxisConfig(cfg); }
  setGhosts(g)           { this._ghosts      = g || []; }
  setEndpointDrag(s)     { this._epDrag      = s; }
  setNewConnDrag(s)      { this._newConnDrag = s; }
  setHoverSocket(s)      { this._hoverSocket = s; }
  setSelectedSegKey(sk)  { this._selectedSegKey = sk; }
  getSelectedSegKey()    { return this._selectedSegKey; }
  setAnnotations(ann)    { this._annotations = ann || []; }

  initConnectionsFromData() {
    if (!this.rows || !this.rows.length) return [];
    
    // Get unique sorted branches
    const uniq = getUniqueBranches(this.rows);
    const conns = [];
    
    for (let idx = 0; idx < uniq.length - 1; idx++) {
      const b1 = uniq[idx];
      const b2 = uniq[idx + 1];
      
      // Find all points at branch b1
      const pts1 = this.rows.filter(r => r.branch === b1);
      // Find all points at branch b2
      const pts2 = this.rows.filter(r => r.branch === b2);
      
      if (!pts1.length || !pts2.length) continue;
      
      if (pts1.length === 1) {
        // Rule 1: Single source branches out to all targets
        const fromPt = pts1[0];
        pts2.forEach(toPt => {
          conns.push({
            fromSb: fromPt.subBranch,
            from: fromPt.branch,
            fromEdge: 'right',
            toSb: toPt.subBranch,
            to: toPt.branch,
            toEdge: 'left'
          });
        });
      } else if (pts2.length === 1) {
        // Rule 2: Single target receives connection from matching sub-branch,
        // or from all sources if no match exists.
        const toPt = pts2[0];
        const matchingFrom = pts1.find(p => p.subBranch === toPt.subBranch);
        if (matchingFrom) {
          conns.push({
            fromSb: matchingFrom.subBranch,
            from: matchingFrom.branch,
            fromEdge: 'right',
            toSb: toPt.subBranch,
            to: toPt.branch,
            toEdge: 'left'
          });
        } else {
          pts1.forEach(fromPt => {
            conns.push({
              fromSb: fromPt.subBranch,
              from: fromPt.branch,
              fromEdge: 'right',
              toSb: toPt.subBranch,
              to: toPt.branch,
              toEdge: 'left'
            });
          });
        }
      } else {
        // Rule 3: Multiple sources and multiple targets.
        // Connect exact matches.
        // For targets without a matching source, connect them to the main branch or first branch of S.
        const mainSb = this.styleConfig?.mainBranch || pts1[0].subBranch;
        const mainFrom = pts1.find(p => p.subBranch === mainSb) || pts1[0];
        
        pts2.forEach(toPt => {
          const matchingFrom = pts1.find(p => p.subBranch === toPt.subBranch);
          if (matchingFrom) {
            conns.push({
              fromSb: matchingFrom.subBranch,
              from: matchingFrom.branch,
              fromEdge: 'right',
              toSb: toPt.subBranch,
              to: toPt.branch,
              toEdge: 'left'
            });
          } else {
            // No exact sub-branch match for this target, connect to main source point
            conns.push({
              fromSb: mainFrom.subBranch,
              from: mainFrom.branch,
              fromEdge: 'right',
              toSb: toPt.subBranch,
              to: toPt.branch,
              toEdge: 'left'
            });
          }
        });
      }
    }
    
    // Normalize all connections
    return conns.map(c => normConn(c));
  }

  render(dark = this.darkMode ?? true) {
    this.darkMode = dark;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const W = this.canvas.clientWidth || 800, H = this.canvas.clientHeight || 500;
    if (this.canvas.width !== W*dpr || this.canvas.height !== H*dpr) { this.canvas.width = W*dpr; this.canvas.height = H*dpr; }
    this.ctx.save(); this.ctx.scale(dpr, dpr);
    this._scene(this.ctx, W, H, dark, false);
    this.ctx.restore();
  }

  renderToOffscreen(W, H, dark = false) {
    const oc = document.createElement('canvas'); oc.width = W; oc.height = H;
    this._scene(oc.getContext('2d'), W, H, dark, true);
    return oc;
  }

  _scene(ctx, W, H, dark, isExport) {
    const sc = this.styleConfig;
    const pal = {
      bg: dark ? '#060810' : '#ffffff', grid: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)',
      axis: dark ? 'rgba(200,214,229,0.35)' : 'rgba(0,0,0,0.4)',
      axisLine: dark ? 'rgba(200,214,229,0.55)' : 'rgba(0,0,0,0.6)', text: dark ? '#c8d6e5' : '#222222',
    };
    Object.assign(sc, pal);
    ctx.fillStyle = sc.bg; ctx.fillRect(0, 0, W, H);
    if (!this.rows.length) return;

    const grouped = groupRows(this.rows);
    const sbs = [...grouped.keys()].sort();
    const uniq = getUniqueBranches(this.rows);
    const sf = Math.min(W, H) / 480;
    const margin = { top: MARGIN_BASE.top*sf, right: MARGIN_BASE.right*sf, bottom: MARGIN_BASE.bottom*sf, left: MARGIN_BASE.left*sf };
    const plotW = W - margin.left - margin.right, plotH = H - margin.top - margin.bottom;
    const barHalf = plotW / uniq.length * (sc.barWidth ?? 0.35) / 2;
    const ac = migrateAxisConfig(this.axisConfig);
    const xMin = ac.bottom.auto !== false ? uniq[0] : (ac.bottom.min ?? uniq[0]);
    const xMax = ac.bottom.auto !== false ? uniq[uniq.length-1] : (ac.bottom.max ?? uniq[uniq.length-1]);
    const xSpan = xMax - xMin || 1;
    const toX = b => margin.left + ((b - xMin) / xSpan) * plotW;

    const yr = ac.left.auto !== false ? getYRange(this.rows) : { min: ac.left.min??0, max: ac.left.max??1 };
    const yMin = yr.min, yMax = yr.max, ySpan = yMax - yMin || 1;
    const toY = v => margin.top + (1 - (v - yMin) / ySpan) * plotH;
    const ps = sc.pointShape;
    this._layout = { margin, plotW, plotH, toX, toY, barHalf, sf, W, H, yMin, yMax, xMin, xMax };

    // Grid
    if (sc.gridLines) {
      ctx.strokeStyle = sc.grid; ctx.lineWidth = 0.5*sf; ctx.setLineDash([3,4]);
      const yi = ac.left.majInterval || niceInterval(ySpan, 5);
      for (let v = Math.ceil(yMin/yi)*yi; v <= yMax+1e-9; v += yi) { const cy = toY(v); ctx.beginPath(); ctx.moveTo(margin.left, cy); ctx.lineTo(margin.left+plotW, cy); ctx.stroke(); }
      const xi = ac.bottom.majInterval || niceInterval(xSpan, 5);
      for (let v = Math.ceil(xMin/xi)*xi; v <= xMax+1e-9; v += xi) { const cx = toX(v); ctx.beginPath(); ctx.moveTo(cx, margin.top); ctx.lineTo(cx, margin.top+plotH); ctx.stroke(); }
      ctx.setLineDash([]);
    }

    this._drawAllAxes(ctx, W, H, margin, plotW, plotH, uniq, toX, xMin, xMax, xSpan, yMin, yMax, ySpan, toY, sf, sc);

    // Ghost continuity connectors — only when user has explicitly set connections.
    // In auto mode (sc.connections === null) initConnectionsFromData() handles all
    // connectivity, so ghosts would create duplicates and wrong extra lines.
    if (sc.continuity && sc.connections && this._ghosts.length) {
      this._ghosts.forEach(g => {
        const idx = sbs.indexOf(g.subBranch);
        const col = sc.branchStyles[g.subBranch]?.color || PALETTE[idx % PALETTE.length];
        const lw  = (sc.branchStyles[g.subBranch]?.lineWidth ?? sc.lineWidth) * sf;
        const x1 = toX(g.from.branch)+barHalf, y1 = toY(g.from.energy);
        const x2 = toX(g.to.branch)-barHalf,   y2 = toY(g.to.energy);
        ctx.save(); ctx.globalAlpha = 0.70; ctx.strokeStyle = col; ctx.lineWidth = lw*0.8;
        ctx.setLineDash([lw*2.5, lw*2]); ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); ctx.restore();
      });
    }

    const es = sc.elementStyles || {};
    if (!es.segmentTypes) es.segmentTypes = {};

    // Build connection list
    let allConns;
    if (sc.connections && sc.connections.length) {
      allConns = sc.connections.map(normConn);
    } else {
      allConns = this.initConnectionsFromData();
    }

    // Pre-build hitTarget positions (needed for connector coordinate lookup)
    const hitMap = new Map(); // key: `${sb}|${branch}` → { leftCx, leftCy, rightCx, rightCy, cx, cy }
    sbs.forEach(sb => {
      const pts = grouped.get(sb);
      pts.forEach(pt => {
        const bx = toX(pt.branch), by = toY(pt.energy);
        hitMap.set(`${sb}|${pt.branch}`, { bx, by, leftCx: bx-barHalf, leftCy: by, rightCx: bx+barHalf, rightCy: by });
      });
    });

    // Helper: get canvas x,y for a connection endpoint
    const connEndCoords = (sb, branch, edge) => {
      const h = hitMap.get(`${sb}|${branch}`);
      if (!h) return null;
      return edge === 'left' ? { cx: h.leftCx, cy: h.leftCy } : { cx: h.rightCx, cy: h.rightCy };
    };

    // ── Pass 1: Connectors ─────────────────────────────────────────────────
    this._segTargets = [];
    allConns.forEach(c => {
      const fCoords = connEndCoords(c.fromSb, c.from, c.fromEdge);
      const tCoords = connEndCoords(c.toSb,   c.to,   c.toEdge);
      if (!fCoords || !tCoords) return;

      const idx   = sbs.indexOf(c.fromSb);
      const bsCfg = sc.branchStyles[c.fromSb] || {};
      const col   = bsCfg.color    || PALETTE[idx % PALETTE.length];
      const lw    = (bsCfg.lineWidth ?? sc.lineWidth) * sf;
      const lt    = bsCfg.lineType  || sc.lineType;
      const sk    = connToKey(c);
      const sCol  = es.segments?.[sk]      || col;
      const sLW   = es.segmentWidths?.[sk] != null ? es.segmentWidths[sk]*sf : lw*0.8;
      const sST   = es.segmentTypes?.[sk]  || lt;
      const dash  = sST==='solid' ? [] : sST==='dotted' ? [sLW,sLW*2] : [sLW*3,sLW*2];

      const { cx: x1, cy: y1 } = fCoords;
      const { cx: x2, cy: y2 } = tCoords;

      // Draw selection glow if selected
      if (!isExport && this._selectedSegKey === sk) {
        ctx.save();
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth   = sLW + 5*sf;
        ctx.globalAlpha = 0.45;
        ctx.setLineDash([]);
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur  = 14*sf;
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
        ctx.restore();
      }

      ctx.save(); ctx.setLineDash(dash); ctx.strokeStyle = sCol; ctx.lineWidth = sLW; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); ctx.restore();

      this._segTargets.push({
        x1, y1, x2, y2, midX:(x1+x2)/2, midY:(y1+y2)/2,
        fromSb:c.fromSb, from:c.from, fromEdge:c.fromEdge,
        toSb:c.toSb, to:c.to, toEdge:c.toEdge,
        subBranch:c.fromSb,
        segKey:sk,
        ep1cx:x1, ep1cy:y1, ep2cx:x2, ep2cy:y2,
      });
    });

    // Connector endpoint handles (reroute diamonds — interactive only)
    if (!isExport) {
      this._segTargets.forEach(seg => {
        const idx  = sbs.indexOf(seg.fromSb);
        const col  = es.segments?.[seg.segKey] || sc.branchStyles?.[seg.fromSb]?.color || PALETTE[idx%PALETTE.length];
        const sLWr = (es.segmentWidths?.[seg.segKey] != null ? es.segmentWidths[seg.segKey] : (sc.branchStyles?.[seg.fromSb]?.lineWidth ?? sc.lineWidth)*0.8)*sf;
        const r = Math.max(3.5, Math.min(5.5, sLWr*1.6))*sf;
        [{ cx:seg.ep1cx, cy:seg.ep1cy }, { cx:seg.ep2cx, cy:seg.ep2cy }].forEach(ep => {
          ctx.save(); ctx.fillStyle=col; ctx.strokeStyle=sc.bg; ctx.lineWidth=1.2*sf; ctx.globalAlpha=0.72;
          ctx.beginPath(); ctx.arc(ep.cx, ep.cy, r, 0, Math.PI*2); ctx.fill(); ctx.stroke(); ctx.restore();
        });
      });
    }

    // ── Pass 2: Bars + markers ─────────────────────────────────────────────
    this._hitTargets  = [];
    this._socketTargets = [];
    sbs.forEach((sb, idx) => {
      const pts   = grouped.get(sb);
      const bsCfg = sc.branchStyles[sb] || {};
      const col   = bsCfg.color    || PALETTE[idx%PALETTE.length];
      const lw    = (bsCfg.lineWidth ?? sc.lineWidth)*sf;
      const brPS  = (bsCfg.pointSize ?? sc.pointSize)*sf;
      const pb    = sc.pointBorder*sf;
      const shape = bsCfg.pointShape || ps;
      pts.forEach(pt => {
        const bx = toX(pt.branch), by = toY(pt.energy), pk = `${sb}|${pt.branch}`;
        const ptCol = es.points?.[pk] || col;
        const barLW = es.barWidths?.[pk]  != null ? es.barWidths[pk]*sf  : lw*1.4;
        const mkSz  = es.pointSizes?.[pk] != null ? es.pointSizes[pk]*sf : brPS;
        ctx.save(); ctx.setLineDash([]); ctx.strokeStyle=ptCol; ctx.lineWidth=barLW; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(bx-barHalf,by); ctx.lineTo(bx+barHalf,by); ctx.stroke(); ctx.restore();
        if (shape !== 'none') this._drawPoint(ctx, bx, by, shape, mkSz, ptCol, pb, sc.bg);
        this._hitTargets.push({
          cx:bx, cy:by,
          leftCx:bx-barHalf, leftCy:by,
          rightCx:bx+barHalf, rightCy:by,
          subBranch:sb, branch:pt.branch, energy:pt.energy, ptKey:pk
        });
        // Socket targets for drag snapping
        this._socketTargets.push({ cx: bx-barHalf, cy: by, subBranch:sb, branch:pt.branch, edge:'left'  });
        this._socketTargets.push({ cx: bx+barHalf, cy: by, subBranch:sb, branch:pt.branch, edge:'right' });
      });
    });

    // ── Pass 3: Stick End Sockets (interactive only) ───────────────────────
    if (!isExport) {
      const SOCKET_R = 5*sf;
      this._socketTargets.forEach(sock => {
        const isHovered = this._hoverSocket &&
          this._hoverSocket.subBranch === sock.subBranch &&
          this._hoverSocket.branch    === sock.branch    &&
          this._hoverSocket.edge      === sock.edge;

        ctx.save();
        ctx.strokeStyle = '#00e5a0';
        ctx.lineWidth   = 1.5*sf;
        ctx.fillStyle   = isHovered ? 'rgba(0,229,160,0.55)' : 'rgba(0,229,160,0.12)';
        if (isHovered) {
          ctx.shadowColor = '#00ff88';
          ctx.shadowBlur  = 12*sf;
          ctx.globalAlpha = 1;
        } else {
          ctx.globalAlpha = 0.55;
        }
        ctx.beginPath();
        ctx.arc(sock.cx, sock.cy, SOCKET_R, 0, Math.PI*2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      });

      // Hover socket extra glow ring
      if (this._hoverSocket) {
        const hs = this._hoverSocket;
        ctx.save();
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth   = 2*sf;
        ctx.globalAlpha = 0.6;
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur  = 20*sf;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(hs.cx, hs.cy, 8*sf, 0, Math.PI*2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Reroute endpoint drag ghost
    if (!isExport && this._epDrag) {
      const d = this._epDrag, seg = d.seg;
      const fx = d.side==='from' ? seg.ep2cx : seg.ep1cx, fy = d.side==='from' ? seg.ep2cy : seg.ep1cy;
      ctx.save(); ctx.setLineDash([4*sf,4*sf]); ctx.strokeStyle=d.target?'#00ff88':'#ff5555'; ctx.lineWidth=1.5*sf; ctx.globalAlpha=0.8;
      ctx.beginPath(); ctx.moveTo(fx,fy); ctx.lineTo(d.dragCx,d.dragCy); ctx.stroke(); ctx.restore();
      if (d.target) { ctx.save(); ctx.strokeStyle='#00ff88'; ctx.lineWidth=2.5*sf; ctx.globalAlpha=0.9; ctx.setLineDash([]); ctx.beginPath(); ctx.arc(d.target.cx,d.target.cy,12*sf,0,Math.PI*2); ctx.stroke(); ctx.restore(); }
    }

    // New connection draw ghost
    if (!isExport && this._newConnDrag) {
      const d = this._newConnDrag;
      ctx.save(); ctx.setLineDash([4*sf,4*sf]); ctx.strokeStyle=d.target?'#00ff88':'rgba(255,255,255,0.5)'; ctx.lineWidth=1.8*sf; ctx.globalAlpha=0.85;
      ctx.beginPath(); ctx.moveTo(d.fromCx,d.fromCy); ctx.lineTo(d.dragCx,d.dragCy); ctx.stroke(); ctx.restore();
      if (d.target) { ctx.save(); ctx.strokeStyle='#00ff88'; ctx.lineWidth=2.5*sf; ctx.globalAlpha=0.9; ctx.setLineDash([]); ctx.beginPath(); ctx.arc(d.target.cx,d.target.cy,11*sf,0,Math.PI*2); ctx.stroke(); ctx.restore(); }
    }

    if (sc.showLegend && sbs.length) this._drawLegend(ctx, W, H, margin, sbs, sf, sc, dark);
    if (isExport && this._annotations && this._annotations.length) {
      this._drawAnnotations(ctx, W, H, margin, plotW, plotH, sf, sc);
    }
  }

  _drawAllAxes(ctx, W, H, margin, plotW, plotH, uniq, toX, xMin, xMax, xSpan, yMin, yMax, ySpan, toY, sf, sc) {
    const ac = this.axisConfig;
    const fc = sc.fontConfig || {
      axisLabel:  { family: 'Space Grotesk', size: 13.5, weight: 'normal', color: null },
      tickNumber: { family: 'JetBrains Mono', size: 11.5, weight: 'normal', color: null },
    };
    const axLblF = fc.axisLabel || { family: 'Space Grotesk', size: 13.5, weight: 'normal', color: null };
    const tickNumF = fc.tickNumber || { family: 'JetBrains Mono', size: 11.5, weight: 'normal', color: null };

    const fz = (tickNumF.size || 11.5) * sf;
    const lfz = (axLblF.size || 13.5) * sf;
    const tickWeight = tickNumF.weight || 'normal';
    const tickFamily = tickNumF.family || 'JetBrains Mono';
    const axWeight = axLblF.weight || 'normal';
    const axFamily = axLblF.family || 'Space Grotesk';

    const tickFont = `${tickWeight} ${fz}px "${tickFamily}", monospace, sans-serif`;
    const labelFont = `${axWeight} ${lfz}px "${axFamily}", sans-serif`;

    const drawV = (side, xPos) => {
      const cfg = ac[side]; if (!cfg?.show) return;
      const inw = side==='left'?1:-1, tDir = cfg.tickDir==='in'?-inw:inw;
      ctx.strokeStyle=sc.axisLine; ctx.lineWidth=1.2*sf; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(xPos,margin.top); ctx.lineTo(xPos,margin.top+plotH); ctx.stroke();
      if (cfg.showTicks) {
        const yi=Number(cfg.majInterval)||niceInterval(ySpan,5), ymi=Number(cfg.minInterval)||yi/5;
        const tl=(Number(cfg.tickLen)||6)*sf, mtl=(Number(cfg.minorTickLen)||3)*sf;
        if (cfg.showMinorTicks) { const y0m=Math.ceil((yMin-1e-9)/ymi)*ymi; for(let v=y0m;v<=yMax+1e-9;v+=ymi){ctx.strokeStyle=sc.axis;ctx.lineWidth=0.7*sf;ctx.beginPath();ctx.moveTo(xPos,toY(v));ctx.lineTo(xPos+tDir*mtl,toY(v));ctx.stroke();} }
        const y0=Math.ceil((yMin-1e-9)/yi)*yi;
        ctx.fillStyle=tickNumF.color || sc.text;
        ctx.textAlign=side==='left'?'right':'left'; ctx.textBaseline='middle'; ctx.font=tickFont;
        for(let v=y0;v<=yMax+1e-9;v+=yi){const cy=toY(v);ctx.strokeStyle=sc.axisLine;ctx.lineWidth=1*sf;ctx.beginPath();ctx.moveTo(xPos,cy);ctx.lineTo(xPos+tDir*tl,cy);ctx.stroke();if(cfg.showLabels){const valStr=cfg.decimals!=null?v.toFixed(cfg.decimals):this._fmtNum(v);ctx.fillText(valStr,side==='left'?xPos+tDir*tl-5*sf:xPos+tDir*tl+5*sf,cy);}}
      }
      if (cfg.label) {
        ctx.save();
        ctx.font=labelFont;
        ctx.fillStyle=axLblF.color || sc.text;
        ctx.textAlign='center';ctx.textBaseline='middle';ctx.translate(side==='left'?14*sf:W-14*sf,margin.top+plotH/2);ctx.rotate(side==='left'?-Math.PI/2:Math.PI/2);ctx.fillText(cfg.label,0,0);ctx.restore();
      }
    };
    const drawH = (side, yPos) => {
      const cfg = ac[side]; if (!cfg?.show) return;
      const inw = side==='bottom'?-1:1, tDir = cfg.tickDir==='in'?-inw:inw;
      ctx.strokeStyle=sc.axisLine; ctx.lineWidth=1.2*sf; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(margin.left,yPos); ctx.lineTo(margin.left+plotW,yPos); ctx.stroke();
      if (cfg.showTicks) {
        const xi = Number(cfg.majInterval) || niceInterval(xSpan, 5), xmi = Number(cfg.minInterval) || xi/5;
        const tl = (Number(cfg.tickLen)||6)*sf, mtl = (Number(cfg.minorTickLen)||3)*sf;
        if (cfg.showMinorTicks) {
          const x0m = Math.ceil((xMin-1e-9)/xmi)*xmi;
          for(let v=x0m;v<=xMax+1e-9;v+=xmi){ctx.strokeStyle=sc.axis;ctx.lineWidth=0.7*sf;ctx.beginPath();ctx.moveTo(toX(v),yPos);ctx.lineTo(toX(v),yPos+tDir*mtl);ctx.stroke();}
        }
        const x0 = Math.ceil((xMin-1e-9)/xi)*xi;
        ctx.fillStyle=tickNumF.color || sc.text;
        ctx.textAlign='center'; ctx.textBaseline=side==='bottom'?'top':'bottom'; ctx.font=tickFont;
        for(let v=x0;v<=xMax+1e-9;v+=xi){
          const cx=toX(v);ctx.strokeStyle=sc.axisLine;ctx.lineWidth=1*sf;ctx.beginPath();ctx.moveTo(cx,yPos);ctx.lineTo(cx,yPos+tDir*tl);ctx.stroke();
          if(cfg.showLabels){const valStr=cfg.decimals!=null?v.toFixed(cfg.decimals):this._fmtNum(v);ctx.fillText(valStr,cx,side==='bottom'?yPos+tDir*tl+4*sf:yPos+tDir*tl-4*sf);}
        }
      }
      if (cfg.label) {
        ctx.save();
        ctx.font=labelFont;
        ctx.fillStyle=axLblF.color || sc.text;
        ctx.textAlign='center';ctx.textBaseline=side==='bottom'?'top':'bottom';ctx.fillText(cfg.label,margin.left+plotW/2,side==='bottom'?H-10*sf:10*sf);ctx.restore();
      }
    };
    drawV('left',margin.left); drawV('right',margin.left+plotW);
    drawH('bottom',margin.top+plotH); drawH('top',margin.top);
  }

  _drawPoint(ctx, x, y, shape, size, color, border, bg) {
    ctx.save(); ctx.fillStyle=color; ctx.strokeStyle=bg; ctx.lineWidth=border; ctx.setLineDash([]); ctx.beginPath();
    if      (shape==='square')   { ctx.rect(x-size,y-size,size*2,size*2); }
    else if (shape==='triangle') { ctx.moveTo(x,y-size*1.15);ctx.lineTo(x+size,y+size*0.7);ctx.lineTo(x-size,y+size*0.7);ctx.closePath(); }
    else if (shape==='diamond')  { ctx.moveTo(x,y-size*1.2);ctx.lineTo(x+size*0.85,y);ctx.lineTo(x,y+size*1.2);ctx.lineTo(x-size*0.85,y);ctx.closePath(); }
    else                         { ctx.arc(x,y,size,0,Math.PI*2); }
    ctx.fill(); if (border>0) ctx.stroke(); ctx.restore();
  }

  _drawLegend(ctx, W, H, margin, sbs, sf, sc, dark) {
    const fc = sc.fontConfig || {
      legend: { family: 'JetBrains Mono', size: 10.5, weight: 'normal', color: null },
      legendPos: 'top-right',
      legendX: null,
      legendY: null,
    };
    const legF = fc.legend || { family: 'JetBrains Mono', size: 10.5, weight: 'normal', color: null };
    const fz = (legF.size || 10.5) * sf;
    const lh = fz * 1.9, padX = 10 * sf, padY = 7 * sf, pw = 24 * sf;

    const legWeight = legF.weight || 'normal';
    const legFamily = legF.family || 'JetBrains Mono';
    ctx.font = `${legWeight} ${fz}px "${legFamily}", monospace, sans-serif`;

    const maxLW = Math.max(...sbs.map(s => ctx.measureText(sc.legendLabels[s] || s).width));
    const boxW = maxLW + pw + padX * 2 + 7 * sf, boxH = sbs.length * lh + padY * 2;

    const plotW = W - margin.left - margin.right;
    const plotH = H - margin.top - margin.bottom;

    let bx = margin.left + plotW - boxW - 12 * sf;
    let by = margin.top + 12 * sf;

    const pos = fc.legendPos || 'top-right';
    if (pos === 'top-left') {
      bx = margin.left + 12 * sf;
      by = margin.top + 12 * sf;
    } else if (pos === 'bottom-right') {
      bx = margin.left + plotW - boxW - 12 * sf;
      by = margin.top + plotH - boxH - 12 * sf;
    } else if (pos === 'bottom-left') {
      bx = margin.left + 12 * sf;
      by = margin.top + plotH - boxH - 12 * sf;
    } else if (pos === 'custom') {
      bx = margin.left + (fc.legendX ?? 0.8) * plotW;
      by = margin.top + (fc.legendY ?? 0.1) * plotH;
    }

    // Save legend bounding box
    this._legendBox = { x: bx, y: by, w: boxW, h: boxH };

    ctx.save();
    ctx.fillStyle = dark ? 'rgba(10,13,20,0.85)' : 'rgba(255,255,255,0.92)';
    ctx.strokeStyle = dark ? '#1e2d45' : '#cccccc';
    ctx.lineWidth = 1;
    this._roundRect(ctx, bx, by, boxW, boxH, 5 * sf);
    ctx.fill();
    ctx.stroke();

    ctx.font = `${legWeight} ${fz}px "${legFamily}", monospace, sans-serif`;
    ctx.textBaseline = 'middle';
    sbs.forEach((sb, i) => {
      const col = (sc.branchStyles[sb] || {}).color || PALETTE[i % PALETTE.length];
      const label = sc.legendLabels[sb] || sb;
      const iy = by + padY + i * lh + lh / 2;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2.5 * sf;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(bx + padX, iy);
      ctx.lineTo(bx + padX + pw, iy);
      ctx.stroke();
      this._drawPoint(ctx, bx + padX + pw / 2, iy, sc.pointShape, 4 * sf, col, 1 * sf, dark ? '#060810' : '#fff');
      
      ctx.fillStyle = legF.color || sc.text;
      ctx.textAlign = 'left';
      ctx.fillText(label, bx + padX + pw + 7 * sf, iy);
    });
    ctx.restore();
  }

  _drawAnnotations(ctx, W, H, margin, plotW, plotH, sf) {
    if (!this._annotations) return;
    this._annotations.forEach(ann => {
      const ax = margin.left + ann.x * plotW;
      const ay = margin.top + ann.y * plotH;

      ctx.save();
      const fs = (ann.fontSize || 13) * sf;
      const weight = ann.fontWeight || 'normal';
      const style = ann.fontStyle || 'normal';
      const family = ann.fontFamily || 'Inter';
      ctx.font = `${style} ${weight} ${fs}px "${family}"`;
      ctx.fillStyle = ann.color || '#ff4d4f';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      const lines = (ann.text || '').split('\n');
      let currentY = ay;
      lines.forEach(line => {
        ctx.fillText(line, ax, currentY);
        currentY += fs * 1.25;
      });
      ctx.restore();
    });
  }

  _roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.arcTo(x+w,y,x+w,y+r,r);ctx.lineTo(x+w,y+h-r);ctx.arcTo(x+w,y+h,x+w-r,y+h,r);ctx.lineTo(x+r,y+h);ctx.arcTo(x,y+h,x,y+h-r,r);ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);ctx.closePath();}

  _fmtNum(n){const a=Math.abs(n);if(!a)return'0';if(a>=100)return n.toFixed(0);if(a>=10)return n.toFixed(1);if(a>=1)return n.toFixed(2);return n.toPrecision(3);}

  // ── Hit testing ────────────────────────────────────────────────────────────
  getHoverInfo(mx,my){
    const T=20; let best=null,bd=Infinity;
    for(const t of this._hitTargets){const d=Math.hypot(mx-t.cx,my-t.cy);if(d<T&&d<bd){best=t;bd=d;}}
    return best;
  }

  getHoverSegment(mx,my){
    const T=11; let best=null,bd=Infinity;
    for(const s of this._segTargets){const d=_distToSeg(mx,my,s.x1,s.y1,s.x2,s.y2);if(d<T&&d<bd){best=s;bd=d;}}
    return best;
  }

  getHoverEndpoint(mx,my){
    const R=15;
    for(const s of this._segTargets){
      if(Math.hypot(mx-s.ep1cx,my-s.ep1cy)<R)return{...s,side:'from'};
      if(Math.hypot(mx-s.ep2cx,my-s.ep2cy)<R)return{...s,side:'to'};
    }
    return null;
  }

  getHoverStickEndpoint(mx,my){
    const R=12;
    let best=null, bd=Infinity;
    for(const s of this._socketTargets){
      const d=Math.hypot(mx-s.cx,my-s.cy);
      if(d<R&&d<bd){best=s;bd=d;}
    }
    return best;
  }

  getHoverLegend(mx, my) {
    if (!this.styleConfig.showLegend || !this._legendBox) return false;
    const b = this._legendBox;
    return mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h;
  }

  getNearestHitTarget(mx,my){
    const M=50; let best=null,bd=M;
    for(const s of this._socketTargets){
      const d=Math.hypot(mx-s.cx,my-s.cy);
      if(d<bd){bd=d;best=s;}
    }
    return best;
  }
}

function _distToSeg(px,py,x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1,l=dx*dx+dy*dy;if(!l)return Math.hypot(px-x1,py-y1);const t=Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/l));return Math.hypot(px-(x1+t*dx),py-(y1+t*dy));}
