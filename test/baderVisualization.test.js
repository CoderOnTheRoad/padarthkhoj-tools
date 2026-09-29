import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { baderLabelParts, chargeColour, CHARGE_PALETTE, containedVerticalFov, filterAtoms, parseAtomNumberSelection, placeLabel, overlaps, unselectedAtomAppearance } from '../src/lib/baderVisualization.js';
import { BaderChargeViewer } from '../src/components/BaderChargeViewer.js';
import { renderBonds } from '../src/lib/bonding.js';

test('charge gradient is symmetric, neutral at zero, and saturates at endpoints', () => {
  assert.equal(chargeColour(0,0,'gradient'),CHARGE_PALETTE.neutral);
  assert.equal(chargeColour(2,2,'gradient'),CHARGE_PALETTE.loss);
  assert.equal(chargeColour(-2,2,'gradient'),CHARGE_PALETTE.gain);
  assert.equal(chargeColour(3,2,'gradient'),CHARGE_PALETTE.loss);
  assert.equal(chargeColour(.01,2),CHARGE_PALETTE.loss);
  assert.equal(chargeColour(-.01,2),CHARGE_PALETTE.gain);
  assert.notEqual(chargeColour(.5,2,'gradient'),chargeColour(1,2,'gradient'));
  assert.equal(chargeColour(.5,2,'gradient'),chargeColour(1,4,'gradient'));
  assert.equal(chargeColour(-2,{min:-2,max:.5},'gradient'),CHARGE_PALETTE.gain);
  assert.equal(chargeColour(.5,{min:-2,max:.5},'gradient'),CHARGE_PALETTE.loss);
});

test('Bader atom filters support species, arrays, lists, and ranges',()=>{
  const records=[{element:'C'},{element:'O'},{element:'C'},{element:'H'},{element:'O'},{element:'N'},{element:'C'},{element:'H'},{element:'O'}];
  assert.deepEqual(filterAtoms(records,'all').indices,[0,1,2,3,4,5,6,7,8]);
  assert.deepEqual(filterAtoms(records,'species',['O','N']).indices,[1,4,5,8]);
  assert.deepEqual(filterAtoms(records,'numbers',[],'[1, 3, 5-7, 9]').indices,[0,2,4,5,6,8]);
  assert.deepEqual(parseAtomNumberSelection('1-5, 7-9',9).indices,[0,1,2,3,4,6,7,8]);
  assert.match(parseAtomNumberSelection('0, 5-2, abc, 20',9).errors.join(' '),/outside.*reversed.*valid.*outside/);
  assert.ok(filterAtoms(records,'species',[]).errors.length);
});

test('unselected atom display modes preserve, mute, or remove structural context',()=>{
  assert.deepEqual(unselectedAtomAppearance('keep'),{visible:true,colour:null});
  assert.deepEqual(unselectedAtomAppearance('grey'),{visible:true,colour:'#94a3b8'});
  assert.deepEqual(unselectedAtomAppearance('hide'),{visible:false,colour:null});
});

test('Bader label content splits combined centre labels into identity and charge',()=>{
  const record={index:7,element:'Cu',baderCharge:-.1254};
  assert.deepEqual(baderLabelParts('atom','outside',record),[{role:'outside',text:'#7'}]);
  assert.deepEqual(baderLabelParts('type','centre',record),[{role:'centre',text:'Cu'}]);
  assert.deepEqual(baderLabelParts('charge','centre',record),[{role:'centre',text:'-0.125 e'}]);
  assert.deepEqual(baderLabelParts('both','centre',record),[
    {role:'centre',text:'#7'},{role:'outside',text:'-0.125 e'},
  ]);
  assert.deepEqual(baderLabelParts('typeCharge','centre',record),[
    {role:'centre',text:'Cu'},{role:'outside',text:'-0.125 e'},
  ]);
  assert.deepEqual(baderLabelParts('typeCharge','outside',record),[{role:'outside',text:'Cu  -0.125 e'}]);
  assert.deepEqual(baderLabelParts('none','outside',record),[]);
});

test('hidden atoms also remove bonds connected to them',()=>{
  const viewer={scene:new THREE.Scene(),chemicalBondObject:null,bondSettings:{visible:true,scale:1.15,rules:[]},bondLattice:null,bondCentre:{x:0,y:0,z:0},bondAtoms:[0,1,2].map(x=>({element:'C',cart:{x,y:0,z:0}}))};
  renderBonds(viewer);
  assert.equal(viewer.chemicalBondObject.geometry.attributes.position.count,4);
  viewer.bondAtomVisible=index=>index<2;
  renderBonds(viewer);
  assert.equal(viewer.chemicalBondObject.geometry.attributes.position.count,2);
});

test('screen labels avoid atom boxes and other labels and hide when crowded', () => {
  const atom={x:100,y:100,radius:10},viewport={width:300,height:300};
  const obstacles=[{left:90,right:110,top:90,bottom:110}];
  const first=placeLabel(atom,80,20,obstacles,viewport);
  assert.ok(first);
  assert.ok(!overlaps(first.box,obstacles[0]));
  const second=placeLabel(atom,80,20,[...obstacles,first.box],viewport);
  assert.ok(second);
  assert.ok(!overlaps(second.box,first.box));
  assert.equal(placeLabel(atom,80,20,[{left:0,right:300,top:0,bottom:300}],viewport),null);
});

test('export field of view contains the entire screen framing at any aspect ratio',()=>{
  assert.equal(containedVerticalFov(45,16/9,16/9),45);
  assert.equal(containedVerticalFov(45,16/9,2),45);
  const square=containedVerticalFov(45,16/9,1);
  assert.ok(square>45);
  const sourceHorizontal=Math.tan(45*Math.PI/360)*(16/9);
  const squareHorizontal=Math.tan(square*Math.PI/360);
  assert.ok(Math.abs(sourceHorizontal-squareHorizontal)<1e-12);
});

test('Bader inspection is single-atom and leaves atom colours and sizes intact', () => {
  const viewer=Object.create(BaderChargeViewer.prototype);
  viewer.atomMeshes=[0,1].map(()=>new THREE.Mesh(new THREE.SphereGeometry(),new THREE.MeshPhongMaterial({color:0xef4444})));
  viewer.records=[{index:1,element:'Cu',baderCharge:.438},{index:2,element:'O',baderCharge:-.75}];
  viewer.inspector={textContent:''};viewer.inspectedIndex=null;
  viewer._toggleAtom(0);
  assert.match(viewer.inspector.textContent,/Atom #1 · Cu/);
  assert.match(viewer.inspector.textContent,/\+0\.4380 e/);
  viewer._toggleAtom(1);
  assert.equal(viewer.inspectedIndex,1);
  assert.match(viewer.inspector.textContent,/Electron gain/);
  assert.equal(viewer.atomMeshes[0].material.emissiveIntensity,0);
  for(const mesh of viewer.atomMeshes){assert.equal(mesh.scale.x,1);assert.equal(mesh.material.color.getHex(),0xef4444);}
  viewer.clearSelection();assert.equal(viewer.inspectedIndex,null);
});

test('PNG export recalculates target layout and restores viewport, including failures', async () => {
  const previousDocument=globalThis.document;
  const calls=[];
  const backgrounds=[],ratios=[];
  const context=new Proxy({}, { get:(_,key)=>key==='createLinearGradient'?()=>({addColorStop(){}}):()=>{} });
  const output={getContext:()=>context,toBlob:callback=>callback(new Blob(['png']))};
  globalThis.document={createElement:()=>output};
  const viewer=Object.create(BaderChargeViewer.prototype);
  Object.assign(viewer,{
    canvas:{clientWidth:600},camera:new THREE.PerspectiveCamera(45,2,.1,500),
    renderer:{
      getContext:()=>({MAX_VIEWPORT_DIMS:1,MAX_RENDERBUFFER_SIZE:2,MAX_TEXTURE_SIZE:3,getParameter:key=>key===1?[16384,16384]:16384}),
      getPixelRatio:()=>2,setPixelRatio:value=>ratios.push(value),getClearColor:()=>new THREE.Color(0xffffff),getClearAlpha:()=>1,setClearColor:(colour,alpha)=>backgrounds.push([colour,alpha]),
      setSize:(w,h)=>calls.push(['size',w,h]),render:()=>calls.push(['render'])},
    scene:new THREE.Scene(),representation:'atom',colourStyle:'gradient',chargeLimit:2,chargeRange:{min:-2,max:1},
    _updateLabelVisibility:(...args)=>calls.push(['layout',...args]),
    resizeRenderer:()=>calls.push(['restore']),
  });
  try {
    const result=await viewer.exportPNG(1800,1200,{transparent:true});
    assert.ok(result instanceof Blob);
    assert.deepEqual(backgrounds[0],[0,0]);
    assert.equal(backgrounds.at(-1)[1],1);
    assert.deepEqual(ratios,[1,2]);
    assert.ok(viewer.camera.fov===45 && viewer.camera.aspect===2);
    assert.deepEqual(calls[1],['layout',1800,1200,3,true]);
    assert.deepEqual(calls.slice(-3),[['restore'],['layout'],['render']]);
    assert.equal(viewer._exporting,false);
    output.toBlob=()=>{throw new Error('Export failed');};
    await assert.rejects(viewer.exportPNG(1200,1800),/Export failed/);
    assert.equal(viewer._exporting,false);
    assert.deepEqual(calls.slice(-3),[['restore'],['layout'],['render']]);
  } finally { globalThis.document=previousDocument; }
});
