import * as THREE from 'three';
import { ELEMENTS } from '../data/elements.js';
import { VisSelectViewer } from './VisSelectViewer.js';

export class IntermediatePlacementViewer extends VisSelectViewer {
  constructor(canvas) {
    super(canvas);
    this.activeIndex = -1;
    this.viewLocked = false;
    this.placementObjects = [];
    this.onAnchorMove = null;
    this.onIntermediateClick = null;
    this.draggingAnchor = false;
    this._down = event => this._handleDown(event);
    this._move = event => this._handleMove(event);
    this._up = () => this._handleUp();
    this.canvas.addEventListener('pointerdown', this._down);
    this.canvas.addEventListener('pointermove', this._move);
    window.addEventListener('pointerup', this._up);
  }

  _toggleAtom(index) {
    if (this.viewLocked) return;
    this.selected.clear();
    this._selOrder = [index];
    this.selected.set(index, 0);
    this.activeIndex = index;
    this._refreshVisuals();
    this.onSelectionChange?.([index]);
  }

  setViewLocked(locked) {
    this.viewLocked = Boolean(locked);
    this.setInteractionEnabled(!this.viewLocked);
    this.canvas.classList.toggle('placement-locked', this.viewLocked);
  }

  clearPlacement() {
    this.placementObjects.forEach(object => {
      this.scene.remove(object);
      object.geometry?.dispose();
      object.material?.map?.dispose();
      object.material?.dispose();
    });
    this.placementObjects = [];
    this.dragTargets = [];
    this.guideShell = null;
  }

  _label(text, position) {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 76;
    const context = canvas.getContext('2d');
    context.fillStyle = 'rgba(6,8,16,.86)'; context.roundRect(8,8,240,60,13); context.fill();
    context.strokeStyle = '#67e8f9'; context.lineWidth = 3; context.stroke();
    context.fillStyle = '#e0f2fe'; context.font = '600 29px ui-monospace,monospace'; context.textAlign='center'; context.textBaseline='middle'; context.fillText(text,128,38);
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map:texture, transparent:true, depthTest:false }));
    sprite.position.copy(position); sprite.position.y += .55; sprite.scale.set(2.5,.74,1);
    return sprite;
  }

  showAnchor({ activeIndex, distance, direction, atoms = [], showAtoms = false, showClearance = true, clearanceRadius = 1.2, valid = true }) {
    this.clearPlacement();
    this.activeIndex = activeIndex;
    const activeMesh = this.atomMeshes[activeIndex];
    if (!activeMesh) return;
    const unit = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();
    const anchor = activeMesh.position.clone().addScaledVector(unit, distance);

    this.guideShell = new THREE.Mesh(new THREE.SphereGeometry(distance,32,20), new THREE.MeshBasicMaterial({ transparent:true, opacity:0, depthWrite:false }));
    this.guideShell.position.copy(activeMesh.position); this.scene.add(this.guideShell); this.placementObjects.push(this.guideShell);

    const anchorMesh = new THREE.Mesh(new THREE.SphereGeometry(.22,20,16), new THREE.MeshPhongMaterial({ color:valid?0x22d3ee:0xfb7185, emissive:valid?0x22d3ee:0xfb7185, emissiveIntensity:.9 }));
    anchorMesh.position.copy(anchor); anchorMesh.userData.anchor=true; this.scene.add(anchorMesh); this.placementObjects.push(anchorMesh);

    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([activeMesh.position.clone(),anchor.clone()]), new THREE.LineBasicMaterial({ color:valid?0x22d3ee:0xfb7185 }));
    this.scene.add(line); this.placementObjects.push(line);
    const label = this._label(`${distance.toFixed(2)} Å`, anchor); this.scene.add(label); this.placementObjects.push(label);

    if (showClearance) {
      const bubble = new THREE.Mesh(new THREE.SphereGeometry(clearanceRadius,28,18), new THREE.MeshBasicMaterial({ color:valid?0x34d399:0xfb7185, wireframe:true, transparent:true, opacity:.2, side:THREE.DoubleSide }));
      bubble.position.copy(anchor); this.scene.add(bubble); this.placementObjects.push(bubble);
    }

    const centre = this._centre || { cx:0,cy:0,cz:0 };
    const atomMeshes = showAtoms ? atoms.map((atom,index) => {
      const element = ELEMENTS[atom.element] || { r:1,color:'#aaa' };
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(Math.min(element.r*.58,.75),20,16), new THREE.MeshPhongMaterial({ color:valid?new THREE.Color(element.color):0xf87171, emissive:atom.binding?0xf59e0b:0x8b5cf6, emissiveIntensity:atom.binding?.95:.58 }));
      mesh.position.set(atom.x-centre.cx,atom.y-centre.cy,atom.z-centre.cz); mesh.userData.intermediateAtom=index; this.scene.add(mesh); this.placementObjects.push(mesh); return mesh;
    }) : [];
    this.dragTargets = [anchorMesh, ...atomMeshes];
  }

  _pointer(event) {
    const rect=this.canvas.getBoundingClientRect();
    return { x:((event.clientX-rect.left)/rect.width)*2-1, y:-((event.clientY-rect.top)/rect.height)*2+1 };
  }

  _handleDown(event) {
    if (!this.viewLocked || event.button!==0 || !this.dragTargets?.length) return;
    this.raycaster.setFromCamera(this._pointer(event),this.camera);
    if (!this.raycaster.intersectObjects(this.dragTargets).length) return;
    this.draggingAnchor=true; this.canvas.classList.add('dragging-placement-sphere'); event.preventDefault();
  }

  _handleMove(event) {
    if (!this.draggingAnchor || !this.guideShell) return;
    this.raycaster.setFromCamera(this._pointer(event),this.camera);
    const hit=this.raycaster.intersectObject(this.guideShell)[0]; if(!hit)return;
    const direction=hit.point.clone().sub(this.guideShell.position).normalize();
    this.onAnchorMove?.({x:direction.x,y:direction.y,z:direction.z});
  }

  _handleUp() { this.draggingAnchor=false; this.canvas.classList.remove('dragging-placement-sphere'); }

  buildStructure(parsed) { this.clearPlacement(); super.buildStructure(parsed); }
  dispose() {
    this.canvas.removeEventListener('pointerdown',this._down); this.canvas.removeEventListener('pointermove',this._move); window.removeEventListener('pointerup',this._up);
    this.clearPlacement(); super.dispose();
  }
}
