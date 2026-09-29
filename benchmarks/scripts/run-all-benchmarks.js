import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDirectory=path.dirname(fileURLToPath(import.meta.url)),benchmarkDirectory=path.resolve(scriptDirectory,'..'),projectDirectory=path.resolve(benchmarkDirectory,'..'),resultsDirectory=path.join(benchmarkDirectory,'results');
const suites=[
  {id:'zpe-analytical',name:'ZPE & TS — analytical reference',script:'run-benchmarks.js',args:['--module','zpe-ts'],result:'latest.json'},
  {id:'zpe-excel',name:'ZPE & TS — supplied workbook',script:'run-zpe-excel-benchmark.js',result:'latest-zpe-excel.json'},
  {id:'orbital-real',name:'Real QE orbital metrics',script:'run-orbital-real-benchmark.js',result:'latest-orbital-real.json'},
  {id:'bader-real',name:'QE & VASP Bader analysis',script:'run-bader-real-benchmark.js',result:'latest-bader-real.json'},
  {id:'qe-workflows',name:'QE workflow generation',script:'run-qe-workflow-benchmark.js',result:'latest-qe-workflows.json'},
  {id:'intermediate-maker',name:'Preset Intermediate Maker',script:'run-intermediate-maker-benchmark.js',result:'latest-intermediate-maker.json'},
  {id:'custom-pathways',name:'Custom Pathway Designer',script:'run-custom-pathway-benchmark.js',result:'latest-custom-pathways.json'},
  {id:'dos-pipeline',name:'QE & VASP DOS/PDOS pipeline',script:'run-dos-pipeline-benchmark.js',result:'latest-dos-pipeline.json'},
  {id:'free-energy',name:'Free Energy Diagram Studio',script:'run-free-energy-benchmark.js',result:'latest-free-energy.json'},
  {id:'crystal-pipeline',name:'Crystal Structure pipeline',script:'run-crystal-pipeline-benchmark.js',result:'latest-crystal-pipeline.json'},
  {id:'qe-output',name:'QE Output Studio',script:'run-qe-output-benchmark.js',result:'latest-qe-output.json'},
];
const elapsed=[];
console.log(`Padarthkhoj unified benchmark — ${suites.length} suites\n`);
for(const suite of suites){
  const started=process.hrtime.bigint(),run=spawnSync(process.execPath,[path.join(scriptDirectory,suite.script),...(suite.args||[])],{cwd:projectDirectory,encoding:'utf8'}),durationMs=Number(process.hrtime.bigint()-started)/1e6;
  if(run.stdout)process.stdout.write(run.stdout);if(run.stderr)process.stderr.write(run.stderr);
  elapsed.push({id:suite.id,durationMs});
  if(run.status!==0){console.error(`\nUnified benchmark stopped: ${suite.name} failed with exit code ${run.status}.`);process.exit(run.status??1);}
}

const pickError=(id,summary)=>{
  if(id==='zpe-analytical')return{value:0,unit:'declared analytical tolerances',label:'maximum analytical error'};
  if(id==='zpe-excel')return{value:Math.max(summary.maximumAbsoluteWebsiteMinusExcelEv?.zpe||0,summary.maximumAbsoluteWebsiteMinusExcelEv?.ts||0),unit:'eV',label:'maximum workbook deviation'};
  if(id==='orbital-real')return{value:Math.max(summary.maximumIntegralAbsoluteError||0,summary.maximumCentreAbsoluteErrorEv||0,summary.maximumOccupiedIntegralAbsoluteError||0,summary.maximumOccupiedCentreAbsoluteErrorEv||0),unit:'mixed integral/eV',label:'maximum numerical error'};
  if(id==='bader-real')return{value:summary.maximumChargeConservationResidual,unit:'e',label:'maximum charge residual'};
  if(id==='intermediate-maker'||id==='custom-pathways')return{value:summary.maximumBindingErrorA,unit:'Å',label:'maximum binding-distance error'};
  if(id==='dos-pipeline')return{value:Math.max(summary.maximumOccupancyError||0,summary.maximumCentreErrorEv||0),unit:'mixed occupancy/eV',label:'maximum downstream error'};
  return{value:null,unit:'',label:'structural/rule validation'};
};
const normalize=(suite,report)=>{
  const s=report.summary||{};let total=s.rules??s.total,passed=s.passed,workload='',scale='';
  if(suite.id==='bader-real'){total=(s.validDatasets||0)+1;passed=(s.passedValidDatasets||0)+(s.negativeMismatchCase==='pass'?1:0);workload=`${s.validDatasets} valid + mismatch control`;scale=`${s.perAtomRecords} atoms`;}
  if(suite.id==='zpe-analytical'){workload=`${s.total} analytical cases`;scale='frequency spectra';}
  if(suite.id==='zpe-excel'){workload=`${s.total} workbook sheets`;scale='user-supplied reference';}
  if(suite.id==='orbital-real'){total=s.channelMetrics;workload=`${s.files} real QE files`;scale=`${s.channelMetrics} channel metrics`;}
  if(suite.id==='qe-workflows'){workload=`${s.workflows} workflows`;scale=`${s.generatedFiles} generated files`;}
  if(suite.id==='intermediate-maker'){workload=`${s.pathways} pathways`;scale=`${s.placements} placements`;}
  if(suite.id==='custom-pathways'){workload=`${s.uploadedMolecules} molecules × ${s.catalysts} catalysts`;scale=`${s.generatedStructures} structures`;}
  if(suite.id==='dos-pipeline'){workload=`${s.datasets} QE/VASP datasets`;scale=`${s.spinDatasets} spin + ${s.nonSpinDatasets} non-spin`;}
  if(suite.id==='free-energy'){workload=`${s.cases} input formats`;scale=`${s.totalRows} energy states`;}
  if(suite.id==='crystal-pipeline'){workload=`${s.structures} structures`;scale=`${s.totalAtoms} atoms; largest ${s.largestStructureAtoms}`;}
  if(suite.id==='qe-output'){workload=`${s.cases} output scenarios`;scale=`${s.totalEnergyPoints} energy points`;}
  const failed=s.failed??Math.max(0,(total??0)-(passed??0)),error=pickError(suite.id,s),durationMs=elapsed.find(item=>item.id===suite.id)?.durationMs??null;
  return{module_id:suite.id,module:suite.name,workload,scale,validation_units:total,passed,failed,pass_rate_percent:total?passed/total*100:0,reported_error:error.value,error_unit:error.unit,error_label:error.label,duration_ms:durationMs,result_file:`benchmarks/results/${suite.result}`};
};
const rows=[];
for(const suite of suites){const report=JSON.parse(await readFile(path.join(resultsDirectory,suite.result),'utf8'));rows.push(normalize(suite,report));}
const totals={modules:rows.length,validationUnits:rows.reduce((sum,row)=>sum+row.validation_units,0),passed:rows.reduce((sum,row)=>sum+row.passed,0),failed:rows.reduce((sum,row)=>sum+row.failed,0),durationMs:rows.reduce((sum,row)=>sum+row.duration_ms,0)};totals.passRate=totals.validationUnits?totals.passed/totals.validationUnits:0;
const environment={timestampUtc:new Date().toISOString(),applicationVersion:JSON.parse(await readFile(path.join(projectDirectory,'package.json'),'utf8')).version,node:process.version,platform:process.platform,architecture:process.arch,osRelease:os.release(),cpu:os.cpus()[0]?.model??'unavailable',logicalCpus:os.cpus().length,totalMemoryBytes:os.totalmem()};
const report={schemaVersion:1,benchmarkType:'Padarthkhoj unified validation benchmark',environment,summary:totals,modules:rows,interpretation:{validationUnit:'A validation unit is a suite-defined independent rule, case, channel metric, or accepted/rejected dataset check.',workbookDeviation:'The Excel comparison records deviation from the user workbook, which uses rounded constants; it is not the analytical-reference error.',timing:'Durations are single-run wall-clock measurements on the recorded environment and should not be treated as formal microbenchmarks.'}};
const csvCell=value=>`"${String(value??'').replaceAll('"','""')}"`,headers=Object.keys(rows[0]),csv=[headers,...rows.map(row=>headers.map(header=>row[header]))].map(row=>row.map(csvCell).join(',')).join('\n')+'\n';
const fmt=value=>value===null||value===undefined?'—':typeof value==='number'?(Math.abs(value)>0&&Math.abs(value)<1e-4?value.toExponential(3):Number(value.toPrecision(6)).toString()):String(value);
const markdown=`# Padarthkhoj unified benchmark summary\n\nGenerated: ${environment.timestampUtc}  \nApplication: v${environment.applicationVersion}  \nEnvironment: ${environment.platform} ${environment.architecture}, Node ${environment.node}\n\n## Overall result\n\n**${totals.passed}/${totals.validationUnits} validation units passed (${(totals.passRate*100).toFixed(2)}%) across ${totals.modules} benchmark suites.**\n\n| Module | Workload | Scale | Passed | Pass rate | Reported error | Runtime (ms) |\n|---|---|---|---:|---:|---|---:|\n${rows.map(row=>`| ${row.module} | ${row.workload} | ${row.scale} | ${row.passed}/${row.validation_units} | ${row.pass_rate_percent.toFixed(2)}% | ${fmt(row.reported_error)} ${row.error_unit} (${row.error_label}) | ${row.duration_ms.toFixed(3)} |`).join('\n')}\n\n## Interpretation notes\n\n- A validation unit is a suite-defined independent rule, analytical case, channel metric, or dataset acceptance/rejection check.\n- The workbook deviation is a comparison with the supplied Excel workbook and includes differences caused by rounded constants. The analytical ZPE reference is reported separately.\n- Runtime values are single-run wall-clock measurements on the recorded machine; use repeated trials for formal performance claims.\n- Every module-specific JSON report contains its detailed provenance, tolerances, cases, and diagnostics.\n`;
await mkdir(resultsDirectory,{recursive:true});const stamp=environment.timestampUtc.replaceAll(':','-').replaceAll('.','-'),base=`unified-benchmark-${stamp}`,json=JSON.stringify(report,null,2)+'\n';await Promise.all([writeFile(path.join(resultsDirectory,'latest-unified.json'),json),writeFile(path.join(resultsDirectory,'latest-unified.csv'),csv),writeFile(path.join(resultsDirectory,'latest-unified.md'),markdown),writeFile(path.join(resultsDirectory,`${base}.json`),json),writeFile(path.join(resultsDirectory,`${base}.csv`),csv),writeFile(path.join(resultsDirectory,`${base}.md`),markdown)]);
console.log(`\nUnified result: ${totals.passed}/${totals.validationUnits} validation units passed across ${totals.modules} suites.`);console.log(`Reports: benchmarks/results/latest-unified.{json,csv,md}`);if(totals.failed)process.exitCode=1;
