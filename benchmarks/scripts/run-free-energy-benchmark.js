import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { computePixelDims } from '../../src/lib/freeEnergyExport.js';
import { PlotEngine, computeGhosts, connToKey, defaultAxisConfig, defaultStyleConfig, migrateAxisConfig, normConn, parseSegKey } from '../../src/lib/freeEnergyPlot.js';
import { getSubBranches, getUniqueBranches, getYRange, groupRows, niceInterval, parseCSV } from '../../src/lib/freeEnergyParser.js';
import { FreeEnergyPlotterPage } from '../../src/pages/FreeEnergyPlotter.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),rules=[],cases=[];
const check=(scope,rule,passed,detail)=>rules.push({scope,rule,status:passed?'pass':'fail',detail});
const fixtures=[
  {id:'single-comma',delimiter:'comma',text:'step,path,energy\n1,main,0.000\n2,main,-0.420\n3,main,0.180\n4,main,-0.760',expectedRows:4,branches:1,steps:4,min:-0.76,max:0.18},
  {id:'branched-tab',delimiter:'tab',text:'branch\tsub-branch\tenergy\n1\tmain\t0\n2\tmain\t0.25\n2\tpath-B\t0.42\n3\tmain\t-0.15\n3\tpath-B\t-0.38\n4\tmain\t-0.64',expectedRows:6,branches:2,steps:4,min:-0.64,max:0.42},
  {id:'split-merge-semicolon',delimiter:'semicolon',text:'# split then merge\n1;A;0\n2;A;0.3\n2;B;0.5\n2;C;0.1\n3;A;-0.2\n3;B;-0.4\n3;C;-0.1\n4;A;-0.7',expectedRows:8,branches:3,steps:4,min:-0.7,max:0.5},
  {id:'unordered-whitespace',delimiter:'whitespace',text:'branch path energy\n3 route 0.8\n1 route -1.2\n2 route 0.0\n# ignored\nbad row here',expectedRows:3,branches:1,steps:3,min:-1.2,max:0.8},
];
const makeContext=()=>{const counts={};const target={measureText:text=>({width:String(text).length*7}),createLinearGradient:()=>({addColorStop(){}}),createPattern:()=>null};return{counts,ctx:new Proxy(target,{get(object,key){if(key in object)return object[key];if(typeof key==='symbol')return object[key];return(...args)=>{counts[key]=(counts[key]||0)+1;return args.length?undefined:undefined;};},set(object,key,value){object[key]=value;return true;}})}};

for(const fixture of fixtures){
  const started=performance.now(),rows=parseCSV(fixture.text),grouped=groupRows(rows),subBranches=getSubBranches(rows),unique=getUniqueBranches(rows),range=getYRange(rows),energies=rows.map(row=>row.energy);
  check(fixture.id,'row count',rows.length===fixture.expectedRows,`${rows.length} rows`);
  check(fixture.id,'branch count',subBranches.length===fixture.branches,subBranches.join(', '));
  check(fixture.id,'unique reaction steps',unique.length===fixture.steps,unique.join(', '));
  check(fixture.id,'energy preservation',Math.min(...energies)===fixture.min&&Math.max(...energies)===fixture.max,`${Math.min(...energies)} to ${Math.max(...energies)} eV`);
  check(fixture.id,'within-branch ordering',[...grouped.values()].every(points=>points.every((point,index)=>index===0||points[index-1].branch<=point.branch)),'all grouped steps sorted');
  check(fixture.id,'padded Y range',range.min<fixture.min&&range.max>fixture.max,`${range.min} to ${range.max} eV`);
  check(fixture.id,'finite tick interval',Number.isFinite(niceInterval(range.max-range.min,6))&&niceInterval(range.max-range.min,6)>0,`${niceInterval(range.max-range.min,6)} eV`);
  const engine=new PlotEngine({getContext:()=>({}),clientWidth:900,clientHeight:600,width:900,height:600});engine.setData(rows);engine.styleConfig.mainBranch=subBranches.includes('main')?'main':subBranches[0];
  const connections=engine.initConnectionsFromData(),keys=connections.map(connToKey);
  check(fixture.id,'unique automatic connections',new Set(keys).size===keys.length,`${connections.length} connections`);
  check(fixture.id,'valid connection endpoints',connections.every(connection=>rows.some(row=>row.subBranch===connection.fromSb&&row.branch===connection.from)&&rows.some(row=>row.subBranch===connection.toSb&&row.branch===connection.to)),keys.join('; '));
  check(fixture.id,'connection key round trip',connections.every(connection=>connToKey(parseSegKey(connToKey(connection)))===connToKey(connection)),'all canonical keys restored');
  const ghosts=computeGhosts(rows,engine.styleConfig.mainBranch);
  check(fixture.id,'continuity endpoints valid',ghosts.every(ghost=>rows.some(row=>row.subBranch===engine.styleConfig.mainBranch&&row.branch===ghost.from.branch)&&rows.some(row=>row.subBranch===ghost.subBranch&&row.branch===ghost.to.branch)||rows.some(row=>row.subBranch===ghost.subBranch&&row.branch===ghost.from.branch)&&rows.some(row=>row.subBranch===engine.styleConfig.mainBranch&&row.branch===ghost.to.branch)),`${ghosts.length} ghost connectors`);
  for(const dark of [false,true]){const fake=makeContext();let error='';try{engine._scene(fake.ctx,1200,800,dark,true);}catch(caught){error=caught.message;}check(fixture.id,`${dark?'dark':'light'} render`,!error&&fake.counts.fillRect>0&&fake.counts.stroke>0,error||`${Object.values(fake.counts).reduce((sum,value)=>sum+value,0)} drawing operations`);}
  cases.push({case:fixture.id,delimiter:fixture.delimiter,rows:rows.length,sub_branches:subBranches.length,unique_steps:unique.length,connections:connections.length,continuity_connectors:ghosts.length,energy_min_eV:Math.min(...energies),energy_max_eV:Math.max(...energies),y_min_eV:range.min,y_max_eV:range.max,parse_and_analyse_ms:performance.now()-started});
}

const normalized=normConn({sb:'A',from:1,to:2});check('connection utilities','legacy normalization',normalized.fromSb==='A'&&normalized.toSb==='A'&&normalized.fromEdge==='right'&&normalized.toEdge==='left',connToKey(normalized));
const legacy=parseSegKey('A|1|B|2');check('connection utilities','legacy key migration',legacy.fromSb==='A'&&legacy.toSb==='B'&&legacy.fromEdge==='right'&&legacy.toEdge==='left',connToKey(legacy));
const oldAxis={x:{position:'top',showAxis:true,label:'Coordinate',min:-1,max:5,auto:false},y:{position:'right',showAxis:true,label:'ΔG (eV)',min:-2,max:2,auto:false}};
const migrated=migrateAxisConfig(oldAxis);check('axis','legacy configuration migration',migrated.top.show&&migrated.top.label==='Coordinate'&&migrated.right.show&&migrated.right.label==='ΔG (eV)','top X and right Y preserved');
check('axis','four-sided defaults',Object.keys(defaultAxisConfig()).join(',')==='bottom,top,left,right','bottom, top, left, right');
const inch=computePixelDims({unitMode:'inch',widthIn:6,heightIn:4,dpi:300}),pixels=computePixelDims({unitMode:'px',widthPx:1920,heightPx:1080,dpi:600});
check('export','inch-to-pixel conversion',inch.w===1800&&inch.h===1200,`${inch.w} × ${inch.h}`);check('export','pixel mode is DPI independent',pixels.w===1920&&pixels.h===1080,`${pixels.w} × ${pixels.h}`);

const sourceRows=parseCSV(fixtures[1].text),targetRows=parseCSV('1\tmain\t0\n2\tmain\t-0.2\n2\tpath-B\t0.1\n3\tmain\t-0.5');
const sourceState={rows:sourceRows,styleConfig:defaultStyleConfig(),axisConfig:defaultAxisConfig(),annotations:[{text:'U = 0 V',x:.2,y:.3,fontFamily:'Arial',fontSize:16,fontWeight:'bold',fontStyle:'normal',color:'#123456'}]};
sourceState.styleConfig.lineWidth=4;sourceState.styleConfig.barWidth=.5;sourceState.styleConfig.pointShape='square';sourceState.styleConfig.branchStyles={main:{color:'#112233',lineType:'solid'},'path-B':{color:'#cc5500'}};sourceState.styleConfig.legendLabels={main:'Preferred route','path-B':'Alternative'};sourceState.styleConfig.fontConfig.legendPos='bottom-left';sourceState.axisConfig.left.decimals=3;
const targetState={rows:targetRows,styleConfig:defaultStyleConfig(),axisConfig:defaultAxisConfig(),annotations:[]};targetState.axisConfig.left.label='Target ΔG';
const page=Object.create(FreeEnergyPlotterPage.prototype);page._state=sourceState;page._plotTabs=[{name:'source',state:sourceState},{name:'target',state:targetState}];page._refreshPlot=()=>{};
const oldAlert=globalThis.alert;globalThis.alert=()=>{};page._applyStyleTemplate(['axis','style','color','legend','typography','annotations'],[1]);if(oldAlert===undefined)delete globalThis.alert;else globalThis.alert=oldAlert;
check('style template','global plot style copied',targetState.styleConfig.lineWidth===4&&targetState.styleConfig.barWidth===.5&&targetState.styleConfig.pointShape==='square','line, bar and point styles');
check('style template','matching branch colors copied',targetState.styleConfig.branchStyles.main.color==='#112233'&&targetState.styleConfig.branchStyles['path-B'].color==='#cc5500','main and path-B');
check('style template','legend labels and position copied',targetState.styleConfig.legendLabels.main==='Preferred route'&&targetState.styleConfig.fontConfig.legendPos==='bottom-left','custom labels; bottom-left');
check('style template','target axis label preserved',targetState.axisConfig.left.label==='Target ΔG'&&targetState.axisConfig.left.decimals===3,'Target ΔG; 3 decimals');
check('style template','annotation copied independently',targetState.annotations.length===1&&targetState.annotations[0]!==sourceState.annotations[0]&&targetState.annotations[0].text==='U = 0 V','deep copy');

const passed=rules.filter(rule=>rule.status==='pass').length,report={schemaVersion:1,benchmarkType:'Free Energy Diagram Studio parsing, connectivity, styling, and PNG export configuration',scopeNote:'Canvas exports are exercised through the production renderer in both themes; browser download triggering itself is outside this headless benchmark.',environment:{timestampUtc:new Date().toISOString(),node:process.version,platform:process.platform,architecture:process.arch,osRelease:os.release(),cpu:os.cpus()[0]?.model??'unavailable'},summary:{cases:cases.length,totalRows:cases.reduce((sum,item)=>sum+item.rows,0),totalConnections:cases.reduce((sum,item)=>sum+item.connections,0),rules:rules.length,passed,failed:rules.length-passed},rules,cases};
const csv=[Object.keys(cases[0]),...cases.map(Object.values)].map(row=>row.map(value=>`"${String(value??'').replaceAll('"','""')}"`).join(',')).join('\n')+'\n',results=path.join(root,'results');await mkdir(results,{recursive:true});await Promise.all([writeFile(path.join(results,'latest-free-energy.json'),JSON.stringify(report,null,2)+'\n'),writeFile(path.join(results,'latest-free-energy-cases.csv'),csv)]);
console.log(`Free Energy Diagram benchmark: ${passed}/${rules.length} rules passed across ${cases.length} input formats and ${report.summary.totalRows} energy states.`);
if(passed!==rules.length)process.exitCode=1;
