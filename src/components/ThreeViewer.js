import * as THREE from 'three';
import { ELEMENTS } from '../data/elements.js';
import { disposeBonding, setBondStructure, setupBonding } from '../lib/bonding.js';
import { setupUnitCellVisibility } from '../lib/unitCellVisibility.js';
import { clearPeriodicEdgeAtoms, disposePeriodicEdgeAtoms, periodicAtomTargets, setupPeriodicEdgeAtoms, syncPeriodicEdgeAtoms } from '../lib/periodicEdgeAtoms.js';

export class ThreeViewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.container = canvas.parentElement;
    this.atomMeshes = [];
    this.bondLines = [];
    this.fixedCages = []; // Visual cages for frozen atoms
    this.selectedMeshIndices = new Set();
    this.animId = null;
    this.onSelectAtomCallback = null;
    this.onContextMenuCallback = null;

    this.mouse = { down: false, rdown: false, last: { x: 0, y: 0 } };
    this.sphericalRot = { phi: 0.6, theta: 0.4, r: 30 };
    this.panOffset = { x: 0, y: 0 };
    this.isLight = document.documentElement.classList.contains('light-mode');

    this._setupRenderer();
    this._setupLights();
    this._setupEvents();
    setupBonding(this);
    setupUnitCellVisibility(this);
    setupPeriodicEdgeAtoms(this);
    this.resizeRenderer();
    this._animate();
  }

  _setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.isLight ? 1.12 : 1.0;
    this.renderer.setClearColor(this.isLight ? 0xf8fafc : 0x060810, 1);
    this.scene = new THREE.Scene();
    const w = this.container.clientWidth || 400;
    const h = this.container.clientHeight || 400;
    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 500);
    this.raycaster = new THREE.Raycaster();
  }

  _setupLights() {
    this.ambientLight = new THREE.AmbientLight(0xffffff, this.isLight ? 0.72 : 0.45);
    this.scene.add(this.ambientLight);
    this.keyLight = new THREE.DirectionalLight(0xffffff, this.isLight ? 1.1 : 0.9);
    this.keyLight.position.set(10, 20, 15); this.scene.add(this.keyLight);
    this.fillLight = new THREE.DirectionalLight(0x4488ff, this.isLight ? 0.42 : 0.3);
    this.fillLight.position.set(-10, -5, -10); this.scene.add(this.fillLight);
  }

  _setupEvents() {
    this.canvas.addEventListener('mousedown', e => {
      this.mouse.last = { x: e.clientX, y: e.clientY };
      if (e.button === 0) this.mouse.down = true;
      if (e.button === 2) this.mouse.rdown = true;
    });
    this.canvas.addEventListener('mousemove', e => {
      if (this.mouse.down) {
        const dx = e.clientX - this.mouse.last.x;
        const dy = e.clientY - this.mouse.last.y;
        this.sphericalRot.theta -= dx * 0.01;
        this.sphericalRot.phi = Math.max(0.05, Math.min(Math.PI - 0.05, this.sphericalRot.phi - dy * 0.01));
        this.mouse.last = { x: e.clientX, y: e.clientY };
        this._updateCamera();
      }
      if (this.mouse.rdown) {
        const dx = e.clientX - this.mouse.last.x;
        const dy = e.clientY - this.mouse.last.y;
        this.panOffset.x -= dx * 0.03;
        this.panOffset.y += dy * 0.03;
        this.mouse.last = { x: e.clientX, y: e.clientY };
        this._updateCamera();
      }
    });
    this.canvas.addEventListener('mouseup', () => { this.mouse.down = false; this.mouse.rdown = false; });
    this.canvas.addEventListener('wheel', e => {
      this.sphericalRot.r = Math.max(3, Math.min(200, this.sphericalRot.r + e.deltaY * 0.04));
      this._updateCamera();
    }, { passive: true });
    this.canvas.addEventListener('click', e => {
      const rect = this.canvas.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera({ x: nx, y: ny }, this.camera);
      const hits = this.raycaster.intersectObjects(periodicAtomTargets(this));
      const multi = e.shiftKey || e.ctrlKey || e.metaKey;
      if (hits.length) {
        this.selectAtom(hits[0].object.userData.atomIdx, multi);
      } else {
        if (!multi) this.selectAtom(-1, false);
      }
    });
    this.canvas.addEventListener('contextmenu', e => {
      e.preventDefault();
      // If clicking an atom with right click, select it first if not already selected
      const rect = this.canvas.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera({ x: nx, y: ny }, this.camera);
      const hits = this.raycaster.intersectObjects(periodicAtomTargets(this));
      if (hits.length) {
        const idx = hits[0].object.userData.atomIdx;
        if (!this.selectedMeshIndices.has(idx)) {
          this.selectAtom(idx, false);
        }
      }
      if (this.onContextMenuCallback) {
        this.onContextMenuCallback(e);
      }
    });
    this._resizeObserver = new ResizeObserver(() => this.resizeRenderer());
    this._resizeObserver.observe(this.container);
  }

  resizeRenderer() {
    const w = this.container.clientWidth || 400;
    const h = this.container.clientHeight || 400;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _animate() {
    this.animId = requestAnimationFrame(() => this._animate());
    this.renderer.render(this.scene, this.camera);
  }

  _updateCamera() {
    const { phi, theta, r } = this.sphericalRot;
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

  buildStructure(cifData) {
    clearPeriodicEdgeAtoms(this);
    this.atomMeshes.forEach(m => this.scene.remove(m));
    this.bondLines.forEach(l => this.scene.remove(l));
    if (this.fixedCages) this.fixedCages.forEach(c => this.scene.remove(c));
    this.atomMeshes = [];
    this.bondLines = [];
    this.fixedCages = [];
    this.selectedMeshIndices.clear();

    const { cell, atoms, mat } = cifData;
    const n = atoms.length || 1;
    let cx = 0, cy = 0, cz = 0;
    atoms.forEach(a => { cx += a.x; cy += a.y; cz += a.z; });
    cx /= n; cy /= n; cz /= n;

    this._drawCellBox(mat, cx, cy, cz);

    atoms.forEach((atom, idx) => {
      const el = ELEMENTS[atom.sym] || { r: 1.0, color: '#aaaaaa' };
      const radius = Math.min(el.r * 0.6, 0.8);
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 16, 12),
        new THREE.MeshPhongMaterial({ color: new THREE.Color(el.color), shininess: this.isLight ? 105 : 80, specular: new THREE.Color(this.isLight ? 0x777777 : 0x444444) })
      );
      mesh.position.set(atom.x - cx, atom.y - cy, atom.z - cz);
      mesh.userData = { atomIdx: idx };
      this.scene.add(mesh);
      this.atomMeshes.push(mesh);

      // Render wireframe cage if atom is fixed
      if (atom.fixed) {
        const cageGeo = new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(radius * 1.3, 1));
        const cageMat = new THREE.LineBasicMaterial({ color: 0xff3366, transparent: true, opacity: 0.6 });
        const cage = new THREE.LineSegments(cageGeo, cageMat);
        cage.position.copy(mesh.position);
        this.scene.add(cage);
        this.fixedCages.push(cage);
      }
    });

    setBondStructure(this, atoms.map(atom => ({
      element: atom.sym,
      cart: { x:atom.x, y:atom.y, z:atom.z },
      frac: Number.isFinite(atom.fx) ? { x:atom.fx, y:atom.fy, z:atom.fz } : null,
    })), mat, { x:cx, y:cy, z:cz });

    const maxDim = Math.max(cell.a, cell.b, cell.c);
    this.sphericalRot.r = maxDim * 2.5;
    this.panOffset = { x: 0, y: 0 };
    this._updateCamera();
  }

  _drawCellBox(mat, cx, cy, cz) {
    const v0 = new THREE.Vector3(0, 0, 0);
    const v1 = new THREE.Vector3(mat[0][0], mat[1][0], mat[2][0]);
    const v2 = new THREE.Vector3(mat[0][1], mat[1][1], mat[2][1]);
    const v3 = new THREE.Vector3(mat[0][2], mat[1][2], mat[2][2]);
    const corners = [v0, v1, v2, v1.clone().add(v2), v3, v1.clone().add(v3), v2.clone().add(v3), v1.clone().add(v2).add(v3)];
    const edges = [[0,1],[0,2],[0,4],[1,3],[1,5],[2,3],[2,6],[3,7],[4,5],[4,6],[5,7],[6,7]];
    const boxColor = this.isLight ? 0x94a3b8 : 0x1e4060;
    const mat2 = new THREE.LineBasicMaterial({ color: boxColor, transparent: true, opacity: 0.7 });
    const offset = new THREE.Vector3(cx, cy, cz);
    edges.forEach(([a, b]) => {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([corners[a].clone().sub(offset), corners[b].clone().sub(offset)]),
        mat2
      );
      this.scene.add(line);
      line.visible = this.unitCellVisible;
      this.bondLines.push(line);
    });
  }

  selectAtom(idx, toggle = false) {
    if (!toggle) {
      this.selectedMeshIndices.forEach(i => {
        if (this.atomMeshes[i]) {
          this.atomMeshes[i].material.emissive.setHex(0x000000);
          this.atomMeshes[i].scale.setScalar(1);
        }
      });
      this.selectedMeshIndices.clear();
    }

    if (idx >= 0) {
      if (toggle && this.selectedMeshIndices.has(idx)) {
        this.selectedMeshIndices.delete(idx);
        if (this.atomMeshes[idx]) {
          this.atomMeshes[idx].material.emissive.setHex(0x000000);
          this.atomMeshes[idx].scale.setScalar(1);
        }
      } else {
        this.selectedMeshIndices.add(idx);
        if (this.atomMeshes[idx]) {
          this.atomMeshes[idx].material.emissive.setHex(0x00d4ff);
          this.atomMeshes[idx].material.emissiveIntensity = 0.4;
          this.atomMeshes[idx].scale.setScalar(1.25);
        }
      }
    }

    syncPeriodicEdgeAtoms(this);
    if (this.onSelectAtomCallback) this.onSelectAtomCallback(Array.from(this.selectedMeshIndices));
  }

  dispose() {
    if (this.animId) cancelAnimationFrame(this.animId);
    if (this._resizeObserver) this._resizeObserver.disconnect();
    disposePeriodicEdgeAtoms(this);
    disposeBonding(this);
    this.renderer.dispose();
  }
}
