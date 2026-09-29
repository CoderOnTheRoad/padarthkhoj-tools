import * as THREE from 'three';
import { ELEMENTS } from '../data/elements.js';

const pairKey=(a,b)=>[a,b].sort().join('|');
const number=value=>Number.isFinite(Number(value))?Number(value):null;

export function findBonds(atoms,lattice,options={}){
  const scale=Math.max(.2,Number(options.scale)||1.15),rules=new Map((options.rules||[]).map(rule=>[pairKey(rule.a,rule.b),rule])),bonds=[];
  for(let i=0;i<atoms.length;i++)for(let j=i+1;j<atoms.length;j++){
    const a=atoms[i],b=atoms[j];let dx=b.cart.x-a.cart.x,dy=b.cart.y-a.cart.y,dz=b.cart.z-a.cart.z;
    if(lattice&&a.frac&&b.frac){let fx=b.frac.x-a.frac.x,fy=b.frac.y-a.frac.y,fz=b.frac.z-a.frac.z;fx-=Math.round(fx);fy-=Math.round(fy);fz-=Math.round(fz);dx=lattice[0][0]*fx+lattice[0][1]*fy+lattice[0][2]*fz;dy=lattice[1][0]*fx+lattice[1][1]*fy+lattice[1][2]*fz;dz=lattice[2][0]*fx+lattice[2][1]*fy+lattice[2][2]*fz;}
    const distance=Math.hypot(dx,dy,dz),rule=rules.get(pairKey(a.element,b.element));
    const min=rule?Math.max(0,number(rule.min)??0.1):0.1;
    const max=rule?Math.max(min,number(rule.max)??0):(ELEMENTS[a.element]?.r||1)+(ELEMENTS[b.element]?.r||1);
    const cutoff=rule?max:max*scale;
    if(distance>=min&&distance<=cutoff)bonds.push({i,j,distance,delta:{x:dx,y:dy,z:dz}});
  }
  return bonds;
}

export function setupBonding(viewer){
  viewer.bondSettings={visible:true,scale:1.15,rules:[]};viewer.chemicalBondObject=null;viewer.bondAtoms=[];viewer.bondLattice=null;viewer.bondCentre={x:0,y:0,z:0};
  const root=document.createElement('div');root.className='bond-ui';root.innerHTML=`<button class="bond-toggle" type="button">Bonds</button><div class="bond-popover" hidden><label><input data-bond-visible type="checkbox" checked> Show bonds</label><label>Automatic threshold <span data-bond-scale-value>115%</span><input data-bond-scale type="range" min="60" max="200" value="115"></label><div class="bond-rule-form"><select data-bond-a></select><select data-bond-b></select><input data-bond-min type="number" min="0" step=".05" value="0.10" title="Minimum Å"><input data-bond-max type="number" min=".1" step=".05" value="2.00" title="Maximum Å"><button data-bond-add type="button">Add pair</button></div><div class="bond-rules"></div><small>Pair distances in Å. Custom pairs override the automatic covalent-radius cutoff.</small></div>`;viewer.container.appendChild(root);viewer.bondUI=root;
  root.querySelector('.bond-toggle').addEventListener('click',event=>{event.stopPropagation();const pop=root.querySelector('.bond-popover');pop.hidden=!pop.hidden;});root.addEventListener('pointerdown',event=>event.stopPropagation());root.addEventListener('click',event=>event.stopPropagation());
  root.querySelector('[data-bond-visible]').addEventListener('change',event=>{viewer.bondSettings.visible=event.target.checked;renderBonds(viewer);});root.querySelector('[data-bond-scale]').addEventListener('input',event=>{viewer.bondSettings.scale=Number(event.target.value)/100;root.querySelector('[data-bond-scale-value]').textContent=`${event.target.value}%`;renderBonds(viewer);});
  root.querySelector('[data-bond-add]').addEventListener('click',()=>{const a=root.querySelector('[data-bond-a]').value,b=root.querySelector('[data-bond-b]').value,min=Number(root.querySelector('[data-bond-min]').value),max=Number(root.querySelector('[data-bond-max]').value);if(!a||!b||!(max>=min))return;viewer.bondSettings.rules=viewer.bondSettings.rules.filter(rule=>pairKey(rule.a,rule.b)!==pairKey(a,b));viewer.bondSettings.rules.push({a,b,min,max});renderRuleList(viewer);renderBonds(viewer);});
}

function renderRuleList(viewer){const list=viewer.bondUI.querySelector('.bond-rules');list.innerHTML='';viewer.bondSettings.rules.forEach((rule,index)=>{const row=document.createElement('div');row.textContent=`${rule.a}–${rule.b}: ${rule.min.toFixed(2)}–${rule.max.toFixed(2)} Å`;const button=document.createElement('button');button.type='button';button.textContent='×';button.addEventListener('click',()=>{viewer.bondSettings.rules.splice(index,1);renderRuleList(viewer);renderBonds(viewer);});row.appendChild(button);list.appendChild(row);});}

export function setBondStructure(viewer,atoms,lattice,centre){viewer.bondAtoms=atoms;viewer.bondLattice=lattice;viewer.bondCentre=centre;const elements=[...new Set(atoms.map(atom=>atom.element))].sort();const html=elements.map(element=>`<option value="${element}">${element}</option>`).join('');viewer.bondUI.querySelector('[data-bond-a]').innerHTML=html;viewer.bondUI.querySelector('[data-bond-b]').innerHTML=html;renderBonds(viewer);}

export function renderBonds(viewer){if(viewer.chemicalBondObject){viewer.scene.remove(viewer.chemicalBondObject);viewer.chemicalBondObject.geometry.dispose();viewer.chemicalBondObject.material.dispose();viewer.chemicalBondObject=null;}viewer.refreshPeriodicEdges?.();if(!viewer.bondSettings.visible||!viewer.bondAtoms.length)return;const bonds=findBonds(viewer.bondAtoms,viewer.bondLattice,viewer.bondSettings),points=[],centre=viewer.bondCentre;bonds.forEach(bond=>{if(viewer.bondAtomVisible&&(!viewer.bondAtomVisible(bond.i)||!viewer.bondAtomVisible(bond.j)))return;const atom=viewer.bondAtoms[bond.i],start=new THREE.Vector3(atom.cart.x-centre.x,atom.cart.y-centre.y,atom.cart.z-centre.z);points.push(start,start.clone().add(new THREE.Vector3(bond.delta.x,bond.delta.y,bond.delta.z)));});if(!points.length)return;viewer.chemicalBondObject=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0x9ca3af,transparent:true,opacity:.7}));viewer.chemicalBondObject.renderOrder=-1;viewer.scene.add(viewer.chemicalBondObject);}

export function disposeBonding(viewer){if(viewer.chemicalBondObject){viewer.scene.remove(viewer.chemicalBondObject);viewer.chemicalBondObject.geometry.dispose();viewer.chemicalBondObject.material.dispose();}viewer.bondUI?.remove();}
