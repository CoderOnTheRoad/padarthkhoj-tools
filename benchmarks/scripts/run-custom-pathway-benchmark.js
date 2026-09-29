import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

import { CO2RR_C2_INTERMEDIATES } from '../../src/data/co2rrIntermediates.js';
import { N2_TO_NH3_INTERMEDIATES, OER_ORR_INTERMEDIATES } from '../../src/data/reactionPathways.js';
import { parseCustomPathwayJSON, serializeCustomPathway, templateFromCIF, validateCustomPathway } from '../../src/lib/customPathway.js';
import { parseCIF } from '../../src/lib/cifGenerator.js';
import { buildIntermediateCIF, placeAnchoredIntermediate } from '../../src/lib/intermediateMaker.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const catalystSources=[
  {id:'halfc1',path:path.join(root,'fixtures/bader/qe-real-002/halfc1.cif'),expectedAtoms:204},
  {id:'full',path:path.join(root,'fixtures/bader/qe-real-001/full.cif'),expectedAtoms:336},
];
const moleculeSources=[
  {id:'co',label:'CO*',filename:'CO.cif',template:CO2RR_C2_INTERMEDIATES.find(item=>item.id==='co')},
  {id:'ooh',label:'OOH*',filename:'OOH.cif',template:OER_ORR_INTERMEDIATES.find(item=>item.id==='OOH')},
  {id:'nh3',label:'NH3*',filename:'NH3.cif',template:N2_TO_NH3_INTERMEDIATES.find(item=>item.id==='NH3')},
];
const rules=[],placements=[];
const check=(scope,rule,passed,detail)=>rules.push({scope,rule,status:passed?'pass':'fail',detail});
const moleculeCIF=source=>{const size=20,shift=8;return `data_${source.id}\n_cell_length_a ${size}\n_cell_length_b ${size}\n_cell_length_c ${size}\n_cell_angle_alpha 90\n_cell_angle_beta 90\n_cell_angle_gamma 90\nloop_\n_atom_site_label\n_atom_site_type_symbol\n_atom_site_Cartn_x\n_atom_site_Cartn_y\n_atom_site_Cartn_z\n${source.template.atoms.map((atom,index)=>`${atom.element}${index+1} ${atom.element} ${(atom.x+shift).toFixed(8)} ${(atom.y+shift).toFixed(8)} ${(atom.z+shift).toFixed(8)}`).join('\n')}\n`;};
const parsedUploads=moleculeSources.map(source=>({...source,text:moleculeCIF(source),parsed:parseCIF(moleculeCIF(source))}));
check('multi-upload','all three CIFs parsed',parsedUploads.every(item=>item.parsed.atoms.length===item.template.atoms.length),parsedUploads.map(item=>`${item.filename}:${item.parsed.atoms.length}`).join(', '));
const intermediates=parsedUploads.map(item=>templateFromCIF(item.parsed,item.template.bindingAtom,{id:item.id,name:item.label,sourceFilename:item.filename}));
check('binding selection','non-first binding atom preserved',intermediates.find(item=>item.id==='ooh').bindingAtom===1,'OOH binding atom 2');
check('binding selection','all binding atoms shifted to origin',intermediates.every(item=>Math.hypot(item.atoms[item.bindingAtom].x,item.atoms[item.bindingAtom].y,item.atoms[item.bindingAtom].z)<1e-10),'all origins zero');
check('ordering','upload order preserved',intermediates.map(item=>item.id).join(',')==='co,ooh,nh3',intermediates.map(item=>item.id).join(' → '));

const pathway={name:'Cross-family adsorption benchmark',intermediates};
const json=serializeCustomPathway(pathway),restored=parseCustomPathwayJSON(json),jsonAgain=serializeCustomPathway(restored);
check('JSON','format marker',JSON.parse(json).format==='padarthkhoj-custom-pathway','padarthkhoj-custom-pathway');
check('JSON','ordered round trip',restored.intermediates.map(item=>item.id).join(',')==='co,ooh,nh3',restored.intermediates.map(item=>item.id).join(','));
check('JSON','deterministic round trip',json===jsonAgain,`${json.length} bytes`);
check('JSON','warning included',/Cross-check and optimize/.test(json),'scientific warning present');

for(const source of catalystSources){
  const text=await readFile(source.path,'utf8'),catalyst=parseCIF(text);
  check(source.id,'real catalyst atom count',catalyst.atoms.length===source.expectedAtoms,`${catalyst.atoms.length} atoms`);
  const activeIndex=catalyst.atoms.reduce((best,atom,index,atoms)=>atom.cz>atoms[best].cz?index:best,0),active=catalyst.atoms[activeIndex];
  const zip=new JSZip(),names=[];
  const started=performance.now();
  for(const [index,template] of restored.intermediates.entries()){
    const placed=placeAnchoredIntermediate(template,active,{distance:1.8,direction:{x:0,y:0,z:1},twist:index*17,tilt:0});
    const binding=placed[template.bindingAtom],error=Math.abs(Math.hypot(binding.x-active.cx,binding.y-active.cy,binding.z-active.cz)-1.8);
    const filename=`${String(index+1).padStart(2,'0')}_${source.id}_${template.id}.cif`,content=buildIntermediateCIF(catalyst,placed,filename),reparsed=parseCIF(content);
    names.push(filename);zip.file(filename,content);
    const valid=reparsed.atoms.length===catalyst.atoms.length+template.atoms.length;
    check(`${source.id}/${template.id}`,'binding distance',error<1e-9,`error ${error.toExponential(3)} Å`);
    check(`${source.id}/${template.id}`,'CIF round trip',valid,`${reparsed.atoms.length} atoms`);
    check(`${source.id}/${template.id}`,'catalyst atom order',reparsed.atoms.slice(0,catalyst.atoms.length).map(atom=>atom.element).join(',')===catalyst.atoms.map(atom=>atom.element).join(','),'element order preserved');
    placements.push({catalyst:source.id,catalyst_atoms:catalyst.atoms.length,intermediate:template.id,intermediate_atoms:template.atoms.length,binding_atom:template.bindingAtom+1,binding_error_A:error,export_atoms:reparsed.atoms.length,cif_round_trip:valid});
  }
  zip.file('custom_pathway.json',json);zip.file('placement.json',JSON.stringify({pathway:pathway.name,activeAtomIndex:activeIndex+1,distance:1.8},null,2));
  const archive=await zip.generateAsync({type:'uint8array'}),opened=await JSZip.loadAsync(archive),archiveNames=Object.keys(opened.files);
  check(source.id,'unique exported filenames',new Set(names).size===names.length,names.join(', '));
  check(source.id,'complete ZIP manifest',archiveNames.length===restored.intermediates.length+2&&names.every(name=>opened.file(name))&&opened.file('custom_pathway.json')&&opened.file('placement.json'),archiveNames.join(', '));
  check(source.id,'ZIP JSON fidelity',(await opened.file('custom_pathway.json').async('string'))===json,`${archive.length} ZIP bytes`);
  check(source.id,'generation completed',performance.now()-started<5000,`${(performance.now()-started).toFixed(3)} ms`);
  source.sha256=createHash('sha256').update(text).digest('hex');source.activeAtom={index:activeIndex+1,element:active.element};
}

const invalidCases=[
  ['malformed JSON',()=>parseCustomPathwayJSON('{broken'),/not valid JSON/],
  ['wrong format',()=>validateCustomPathway({format:'other',version:1,pathway:{}}),/not a Padarthkhoj/],
  ['empty pathway',()=>validateCustomPathway({format:'padarthkhoj-custom-pathway',version:1,pathway:{name:'x',intermediates:[]}}),/no intermediates/],
  ['duplicate names',()=>validateCustomPathway({format:'padarthkhoj-custom-pathway',version:1,pathway:{name:'x',intermediates:[intermediates[0],{...intermediates[1],label:'co*'}]}}),/Duplicate/],
  ['invalid binding atom',()=>templateFromCIF(parsedUploads[0].parsed,99,{name:'bad'}),/Select the atom/],
  ['missing intermediate name',()=>templateFromCIF(parsedUploads[0].parsed,0,{name:''}),/Enter a name/],
];
for(const [name,action,pattern] of invalidCases){let message='';try{action();}catch(error){message=error.message;}check('negative controls',name,pattern.test(message),message||'not rejected');}

const passed=rules.filter(rule=>rule.status==='pass').length,report={schemaVersion:1,benchmarkType:'Custom Pathway Designer portability and catalyst reuse',sources:{molecules:parsedUploads.map(item=>({filename:item.filename,atoms:item.parsed.atoms.length,bindingAtom:item.template.bindingAtom+1})),catalysts:catalystSources.map(item=>({id:item.id,expectedAtoms:item.expectedAtoms,sha256:item.sha256,activeAtom:item.activeAtom}))},environment:{timestampUtc:new Date().toISOString(),node:process.version,platform:process.platform,architecture:process.arch,osRelease:os.release(),cpu:os.cpus()[0]?.model??'unavailable'},summary:{uploadedMolecules:parsedUploads.length,catalysts:catalystSources.length,generatedStructures:placements.length,invalidCasesRejected:invalidCases.filter(([name])=>rules.find(rule=>rule.scope==='negative controls'&&rule.rule===name)?.status==='pass').length,rules:rules.length,passed,failed:rules.length-passed,maximumBindingErrorA:Math.max(...placements.map(item=>item.binding_error_A))},rules,placements};
const csv=[Object.keys(placements[0]),...placements.map(Object.values)].map(row=>row.map(value=>`"${String(value??'').replaceAll('"','""')}"`).join(',')).join('\n')+'\n';
const results=path.join(root,'results');await mkdir(results,{recursive:true});await Promise.all([writeFile(path.join(results,'latest-custom-pathways.json'),JSON.stringify(report,null,2)+'\n'),writeFile(path.join(results,'latest-custom-pathway-placements.csv'),csv)]);
console.log(`Custom Pathway benchmark: ${passed}/${rules.length} rules passed; ${placements.length} structures generated on ${catalystSources.length} real catalysts; ${report.summary.invalidCasesRejected}/${invalidCases.length} invalid cases rejected.`);
if(passed!==rules.length)process.exitCode=1;
