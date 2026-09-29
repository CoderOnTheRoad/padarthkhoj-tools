import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { INTERMEDIATE_PATHWAYS } from '../../src/data/reactionPathways.js';
import { parseCIF } from '../../src/lib/cifGenerator.js';
import { buildIntermediateCIF, evaluatePlacement, evaluatePlacementVolume, getTemplateAdsorptionAxis, placeAnchoredIntermediate, suggestPlacementSpheres } from '../../src/lib/intermediateMaker.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'fixtures/bader/qe-real-002/halfc1.cif');
const sourceText = await readFile(sourcePath, 'utf8');
const catalyst = parseCIF(sourceText);
const expectedOrders = {
  'nrr-no3-nh3': ['NO3','NO3H','NO2','NO2H','NO','NOH','NHO','NHOH','N','NH','NH2','NH2OH','NH3'],
  'nrr-n2-nh3': ['NNH','NNH2','NHNH','NHNH2','NH2NH2','N','NH','NH2','NH3'],
  'co2rr-c2h4': ['co2','cooh','co','co-co','coh','cocoh','cco','chco','chcho','ch2cho','c2h4'],
  'co2rr-c2h5oh': ['co2','cooh','co','co-co','coh','cocoh','cco','chco','chcho','ch2cho','ch3cho','ch3ch2o','ch3ch2oh'],
  'co2rr-cho-alternative': ['co2','cooh','co','cho'],
  'her-h-adsorption': ['H'],
  'oer-orr-oxygen-intermediates': ['O','OH','OOH'],
};
const distances = [1.6, 1.8, 2.2];
const direction = { x: 0, y: 0, z: 1 };
const activeIndex = catalyst.atoms.reduce((best, atom, index, atoms) => atom.cz > atoms[best].cz ? index : best, 0);
const active = catalyst.atoms[activeIndex];
const rules = [], geometries = [], timings = [];
const check = (scope, rule, passed, detail) => rules.push({ scope, rule, status: passed ? 'pass' : 'fail', detail });
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const sourcePoint = atom => ({ x:atom.x, y:atom.y, z:atom.z });
const rmsPairError = (template, placed) => {
  let sum = 0, count = 0, maximum = 0;
  for (let i=0;i<template.atoms.length;i++) for (let j=i+1;j<template.atoms.length;j++) {
    const error = Math.abs(distance(sourcePoint(template.atoms[i]),sourcePoint(template.atoms[j]))-distance(placed[i],placed[j]));
    sum += error*error; maximum=Math.max(maximum,error); count++;
  }
  return { rms:count?Math.sqrt(sum/count):0, maximum, pairs:count };
};
const axisAngle = (template, placed) => {
  if (template.atoms.length < 2) return 0;
  const binding=placed[template.bindingAtom], others=placed.filter((_,i)=>i!==template.bindingAtom);
  const vector=others.reduce((sum,atom)=>({x:sum.x+atom.x-binding.x,y:sum.y+atom.y-binding.y,z:sum.z+atom.z-binding.z}),{x:0,y:0,z:0});
  const length=Math.hypot(vector.x,vector.y,vector.z)||1;
  return Math.acos(Math.max(-1,Math.min(1,vector.z/length)))*180/Math.PI;
};

check('dataset','real catalyst atom count',catalyst.atoms.length===204,`${catalyst.atoms.length} atoms`);
check('dataset','pathway inventory',INTERMEDIATE_PATHWAYS.length===7,`${INTERMEDIATE_PATHWAYS.length} pathways`);
for (const pathway of INTERMEDIATE_PATHWAYS) {
  const actual = pathway.templates.map(item=>item.id);
  check(pathway.id,'pathway order',JSON.stringify(actual)===JSON.stringify(expectedOrders[pathway.id]),actual.join(' → '));
  check(pathway.id,'unique intermediate ids',new Set(actual).size===actual.length,`${actual.length} unique of ${actual.length}`);
  for (const template of pathway.templates) {
    const bindingTemplate=template.atoms[template.bindingAtom];
    check(`${pathway.id}/${template.id}`,'valid binding atom',Boolean(bindingTemplate)&&Math.hypot(bindingTemplate.x,bindingTemplate.y,bindingTemplate.z)<1e-10,`${bindingTemplate?.element??'missing'} at index ${template.bindingAtom}`);
    check(`${pathway.id}/${template.id}`,'unit adsorption axis',Math.abs(Math.hypot(...Object.values(getTemplateAdsorptionAxis(template)))-1)<1e-10,'normalized');
    for (const requested of distances) {
      const start=performance.now();
      const placed=placeAnchoredIntermediate(template,active,{distance:requested,direction,twist:31,tilt:0});
      const elapsed=performance.now()-start, binding=placed[template.bindingAtom];
      const bindingError=Math.abs(distance(binding,{x:active.cx,y:active.cy,z:active.cz})-requested);
      const pair=rmsPairError(template,placed), angle=axisAngle(template,placed);
      const collision=evaluatePlacement(catalyst.atoms,placed,activeIndex,1.6);
      const finite=placed.every(atom=>['x','y','z'].every(key=>Number.isFinite(atom[key])));
      const title=`halfc1_${pathway.exportLabel}_${template.id}_${requested.toFixed(1)}`;
      const cifText=buildIntermediateCIF(catalyst,placed,title), reparsed=parseCIF(cifText);
      const roundTrip=reparsed.atoms.length===catalyst.atoms.length+template.atoms.length && reparsed.atoms.slice(-template.atoms.length).map(atom=>atom.element).join(',')===template.atoms.map(atom=>atom.element).join(',');
      check(`${pathway.id}/${template.id}/${requested}`,'binding distance',bindingError<1e-9,`error ${bindingError.toExponential(3)} Å`);
      check(`${pathway.id}/${template.id}/${requested}`,'rigid internal geometry',pair.maximum<1e-9,`RMS ${pair.rms.toExponential(3)} Å; max ${pair.maximum.toExponential(3)} Å`);
      check(`${pathway.id}/${template.id}/${requested}`,'outward axis',angle<1e-6,`${angle.toExponential(3)}°`);
      check(`${pathway.id}/${template.id}/${requested}`,'finite coordinates',finite,'all generated coordinates finite');
      check(`${pathway.id}/${template.id}/${requested}`,'CIF round trip',roundTrip,`${reparsed.atoms.length} reparsed atoms`);
      geometries.push({pathway:pathway.id,intermediate:template.id,requested_distance_A:requested,binding_error_A:bindingError,internal_rms_error_A:pair.rms,internal_max_error_A:pair.maximum,axis_angle_deg:angle,collisions_at_1_6_A:collision.collisions,closest_contact_A:Number.isFinite(collision.closest)?collision.closest:null,cif_round_trip:roundTrip});
      timings.push({pathway:pathway.id,intermediate:template.id,atoms:template.atoms.length,generation_ms:elapsed});
    }
  }
}

const suggestions=suggestPlacementSpheres(catalyst.atoms,activeIndex,1.8,1.2,6);
check('sphere suggestions','requested count',suggestions.length===6,`${suggestions.length} suggestions`);
check('sphere suggestions','centres at requested distance',suggestions.every(item=>Math.abs(distance(item.centre,{x:active.cx,y:active.cy,z:active.cz})-1.8)<1e-9),'all centres at 1.8 Å');
check('sphere suggestions','ranked by occupancy',suggestions.every((item,index)=>index===0||suggestions[index-1].atomsInside<=item.atomsInside),suggestions.map(item=>item.atomsInside).join(','));
const synthetic=[{cx:0,cy:0,cz:0},{cx:0,cy:0,cz:2.1}], probe=[{element:'H',x:0,y:0,z:1.8,binding:true}];
const collision=evaluatePlacement(synthetic,probe,0,1.6), volume=evaluatePlacementVolume(synthetic,probe,0,0.5);
check('negative controls','collision detected',!collision.valid&&collision.collisions===1,`${collision.collisions} collision`);
check('negative controls','clearance intrusion detected',volume.catalystAtomsInside===1,`${volume.catalystAtomsInside} catalyst atom inside`);

const names=INTERMEDIATE_PATHWAYS.flatMap(pathway=>pathway.templates.map((template,index)=>`${pathway.exportLabel}/${String(index+1).padStart(2,'0')}_halfc1_${template.id}.cif`));
check('exports','globally unique pathway filenames',new Set(names).size===names.length,`${names.length} unique names`);
const passed=rules.filter(rule=>rule.status==='pass').length;
const values=timings.map(item=>item.generation_ms).sort((a,b)=>a-b), median=values[Math.floor(values.length/2)]??0;
const report={schemaVersion:1,benchmarkType:'Intermediate Maker geometry and CIF export',source:{filename:'halfc1.cif',sha256:createHash('sha256').update(sourceText).digest('hex'),atoms:catalyst.atoms.length,activeAtom:{index:activeIndex+1,element:active.element}},environment:{timestampUtc:new Date().toISOString(),node:process.version,platform:process.platform,architecture:process.arch,osRelease:os.release(),cpu:os.cpus()[0]?.model??'unavailable'},tolerances:{bindingDistanceA:1e-9,internalDistanceA:1e-9,axisAngleDegrees:1e-6},summary:{pathways:INTERMEDIATE_PATHWAYS.length,uniqueTemplates:new Set(INTERMEDIATE_PATHWAYS.flatMap(item=>item.templates.map(template=>`${item.id}/${template.id}`))).size,placements:geometries.length,rules:rules.length,passed,failed:rules.length-passed,maximumBindingErrorA:Math.max(...geometries.map(item=>item.binding_error_A)),maximumInternalErrorA:Math.max(...geometries.map(item=>item.internal_max_error_A)),maximumAxisAngleDegrees:Math.max(...geometries.map(item=>item.axis_angle_deg)),cifRoundTripPassed:geometries.filter(item=>item.cif_round_trip).length,medianGenerationMs:median},pathways:INTERMEDIATE_PATHWAYS.map(item=>({id:item.id,family:item.family,order:item.templates.map(template=>template.id)})),rules,geometries,timings};
const csv = (rows) => [Object.keys(rows[0]),...rows.map(Object.values)].map(row=>row.map(value=>`"${String(value??'').replaceAll('"','""')}"`).join(',')).join('\n')+'\n';
const results=path.join(root,'results');await mkdir(results,{recursive:true});
await Promise.all([writeFile(path.join(results,'latest-intermediate-maker.json'),JSON.stringify(report,null,2)+'\n'),writeFile(path.join(results,'latest-intermediate-geometries.csv'),csv(geometries)),writeFile(path.join(results,'latest-intermediate-performance.csv'),csv(timings))]);
console.log(`Intermediate Maker benchmark: ${passed}/${rules.length} rules passed; ${geometries.length} placements across ${INTERMEDIATE_PATHWAYS.length} pathways.`);
console.log(`Maximum binding error: ${report.summary.maximumBindingErrorA.toExponential(3)} Å; maximum internal error: ${report.summary.maximumInternalErrorA.toExponential(3)} Å; CIF round trips: ${report.summary.cifRoundTripPassed}/${geometries.length}.`);
if(passed!==rules.length)process.exitCode=1;
