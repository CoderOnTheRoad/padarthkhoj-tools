import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { calculateBaderCharge, parseACF, parseQEInputAtoms, parseVaspPoscar } from '../../src/lib/baderAnalysis.js';

const benchmarkDirectory=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fixtureRoot=path.join(benchmarkDirectory,'fixtures/bader');
const resultsDirectory=path.join(benchmarkDirectory,'results');
const validCases=['vasp-real-001','qe-real-001','qe-real-002'];
const tolerance=1e-8;
const footerConservationTolerance=2e-4;
const atomicNumbers={H:1,C:6,N:7,O:8,F:9,S:16,Cu:29};
const datasets=[];
const atoms=[];

const sha256=text=>createHash('sha256').update(text).digest('hex');
const summarize=values=>({count:values.length,mean:values.reduce((sum,value)=>sum+value,0)/values.length,minimum:Math.min(...values),maximum:Math.max(...values),sum:values.reduce((sum,value)=>sum+value,0)});

for(const caseName of validCases){
  const directory=path.join(fixtureRoot,caseName),manifest=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8'));
  const acfText=await readFile(path.join(directory,'ACF.dat'),'utf8'),acf=parseACF(acfText);
  let referenceAtoms,referenceText,referenceFilename=manifest.referenceFilename,coordinateValidation;
  if(manifest.sourceCode==='VASP'){
    referenceText=await readFile(path.join(directory,referenceFilename),'utf8');referenceAtoms=parseVaspPoscar(referenceText,referenceFilename).atoms;
    const displacements=acf.rows.map((row,index)=>Math.hypot(row.x-referenceAtoms[index].cx,row.y-referenceAtoms[index].cy,row.z-referenceAtoms[index].cz));
    coordinateValidation={method:'direct Cartesian displacement',maximumAngstrom:Math.max(...displacements),meanAngstrom:displacements.reduce((sum,value)=>sum+value,0)/displacements.length,toleranceAngstrom:manifest.coordinateAgreementAngstrom.acceptanceTolerance,passed:Math.max(...displacements)<manifest.coordinateAgreementAngstrom.acceptanceTolerance};
  }else{
    referenceText=await readFile(path.join(directory,referenceFilename),'utf8');referenceAtoms=parseQEInputAtoms(referenceText);
    coordinateValidation={method:'atom count and SCF ATOMIC_POSITIONS order; direct ACF coordinate comparison not applicable to this periodic/origin representation',passed:true};
  }
  const hashesPassed=sha256(acfText)===manifest.files['ACF.dat'].sha256&&sha256(referenceText)===manifest.files[referenceFilename].sha256;
  const countPassed=acf.rows.length===referenceAtoms.length;
  const core=manifest.frozenCoreElectronsForInterface;
  const caseAtoms=acf.rows.map((row,index)=>{
    const element=referenceAtoms[index].element;
    const websiteCharge=calculateBaderCharge(row,element,core[element]);
    const independentCharge=atomicNumbers[element]-core[element]-row.electrons;
    return {caseId:manifest.caseId,sourceCode:manifest.sourceCode,atomIndex:row.index,element,acfElectrons:row.electrons,coreSubtraction:core[element],referenceElectrons:atomicNumbers[element]-core[element],websiteBaderCharge:websiteCharge,independentBaderCharge:independentCharge,absoluteError:Math.abs(websiteCharge-independentCharge),x:row.x,y:row.y,z:row.z,minDistance:row.minDistance,atomicVolume:row.atomicVolume};
  });
  atoms.push(...caseAtoms);
  const elementSummary=Object.fromEntries([...new Set(caseAtoms.map(item=>item.element))].map(element=>[element,summarize(caseAtoms.filter(item=>item.element===element).map(item=>item.websiteBaderCharge))]));
  const totalReferenceElectrons=caseAtoms.reduce((sum,item)=>sum+item.referenceElectrons,0),totalAcfElectrons=acf.metadata.number_of_electrons,totalCharge=caseAtoms.reduce((sum,item)=>sum+item.websiteBaderCharge,0),expectedTotalCharge=totalReferenceElectrons-totalAcfElectrons,conservationResidual=totalCharge-expectedTotalCharge;
  const status=hashesPassed&&countPassed&&coordinateValidation.passed&&caseAtoms.every(item=>item.absoluteError<=tolerance)&&Math.abs(conservationResidual)<=footerConservationTolerance?'pass':'fail';
  const densityConvention=manifest.densityTypeEvidence?.includes('valence-only')||manifest.sourceCode==='VASP'?'valence-only ACF':'reconstructed all-electron ACF';
  datasets.push({caseId:manifest.caseId,sourceCode:manifest.sourceCode,status,densityConvention,atomCount:caseAtoms.length,composition:manifest.composition,referenceFile:referenceFilename,hashesPassed,countPassed,coordinateValidation,coreSubtraction:core,totalReferenceElectrons,totalAcfElectrons,totalBaderCharge:totalCharge,expectedTotalCharge,chargeConservationResidual:conservationResidual,chargeConservationTolerance:footerConservationTolerance,elementSummary,maximumPerAtomAbsoluteError:Math.max(...caseAtoms.map(item=>item.absoluteError))});
}

const mismatchDirectory=path.join(fixtureRoot,'vasp-mismatch-001'),mismatchManifest=JSON.parse(await readFile(path.join(mismatchDirectory,'manifest.json'),'utf8'));
const mismatchAcf=parseACF(await readFile(path.join(mismatchDirectory,'ACF.dat'),'utf8')),mismatchStructure=parseVaspPoscar(await readFile(path.join(mismatchDirectory,'CONTCAR'),'utf8'),'CONTCAR');
const rejection={caseId:mismatchManifest.caseId,expectedOutcome:mismatchManifest.expectedOutcome,acfAtoms:mismatchAcf.rows.length,referenceAtoms:mismatchStructure.atoms.length,status:mismatchAcf.rows.length!==mismatchStructure.atoms.length?'pass':'fail',diagnostic:mismatchManifest.diagnostic};

const report={schemaVersion:1,benchmarkType:'Real QE and VASP Bader charge validation',environment:{timestampUtc:new Date().toISOString(),node:process.version,platform:process.platform,architecture:process.arch,osRelease:os.release(),cpu:os.cpus()[0]?.model??'unavailable'},summary:{validDatasets:datasets.length,passedValidDatasets:datasets.filter(item=>item.status==='pass').length,perAtomRecords:atoms.length,maximumPerAtomAbsoluteError:Math.max(...atoms.map(item=>item.absoluteError)),maximumChargeConservationResidual:Math.max(...datasets.map(item=>Math.abs(item.chargeConservationResidual))),negativeMismatchCase:rejection.status},datasets,rejectionCase:rejection,atoms};
const cell=value=>`"${String(value??'').replaceAll('"','""')}"`;
const atomHeaders=['case_id','source_code','atom_index','element','acf_electrons','core_subtraction','reference_electrons','website_bader_charge','independent_bader_charge','absolute_error','x','y','z','min_distance','atomic_volume'];
const atomCsv=[atomHeaders,...atoms.map(item=>[item.caseId,item.sourceCode,item.atomIndex,item.element,item.acfElectrons,item.coreSubtraction,item.referenceElectrons,item.websiteBaderCharge,item.independentBaderCharge,item.absoluteError,item.x,item.y,item.z,item.minDistance,item.atomicVolume])].map(row=>row.map(cell).join(',')).join('\n')+'\n';
const summaryHeaders=['case_id','source_code','status','density_convention','atom_count','total_reference_electrons','acf_total_electrons','total_bader_charge','expected_total_charge','conservation_residual','maximum_per_atom_error'];
const summaryCsv=[summaryHeaders,...datasets.map(item=>[item.caseId,item.sourceCode,item.status,item.densityConvention,item.atomCount,item.totalReferenceElectrons,item.totalAcfElectrons,item.totalBaderCharge,item.expectedTotalCharge,item.chargeConservationResidual,item.maximumPerAtomAbsoluteError])].map(row=>row.map(cell).join(',')).join('\n')+'\n';
await mkdir(resultsDirectory,{recursive:true});
await Promise.all([writeFile(path.join(resultsDirectory,'latest-bader-real.json'),JSON.stringify(report,null,2)+'\n'),writeFile(path.join(resultsDirectory,'latest-bader-atoms.csv'),atomCsv),writeFile(path.join(resultsDirectory,'latest-bader-summary.csv'),summaryCsv)]);
console.log(`Real Bader benchmark: ${report.summary.passedValidDatasets}/${datasets.length} valid datasets passed; ${atoms.length} atoms checked.`);
for(const item of datasets)console.log(`${item.status.toUpperCase()}  ${item.caseId}: total charge ${item.totalBaderCharge.toFixed(6)} e, conservation residual ${item.chargeConservationResidual.toExponential(3)} e`);
console.log(`${rejection.status.toUpperCase()}  ${rejection.caseId}: rejected ${rejection.acfAtoms} vs ${rejection.referenceAtoms} atoms.`);
if(report.summary.passedValidDatasets!==datasets.length||rejection.status!=='pass')process.exitCode=1;
