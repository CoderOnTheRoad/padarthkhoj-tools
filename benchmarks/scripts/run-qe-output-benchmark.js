import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { parseCIF } from '../../src/lib/cifParser.js';
import { buildIN, parseQEOut, patchInputFile } from '../../src/lib/qeInputGenerator.js';
import { generateAtomicPositions, generateCIF, parseQEOutput } from '../../src/lib/qeParser.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),rules=[],cases=[];
const realDirectory=path.join(root,'fixtures/qe-output/real');
const manifest=JSON.parse(await readFile(path.join(realDirectory,'manifest.json'),'utf8'));
const check=(scope,rule,passed,detail)=>rules.push({scope,rule,status:passed?'pass':'fail',detail});
const close=(actual,expected,tolerance=1e-10)=>actual===null&&expected===null||Number.isFinite(actual)&&Number.isFinite(expected)&&Math.abs(actual-expected)<=tolerance;
const header=(calculation="'scf'")=>`calculation = ${calculation}\nlattice parameter (alat) = 10.0000 a.u.\ncrystal axes: (cart. coord. in units of alat)\na(1) = (1 0 0)\na(2) = (0 1 0)\na(3) = (0 0 1)\nsite n. atom positions (alat units)\n1 Si tau(1) = (0 0 0)\n2 Si tau(2) = (0.25 0.25 0.25)\n`;

const fixtures=[];
for(const item of manifest.files){
  const text=await readFile(path.join(realDirectory,item.filename),'utf8');
  fixtures.push({id:`real-${item.calculationType}`,filename:item.filename,text,expected:{...item.expected,calcType:item.calculationType,isRelaxed:item.calculationType!=='scf',ionicSteps:item.calculationType==='scf'?0:item.calculationType==='relax'?171:14,convergenceAchieved:true},sha256:item.sha256,referenceType:'real'});
}
fixtures.push(
  {id:'controlled-interrupted-latest',filename:'controlled-interrupted.out',text:header("'vc-relax'")+`CELL_PARAMETERS (bohr)\n10.1 0 0\n0 10.1 0\n0 0 10.1\nATOMIC_POSITIONS (bohr)\nSi 0 0 0\nSi 2.6 2.6 2.6\n! total energy = -13.0 Ry\nTotal force = 0.20 Ry/Bohr\nconvergence NOT achieved after 100 iterations\nError in routine electrons (1): charge is wrong`,expected:{calcType:'vc-relax',atoms:2,isRelaxed:false,structureSource:'latest',ionicSteps:1,energyPoints:1,finalEnergyRy:-13,finalForceRyBohr:.2,finalPressureKbar:null,scfIterations:0,jobDone:false,errors:2,convergenceAchieved:false},referenceType:'synthetic-negative-control'},
  {id:'controlled-malformed',filename:'malformed.txt',text:'This is not a Quantum ESPRESSO output file.',expected:{calcType:'unknown',atoms:0,isRelaxed:false,structureSource:null,ionicSteps:0,energyPoints:0,finalEnergyRy:null,finalForceRyBohr:null,finalPressureKbar:null,scfIterations:0,jobDone:false,errors:0,convergenceAchieved:false},referenceType:'synthetic-negative-control'},
);

for(const fixture of fixtures){
  const started=performance.now(),parsed=parseQEOutput(fixture.text),parseMs=performance.now()-started,expected=fixture.expected;
  if(fixture.referenceType==='real')check(fixture.id,'SHA-256 fixture integrity',createHash('sha256').update(fixture.text).digest('hex')===fixture.sha256,fixture.sha256);
  check(fixture.id,'calculation type',parsed.calcType===expected.calcType,parsed.calcType);
  check(fixture.id,'relaxation status',parsed.isRelaxed===expected.isRelaxed,String(parsed.isRelaxed));
  check(fixture.id,'selected structure source',(parsed.final?.source??null)===expected.structureSource,parsed.final?.source??'none');
  check(fixture.id,'atom count',(parsed.final?.atoms.length??0)===expected.atoms,`${parsed.final?.atoms.length??0} atoms`);
  check(fixture.id,'ionic-step history',parsed.nSteps===expected.ionicSteps,`${parsed.nSteps} coordinate snapshots`);
  check(fixture.id,'energy history',parsed.energiesRy.length===expected.energyPoints,`${parsed.energiesRy.length} points`);
  check(fixture.id,'final energy',close(parsed.finalEnergyRy,expected.finalEnergyRy),`${parsed.finalEnergyRy??'none'} Ry`);
  check(fixture.id,'final force',close(parsed.finalForceRyBohr,expected.finalForceRyBohr),`${parsed.finalForceRyBohr??'none'} Ry/Bohr`);
  check(fixture.id,'final pressure',close(parsed.finalPressureKbar,expected.finalPressureKbar),`${parsed.finalPressureKbar??'none'} kbar`);
  check(fixture.id,'SCF iteration history',parsed.scfIterations.length===expected.scfIterations,`${parsed.scfIterations.length} iterations`);
  check(fixture.id,'convergence detection',parsed.convergenceAchieved===expected.convergenceAchieved,String(parsed.convergenceAchieved));
  check(fixture.id,'JOB DONE detection',parsed.jobDone===expected.jobDone,String(parsed.jobDone));
  check(fixture.id,'error count',parsed.errors.length===expected.errors,parsed.errors.map(item=>item.message).join(' | ')||'none');
  let exportMs=0;
  if(parsed.final){
    const exportStarted=performance.now(),cif=generateCIF(parsed.final,fixture.filename),positions=generateAtomicPositions(parsed.final),reparsed=parseCIF(cif);exportMs=performance.now()-exportStarted;
    const positionAtoms=positions.split(/\r?\n/).filter(line=>/^\s*[A-Z][a-z]?\s+[-+\d.]/.test(line)).length;
    check(fixture.id,'CIF round trip',reparsed.atoms.length===expected.atoms,`${reparsed.atoms.length} atoms`);
    check(fixture.id,'ATOMIC_POSITIONS export',positionAtoms===expected.atoms,`${positionAtoms} atoms`);
    check(fixture.id,'finite structure export',!/(?:NaN|undefined|Infinity)/.test(cif+positions),'clean numeric output');
  }
  cases.push({case:fixture.id,reference_type:fixture.referenceType,filename:fixture.filename,bytes:fixture.text.length,calc_type:parsed.calcType,is_relaxed:parsed.isRelaxed,structure_source:parsed.final?.source??'',atoms:parsed.final?.atoms.length??0,ionic_steps:parsed.nSteps,scf_iterations:parsed.scfIterations.length,energy_points:parsed.energiesRy.length,final_energy_Ry:parsed.finalEnergyRy,final_force_Ry_Bohr:parsed.finalForceRyBohr,final_pressure_kbar:parsed.finalPressureKbar,job_done:parsed.jobDone,error_count:parsed.errors.length,parse_ms:parseMs,export_ms:exportMs});
}

const interrupted=fixtures.find(item=>item.id==='controlled-interrupted-latest').text,bohr=parseQEOutput(interrupted);
check('unit conversion','bohr cell converted to angstrom',Math.abs(bohr.final.params.a-10.1*0.529177210903)<1e-10,`${bohr.final.params.a} Å`);
check('unit conversion','bohr atoms converted to angstrom',Math.abs(bohr.final.atoms[1].x-2.6*0.529177210903)<1e-10,`${bohr.final.atoms[1].x} Å`);

const restartReference=`calculation = 'vc-relax'\nlattice parameter (alat) = 10.0000 a.u.\ncrystal axes: (cart. coord. in units of alat)\na(1) = (1 0 0)\na(2) = (0 1 0)\na(3) = (0 0 1)\nsite n. atom positions (alat units)\n1 Si tau(1) = (0 0 0)\n2 Si tau(2) = (0.25 0.25 0.25)\nBegin final coordinates\nCELL_PARAMETERS (angstrom)\n5.43 0 0\n0 5.43 0\n0 0 5.43\nATOMIC_POSITIONS (crystal)\nSi 0 0 0\nSi .251 .251 .251\nEnd final coordinates\n`;
const rich=parseQEOut(restartReference),original=`&CONTROL\n calculation='vc-relax'\n/\n&SYSTEM\n ibrav=0\n nat=2\n ntyp=1\n ecutwfc=60\n/\nCELL_PARAMETERS (angstrom)\n5.0 0 0\n0 5.0 0\n0 0 5.0\nATOMIC_POSITIONS (crystal)\nSi 0 0 0\nSi .25 .25 .25\nK_POINTS gamma\n`,patched=patchInputFile(original,rich);
check('interrupted-run fixer','cell updated',patched.changes.cell&&patched.changes.cellMethod==='card'&&/5\.4300000000/.test(patched.text),'CELL_PARAMETERS card');
check('interrupted-run fixer','atoms updated',patched.changes.atoms&&/Si\s+0\.2510000000/.test(patched.text),'final atomic positions');
check('interrupted-run fixer','unrelated settings preserved',/ecutwfc=60/.test(patched.text)&&/K_POINTS gamma/.test(patched.text),'ecutwfc and k points');
const rebuilt=buildIN(rich,false);check('interrupted-run fixer','output-only reconstruction',/ATOMIC_POSITIONS \{crystal\}/.test(rebuilt)&&/CELL_PARAMETERS \(angstrom\)/.test(rebuilt)&&!/undefined|NaN/.test(rebuilt),'complete reconstructed input');

const passed=rules.filter(rule=>rule.status==='pass').length,report={schemaVersion:2,benchmarkType:'QE Output Studio using real production SCF, relax, and vc-relax outputs plus controlled failure cases',environment:{timestampUtc:new Date().toISOString(),node:process.version,platform:process.platform,architecture:process.arch,osRelease:os.release(),cpu:os.cpus()[0]?.model??'unavailable'},summary:{cases:cases.length,realCases:cases.filter(item=>item.reference_type==='real').length,controlledCases:cases.filter(item=>item.reference_type!=='real').length,validStructures:cases.filter(item=>item.atoms>0).length,totalEnergyPoints:cases.reduce((sum,item)=>sum+item.energy_points,0),rules:rules.length,passed,failed:rules.length-passed},rules,cases};
const csv=[Object.keys(cases[0]),...cases.map(Object.values)].map(row=>row.map(value=>`"${String(value??'').replaceAll('"','""')}"`).join(',')).join('\n')+'\n',results=path.join(root,'results');await mkdir(results,{recursive:true});await Promise.all([writeFile(path.join(results,'latest-qe-output.json'),JSON.stringify(report,null,2)+'\n'),writeFile(path.join(results,'latest-qe-output-cases.csv'),csv)]);
console.log(`QE Output Studio benchmark: ${passed}/${rules.length} rules passed across ${report.summary.realCases} real and ${report.summary.controlledCases} controlled cases.`);
if(passed!==rules.length)process.exitCode=1;
