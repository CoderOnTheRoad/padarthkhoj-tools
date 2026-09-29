import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { parseCIF } from '../../src/lib/cifParser.js';
import { generateBaderWorkflow, generateBandsWorkflow, generateChargeWorkflow, generateDOSWorkflow, generatePWWorkflow, generateVibrationalWorkflow } from '../../src/lib/qeGenerator.js';

const benchmarkDirectory=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourcePath=path.join(benchmarkDirectory,'fixtures/bader/qe-real-002/halfc1.cif');
const sourceText=await readFile(sourcePath,'utf8'),sourceSha256=createHash('sha256').update(sourceText).digest('hex');
const cif=await parseCIF(sourceText);cif.filename='halfc1.cif';
const shared={baseName:'halfc1',prefix:"'halfc1'",outdir:"'./benchmark-tmp'",kx:1,ky:1,kz:1,speciesParams:{C:{pseudo:'C.pbe-n-kjpaw_psl.1.0.0.UPF'},N:{pseudo:'N.pbe-n-kjpaw_psl.1.0.0.UPF'},H:{pseudo:'H.pbe-kjpaw_psl.1.0.0.UPF'}}};
const workflows=[
  {id:'scf',workflow:generatePWWorkflow('scf',cif,shared)},
  {id:'relax',workflow:generatePWWorkflow('relax',cif,shared)},
  {id:'dos',workflow:generateDOSWorkflow(cif,shared)},
  {id:'bands',workflow:generateBandsWorkflow(cif,shared)},
  {id:'charge-density',workflow:generateChargeWorkflow(cif,shared)},
  {id:'bader',workflow:generateBaderWorkflow(cif,shared)},
  {id:'vibrational-d3',workflow:generateVibrationalWorkflow(cif,{...shared,vdw_corr:'"dft-d3"'})},
  {id:'vibrational-no-d3',workflow:generateVibrationalWorkflow(cif,{...shared,vdw_corr:'"none"'})},
];

const atomRows=text=>{const lines=text.split(/\r?\n/),start=lines.findIndex(line=>/^\s*ATOMIC_POSITIONS\b/i.test(line));if(start<0)return 0;let count=0;for(let index=start+1;index<lines.length;index++){if(!/^\s*[A-Z][a-z]?\s+[-+\d.]/.test(lines[index]))break;count++;}return count;};
const rules=[];
const check=(workflow,rule,passed,detail)=>rules.push({workflow,rule,status:passed?'pass':'fail',detail});
const file=(workflow,ending)=>workflow.files.find(item=>item.filename.endsWith(ending));
const allInputFiles=workflows.flatMap(item=>item.workflow.files.filter(candidate=>candidate.filename.endsWith('.in')));

for(const item of workflows){
  const names=item.workflow.files.map(candidate=>candidate.filename),submit=file(item.workflow,'_submit.sh');
  check(item.id,'unique filenames',new Set(names).size===names.length,names.join(', '));
  check(item.id,'submission script exists',Boolean(submit),submit?.filename??'missing');
  check(item.id,'strict sequential shell',/set -euo pipefail/.test(submit?.text??''),'set -euo pipefail');
  const structural=item.workflow.files.filter(candidate=>/(?:_scf|_relax|_nscf)\.in$/.test(candidate.filename));
  structural.forEach(candidate=>check(item.id,`${candidate.filename}: 204 atoms`,atomRows(candidate.text)===204,`parsed ${atomRows(candidate.text)} ATOMIC_POSITIONS rows`));
}

const scf=file(workflows[0].workflow,'_scf.in'),relax=file(workflows[1].workflow,'_relax.in');
check('scf','calculation mode',/calculation\s*=\s*['"]scf['"]/.test(scf.text),'scf');check('relax','calculation mode',/calculation\s*=\s*['"]vc-relax['"]/.test(relax.text)&&/^&IONS$/m.test(relax.text)&&/^&CELL$/m.test(relax.text),'vc-relax with &IONS and &CELL');
check('scf','species and pseudopotentials',/C\.pbe-n-kjpaw_psl\.1\.0\.0\.UPF/.test(scf.text)&&/N\.pbe-n-kjpaw_psl\.1\.0\.0\.UPF/.test(scf.text)&&/H\.pbe-kjpaw_psl\.1\.0\.0\.UPF/.test(scf.text),'C/N/H PSL PAW files');

const dos=workflows[2].workflow,dosScf=file(dos,'_scf.in'),dosNscf=file(dos,'_nscf.in'),dosPost=file(dos,'_dos.in'),dosSubmit=file(dos,'_submit.sh');
check('dos','file set',dos.files.length===4,dos.files.map(item=>item.filename).join(', '));check('dos','SCF smearing default',/occupations\s*=\s*"smearing"/.test(dosScf.text),'smearing');check('dos','NSCF tetrahedra default',/occupations\s*=\s*"tetrahedra"/.test(dosNscf.text)&&!/^\s*(?:smearing|degauss)\s*=/m.test(dosNscf.text),'tetrahedra without smearing/degauss');check('dos','DOS postprocessor',/^&DOS$/m.test(dosPost.text),'dos.x input');check('dos','execution order',/pw\.x[^\n]+_scf\.in[\s\S]*pw\.x[^\n]+_nscf\.in[\s\S]*dos\.x[^\n]+_dos\.in/.test(dosSubmit.text),'pw.x → pw.x → dos.x');

const bands=workflows[3].workflow,bandsNscf=file(bands,'_nscf.in'),bandsPost=file(bands,'_bands.in'),bandsSubmit=file(bands,'_submit.sh');check('bands','crystal band path',/K_POINTS crystal_b\n\d+/.test(bandsNscf.text),'crystal_b path');check('bands','literature warning',/cross-check|cross.verify|WARNING/i.test(bandsNscf.text),'user warning present');check('bands','BANDS namelist without lsym',/^&BANDS$/m.test(bandsPost.text)&&!/^\s*lsym\s*=/m.test(bandsPost.text),'&BANDS, no lsym');check('bands','execution order',/pw\.x[^\n]+_scf\.in[\s\S]*pw\.x[^\n]+_nscf\.in[\s\S]*bands\.x/.test(bandsSubmit.text),'pw.x → pw.x → bands.x');

const charge=workflows[4].workflow,chargePost=file(charge,'_charge.in');check('charge-density','plot settings',/plot_num\s*=\s*0/.test(chargePost.text)&&/output_format\s*=\s*6/.test(chargePost.text),'plot_num 0, cube format');check('charge-density','execution order',/pw\.x[\s\S]*pp\.x/.test(file(charge,'_submit.sh').text),'pw.x → pp.x');

const bader=workflows[5].workflow,baderAll=file(bader,'_allelectron.in'),baderVal=file(bader,'_valenceelectron.in');check('bader','all-electron density',/plot_num\s*=\s*21/.test(baderAll.text),'plot_num 21');check('bader','valence density',/plot_num\s*=\s*0/.test(baderVal.text),'plot_num 0');check('bader','execution order',/pw\.x[\s\S]*pp\.x[^\n]+_allelectron\.in[\s\S]*pp\.x[^\n]+_valenceelectron\.in/.test(file(bader,'_submit.sh').text),'pw.x → pp.x → pp.x');

const vibD3=workflows[6].workflow,vibPlain=workflows[7].workflow;check('vibrational-d3','five-file workflow',vibD3.files.length===5,vibD3.files.map(item=>item.filename).join(', '));check('vibrational-d3','D3 Hessian connected',/filhess/.test(file(vibD3,'_hess.in').text)&&/dftd3_hess/.test(file(vibD3,'_ph.in').text)&&/d3hess\.x/.test(file(vibD3,'_submit.sh').text),'d3hess.x active');check('vibrational-d3','execution order',/pw\.x[\s\S]*d3hess\.x[\s\S]*ph\.x[\s\S]*dynmat\.x/.test(file(vibD3,'_submit.sh').text),'pw.x → d3hess.x → ph.x → dynmat.x');check('vibrational-no-d3','Hessian skipped',/not required/.test(file(vibPlain,'_hess.in').text)&&!/^d3hess\.x/m.test(file(vibPlain,'_submit.sh').text),'d3hess.x skipped');

for(const candidate of allInputFiles){check('cross-workflow',`${candidate.filename}: no undefined/NaN`,!/(?:undefined|NaN)/.test(candidate.text),'clean generated text');}
const passed=rules.filter(rule=>rule.status==='pass').length,report={schemaVersion:1,benchmarkType:'Real-CIF Quantum ESPRESSO workflow generation',source:{filename:'halfc1.cif',sha256:sourceSha256,atoms:cif.atoms.length},environment:{timestampUtc:new Date().toISOString(),node:process.version,platform:process.platform,architecture:process.arch,osRelease:os.release(),cpu:os.cpus()[0]?.model??'unavailable'},summary:{workflows:workflows.length,generatedFiles:workflows.reduce((sum,item)=>sum+item.workflow.files.length,0),rules:rules.length,passed,failed:rules.length-passed},workflows:workflows.map(item=>({id:item.id,files:item.workflow.files.map(candidate=>candidate.filename)})),rules};
const csvCell=value=>`"${String(value??'').replaceAll('"','""')}"`;const csv=[['workflow','rule','status','detail'],...rules.map(rule=>[rule.workflow,rule.rule,rule.status,rule.detail])].map(row=>row.map(csvCell).join(',')).join('\n')+'\n';
const resultsDirectory=path.join(benchmarkDirectory,'results');await mkdir(resultsDirectory,{recursive:true});await Promise.all([writeFile(path.join(resultsDirectory,'latest-qe-workflows.json'),JSON.stringify(report,null,2)+'\n'),writeFile(path.join(resultsDirectory,'latest-qe-workflows.csv'),csv)]);
console.log(`QE workflow benchmark: ${passed}/${rules.length} rules passed across ${workflows.length} workflows and ${report.summary.generatedFiles} generated files.`);for(const item of workflows)console.log(`${item.id.padEnd(20)} ${item.workflow.files.length} files`);if(passed!==rules.length)process.exitCode=1;
