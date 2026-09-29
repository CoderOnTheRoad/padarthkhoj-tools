// Free Energy Plotter — Interaction Layer (v5)
//
// Gestures:
//   hover near stick-end socket → highlights socket green
//   click bar/segment           → selects element (branch/segment colour popup)
//   dblclick                    → opens full style popup for element
//   mousedown near segment endpoint → reroute drag  (snaps to nearest socket)
//   mousedown on socket/bar + drag > 6px → draw new connector (snaps to socket)
//   contextmenu on segment      → onConnectionDelete({segKey})
//   Delete / Backspace key      → delete selected segment (if any)
//   onConnectionReRoute({segKey, side, newBranch, newSubBranch, newEdge})
//   onConnectionAdd({fromSb, from, fromEdge, toSb, to, toEdge})

import { escapeHTML } from './html.js';

const DRAG_THR = 6;    // px threshold to start new-connection draw

export class InteractionLayer {
  constructor(canvas, engine, callbacks = {}) {
    this.canvas    = canvas;
    this.engine    = engine;
    this.callbacks = callbacks;
    this._epDrag      = null;   // endpoint reroute drag state
    this._potDraw     = null;   // potential new-connection (pending threshold)
    this._newConnDrag = null;   // confirmed new-connection draw state
    this._handlers    = {};
    this._bindEvents();
  }

  dispose() {
    const c = this.canvas;
    c.removeEventListener('mousedown',   this._handlers.down);
    c.removeEventListener('mousemove',   this._handlers.move);
    c.removeEventListener('mouseup',     this._handlers.up);
    c.removeEventListener('mouseleave',  this._handlers.leave);
    c.removeEventListener('click',       this._handlers.click);
    c.removeEventListener('dblclick',    this._handlers.dbl);
    c.removeEventListener('contextmenu', this._handlers.ctx, { capture: true });
    document.removeEventListener('keydown', this._handlers.key);
  }

  _bindEvents() {
    this._handlers.down  = e => this._onDown(e);
    this._handlers.move  = e => this._onMove(e);
    this._handlers.up    = e => this._onUp(e);
    this._handlers.leave = e => this._onLeave(e);
    this._handlers.click = e => this._onClick(e);
    this._handlers.dbl   = e => this._onDbl(e);
    this._handlers.ctx   = e => this._onCtx(e);
    this._handlers.key   = e => this._onKey(e);
    const c = this.canvas;
    c.addEventListener('mousedown',   this._handlers.down);
    c.addEventListener('mousemove',   this._handlers.move);
    c.addEventListener('mouseup',     this._handlers.up);
    c.addEventListener('mouseleave',  this._handlers.leave);
    c.addEventListener('click',       this._handlers.click);
    c.addEventListener('dblclick',    this._handlers.dbl);
    c.addEventListener('contextmenu', this._handlers.ctx, { capture: true });
    document.addEventListener('keydown', this._handlers.key);
  }

  _toCanvas(e) {
    const rect = this.canvas.getBoundingClientRect();
    const dpr  = window.devicePixelRatio || 1;
    return {
      cx: (e.clientX - rect.left) * (this.canvas.width  / rect.width)  / dpr,
      cy: (e.clientY - rect.top)  * (this.canvas.height / rect.height) / dpr,
      ox: e.offsetX,
      oy: e.offsetY,
    };
  }

  // ── Keyboard: Delete / Backspace → delete selected segment ────────────────
  _onKey(e) {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    // Don't steal events when a text input or contenteditable is focused
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (document.activeElement?.isContentEditable) return;
    const sk = this.engine.getSelectedSegKey();
    if (!sk) return;
    e.preventDefault();
    this.engine.setSelectedSegKey(null);
    this.callbacks.onConnectionDelete?.({ segKey: sk });
  }

  // ── Right-click: delete connector ────────────────────────────────────────
  _onCtx(e) {
    e.preventDefault();
    const { cx, cy } = this._toCanvas(e);
    const seg = this.engine.getHoverSegment(cx, cy);
    if (seg) {
      this.engine.setSelectedSegKey(null);
      this.callbacks.onConnectionDelete?.({ segKey: seg.segKey });
    }
  }

  // ── Mousedown ─────────────────────────────────────────────────────────────
  _onDown(e) {
    if (e.button !== 0) return;
    const { cx, cy } = this._toCanvas(e);

    // Priority 0: legend box → legend drag
    if (this.engine.getHoverLegend(cx, cy)) {
      e.preventDefault();
      const fc = this.engine.styleConfig.fontConfig || {};
      const layout = this.engine._layout;
      if (layout) {
        const plotW = layout.plotW;
        const plotH = layout.plotH;
        const margin = layout.margin;
        let currentX = fc.legendX;
        let currentY = fc.legendY;
        if (currentX == null || currentY == null) {
          const b = this.engine._legendBox;
          currentX = b ? (b.x - margin.left) / plotW : 0.8;
          currentY = b ? (b.y - margin.top) / plotH : 0.1;
        }
        this._legDrag = {
          startCx: cx,
          startCy: cy,
          startLegendX: currentX,
          startLegendY: currentY
        };
        this.canvas.style.cursor = 'move';
        return;
      }
    }

    // Priority 1: connector endpoint handle → reroute drag
    const ep = this.engine.getHoverEndpoint(cx, cy);
    if (ep) {
      e.preventDefault();
      this._epDrag = { seg: ep, side: ep.side, dragCx: cx, dragCy: cy, target: null };
      this.canvas.style.cursor = 'crosshair';
      return;
    }

    // Priority 2: stick-end socket → immediate new connection draw (no threshold)
    const sock = this.engine.getHoverStickEndpoint(cx, cy);
    if (sock) {
      e.preventDefault();
      this._newConnDrag = {
        fromHit:  { subBranch: sock.subBranch, branch: sock.branch, edge: sock.edge },
        fromCx:   sock.cx,
        fromCy:   sock.cy,
        dragCx:   cx,
        dragCy:   cy,
        target:   null,
      };
      this.canvas.style.cursor = 'crosshair';
      return;
    }

    // Priority 3: bar center → potential new connection (threshold needed)
    const pt = this.engine.getHoverInfo(cx, cy);
    if (pt) {
      this._potDraw = { fromHit: { ...pt, edge: 'right' }, fromCx: pt.cx, fromCy: pt.cy, startCx: cx, startCy: cy };
    }
  }

  // ── Mousemove ─────────────────────────────────────────────────────────────
  _onMove(e) {
    const { cx, cy, ox, oy } = this._toCanvas(e);

    // ── Legend drag ─────────────────────────────────────────────────────────
    if (this._legDrag) {
      const dx = cx - this._legDrag.startCx;
      const dy = cy - this._legDrag.startCy;
      const layout = this.engine._layout;
      if (layout) {
        const fc = this.engine.styleConfig.fontConfig;
        if (fc) {
          fc.legendPos = 'custom';
          fc.legendX = Math.max(0, Math.min(1, this._legDrag.startLegendX + dx / layout.plotW));
          fc.legendY = Math.max(0, Math.min(1, this._legDrag.startLegendY + dy / layout.plotH));
          this.engine.render();
        }
      }
      this.canvas.style.cursor = 'move';
      return;
    }

    // ── Reroute endpoint drag ──────────────────────────────────────────────
    if (this._epDrag) {
      this._epDrag.dragCx = cx;
      this._epDrag.dragCy = cy;
      const seg = this._epDrag.seg;
      const fixedBranch = this._epDrag.side === 'from' ? seg.to   : seg.from;
      const fixedSb     = this._epDrag.side === 'from' ? seg.toSb : seg.fromSb;
      const nearest = this.engine.getNearestHitTarget(cx, cy);
      const isValid = nearest &&
        !(nearest.branch == fixedBranch && nearest.subBranch === fixedSb);
      this._epDrag.target = isValid ? nearest : null;
      this.engine.setEndpointDrag(this._epDrag);
      this.engine.render();
      this.canvas.style.cursor = 'crosshair';
      return;
    }

    // ── New connection draw (confirmed) ───────────────────────────────────
    if (this._newConnDrag) {
      this._newConnDrag.dragCx = cx;
      this._newConnDrag.dragCy = cy;
      const fh = this._newConnDrag.fromHit;
      const nearest = this.engine.getNearestHitTarget(cx, cy);
      const isValid = nearest &&
        !(nearest.subBranch === fh.subBranch && nearest.branch === fh.branch && nearest.edge === fh.edge);
      this._newConnDrag.target = isValid ? nearest : null;
      this.engine.setNewConnDrag(this._newConnDrag);
      this.engine.render();
      this.canvas.style.cursor = 'crosshair';
      return;
    }

    // ── Promote potential draw to confirmed draw ───────────────────────────
    if (this._potDraw) {
      const dx = cx - this._potDraw.startCx, dy = cy - this._potDraw.startCy;
      if (Math.hypot(dx, dy) > DRAG_THR) {
        this._newConnDrag = {
          fromHit: this._potDraw.fromHit,
          fromCx:  this._potDraw.fromCx,
          fromCy:  this._potDraw.fromCy,
          dragCx: cx, dragCy: cy, target: null,
        };
        this._potDraw = null;
        this.canvas.style.cursor = 'crosshair';
      }
      return;
    }

    // ── Normal hover: legend + sockets + cursor + tooltip ─────────────────
    const isOverLeg = this.engine.getHoverLegend(cx, cy);
    if (isOverLeg) {
      this.canvas.style.cursor = 'move';
      this.engine.setHoverSocket(null);
      const tip = document.getElementById('fep-tooltip');
      if (tip) {
        tip.innerHTML = `<b>Legend</b><br><span class="fep-tt-hint">Drag to reposition</span>`;
        tip.style.cssText = `display:block;left:${ox+14}px;top:${oy-8}px`;
      }
      return;
    }

    const sock = this.engine.getHoverStickEndpoint(cx, cy);
    const ep   = !sock && this.engine.getHoverEndpoint(cx, cy);
    const pt   = !sock && !ep && this.engine.getHoverInfo(cx, cy);
    const seg  = !sock && !ep && !pt && this.engine.getHoverSegment(cx, cy);

    // Socket hover highlight
    this.engine.setHoverSocket(sock || null);
    if (sock || ep || pt || seg) {
      this.engine.render();
    }

    this.canvas.style.cursor = (sock || ep) ? 'crosshair' : (pt || seg) ? 'pointer' : 'default';

    const tip = document.getElementById('fep-tooltip');
    if (!tip) return;
    if (sock) {
      tip.innerHTML = `<span style="color:#00e5a0">⊕ Drag</span> to connect
        <br><span class="fep-tt-hint">${escapeHTML(sock.subBranch)} step ${sock.branch} · ${escapeHTML(sock.edge)} socket</span>`;
      tip.style.cssText = `display:block;left:${ox+14}px;top:${oy-8}px`;
    } else if (ep) {
      tip.innerHTML = `<span style="color:#00e5a0">⟷ Drag</span> to reconnect
        <br><span class="fep-tt-hint">${ep.side} endpoint</span>`;
      tip.style.cssText = `display:block;left:${ox+14}px;top:${oy-8}px`;
    } else if (pt) {
      tip.innerHTML = `<b>${escapeHTML(pt.subBranch)}</b> · step ${pt.branch}
        <br><span style="color:var(--accent)">${(+pt.energy).toFixed(4)} eV</span>
        <br><span class="fep-tt-hint">click: colour · dbl: style · drag socket: new line</span>`;
      tip.style.cssText = `display:block;left:${ox+14}px;top:${oy-8}px`;
    } else if (seg) {
      const fEdge = seg.fromEdge || '?', tEdge = seg.toEdge || '?';
      tip.innerHTML = `<b>${escapeHTML(seg.fromSb)}</b>[${seg.from}·${escapeHTML(fEdge)}] → <b>${escapeHTML(seg.toSb)}</b>[${seg.to}·${escapeHTML(tEdge)}]
        <br><span class="fep-tt-hint">click: select · dbl: style · right-click: delete · ◆: reroute</span>`;
      tip.style.cssText = `display:block;left:${ox+14}px;top:${oy-8}px`;
    } else {
      tip.style.display = 'none';
      if (this.engine._hoverSocket) {
        this.engine.setHoverSocket(null);
        this.engine.render();
      }
    }
  }

  // ── Mouseup ───────────────────────────────────────────────────────────────
  _onUp() {
    // Commit legend drag
    if (this._legDrag) {
      this._legDrag = null;
      this.canvas.style.cursor = 'default';
      this.callbacks.onLegendMoved?.(this.engine.styleConfig.fontConfig);
      return;
    }

    // Commit reroute
    if (this._epDrag) {
      const drag = this._epDrag;
      this._epDrag = null;
      this.engine.setEndpointDrag(null);
      this.engine.render();
      if (drag.target) {
        this.callbacks.onConnectionReRoute?.({
          segKey:       drag.seg.segKey,
          side:         drag.side,
          newBranch:    drag.target.branch,
          newSubBranch: drag.target.subBranch,
          newEdge:      drag.target.edge || (drag.side === 'from' ? 'left' : 'right'),
        });
      }
      this.canvas.style.cursor = 'default';
      return;
    }

    // Commit new connection draw
    if (this._newConnDrag) {
      const drag = this._newConnDrag;
      this._newConnDrag = null;
      this.engine.setNewConnDrag(null);
      this.engine.render();
      if (drag.target) {
        this.callbacks.onConnectionAdd?.({
          fromSb:   drag.fromHit.subBranch,
          from:     drag.fromHit.branch,
          fromEdge: drag.fromHit.edge || 'right',
          toSb:     drag.target.subBranch,
          to:       drag.target.branch,
          toEdge:   drag.target.edge || 'left',
        });
      }
      this.canvas.style.cursor = 'default';
      return;
    }

    // Cancel potential draw
    this._potDraw = null;
  }

  _onLeave() {
    this._legDrag = null;
    if (this._epDrag) { this._epDrag = null; this.engine.setEndpointDrag(null); this.engine.render(); }
    if (this._newConnDrag) { this._newConnDrag = null; this.engine.setNewConnDrag(null); this.engine.render(); }
    this._potDraw = null;
    this.engine.setHoverSocket(null);
    const tip = document.getElementById('fep-tooltip');
    if (tip) tip.style.display = 'none';
    this.canvas.style.cursor = 'default';
  }

  // ── Single click ──────────────────────────────────────────────────────────
  _onClick(e) {
    if (e.detail > 1) return;   // part of dblclick — skip
    if (this._epDrag || this._newConnDrag || this._legDrag) return;
    const { cx, cy, ox, oy } = this._toCanvas(e);
    if (this.engine.getHoverEndpoint(cx, cy)) return;
    if (this.engine.getHoverStickEndpoint(cx, cy)) return;
    if (this.engine.getHoverLegend(cx, cy)) return;

    const pt  = this.engine.getHoverInfo(cx, cy);
    const seg = !pt && this.engine.getHoverSegment(cx, cy);

    if (seg) {
      const prevSk = this.engine.getSelectedSegKey();
      const newSk  = prevSk === seg.segKey ? null : seg.segKey;
      this.engine.setSelectedSegKey(newSk);
      this.engine.render();
      if (!newSk) return;
      this.callbacks.onBranchClick?.(seg.subBranch, ox, oy);
      return;
    }

    if (!pt) return;
    if (this.engine.getSelectedSegKey()) {
      this.engine.setSelectedSegKey(null);
      this.engine.render();
    }
    this.callbacks.onBranchClick?.((pt).subBranch, ox, oy);
  }

  // ── Double click ──────────────────────────────────────────────────────────
  _onDbl(e) {
    const { cx, cy, ox, oy } = this._toCanvas(e);
    if (this.engine.getHoverEndpoint(cx, cy)) return;
    if (this.engine.getHoverStickEndpoint(cx, cy)) return;
    if (this.engine.getHoverLegend(cx, cy)) return;

    const pt  = this.engine.getHoverInfo(cx, cy);
    const seg = !pt && this.engine.getHoverSegment(cx, cy);

    if (pt) {
      this.callbacks.onElementClick?.('point', pt.ptKey ?? `${pt.subBranch}|${pt.branch}`, pt.subBranch, ox, oy);
    } else if (seg) {
      this.callbacks.onElementClick?.('segment', seg.segKey, seg.fromSb, ox, oy);
    } else {
      // Empty double click
      const layout = this.engine._layout;
      if (layout) {
        const margin = layout.margin;
        const xFrac = Math.max(0, Math.min(1, (cx - margin.left) / layout.plotW));
        const yFrac = Math.max(0, Math.min(1, (cy - margin.top) / layout.plotH));
        this.callbacks.onEmptyDblClick?.(xFrac, yFrac);
      }
    }
  }
}
