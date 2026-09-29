import { IntermediatePlacementViewer } from '../components/IntermediatePlacementViewer.js';
import { getIntermediatePathway, INTERMEDIATE_PATHWAYS } from '../data/reactionPathways.js';
import { exportZIP, parseCIF } from '../lib/cifGenerator.js';
import { anglesFromDirection, buildIntermediateCIF, directionFromAngles, evaluatePlacement, evaluatePlacementVolume, placeAnchoredIntermediate } from '../lib/intermediateMaker.js';

const readFileText = file => new Promise((resolve,reject) => {
  const reader=new FileReader(); reader.onload=event=>resolve(event.target.result); reader.onerror=()=>reject(new Error('Could not read the CIF file')); reader.readAsText(file);
});
const cloneDirection = direction => ({ x:direction.x,y:direction.y,z:direction.z });

export class IntermediateMakerPage {
  constructor(container) {
    this.container=container; this.parsed=null; this.filename='structure.cif'; this.activeIndex=-1; this.stage='setup'; this.viewLocked=false;
    this.anchor={ distance:1.8,direction:directionFromAngles(0,60),twist:0,tilt:0 };
    this.clearanceRadius=1.2; this.minimumDistance=1.6; this.generated=false; this.pathwayId=INTERMEDIATE_PATHWAYS[0].id; this.templateId=this._pathway().templates[0].id;
    this.placements=new Map(); this.showClearance=true; this.viewer=null; this.currentPlacement=null;
    this._themeListener=event=>this.viewer?.setTheme(event.detail.isLight); window.addEventListener('theme-changed',this._themeListener);
  }

  render() {
    this.container.innerHTML=`<div class="im-layout">
      <section class="im-viewer"><canvas id="im-canvas"></canvas>
        <div class="im-upload" id="im-upload"><div class="im-drop" id="im-drop"><div class="im-drop-icon">◉</div><strong>Upload catalyst CIF</strong><span>Drop a .cif file or click to browse</span><input id="im-file" type="file" accept=".cif"></div></div>
        <div class="im-hud" id="im-hud" hidden><span id="im-file-name"></span><span id="im-active-label">Select the active-site atom</span></div>
        <div class="im-view-help" id="im-help" hidden>Unlocked: rotate, pan, zoom and select site<br>Locked: drag anchor or glowing intermediate</div>
      </section>
      <aside class="im-panel"><header><h2>Preset Reaction Pathways</h2><p>Built-in catalytic pathways with anchor placement</p></header>
        <div class="im-stepper"><span data-step="setup" class="active">1 Surface</span><span data-step="anchor">2 Anchor</span><span data-step="pathway">3 Pathway</span></div>

        <div class="im-stage" data-stage="setup"><div class="im-section"><h3>1. Prepare surface</h3>
          <p class="im-lock-note">Upload the CIF, rotate to a useful view, and click exactly one active-site atom.</p>
          <div class="im-view-actions"><button class="btn btn-ghost" id="im-reset-site" disabled>Reset site</button><button class="btn btn-primary" id="im-lock-view" disabled>Lock view</button></div>
          <button class="btn btn-primary im-wide" id="im-to-anchor" disabled>Continue to anchor placement</button>
        </div></div>

        <div class="im-stage" data-stage="anchor" hidden><div class="im-section"><h3>2. Place adsorption anchor</h3>
          <p class="im-lock-note">The anchor fixes the binding atom. Its outward vector is the automatic perpendicular molecular direction.</p>
          <button class="btn btn-ghost im-wide" id="im-anchor-lock">Unlock view</button>
          <label>Active site → anchor distance<div class="im-range"><input id="im-distance-range" type="range" min="1" max="4" step=".01" value="1.8"><input id="im-distance" type="number" min=".1" max="10" step=".01" value="1.80"><span>Å</span></div></label>
          <label>Clearance bubble radius<div class="im-range"><input id="im-clearance-radius" type="range" min=".3" max="4" step=".05" value="1.2"><input id="im-clearance-number" type="number" min=".1" max="10" step=".05" value="1.20"><span>Å</span></div></label>
          <div class="im-angle-grid"><label>Azimuth °<input id="im-azimuth" type="number" value="0"></label><label>Elevation °<input id="im-elevation" type="number" value="60"></label></div>
          <div class="im-view-actions"><button class="btn btn-ghost" id="im-back-setup">Back</button><button class="btn btn-primary" id="im-confirm-anchor">Use this anchor</button></div>
          <div class="im-status waiting" id="im-anchor-status">Drag the cyan anchor to place it.</div>
        </div></div>

        <div class="im-stage" data-stage="pathway" hidden><div class="im-section"><h3>3. Reaction pathway</h3>
          <button class="btn btn-ghost im-wide" id="im-pathway-lock">Unlock view</button>
          <div class="im-family-grid"><button class="active" data-family="NRR">NRR</button><button data-family="CO2RR">CO₂RR</button><button data-family="HER">HER</button><button data-family="OER/ORR">OER/ORR</button></div>
          <label>Reaction<select id="im-reaction"></select></label>
          <p class="im-lock-note" id="im-pathway-description"></p>
          <p class="im-warning">Suggested starting sequence only. Cross-check the mechanism, binding atoms, protonation states, and branching against literature for your catalyst before calculation.</p>
          <button class="btn btn-primary im-wide" id="im-generate-all"></button>
          <div id="im-generated-tools" hidden><p class="im-generated-summary" id="im-generated-summary"></p>
            <div class="im-path" id="im-path"></div>
            <label>Preview<select id="im-template"></select></label>
            <div class="im-angle-grid"><label>Twist around normal °<input id="im-twist" type="number" value="0"></label><label>Tilt from normal °<input id="im-tilt" type="number" min="-90" max="90" value="0"></label></div>
            <label>Atom collision warning<div class="im-range"><input id="im-min-distance" type="number" min=".1" max="5" step=".05" value="1.60"><span>Å</span></div></label>
            <div class="im-view-actions"><button class="btn btn-ghost" id="im-toggle-clearance">Hide clearance</button><button class="btn btn-ghost" id="im-apply-all">Apply placement to all</button></div>
            <div class="im-status waiting" id="im-status"></div>
          </div>
          <button class="btn btn-ghost im-wide" id="im-back-anchor">Back to anchor</button>
        </div>
        <div class="im-actions"><button class="btn btn-ghost" id="im-download" disabled>Download preview CIF</button><button class="btn btn-primary" id="im-download-all" disabled>Download all ZIP</button></div></div>
      </aside></div>`;
    this.viewer=new IntermediatePlacementViewer(this.container.querySelector('#im-canvas'));
    this.viewer.onSelectionChange=indices=>{ this.activeIndex=indices[0]??-1; this._updateSetup(); };
    this.viewer.onAnchorMove=direction=>{ this._setCurrentDirection(direction); this._syncAnchorControls(); this._updateViewer(); };
    this._bindEvents(); this._renderPathwayUI(); this._setStage('setup');
  }

  _bindEvents() {
    const fileInput=this.container.querySelector('#im-file'), drop=this.container.querySelector('#im-drop');
    drop.addEventListener('click',()=>fileInput.click()); fileInput.addEventListener('click',event=>event.stopPropagation()); fileInput.addEventListener('change',event=>this._loadFile(event.target.files[0]));
    drop.addEventListener('dragover',event=>{event.preventDefault();drop.classList.add('drag');}); drop.addEventListener('dragleave',()=>drop.classList.remove('drag')); drop.addEventListener('drop',event=>{event.preventDefault();drop.classList.remove('drag');this._loadFile(event.dataTransfer.files[0]);});
    this.container.querySelector('#im-reset-site').addEventListener('click',()=>this._resetSite());
    this.container.querySelector('#im-lock-view').addEventListener('click',()=>this._setLocked(!this.viewLocked));
    this.container.querySelector('#im-anchor-lock').addEventListener('click',()=>this._setLocked(!this.viewLocked));
    this.container.querySelector('#im-pathway-lock').addEventListener('click',()=>this._setLocked(!this.viewLocked));
    this.container.querySelector('#im-to-anchor').addEventListener('click',()=>{this._setLocked(true);this._setStage('anchor');this._updateViewer();});
    this.container.querySelector('#im-back-setup').addEventListener('click',()=>{this._setStage('setup');this._setLocked(false);this.viewer.clearPlacement();});
    this.container.querySelector('#im-confirm-anchor').addEventListener('click',()=>{this._setStage('pathway');this._updateViewer();});
    this.container.querySelector('#im-back-anchor').addEventListener('click',()=>{this._setStage('anchor');this._updateViewer();});
    const anchorBindings=[
      ['#im-distance',value=>this.anchor.distance=Math.max(.1,Number(value)||1.8)],['#im-distance-range',value=>this.anchor.distance=Number(value)],
      ['#im-clearance-radius',value=>this.clearanceRadius=Number(value)],['#im-clearance-number',value=>this.clearanceRadius=Math.max(.1,Number(value)||1.2)],
      ['#im-azimuth',value=>{const angles=anglesFromDirection(this.anchor.direction);this.anchor.direction=directionFromAngles(Number(value)||0,angles.elevation);}],
      ['#im-elevation',value=>{const angles=anglesFromDirection(this.anchor.direction);this.anchor.direction=directionFromAngles(angles.azimuth,Number(value)||0);}],
    ];
    anchorBindings.forEach(([selector,update])=>this.container.querySelector(selector).addEventListener('input',event=>{update(event.target.value);this._syncAnchorControls();this._updateViewer();}));
    this.container.querySelector('#im-generate-all').addEventListener('click',()=>this._generateAll());
    this.container.querySelector('#im-reaction').addEventListener('change',event=>this._selectPathway(event.target.value));
    this.container.querySelector('#im-template').addEventListener('change',event=>{this.templateId=event.target.value;this._syncPathControls();this._updateViewer();});
    this.container.querySelectorAll('[data-family]').forEach(button=>button.addEventListener('click',()=>this._selectFamily(button.dataset.family)));
    this.container.querySelector('#im-twist').addEventListener('input',event=>{this._currentState().twist=Number(event.target.value)||0;this._updateViewer();});
    this.container.querySelector('#im-tilt').addEventListener('input',event=>{this._currentState().tilt=Number(event.target.value)||0;this._updateViewer();});
    this.container.querySelector('#im-min-distance').addEventListener('input',event=>{this.minimumDistance=Math.max(.1,Number(event.target.value)||1.6);this._updateViewer();});
    this.container.querySelector('#im-toggle-clearance').addEventListener('click',()=>{this.showClearance=!this.showClearance;this.container.querySelector('#im-toggle-clearance').textContent=this.showClearance?'Hide clearance':'Show clearance';this._updateViewer();});
    this.container.querySelector('#im-apply-all').addEventListener('click',()=>this._applyCurrentToAll());
    this.container.querySelector('#im-download').addEventListener('click',()=>this._downloadCurrent()); this.container.querySelector('#im-download-all').addEventListener('click',()=>this._downloadAll());
  }

  async _loadFile(file) {
    if(!file)return;
    try { const text=await readFileText(file), parsed=parseCIF(text); if(!parsed.atoms.length)throw new Error('No atoms found in the CIF atom-site loop');
      this.parsed=parsed;this.filename=file.name;this.activeIndex=-1;this.generated=false;this.placements.clear();this.viewer.buildStructure(parsed);
      this.container.querySelector('#im-upload').hidden=true;this.container.querySelector('#im-hud').hidden=false;this.container.querySelector('#im-help').hidden=false;this.container.querySelector('#im-file-name').textContent=`${file.name} · ${parsed.atoms.length} atoms`;this._setStage('setup');this._updateSetup();
    } catch(error){alert(error.message);}
  }

  _setStage(stage) { this.stage=stage;this.container.querySelectorAll('[data-stage]').forEach(node=>node.hidden=node.dataset.stage!==stage);this.container.querySelectorAll('[data-step]').forEach(node=>node.classList.toggle('active',node.dataset.step===stage)); }
  _setLocked(locked) {
    this.viewLocked=Boolean(locked&&this.activeIndex>=0);
    this.viewer.setViewLocked(this.viewLocked);
    ['#im-lock-view','#im-anchor-lock','#im-pathway-lock'].forEach(selector=>{
      const button=this.container.querySelector(selector);
      if(!button)return;
      button.textContent=this.viewLocked?'Unlock view':'Lock view';
      button.classList.toggle('btn-primary',!this.viewLocked);
      button.classList.toggle('btn-ghost',this.viewLocked);
    });
  }
  _resetSite(){this._setLocked(false);this.activeIndex=-1;this.viewer.activeIndex=-1;this.viewer.clearSelection();this.viewer.clearPlacement();this._updateSetup();}
  _updateSetup(){const has=this.activeIndex>=0;this.container.querySelector('#im-reset-site').disabled=!has;this.container.querySelector('#im-lock-view').disabled=!has;this.container.querySelector('#im-to-anchor').disabled=!has;this.container.querySelector('#im-active-label').textContent=has?`Active site: ${this.parsed.atoms[this.activeIndex].label} (${this.parsed.atoms[this.activeIndex].element})`:'Select the active-site atom';}
  _syncAnchorControls(){const angles=anglesFromDirection(this.anchor.direction);this.container.querySelector('#im-distance').value=this.anchor.distance.toFixed(2);this.container.querySelector('#im-distance-range').value=this.anchor.distance;this.container.querySelector('#im-clearance-radius').value=this.clearanceRadius;this.container.querySelector('#im-clearance-number').value=this.clearanceRadius.toFixed(2);this.container.querySelector('#im-azimuth').value=angles.azimuth.toFixed(1);this.container.querySelector('#im-elevation').value=angles.elevation.toFixed(1);}
  _setCurrentDirection(direction){if(this.generated){this._currentState().direction=cloneDirection(direction);}else this.anchor.direction=cloneDirection(direction);}
  _currentState(){return this.placements.get(this.templateId);}
  _pathway(){return getIntermediatePathway(this.pathwayId);}
  _template(){return this._pathway().templates.find(item=>item.id===this.templateId);}
  _statePlacement(template=this._template(),state=this.generated?this._currentState():this.anchor){const atoms=placeAnchoredIntermediate(template,this.parsed.atoms[this.activeIndex],state);const validation=evaluatePlacement(this.parsed.atoms,atoms,this.activeIndex,this.minimumDistance);const volume=evaluatePlacementVolume(this.parsed.atoms,atoms,this.activeIndex,this.clearanceRadius);return{atoms,validation,volume};}

  _updateViewer(){if(!this.parsed||this.activeIndex<0)return;const state=this.generated?this._currentState():this.anchor;const placement=this._statePlacement(this._template(),state);this.currentPlacement=placement;const valid=placement.validation.valid;
    this.viewer.showAnchor({activeIndex:this.activeIndex,distance:state.distance,direction:state.direction,atoms:placement.atoms,showAtoms:this.generated,showClearance:this.showClearance,clearanceRadius:this.clearanceRadius,valid});
    if(this.stage==='anchor'){const status=this.container.querySelector('#im-anchor-status');status.className=`im-status ${valid?'valid':'invalid'}`;status.textContent=valid?'Anchor is clear. The molecule will point outward along this vector.':`${placement.validation.collisions} close contact(s); move the anchor before continuing.`;}
    if(this.generated){const status=this.container.querySelector('#im-status');status.className=`im-status ${valid?'valid':'invalid'}`;status.textContent=`Previewing ${this._template().label} · perpendicular axis · ${state.distance.toFixed(2)} Å · ${valid?'no close contacts':`${placement.validation.collisions} close contact(s)`}`;}
  }

  _selectFamily(family){if(this._pathway().family===family)return;const pathway=INTERMEDIATE_PATHWAYS.find(item=>item.family===family);if(pathway)this._selectPathway(pathway.id);}
  _selectPathway(pathwayId){const pathway=getIntermediatePathway(pathwayId);if(pathway.id===this.pathwayId)return;this.pathwayId=pathway.id;this.templateId=pathway.templates[0].id;this.generated=false;this.placements.clear();this.currentPlacement=null;this.container.querySelector('#im-generated-tools').hidden=true;this.container.querySelector('#im-download').disabled=true;this.container.querySelector('#im-download-all').disabled=true;this._renderPathwayUI();this._updateViewer();}
  _renderPathwayUI(){const pathway=this._pathway(),templates=pathway.templates,count=templates.length,familyPathways=INTERMEDIATE_PATHWAYS.filter(item=>item.family===pathway.family),reaction=this.container.querySelector('#im-reaction');this.container.querySelectorAll('[data-family]').forEach(button=>button.classList.toggle('active',button.dataset.family===pathway.family));reaction.innerHTML=familyPathways.map(item=>`<option value="${item.id}" ${item.id===pathway.id?'selected':''}>${item.reactionLabel}</option>`).join('');reaction.disabled=familyPathways.length===1;this.container.querySelector('#im-pathway-description').textContent=pathway.description;this.container.querySelector('#im-generate-all').textContent=count===1?'Generate H adsorption':`Generate all ${count} intermediates`;this.container.querySelector('#im-generated-summary').textContent=count===1?'✓ H adsorption geometry generated. Adjust its placement before export.':`✓ All ${count} intermediates generated. Each step has an independent saved placement.`;this.container.querySelector('#im-path').innerHTML=templates.map(item=>`<button data-template="${item.id}">${item.label}</button>`).join('<span>→</span>');this.container.querySelector('#im-template').innerHTML=templates.map(item=>`<option value="${item.id}">${item.label}</option>`).join('');this.container.querySelectorAll('[data-template]').forEach(button=>button.addEventListener('click',()=>{this.templateId=button.dataset.template;this.container.querySelector('#im-template').value=this.templateId;this._syncPathControls();this._updateViewer();}));}
  _generateAll(){this.placements.clear();this._pathway().templates.forEach(template=>this.placements.set(template.id,{distance:this.anchor.distance,direction:cloneDirection(this.anchor.direction),twist:0,tilt:0}));this.generated=true;this.container.querySelector('#im-generated-tools').hidden=false;this.container.querySelector('#im-download').disabled=false;this.container.querySelector('#im-download-all').disabled=false;this._syncPathControls();this._updateViewer();}
  _syncPathControls(){if(!this.generated)return;const state=this._currentState();this.container.querySelector('#im-twist').value=state.twist;this.container.querySelector('#im-tilt').value=state.tilt;this.container.querySelectorAll('[data-template]').forEach(button=>button.classList.toggle('active',button.dataset.template===this.templateId));}
  _applyCurrentToAll(){const source=this._currentState();this.placements.forEach(state=>{state.distance=source.distance;state.direction=cloneDirection(source.direction);state.twist=source.twist;state.tilt=source.tilt;});this._updateViewer();}
  _baseName(){return this.filename.replace(/\.cif$/i,'').replace(/[^A-Za-z0-9._-]+/g,'_');}
  _fileFor(template){const state=this.placements.get(template.id),atoms=this._statePlacement(template,state).atoms,name=`${this._baseName()}_${template.id}.cif`;return{name,content:buildIntermediateCIF(this.parsed,atoms,name)};}
  _downloadCurrent(){if(!this.generated)return;const file=this._fileFor(this._template()),anchor=document.createElement('a');anchor.href=URL.createObjectURL(new Blob([file.content],{type:'chemical/x-cif'}));anchor.download=file.name;anchor.click();setTimeout(()=>URL.revokeObjectURL(anchor.href),1000);}
  async _downloadAll(){if(!this.generated)return;const pathway=this._pathway(),files=pathway.templates.map((template,index)=>{const file=this._fileFor(template);return{name:`${String(index+1).padStart(2,'0')}_${file.name}`,content:file.content};});files.push({name:'placement.json',content:JSON.stringify({warning:'Initial geometric placements only; inspect and optimize every structure.',pathway:pathway.reactionLabel,activeAtomIndex:this.activeIndex+1,placements:Object.fromEntries(this.placements)},null,2)});await exportZIP(files,`${this._baseName()}_${pathway.exportLabel}_intermediates.zip`);}
  destroy(){window.removeEventListener('theme-changed',this._themeListener);this.viewer?.dispose();}
}
