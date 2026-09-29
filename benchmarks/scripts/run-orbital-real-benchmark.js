import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { calculateOrbitalMetric, columnLetter } from '../../src/lib/orbitalMetrics.js';
import { parsePdosFile, validatePdosCollection } from '../../src/lib/pdosAnalysis.js';

const directory=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../fixtures/orbital-metrics/qe-real');
const resultsDirectory=path.resolve(directory,'../../../results');
const manifest=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8'));
const tolerance=1e-11;
const rows=[];
const parsed=[];
const rawLayouts={p:['pz','px','py'],d:['dz2','dzx','dzy','dx2-y2','dxy']};

const integrate=(energy,values)=>{
  let area=0,moment=0;
  for(let index=1;index<energy.length;index+=1){const dx=energy[index]-energy[index-1];area+=dx*(values[index-1]+values[index])/2;moment+=dx*(energy[index-1]*values[index-1]+energy[index]*values[index])/2;}
  return {area,centre:Math.abs(area)<1e-14?null:moment/area};
};

const clippedAtFermi=(energy,values,fermiEnergy)=>{
  const points=[];
  for(let index=0;index<energy.length;index+=1){
    if(energy[index]<=fermiEnergy)points.push([energy[index],values[index]]);
    if(energy[index]===fermiEnergy)break;
    if(index&&energy[index]>fermiEnergy&&energy[index-1]<fermiEnergy){const fraction=(fermiEnergy-energy[index-1])/(energy[index]-energy[index-1]);points.push([fermiEnergy,values[index-1]+fraction*(values[index]-values[index-1])]);break;}
  }
  return {energy:points.map(point=>point[0]),values:points.map(point=>point[1])};
};

for(const item of manifest.files){
  const text=await readFile(path.join(directory,item.filename),'utf8');
  const hash=createHash('sha256').update(text).digest('hex');
  const record=parsePdosFile(item.filename,text);parsed.push({...record,group:item.group});
  const numeric=text.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#')).map(line=>line.split(/\s+/).map(Number));
  const energy=numeric.map(row=>row[0]),components=rawLayouts[item.orbital];
  const rawChannels={};components.forEach((name,index)=>{rawChannels[`${name}_up`]=numeric.map(row=>row[3+2*index]);rawChannels[`${name}_down`]=numeric.map(row=>row[4+2*index]);});
  const columns=[{letter:'A',name:'Energy_eV',values:record.energy,energy:true},...Object.entries(record.channels).map(([name,values],index)=>({letter:columnLetter(index+1),name,values}))];
  const dataset={energy:record.energy,columns};
  const fermiEnergyEv=manifest.fermiEnergiesEv[item.group];
  for(const [channel,rawValues] of Object.entries(rawChannels)){
    const reference=integrate(energy,rawValues);
    const area=calculateOrbitalMetric(dataset,{type:'occupancy',sourceName:channel,rangeEnabled:false});
    const centre=calculateOrbitalMetric(dataset,{type:'centre',sourceName:channel,rangeEnabled:false});
    const areaError=Math.abs(area.value-reference.area),centreError=Math.abs(centre.value-reference.centre);
    const occupiedRaw=clippedAtFermi(energy,rawValues,fermiEnergyEv),occupiedReference=integrate(occupiedRaw.energy,occupiedRaw.values);
    const occupiedArea=calculateOrbitalMetric(dataset,{type:'occupancy',sourceName:channel,rangeEnabled:true,xMin:energy[0],xMax:fermiEnergyEv});
    const occupiedCentre=calculateOrbitalMetric(dataset,{type:'centre',sourceName:channel,rangeEnabled:true,xMin:energy[0],xMax:fermiEnergyEv});
    const occupiedAreaError=Math.abs(occupiedArea.value-occupiedReference.area),occupiedCentreError=Math.abs(occupiedCentre.value-occupiedReference.centre);
    rows.push({file:item.filename,group:item.group,species:item.species,atomNumber:item.atomNumber,orbital:item.orbital,channel,pointCount:record.pointCount,energyMinimumEv:energy[0],energyMaximumEv:energy.at(-1),fermiEnergyEv,referenceIntegral:reference.area,websiteIntegral:area.value,integralAbsoluteError:areaError,referenceCentreEv:reference.centre,websiteCentreEv:centre.value,centreAbsoluteError:centreError,referenceOccupiedIntegral:occupiedReference.area,websiteOccupiedIntegral:occupiedArea.value,occupiedIntegralAbsoluteError:occupiedAreaError,referenceOccupiedCentreEv:occupiedReference.centre,websiteOccupiedCentreEv:occupiedCentre.value,occupiedCentreAbsoluteErrorEv:occupiedCentreError,status:hash===item.sha256&&record.spinMode==='spin'&&areaError<=tolerance&&centreError<=tolerance&&occupiedAreaError<=tolerance&&occupiedCentreError<=tolerance?'pass':'fail'});
  }
}

const groups={};
for(const record of parsed){(groups[record.group]??=[]).push(record);}
const compatibility=Object.entries(groups).map(([group,records])=>{try{const result=validatePdosCollection(records);return{group,status:'pass',files:records.length,...result};}catch(error){return{group,status:'fail',files:records.length,diagnostic:error.message};}});
const passed=rows.filter(row=>row.status==='pass').length;
const spinSummary=manifest.files.map(item=>{const itemRows=rows.filter(row=>row.file===item.filename),up=itemRows.filter(row=>row.channel.endsWith('_up')).reduce((sum,row)=>sum+row.websiteOccupiedIntegral,0),down=itemRows.filter(row=>row.channel.endsWith('_down')).reduce((sum,row)=>sum+row.websiteOccupiedIntegral,0);return{file:item.filename,group:item.group,orbital:item.orbital,fermiEnergyEv:manifest.fermiEnergiesEv[item.group],occupiedUp:up,occupiedDown:down,occupiedTotal:up+down,spinDifference:up-down,spinPolarization:Math.abs(up+down)<1e-14?null:(up-down)/(up+down)};});
const report={schemaVersion:1,benchmarkType:'Real QE orbital parsing, full-grid metrics, and occupied-state metrics',datasetVersion:manifest.datasetVersion,scopeNote:'Occupied metrics integrate from the file minimum energy to the user-supplied Fermi energy, with linear interpolation at the Fermi boundary.',fermiEnergiesEv:manifest.fermiEnergiesEv,environment:{timestampUtc:new Date().toISOString(),node:process.version,platform:process.platform,architecture:process.arch,osRelease:os.release(),cpu:os.cpus()[0]?.model??'unavailable'},summary:{files:manifest.files.length,channelMetrics:rows.length,passed,failed:rows.length-passed,maximumIntegralAbsoluteError:Math.max(...rows.map(row=>row.integralAbsoluteError)),maximumCentreAbsoluteErrorEv:Math.max(...rows.map(row=>row.centreAbsoluteError)),maximumOccupiedIntegralAbsoluteError:Math.max(...rows.map(row=>row.occupiedIntegralAbsoluteError)),maximumOccupiedCentreAbsoluteErrorEv:Math.max(...rows.map(row=>row.occupiedCentreAbsoluteErrorEv))},compatibility,spinSummary,cases:rows};
const headers=['file','group','species','atom_number','orbital','channel','points','energy_min_ev','energy_max_ev','fermi_energy_ev','reference_full_integral','website_full_integral','full_integral_absolute_error','reference_full_centre_ev','website_full_centre_ev','full_centre_absolute_error_ev','reference_occupied_integral','website_occupied_integral','occupied_integral_absolute_error','reference_occupied_centre_ev','website_occupied_centre_ev','occupied_centre_absolute_error_ev','status'];
const csvCell=value=>`"${String(value??'').replaceAll('"','""')}"`;
const csv=[headers,...rows.map(row=>[row.file,row.group,row.species,row.atomNumber,row.orbital,row.channel,row.pointCount,row.energyMinimumEv,row.energyMaximumEv,row.fermiEnergyEv,row.referenceIntegral,row.websiteIntegral,row.integralAbsoluteError,row.referenceCentreEv,row.websiteCentreEv,row.centreAbsoluteError,row.referenceOccupiedIntegral,row.websiteOccupiedIntegral,row.occupiedIntegralAbsoluteError,row.referenceOccupiedCentreEv,row.websiteOccupiedCentreEv,row.occupiedCentreAbsoluteErrorEv,row.status])].map(row=>row.map(csvCell).join(',')).join('\n')+'\n';
await mkdir(resultsDirectory,{recursive:true});
const json=JSON.stringify(report,null,2)+'\n';
await Promise.all([writeFile(path.join(resultsDirectory,'latest-orbital-real.json'),json),writeFile(path.join(resultsDirectory,'latest-orbital-real.csv'),csv)]);
console.log(`Real QE orbital benchmark: ${passed}/${rows.length} channel metrics passed across ${manifest.files.length} files.`);
for(const item of compatibility)console.log(`${item.status.toUpperCase()}  ${item.group}: ${item.files} file(s), ${item.pointCount??'—'} points`);
console.log(`Maximum errors: integral ${report.summary.maximumIntegralAbsoluteError.toExponential(3)}, centre ${report.summary.maximumCentreAbsoluteErrorEv.toExponential(3)} eV.`);
console.log(`Occupied-state maximum errors: integral ${report.summary.maximumOccupiedIntegralAbsoluteError.toExponential(3)}, centre ${report.summary.maximumOccupiedCentreAbsoluteErrorEv.toExponential(3)} eV.`);
if(passed!==rows.length||compatibility.some(item=>item.status!=='pass'))process.exitCode=1;
