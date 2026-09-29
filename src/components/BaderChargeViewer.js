import * as THREE from 'three';
import { VisSelectViewer } from './VisSelectViewer.js';
import { ELEMENTS } from '../data/elements.js';
import { baderLabelParts, chargeColour, CHARGE_PALETTE, containedVerticalFov, placeLabel, unselectedAtomAppearance } from '../lib/baderVisualization.js';
import { renderBonds } from '../lib/bonding.js';
import { periodicAtomTargets, syncPeriodicEdgeAtoms } from '../lib/periodicEdgeAtoms.js';

export class BaderChargeViewer extends VisSelectViewer {
  constructor(canvas) {
    super(canvas);
    this.chargeLabels = []; this.chargeRings = []; this.elementLegend = [];
    this.records = []; this.labelScale = 1; this.inspectedIndex = null;
    this.inspector = document.createElement('div');
    this.inspector.className = 'bca-inspector';
    this.inspector.setAttribute('role', 'status');
    this.container.appendChild(this.inspector);
    this.gradientLegend = document.createElement('div');
    this.gradientLegend.className = 'bca-gradient-key';
    this.container.querySelector('.bca-legend')?.appendChild(this.gradientLegend);
    this._inspectEmpty = event => {
      if (this.mouse.moved || !this.interactionEnabled) return;
      const rect = this.canvas.getBoundingClientRect();
      this.raycaster.setFromCamera({ x:(event.clientX-rect.left)/rect.width*2-1, y:1-(event.clientY-rect.top)/rect.height*2 }, this.camera);
      if (!this.raycaster.intersectObjects(periodicAtomTargets(this)).length) this.clearSelection();
    };
    this.canvas.addEventListener('click', this._inspectEmpty);
    this._refreshInspector();
  }

  // Bader uses inspection only; the shared multi-selection behaviour is not used.
  _toggleAtom(index) {
    this.inspectedIndex = this.inspectedIndex === index ? null : index;
    this._refreshInspector();
  }
  clearSelection() { this.inspectedIndex = null; this._refreshInspector(); }
  invalidateLabelLayout() { this._layoutKey = null; }
  _refreshInspector() {
    this.atomMeshes.forEach((mesh, index) => {
      mesh.material.emissive.setHex(index === this.inspectedIndex ? 0x777777 : 0);
      mesh.material.emissiveIntensity = index === this.inspectedIndex ? .15 : 0;
      mesh.scale.setScalar(1);
    });
    if (!this.inspector) return;
    const record = this.records?.[this.inspectedIndex];
    this.inspector.textContent = record
      ? 'Atom #' + record.index + ' · ' + record.element + '\nBader charge: ' + (record.baderCharge >= 0 ? '+' : '') + record.baderCharge.toFixed(4) + ' e\n' + (Math.abs(record.baderCharge) < 1e-8 ? 'Neutral' : record.baderCharge > 0 ? 'Electron loss' : 'Electron gain')
      : 'Click an atom to inspect its element and charge.';
    this._layoutKey = null;
  }
  _clearLabels() {
    [...(this.chargeLabels || []), ...(this.chargeRings || [])].forEach(item => {
      this.scene.remove(item); item.material.map?.dispose(); item.material.dispose();
    });
    this.chargeLabels = []; this.chargeRings = [];
    if (this.labelLeaders) {
      this.scene.remove(this.labelLeaders);
      this.labelLeaders.geometry.dispose(); this.labelLeaders.material.dispose();
      this.labelLeaders = null;
    }
    this._layoutKey = null;
  }
  _makeLabel(text, color, role='outside') {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = '600 24px sans-serif';
    canvas.width = Math.ceil(context.measureText(text).width) + 16; canvas.height = 38;
    context.font = '600 24px sans-serif';
    context.textAlign = 'center'; context.textBaseline = 'middle';
    context.strokeStyle = this.isLight ? 'rgba(255,255,255,.96)' : 'rgba(5,10,20,.96)';
    context.lineWidth = 5; context.lineJoin = 'round';
    context.strokeText(text,canvas.width/2,19);
    context.fillStyle = role === 'outside' ? color : (this.isLight ? '#172033' : '#ffffff');
    context.fillText(text,canvas.width/2,19);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map:new THREE.CanvasTexture(canvas), transparent:true, depthTest:false, depthWrite:false,
      toneMapped:false,
    }));
    sprite.userData.width = canvas.width / 2 * this.labelScale;
    sprite.userData.height = 19 * this.labelScale;
    sprite.userData.role = role;
    return sprite;
  }
  _makeRing(color,intensity,size,style='faded',fadeAmount=.6){const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const context=canvas.getContext('2d');const fade=Math.max(0,Math.min(1,fadeAmount));context.beginPath();context.arc(64,64,48,0,Math.PI*2);context.strokeStyle=color;context.lineWidth=style==='sharp'?6+intensity*5:5+intensity*7;context.shadowColor=color;context.shadowBlur=style==='sharp'?0:6+fade*30+intensity*8;context.globalAlpha=style==='sharp'?.95:.9-fade*.42;context.stroke();const texture=new THREE.CanvasTexture(canvas);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:true,depthWrite:false,blending:style==='sharp'?THREE.NormalBlending:THREE.AdditiveBlending}));sprite.scale.set(size,size,1);return sprite;}
  applyCharges(records, labelMode='both', labelScale=1, options={}) {
    this._clearLabels();
    this.records = records; this.labelMode = labelMode; this.chargeOptions = { ...options };
    this.labelScale = Math.max(.5,Math.min(2,Number(labelScale)||1));
    this.representation = options.representation || 'ring';
    this.colourStyle = options.colourStyle || 'solid';
    this.glowStyle = options.glowStyle || 'faded';
    this.fadeAmount = Number.isFinite(Number(options.fadeAmount)) ? Math.max(0,Math.min(1,Number(options.fadeAmount))) : .6;
    this.selectedIndices = new Set(options.selectedIndices ?? records.map((_,index)=>index));
    this.unselectedMode = options.unselectedMode || 'keep';
    this.labelPlacement = options.labelPlacement || 'outside';
    this.labelVisibility = options.labelVisibility || 'dynamic';
    const unselected = unselectedAtomAppearance(this.unselectedMode);
    const selectedRecords = records.filter((_,index)=>this.selectedIndices.has(index));
    this.chargeRange = {
      min:Math.min(0,...selectedRecords.map(record=>record.baderCharge)),
      max:Math.max(0,...selectedRecords.map(record=>record.baderCharge)),
    };
    this.chargeLimit = Math.max(0,...selectedRecords.map(record => Math.abs(record.baderCharge)));
    this.elementLegend = [...new Set(selectedRecords.map(record=>record.element))].map(element=>({element,color:ELEMENTS[element]?.color||'#aaaaaa'}));
    records.forEach((record,index) => {
      const mesh = this.atomMeshes[index]; if (!mesh) return;
      mesh.material.color.copy(mesh.userData.origColor);
      mesh.material.emissive.setHex(0); mesh.material.emissiveIntensity=0; mesh.scale.setScalar(1);
      mesh.visible = this.selectedIndices.has(index) || unselected.visible;
      mesh.layers.set(mesh.visible ? 0 : 1);
      if (!this.selectedIndices.has(index)) {
        if (unselected.colour) mesh.material.color.set(unselected.colour);
        return;
      }
      const intensity = Math.min(1,Math.abs(record.baderCharge)/Math.max(this.chargeLimit,1e-8));
      mesh.material.color.copy(this.representation === 'atom'
        ? new THREE.Color(chargeColour(record.baderCharge,this.chargeRange,this.colourStyle)) : mesh.userData.origColor);
      if (this.representation === 'ring' && Math.abs(record.baderCharge) > 1e-8) {
        const radius = Math.min((ELEMENTS[record.element]?.r||1)*.58,.82);
        const ring = this._makeRing(record.baderCharge > 0 ? CHARGE_PALETTE.loss : CHARGE_PALETTE.gain,intensity,radius*2.75+.38,this.glowStyle,this.fadeAmount);
        ring.position.copy(mesh.position); this.scene.add(ring); this.chargeRings.push(ring);
      }
      for (const part of baderLabelParts(labelMode,this.labelPlacement,record)) {
        const label = this._makeLabel(part.text,chargeColour(record.baderCharge,this.chargeRange),part.role);
        label.userData.atomIndex = index;
        this.scene.add(label); this.chargeLabels.push(label);
      }
    });
    if(this.inspectedIndex!==null&&!this.atomMeshes[this.inspectedIndex]?.visible)this.inspectedIndex=null;
    this.bondAtomVisible=this.unselectedMode==='hide'?index=>this.selectedIndices.has(index):null;
    renderBonds(this);
    this.labelLeaders = new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({
      color:this.isLight ? 0x64748b : 0x94a3b8, transparent:true, opacity:.55, depthTest:false, depthWrite:false,
    }));
    this.scene.add(this.labelLeaders);
    if (this.gradientLegend) {
      this.gradientLegend.hidden = this.representation !== 'atom' || this.colourStyle !== 'gradient';
      this.gradientLegend.replaceChildren();
      const title = document.createElement('div'); title.textContent = 'Bader charge (e)';
      const bar = document.createElement('div'); bar.className = 'bca-gradient-bar';
      const values = document.createElement('div'); values.className = 'bca-gradient-values';
      for (const value of [this.chargeRange.min,0,this.chargeRange.max]) {
        const label = document.createElement('span'); label.textContent = (value > 0 ? '+' : '') + value.toFixed(3); values.appendChild(label);
      }
      this.gradientLegend.append(title,bar,values);
    }
    syncPeriodicEdgeAtoms(this);
    this._refreshInspector(); this._updateLabelVisibility();
  }
  _legendDimensions(scale) {
    const count = (this.representation === 'ring' ? this.elementLegend.length : 0) + 2;
    return { width:240*scale, height:(28+count*30+(this.representation==='atom'&&this.colourStyle==='gradient'?70:0))*scale };
  }
  _updateLabelVisibility(width=this.canvas.clientWidth||600,height=this.canvas.clientHeight||400,scale=1,exporting=false) {
    if (!this.chargeLabels?.length) return;
    this.camera.updateMatrixWorld();
    const key = [width,height,scale,exporting,this.inspectedIndex,this.labelPlacement,this.labelVisibility,this.camera.matrixWorld.elements.join(','),this.camera.projectionMatrix.elements.join(',')].join('|');
    if (key === this._layoutKey) return;
    this._layoutKey = key;
    const focal = height / (2*Math.tan(THREE.MathUtils.degToRad(this.camera.fov)/2));
    const projected = this.atomMeshes.map(mesh => {
      const cameraPosition = mesh.position.clone().applyMatrix4(this.camera.matrixWorldInverse);
      const p = mesh.position.clone().project(this.camera);
      const depth = -cameraPosition.z;
      return { x:(p.x*.5+.5)*width, y:(.5-p.y*.5)*height, z:p.z, depth,
        radius:Math.min((ELEMENTS[mesh.userData.element]?.r||1)*.58,.82)*focal/Math.max(depth,.001) };
    });
    const inView = p => p.depth>0 && p.z>=-1 && p.z<=1 && p.x>=0 && p.x<=width && p.y>=0 && p.y<=height;
    const obstacles = projected.filter((p,index)=>this.atomMeshes[index].visible&&inView(p)).map(p=>({left:p.x-p.radius,right:p.x+p.radius,top:p.y-p.radius,bottom:p.y+p.radius}));
    if (exporting) {
      const size=this._legendDimensions(scale);
      obstacles.push({left:18*scale,right:(18*scale)+size.width,top:height-size.height-18*scale,bottom:height});
    } else {
      const canvasRect=this.canvas.getBoundingClientRect();
      this.container.querySelectorAll('.bca-legend, .bca-inspector, .bond-ui').forEach(node=>{
        const r=node.getBoundingClientRect();
        obstacles.push({left:r.left-canvasRect.left,right:r.right-canvasRect.left,top:r.top-canvasRect.top,bottom:r.bottom-canvasRect.top});
      });
    }
    const ordered=[...this.chargeLabels].sort((a,b)=>{
      const ai=a.userData.atomIndex,bi=b.userData.atomIndex;
      if (ai===this.inspectedIndex) return -1;
      if (bi===this.inspectedIndex) return 1;
      return projected[ai].depth-projected[bi].depth;
    });
    const points=[];
    for (const label of ordered) {
      const index=label.userData.atomIndex,p=projected[index];
      label.visible=false;
      if (!inView(p)) continue;
      const w=label.userData.width*scale,h=label.userData.height*scale;
      const toWorld=(x,y)=>new THREE.Vector3(x/width*2-1,1-y/height*2,p.z).unproject(this.camera);
      const occluded=projected.some((other,j)=>j!==index&&this.atomMeshes[j].visible&&inView(other)&&other.depth<p.depth&&Math.hypot(p.x-other.x,p.y-other.y)<other.radius);
      if (label.userData.role === 'centre') {
        if (this.labelVisibility === 'dynamic' && occluded) continue;
        label.position.copy(this.atomMeshes[index].position);
        label.scale.set(w*p.depth/focal,h*p.depth/focal,1); label.visible=true;
        continue;
      }
      // A nearer atom covering the anchor also hides that atom's label.
      if (this.labelVisibility === 'dynamic' && occluded) continue;
      const placement=this.labelVisibility === 'all'
        ? {x:p.x,y:Math.max(h/2,p.y-p.radius-7*scale-h/2),box:{left:p.x-w/2,right:p.x+w/2,top:p.y-p.radius-7*scale-h,bottom:p.y-p.radius-7*scale}}
        : placeLabel(p,w,h,obstacles,{width,height,scale});
      if (!placement) continue;
      label.position.copy(toWorld(placement.x,placement.y));
      label.scale.set(w*p.depth/focal,h*p.depth/focal,1);
      label.visible=true; if(this.labelVisibility === 'dynamic') obstacles.push(placement.box);
      const dx=placement.x-p.x,dy=placement.y-p.y,distance=Math.hypot(dx,dy);
      if(distance>0) points.push(toWorld(p.x+dx/distance*p.radius,p.y+dy/distance*p.radius),
        toWorld(Math.max(placement.box.left,Math.min(p.x,placement.box.right)),Math.max(placement.box.top,Math.min(p.y,placement.box.bottom))));
    }
    this.labelLeaders.geometry.dispose();
    this.labelLeaders.geometry=new THREE.BufferGeometry().setFromPoints(points);
  }
  _animate() {
    this.animId=requestAnimationFrame(()=>this._animate());
    if (this._exporting) return;
    this._updateLabelVisibility(); this.renderer.render(this.scene,this.camera);
  }
  setTheme(isLight) {
    super.setTheme(isLight);
    if (this.records?.length) this.applyCharges(this.records,this.labelMode,this.labelScale,this.chargeOptions);
  }
  async exportPNG(widthPx,heightPx,{transparent=false}={}) {
    if(this._exporting) throw new Error('An image export is already in progress.');
    const gl=this.renderer.getContext();
    const viewport=gl.getParameter(gl.MAX_VIEWPORT_DIMS);
    const maxSize=Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),gl.getParameter(gl.MAX_TEXTURE_SIZE));
    if(widthPx>Math.min(maxSize,viewport[0])||heightPx>Math.min(maxSize,viewport[1])||widthPx*heightPx>64000000) {
      throw new Error('Requested image exceeds this GPU/browser export limit. Reduce the dimensions or DPI.');
    }
    const previousRatio=this.renderer.getPixelRatio();
    const previousColour=this.renderer.getClearColor(new THREE.Color());
    const previousAlpha=this.renderer.getClearAlpha();
    const previousBackground=this.scene.background;
    const previousAspect=this.camera.aspect;
    const previousFov=this.camera.fov;
    this._exporting=true;
    const scale=widthPx/(this.canvas.clientWidth||600);
    try {
      // Export pixels must not be multiplied again by the display's device ratio.
      this.renderer.setPixelRatio(1);
      if(transparent){this.scene.background=null;this.renderer.setClearColor(0x000000,0);}
      this.renderer.setSize(widthPx,heightPx,false);
      const exportAspect=widthPx/heightPx;
      this.camera.fov=containedVerticalFov(previousFov,previousAspect,exportAspect);
      this.camera.aspect=exportAspect; this.camera.updateProjectionMatrix();
      this._layoutKey=null;
      this._updateLabelVisibility(widthPx,heightPx,scale,true);
      this.renderer.render(this.scene,this.camera);
      const output=document.createElement('canvas'); output.width=widthPx; output.height=heightPx;
      const context=output.getContext('2d'); context.drawImage(this.canvas,0,0,widthPx,heightPx);
      const items=[...(this.representation==='ring'?this.elementLegend.map(item=>({label:item.element,color:item.color})):[]),
        {label:'loss (+)',color:CHARGE_PALETTE.loss,ring:this.representation==='ring'},
        {label:'gain (−)',color:CHARGE_PALETTE.gain,ring:this.representation==='ring'}];
      const size=this._legendDimensions(scale),x=18*scale,y=heightPx-size.height-18*scale;
      context.fillStyle=this.isLight?'rgba(255,255,255,.97)':'rgba(8,12,22,.95)';
      if(!transparent){context.beginPath();context.roundRect(x,y,size.width,size.height,8*scale);context.fill();}
      context.font='600 '+(12*scale)+'px sans-serif';
      const textColour=transparent||this.isLight?'#172033':'#ffffff';
      items.forEach((item,index)=>{
        const cy=y+(28+index*30)*scale;
        context.beginPath();context.arc(x+18*scale,cy,5*scale,0,Math.PI*2);
        if(item.ring){context.strokeStyle=item.color;context.lineWidth=2*scale;context.stroke();}
        else{context.fillStyle=item.color;context.fill();}
        context.fillStyle=textColour;context.fillText(item.label,x+32*scale,cy+4*scale);
      });
      if (this.representation==='atom' && this.colourStyle==='gradient') {
        const by=y+(28+items.length*30)*scale,bx=x+12*scale,bw=size.width-24*scale;
        context.fillStyle=textColour;context.fillText('Bader charge (e)',bx,by);
        const gradient=context.createLinearGradient(bx,0,bx+bw,0);
        gradient.addColorStop(0,CHARGE_PALETTE.gain);gradient.addColorStop(.5,CHARGE_PALETTE.neutral);gradient.addColorStop(1,CHARGE_PALETTE.loss);
        context.fillStyle=gradient;context.fillRect(bx,by+10*scale,bw,12*scale);
        context.fillStyle=textColour;
        context.textAlign='left';context.fillText(this.chargeRange.min.toFixed(3),bx,by+40*scale);
        context.textAlign='center';context.fillText('0',bx+bw/2,by+40*scale);
        context.textAlign='right';context.fillText((this.chargeRange.max>0?'+':'')+this.chargeRange.max.toFixed(3),bx+bw,by+40*scale);
      }
      const blob=await new Promise(resolve=>output.toBlob(resolve,'image/png'));
      if(!blob) throw new Error('The browser could not create this image. Try a smaller export.');
      return blob;
    } finally {
      this.renderer.setClearColor(previousColour,previousAlpha);
      this.scene.background=previousBackground;
      this.renderer.setPixelRatio(previousRatio);
      this.camera.fov=previousFov;
      this.camera.aspect=previousAspect;
      this.resizeRenderer();this._layoutKey=null;this._exporting=false;
      this._updateLabelVisibility();this.renderer.render(this.scene,this.camera);
    }
  }
  buildStructure(parsed) {
    this._clearLabels();this.records=[];this.inspectedIndex=null;
    super.buildStructure(parsed);this._refreshInspector();
  }
  dispose() {
    this.canvas.removeEventListener('click',this._inspectEmpty);
    this.inspector?.remove();this.gradientLegend?.remove();
    this._clearLabels();super.dispose();
  }
}
