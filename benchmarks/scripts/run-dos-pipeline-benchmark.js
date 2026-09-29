import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { calculateOrbitalMetric, parseOrbitalMetricsCsv } from '../../src/lib/orbitalMetrics.js';
import { buildPdosExportFilename, parsePdosUpload, parseVaspPoscarSpecies, pdosResultToCsv, sumPdosRecords, summarizePdosRecords, validatePdosCollection } from '../../src/lib/pdosAnalysis.js';
import { applyDosTemplate, createDatasetView, getDosFillPoints, parseDosCsv, parseDosTemplate, serializeDosTemplate } from '../../src/lib/scientificDosPlot.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const qeDirectory=path.join(root,'fixtures/orbital-metrics/qe-real');
const manifest=JSON.parse(await readFile(path.join(qeDirectory,'manifest.json'),'utf8'));
const vaspDirectory=path.join(root,'fixtures/dos-pipeline/vasp-real');
const vaspManifest=JSON.parse(await readFile(path.join(vaspDirectory,'manifest.json'),'utf8'));
const rules=[],rows=[];
const check=(scope,rule,passed,detail)=>rules.push({scope,rule,status:passed?'pass':'fail',detail});
const integrate=(energy,values)=>{let area=0,moment=0;for(let i=1;i<energy.length;i++){const dx=energy[i]-energy[i-1];area+=dx*(values[i-1]+values[i])/2;moment+=dx*(energy[i-1]*values[i-1]+energy[i]*values[i])/2;}return{area,centre:Math.abs(area)<1e-14?null:moment/area};};
const close=(a,b,tolerance=1e-10)=>a===null&&b===null||Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=tolerance;
const template=parseDosTemplate(serializeDosTemplate('Benchmark style',{palette:'vivid',lineWidth:3,fontFamily:'Times New Roman',legendPosition:'bottom-left',xDecimals:3,yDecimals:4},{down:{lineStyle:'dotted'}}));

const runPipeline=(id,records,fermiEnergy,metadata={})=>{
  const started=performance.now(),compatibility=validatePdosCollection(records),summary=summarizePdosRecords(records);
  const result=sumPdosRecords(records,{fermiEnergy}),csv=pdosResultToCsv(result),plot=createDatasetView(parseDosCsv(csv,`${id}.csv`));
  applyDosTemplate(plot,template);
  const metricData=parseOrbitalMetricsCsv(csv,`${id}.csv`),channel=Object.keys(result.channels).find(name=>!/^LDOS/i.test(name))||Object.keys(result.channels)[0];
  const reference=integrate(result.energy,result.channels[channel]);
  const occupancy=calculateOrbitalMetric(metricData,{type:'occupancy',sourceName:channel,rangeEnabled:false});
  const centre=calculateOrbitalMetric(metricData,{type:'centre',sourceName:channel,rangeEnabled:false});
  const fill=getDosFillPoints(result.energy,result.channels[channel],true,result.energy[0]+(result.energy.at(-1)-result.energy[0])*.25,result.energy[0]+(result.energy.at(-1)-result.energy[0])*.75);
  const filename=buildPdosExportFilename({sourceFilenames:records.map(record=>record.sourceFilename||record.filename),selectionMode:metadata.selectionMode||'manual',atomNumbers:summary.atoms.map(atom=>atom.atomNumber),species:summary.species,orbitals:summary.orbitals});
  check(id,'compatible selected records',compatibility.pointCount===result.energy.length,`${records.length} records, ${result.energy.length} points`);
  check(id,'Fermi shift',Math.abs(result.energy[0]-(records[0].energy[0]-fermiEnergy))<1e-12,`${records[0].energy[0]} − ${fermiEnergy} = ${result.energy[0]} eV`);
  check(id,'CSV plotter round trip',plot.energy.length===result.energy.length&&Object.keys(plot.channels).every(name=>result.channels[name].every((value,index)=>value===plot.channels[name][index])),`${plot.energy.length} rows, ${Object.keys(plot.channels).length} channels`);
  check(id,'spin mode preserved',plot.spinMode===result.spinMode,result.spinMode);
  check(id,'plot template applied',plot.style.lineWidth===3&&plot.style.fontFamily==='Times New Roman'&&plot.style.legendPosition==='bottom-left','line 3; Times New Roman; bottom-left legend');
  check(id,'fill-range interpolation',fill.length>=2&&fill[0].x>result.energy[0]&&fill.at(-1).x<result.energy.at(-1),`${fill.length} fill points`);
  check(id,'occupancy',occupancy.status==='ok'&&close(occupancy.value,reference.area),`error ${Math.abs(occupancy.value-reference.area).toExponential(3)}`);
  check(id,'orbital centre',centre.status==='ok'&&close(centre.value,reference.centre),`error ${Math.abs(centre.value-reference.centre).toExponential(3)} eV`);
  check(id,'recognizable filename',filename.endsWith('_pdos.csv')&&!/[\s#()]/.test(filename),filename);
  rows.push({dataset:id,source:metadata.source||records[0].sourceCode||'Quantum ESPRESSO',spin_mode:result.spinMode,records:records.length,points:result.energy.length,fermi_energy_eV:fermiEnergy,energy_min_shifted_eV:result.energy[0],energy_max_shifted_eV:result.energy.at(-1),metric_channel:channel,occupancy:occupancy.value,reference_occupancy:reference.area,occupancy_error:Math.abs(occupancy.value-reference.area),centre_eV:centre.value,reference_centre_eV:reference.centre,centre_error_eV:Math.abs(centre.value-reference.centre),csv_filename:filename,elapsed_ms:performance.now()-started});
};

const qeGroups={};
for(const item of manifest.files){const text=await readFile(path.join(qeDirectory,item.filename),'utf8'),parsed=parsePdosUpload(item.filename,text);check(item.group,`${item.filename}: checksum`,createHash('sha256').update(text).digest('hex')===item.sha256,'fixture unchanged');(qeGroups[item.group]??=[]).push(...parsed.records);}
for(const [group,records] of Object.entries(qeGroups)){
  check(group,'QE metadata selection',records.every(record=>record.sourceCode==='Quantum ESPRESSO'&&record.species===manifest.files.find(item=>item.group===group).species),`${records[0].species}; atom ${records[0].atomNumber}`);
  runPipeline(`QE-${group}`,records,manifest.fermiEnergiesEv[group],{source:'Quantum ESPRESSO',selectionMode:'species'});
}

const vaspUploads={};
for(const dataset of vaspManifest.datasets){
  const directory=path.join(vaspDirectory,dataset.directory);
  const [doscar,structure]=await Promise.all([readFile(path.join(directory,dataset.doscar),'utf8'),readFile(path.join(directory,dataset.structure),'utf8')]);
  check(dataset.id,'DOSCAR checksum',createHash('sha256').update(doscar).digest('hex')===dataset.doscarSha256,'fixture unchanged');
  check(dataset.id,`${dataset.structure} checksum`,createHash('sha256').update(structure).digest('hex')===dataset.structureSha256,'fixture unchanged');
  const upload=parsePdosUpload(dataset.doscar,doscar),species=parseVaspPoscarSpecies(structure);
  upload.records.forEach(record=>{record.species=species.speciesByAtom.get(record.atomNumber);});
  const parsedAtomCount=new Set(upload.records.map(record=>record.atomNumber)).size;
  check(dataset.id,'atom count',parsedAtomCount===dataset.atomCount,`${parsedAtomCount} ions represented by ${upload.records.length} orbital records`);
  check(dataset.id,'energy-grid count',upload.records.every(record=>record.energy.length===dataset.nedos),`${upload.records[0].energy.length} points`);
  check(dataset.id,'spin mode detected',upload.records.every(record=>record.spinMode===dataset.spinMode),upload.records[0].spinMode);
  check(dataset.id,'Fermi energy detected',Math.abs(upload.fermiEnergy-dataset.fermiEnergyEv)<1e-10,`${upload.fermiEnergy} eV`);
  const mappedComposition={};for(const element of species.speciesByAtom.values())mappedComposition[element]=(mappedComposition[element]||0)+1;
  check(dataset.id,'structure species mapping',JSON.stringify(mappedComposition)===JSON.stringify(dataset.composition),JSON.stringify(mappedComposition));
  const selectedSpecies=Object.keys(dataset.composition)[0],selected=upload.records.filter(record=>record.species===selectedSpecies);
  const selectedAtomCount=new Set(selected.map(record=>record.atomNumber)).size;
  check(dataset.id,'representative species selection',selectedAtomCount===dataset.composition[selectedSpecies],`${selectedAtomCount} ${selectedSpecies} ions represented by ${selected.length} orbital records`);
  runPipeline(dataset.id,selected,upload.fermiEnergy,{source:'VASP',selectionMode:'species'});
  vaspUploads[dataset.spinMode]=upload;
}

let rejected='';try{validatePdosCollection([qeGroups['Cu-pd'][0],vaspUploads['non-spin'].records[0]]);}catch(error){rejected=error.message;}
check('negative controls','mixed spin modes rejected',/cannot be summed/.test(rejected),rejected);
let badCsv='';try{parseDosCsv('Energy_eV,d\n0,1\n-1,2\n','descending.csv');}catch(error){badCsv=error.message;}
check('negative controls','descending plot grid rejected',/strictly increasing/.test(badCsv),badCsv);

const passed=rules.filter(rule=>rule.status==='pass').length,report={schemaVersion:1,benchmarkType:'End-to-end QE and VASP projected DOS data pipeline',scope:'Raw PDOS/DOSCAR and POSCAR → selection → Fermi alignment → CSV → DOS Plotter → orbital metrics',environment:{timestampUtc:new Date().toISOString(),node:process.version,platform:process.platform,architecture:process.arch,osRelease:os.release(),cpu:os.cpus()[0]?.model??'unavailable'},summary:{datasets:rows.length,qeDatasets:Object.keys(qeGroups).length,vaspDatasets:2,spinDatasets:rows.filter(row=>row.spin_mode==='spin').length,nonSpinDatasets:rows.filter(row=>row.spin_mode==='non-spin').length,rules:rules.length,passed,failed:rules.length-passed,maximumOccupancyError:Math.max(...rows.map(row=>row.occupancy_error)),maximumCentreErrorEv:Math.max(...rows.map(row=>row.centre_error_eV))},rules,datasets:rows};
const csv=[Object.keys(rows[0]),...rows.map(Object.values)].map(row=>row.map(value=>`"${String(value??'').replaceAll('"','""')}"`).join(',')).join('\n')+'\n',results=path.join(root,'results');await mkdir(results,{recursive:true});await Promise.all([writeFile(path.join(results,'latest-dos-pipeline.json'),JSON.stringify(report,null,2)+'\n'),writeFile(path.join(results,'latest-dos-pipeline-metrics.csv'),csv)]);
console.log(`DOS/PDOS pipeline benchmark: ${passed}/${rules.length} rules passed across ${rows.length} datasets (${report.summary.spinDatasets} spin, ${report.summary.nonSpinDatasets} non-spin).`);
console.log(`Maximum downstream errors: occupancy ${report.summary.maximumOccupancyError.toExponential(3)}, centre ${report.summary.maximumCentreErrorEv.toExponential(3)} eV.`);
if(passed!==rules.length)process.exitCode=1;
