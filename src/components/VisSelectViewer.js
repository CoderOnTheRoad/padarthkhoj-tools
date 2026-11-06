import * as THREE from 'three';
import { ELEMENTS } from '../data/elements.js';
import { disposeBonding, setBondStructure, setupBonding } from '../lib/bonding.js';
import { setupUnitCellVisibility } from '../lib/unitCellVisibility.js';
import { clearPeriodicEdgeAtoms, disposePeriodicEdgeAtoms, periodicAtomTargets, setupPeriodicEdgeAtoms, syncPeriodicEdgeAtoms } from '../lib/periodicEdgeAtoms.js';
import { isPointerDrag } from '../lib/pointerGesture.js';

// ─── Color palette for multi-selected atoms ───────────────────────────────────
const SEL_COLORS = [
  0x00d4ff, // cyan  (accent)
  0xa78bfa, // purple
  0x34d399, // green
  0xfbbf24, // amber
  0xf87171, // red
  0x60a5fa, // blue
  0xf472b6, // pink
  0x4ade80, // lime
];

/**
 * VisSelectViewer — extends ThreeViewer for multi-atom selection.
 * Click an atom → toggles selection (highlighted with a colour per selection order).
 * Also supports orbit / pan / zoom just like the original.
 */
export class VisSelectViewer {
  constructor(canvas) {
    this.canvas    = canvas;
    this.container = canvas.parentElement;

    // Selection: Map<atomIdx → selectionOrderIndex>
    this.selected   = new Map();
    this._selOrder  = [];   // ordered list of atomIdx

    this.atomMeshes = [];
    this.bondLines  = [];
    this.animId     = null;

    this.onSelectionChange = null; // callback(selectedIndices: number[])
    this.interactionEnabled = true;

    // Orbit state
    this.mouse       = {
      down: false,
      rdown: false,
      last: { x: 0, y: 0 },
      pressStart: null,
      moved: false,
    };
    this.spherical   = { phi: 0.6, theta: 0.4, r: 30 };
    this.panOffset   = { x: 0, y: 0 };
    this.isLight     = document.documentElement.classList.contains('light-mode');

    this._setup();
    setupBonding(this);
    setupUnitCellVisibility(this);
    setupPeriodicEdgeAtoms(this);
    this.resizeRenderer();
    this._animate();
  }

  _setup() {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.isLight ? 1.12 : 1.0;
    this.renderer.setClearColor(this.isLight ? 0xf8fafc : 0x060810, 1);

    this.scene    = new THREE.Scene();
    const w = this.container.clientWidth  || 600;
    const h = this.container.clientHeight || 400;
    this.camera   = new THREE.PerspectiveCamera(45, w / h, 0.1, 500);
    this.raycaster = new THREE.Raycaster();

    // Lights
    this.ambientLight = new THREE.AmbientLight(0xffffff, this.isLight ? 0.72 : 0.45);
    this.scene.add(this.ambientLight);
    this.keyLight = new THREE.DirectionalLight(0xffffff, this.isLight ? 1.1 : 0.9);
    this.keyLight.position.set(10, 20, 15); this.scene.add(this.keyLight);
    this.fillLight = new THREE.DirectionalLight(0x4488ff, this.isLight ? 0.42 : 0.3);
    this.fillLight.position.set(-10, -5, -10); this.scene.add(this.fillLight);

    // Events
    this.canvas.addEventListener('mousedown', e => {
      if (!this.interactionEnabled) return;
      this.mouse.last  = { x: e.clientX, y: e.clientY };
      this.mouse.pressStart = { x: e.clientX, y: e.clientY };
      this.mouse.moved = false;
      if (e.button === 0) this.mouse.down  = true;
      if (e.button === 2) this.mouse.rdown = true;
    });
    this.canvas.addEventListener('mousemove', e => {
      if (!this.interactionEnabled) return;
      const dx = e.clientX - this.mouse.last.x;
      const dy = e.clientY - this.mouse.last.y;
      // Only an active, deliberate drag should suppress atom selection. The
      // previous 2 px per-event check rejected many ordinary clicks.
      if ((this.mouse.down || this.mouse.rdown) && isPointerDrag(
        this.mouse.pressStart,
        { x: e.clientX, y: e.clientY },
      )) this.mouse.moved = true;
      if (this.mouse.down) {
        this.spherical.theta -= dx * 0.01;
        this.spherical.phi   = Math.max(0.05, Math.min(Math.PI - 0.05, this.spherical.phi - dy * 0.01));
        this.mouse.last = { x: e.clientX, y: e.clientY };
        this._updateCamera();
      }
      if (this.mouse.rdown) {
        this.panOffset.x -= dx * 0.03;
        this.panOffset.y += dy * 0.03;
        this.mouse.last = { x: e.clientX, y: e.clientY };
        this._updateCamera();
      }
    });
    this.canvas.addEventListener('mouseup', e => {
      if (!this.interactionEnabled) return;
      if (e.button === 0) { this.mouse.down  = false; }
      if (e.button === 2) { this.mouse.rdown = false; }
    });
    this.canvas.addEventListener('wheel', e => {
      if (!this.interactionEnabled) return;
      this.spherical.r = Math.max(3, Math.min(200, this.spherical.r + e.deltaY * 0.04));
      this._updateCamera();
    }, { passive: true });

    // Click = toggle selection (only if not dragging)
    this.canvas.addEventListener('click', e => {
      if (!this.interactionEnabled) return;
      if (this.mouse.moved) return;
      const rect = this.canvas.getBoundingClientRect();
      const nx   = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
      const ny   = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
      this.raycaster.setFromCamera({ x: nx, y: ny }, this.camera);
      const hits = this.raycaster.intersectObjects(periodicAtomTargets(this));
      if (hits.length) {
        this._toggleAtom(hits[0].object.userData.atomIdx);
      }
    });

    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    this._ro = new ResizeObserver(() => this.resizeRenderer());
    this._ro.observe(this.container);
  }

  resizeRenderer() {
    const w = this.container.clientWidth  || 600;
    const h = this.container.clientHeight || 400;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width  = w + 'px';
    this.canvas.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _animate() {
    this.animId = requestAnimationFrame(() => this._animate());
    this.renderer.render(this.scene, this.camera);
  }

  _updateCamera() {
    const { phi, theta, r } = this.spherical;
    this.camera.position.set(
      r * Math.sin(phi) * Math.sin(theta) + this.panOffset.x,
      r * Math.cos(phi) + this.panOffset.y,
      r * Math.sin(phi) * Math.cos(theta)
    );
    this.camera.lookAt(this.panOffset.x, this.panOffset.y, 0);
    this.camera.up.set(0, 1, 0);
  }

  setTheme(isLight) {
    this.isLight = isLight;
    this.renderer.setClearColor(this.isLight ? 0xf8fafc : 0x060810, 1);
    this.renderer.toneMappingExposure = this.isLight ? 1.12 : 1.0;
    if (this.ambientLight) this.ambientLight.intensity = this.isLight ? 0.72 : 0.45;
    if (this.keyLight) this.keyLight.intensity = this.isLight ? 1.1 : 0.9;
    if (this.fillLight) this.fillLight.intensity = this.isLight ? 0.42 : 0.3;
    this.atomMeshes.forEach(mesh => {
      if (!mesh.material) return;
      mesh.material.shininess = this.isLight ? 105 : 80;
      mesh.material.specular?.setHex(this.isLight ? 0x777777 : 0x444444);
      mesh.material.needsUpdate = true;
    });
    if (this.chemicalBondObject?.material) {
      this.chemicalBondObject.material.color.setHex(this.isLight ? 0x64748b : 0x9ca3af);
      this.chemicalBondObject.material.opacity = this.isLight ? 0.8 : 0.7;
    }
    const boxColor = this.isLight ? 0x94a3b8 : 0x1e4060;
    this.bondLines.forEach(line => {
      line.material.color.setHex(boxColor);
    });
  }

  setInteractionEnabled(enabled) {
    this.interactionEnabled = Boolean(enabled);
    if (!this.interactionEnabled) {
      this.mouse.down = false;
      this.mouse.rdown = false;
    }
  }

  // ─── Build structure from parseCIF result (uses cx/cy/cz = Cartesian Å) ─────
  buildStructure(parsed) {
    // Clear old objects
    clearPeriodicEdgeAtoms(this);
    this.atomMeshes.forEach(m => this.scene.remove(m));
    this.bondLines.forEach(l  => this.scene.remove(l));
    this.atomMeshes = [];
    this.bondLines  = [];
    this.selected.clear();
    this._selOrder = [];

    const atoms = parsed.atoms;
    if (!atoms.length) return;

    // Centroid in Cartesian space
    let sumx = 0, sumy = 0, sumz = 0;
    atoms.forEach(a => { sumx += a.cx; sumy += a.cy; sumz += a.cz; });
    const n = atoms.length;
    const ocx = sumx / n, ocy = sumy / n, ocz = sumz / n;
    this._centre = { cx: ocx, cy: ocy, cz: ocz };

    atoms.forEach((atom, idx) => {
      const el     = ELEMENTS[atom.element] || { r: 1.0, color: '#aaaaaa' };
      const radius = Math.min(el.r * 0.58, 0.82);
      const geo    = new THREE.SphereGeometry(radius, 18, 14);
      const mat    = new THREE.MeshPhongMaterial({
        color:     new THREE.Color(el.color),
        shininess: this.isLight ? 105 : 80,
        specular:  new THREE.Color(this.isLight ? 0x777777 : 0x444444),
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(atom.cx - ocx, atom.cy - ocy, atom.cz - ocz);
      mesh.userData = { atomIdx: idx, element: atom.element, origColor: new THREE.Color(el.color) };
      this.scene.add(mesh);
      this.atomMeshes.push(mesh);
    });

    setBondStructure(this, atoms.map(atom => ({
      element:atom.element,
      cart:{x:atom.cx,y:atom.cy,z:atom.cz},
      frac:Number.isFinite(Number(atom.x))?{x:Number(atom.x),y:Number(atom.y),z:Number(atom.z)}:null,
    })), parsed.lattMat, {x:ocx,y:ocy,z:ocz});

    // Unit-cell box from lattice matrix (if available)
    if (parsed.lattMat) {
      this._drawCellBox(parsed.lattMat, ocx, ocy, ocz);
    }

    // Auto-zoom to true Cartesian extent
    const cxs = atoms.map(a => a.cx);
    const cys = atoms.map(a => a.cy);
    const czs = atoms.map(a => a.cz);
    const span = Math.max(
      Math.max(...cxs) - Math.min(...cxs),
      Math.max(...cys) - Math.min(...cys),
      Math.max(...czs) - Math.min(...czs),
      6
    );
    this.spherical.r     = span * 1.8;
    this.panOffset       = { x: 0, y: 0 };
    this.spherical.phi   = 0.65;
    this.spherical.theta = 0.4;
    this._updateCamera();
  }

  // Draw unit-cell outline from lattice matrix rows
  _drawCellBox(M, ocx, ocy, ocz) {
    // Build 8 corner vectors
    const v = (xf, yf, zf) => new THREE.Vector3(
      M[0][0]*xf + M[0][1]*yf + M[0][2]*zf - ocx,
      M[1][0]*xf + M[1][1]*yf + M[1][2]*zf - ocy,
      M[2][0]*xf + M[2][1]*yf + M[2][2]*zf - ocz,
    );
    const corners = [
      v(0,0,0), v(1,0,0), v(0,1,0), v(1,1,0),
      v(0,0,1), v(1,0,1), v(0,1,1), v(1,1,1),
    ];
    const edges = [[0,1],[0,2],[0,4],[1,3],[1,5],[2,3],[2,6],[3,7],[4,5],[4,6],[5,7],[6,7]];
    const boxColor = this.isLight ? 0x94a3b8 : 0x1e4060;
    const mat   = new THREE.LineBasicMaterial({ color: boxColor, transparent: true, opacity: 0.55 });
    edges.forEach(([a, b]) => {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([corners[a], corners[b]]), mat
      );
      this.scene.add(line);
      line.visible = this.unitCellVisible;
      this.bondLines.push(line);
    });
  }

  // ─── Multi-selection ─────────────────────────────────────────────────────────
  _toggleAtom(idx) {
    if (this.selected.has(idx)) {
      // Deselect
      this._selOrder = this._selOrder.filter(i => i !== idx);
      this.selected.delete(idx);
    } else {
      this._selOrder.push(idx);
      this.selected.set(idx, this._selOrder.length - 1);
    }
    this._refreshVisuals();
    if (this.onSelectionChange) this.onSelectionChange(this.getSelectedIndices());
  }

  _refreshVisuals() {
    this.atomMeshes.forEach((mesh, idx) => {
      const ord   = this.selected.get(idx);
      const isSel = ord !== undefined;
      if (isSel) {
        const col = SEL_COLORS[ord % SEL_COLORS.length];
        mesh.material.emissive.setHex(col);
        mesh.material.emissiveIntensity = 0.55;
        mesh.scale.setScalar(1.3);
      } else {
        mesh.material.emissive.setHex(0x000000);
        mesh.material.emissiveIntensity = 0;
        mesh.scale.setScalar(1.0);
      }
    });
    syncPeriodicEdgeAtoms(this);
  }

  clearSelection() {
    this.selected.clear();
    this._selOrder = [];
    this._refreshVisuals();
    if (this.onSelectionChange) this.onSelectionChange([]);
  }

  selectAll() {
    this.selected.clear();
    this._selOrder = [];
    this.atomMeshes.forEach((_, idx) => {
      this._selOrder.push(idx);
      this.selected.set(idx, idx);
    });
    this._refreshVisuals();
    if (this.onSelectionChange) this.onSelectionChange(this.getSelectedIndices());
  }

  getSelectedIndices() {
    return [...this._selOrder];
  }

  // Highlight a specific atom from outside (e.g. hover in list) — no selection change
  highlightHover(idx) {
    this.atomMeshes.forEach((mesh, i) => {
      if (!this.selected.has(i)) {
        mesh.material.color.copy(mesh.userData.origColor);
      }
    });
    if (idx >= 0 && !this.selected.has(idx) && this.atomMeshes[idx]) {
      this.atomMeshes[idx].material.color.setHex(0xffffff);
    }
  }

  dispose() {
    if (this.animId) cancelAnimationFrame(this.animId);
    disposePeriodicEdgeAtoms(this);
    disposeBonding(this);
    if (this._ro) this._ro.disconnect();
    this.renderer.dispose();
  }
}
