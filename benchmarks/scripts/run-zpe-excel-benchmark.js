import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { calculateZpeTs } from '../../src/lib/zpeTs.js';
import { referenceExcelZpeTs } from '../references/zpe-ts-reference.js';

const scriptDirectory=path.dirname(fileURLToPath(import.meta.url));
const benchmarkDirectory=path.resolve(scriptDirectory,'..');
const projectDirectory=path.resolve(benchmarkDirectory,'..');
const dataset=JSON.parse(await readFile(path.join(benchmarkDirectory,'fixtures/zpe-ts/excel-reference-cases.json'),'utf8'));
const application=JSON.parse(await readFile(path.join(projectDirectory,'package.json'),'utf8'));
const comparisonTemperatureK=298.15;
const excelToleranceEv=1e-12;
const git=(...args)=>{try{return execFileSync('git',args,{cwd:projectDirectory,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{return'unavailable';}};
const percentage=(difference,reference)=>reference===0?null:100*difference/reference;
const rows=[];

for(const benchmarkCase of dataset.cases){
  const started=process.hrtime.bigint();
  const excelOracle=referenceExcelZpeTs(benchmarkCase.frequenciesThz,dataset.excelConstants);
  const website=calculateZpeTs(benchmarkCase.frequenciesThz,comparisonTemperatureK).totals;
  const excelZpeError=Math.abs(excelOracle.zpeEv-benchmarkCase.excelResults.zpeEv);
  const excelTsError=Math.abs(excelOracle.tsEv-benchmarkCase.excelResults.tsEv);
  const zpeDifference=website.zpeEv-benchmarkCase.excelResults.zpeEv;
  const tsDifference=website.tsEv-benchmarkCase.excelResults.tsEv;
  rows.push({
    id:benchmarkCase.id,
    sheet:benchmarkCase.sheet,
    frequencyCount:benchmarkCase.frequenciesThz.length,
    status:excelZpeError<=excelToleranceEv&&excelTsError<=excelToleranceEv?'pass':'fail',
    excelStored:{...benchmarkCase.excelResults},
    excelRecalculated:{zpeEv:excelOracle.zpeEv,tsEv:excelOracle.tsEv},
    excelReproductionAbsoluteError:{zpeEv:excelZpeError,tsEv:excelTsError},
    website298_15K:{zpeEv:website.zpeEv,tsEv:website.tsEv},
    websiteMinusExcel:{zpeEv:zpeDifference,tsEv:tsDifference},
    websiteMinusExcelPercent:{zpe:percentage(zpeDifference,benchmarkCase.excelResults.zpeEv),ts:percentage(tsDifference,benchmarkCase.excelResults.tsEv)},
    durationMs:Number(process.hrtime.bigint()-started)/1e6,
  });
}

const mean=values=>values.reduce((sum,value)=>sum+value,0)/values.length;
const maxAbsolute=(values)=>Math.max(...values.map(Math.abs));
const passed=rows.filter(row=>row.status==='pass').length;
const report={
  schemaVersion:1,
  benchmarkType:'ZPE/TS dual-reference comparison',
  datasetVersion:dataset.datasetVersion,
  comparisonTemperatureK,
  interpretation:{
    passCriterion:`Stored Excel ZPE and TS reproduced from the workbook constants within ${excelToleranceEv} eV.`,
    websiteComparison:'Website values use exact SI constants at 298.15 K. Their difference from Excel is reported descriptively and is not a failure because the workbook uses rounded and internally nonequivalent kT values.',
  },
  source:dataset.source,
  excelConstants:dataset.excelConstants,
  environment:{timestampUtc:new Date().toISOString(),applicationVersion:application.version,gitCommit:git('rev-parse','HEAD'),gitDirty:git('status','--porcelain')!=='',node:process.version,platform:process.platform,architecture:process.arch,osRelease:os.release(),cpu:os.cpus()[0]?.model??'unavailable',logicalCpus:os.cpus().length,totalMemoryBytes:os.totalmem()},
  summary:{
    total:rows.length,passed,failed:rows.length-passed,passRate:passed/rows.length,
    meanWebsiteMinusExcelEv:{zpe:mean(rows.map(row=>row.websiteMinusExcel.zpeEv)),ts:mean(rows.map(row=>row.websiteMinusExcel.tsEv))},
    meanWebsiteMinusExcelPercent:{zpe:mean(rows.map(row=>row.websiteMinusExcelPercent.zpe)),ts:mean(rows.map(row=>row.websiteMinusExcelPercent.ts))},
    maximumAbsoluteWebsiteMinusExcelEv:{zpe:maxAbsolute(rows.map(row=>row.websiteMinusExcel.zpeEv)),ts:maxAbsolute(rows.map(row=>row.websiteMinusExcel.tsEv))},
  },
  cases:rows,
};

const headers=['case_id','sheet','frequency_count','status','excel_zpe_ev','recalculated_excel_zpe_ev','excel_zpe_reproduction_error_ev','website_zpe_ev_298_15k','website_minus_excel_zpe_ev','website_minus_excel_zpe_percent','excel_ts_ev','recalculated_excel_ts_ev','excel_ts_reproduction_error_ev','website_ts_ev_298_15k','website_minus_excel_ts_ev','website_minus_excel_ts_percent','duration_ms'];
const csvCell=value=>`"${String(value??'').replaceAll('"','""')}"`;
const csvRows=rows.map(row=>[row.id,row.sheet,row.frequencyCount,row.status,row.excelStored.zpeEv,row.excelRecalculated.zpeEv,row.excelReproductionAbsoluteError.zpeEv,row.website298_15K.zpeEv,row.websiteMinusExcel.zpeEv,row.websiteMinusExcelPercent.zpe,row.excelStored.tsEv,row.excelRecalculated.tsEv,row.excelReproductionAbsoluteError.tsEv,row.website298_15K.tsEv,row.websiteMinusExcel.tsEv,row.websiteMinusExcelPercent.ts,row.durationMs]);
const csv=[headers,...csvRows].map(row=>row.map(csvCell).join(',')).join('\n')+'\n';
const resultsDirectory=path.join(benchmarkDirectory,'results');
await mkdir(resultsDirectory,{recursive:true});
const stamp=report.environment.timestampUtc.replaceAll(':','-').replaceAll('.','-');
const base=`zpe-excel-comparison-${dataset.datasetVersion}-${stamp}`;
const json=JSON.stringify(report,null,2)+'\n';
await Promise.all([writeFile(path.join(resultsDirectory,`${base}.json`),json),writeFile(path.join(resultsDirectory,`${base}.csv`),csv),writeFile(path.join(resultsDirectory,'latest-zpe-excel.json'),json),writeFile(path.join(resultsDirectory,'latest-zpe-excel.csv'),csv)]);

console.log(`ZPE/TS Excel reference benchmark at ${comparisonTemperatureK} K`);
for(const row of rows)console.log(`${row.status==='pass'?'PASS':'FAIL'}  ${row.sheet.padEnd(9)}  Excel reproduction: ZPE ${row.excelReproductionAbsoluteError.zpeEv.toExponential(2)} eV, TS ${row.excelReproductionAbsoluteError.tsEv.toExponential(2)} eV`);
console.log(`\n${passed}/${rows.length} Excel cases reproduced within ${excelToleranceEv} eV.`);
console.log(`Mean website−Excel: ZPE ${report.summary.meanWebsiteMinusExcelEv.zpe.toExponential(4)} eV (${report.summary.meanWebsiteMinusExcelPercent.zpe.toFixed(4)}%), TS ${report.summary.meanWebsiteMinusExcelEv.ts.toExponential(4)} eV (${report.summary.meanWebsiteMinusExcelPercent.ts.toFixed(4)}%).`);
console.log(`Reports: benchmarks/results/${base}.{json,csv}`);
if(passed!==rows.length)process.exitCode=1;
