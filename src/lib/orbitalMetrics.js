import JSZip from 'jszip';
import { getDosFillPoints, parseDosCsv } from './scientificDosPlot.js';

export function columnLetter(index) {
  let result='';
  for(let value=index+1;value;value=Math.floor((value-1)/26))result=String.fromCharCode(65+(value-1)%26)+result;
  return result;
}

export function parseOrbitalMetricsCsv(text,filename='pdos.csv') {
  const parsed=parseDosCsv(text,filename);
  const columns=[{letter:'A',name:'Energy_eV',values:parsed.energy,energy:true},...Object.entries(parsed.channels).map(([name,values],index)=>({letter:columnLetter(index+1),name,values}))];
  return {...parsed,columns,baseColumnCount:columns.length,derivedColumns:[],warnings:[]};
}

const tokenizeFormula=formula=>{
  const tokens=[];let index=0;const source=String(formula).toUpperCase();
  while(index<source.length){if(/\s/.test(source[index])){index+=1;continue;}const rest=source.slice(index);const number=rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:E[-+]?\d+)?/);if(number){tokens.push({type:'number',value:Number(number[0])});index+=number[0].length;continue;}const ref=rest.match(/^[A-Z]+/);if(ref){tokens.push({type:'ref',value:ref[0]});index+=ref[0].length;continue;}if('+-*/()'.includes(source[index])){tokens.push({type:source[index],value:source[index++]});continue;}throw new Error(`Unsupported formula token near “${source.slice(index,index+8)}”`);}return tokens;
};

export function compileColumnFormula(formula) {
  const tokens=tokenizeFormula(formula);if(!tokens.length)throw new Error('Formula is empty');
  const output=[],operators=[],precedence={'+':1,'-':1,'*':2,'/':2};let expectingValue=true;
  tokens.forEach(token=>{
    if(token.type==='number'||token.type==='ref'){if(!expectingValue)throw new Error('Missing operator in formula');output.push(token);expectingValue=false;return;}
    if(token.type==='('){if(!expectingValue)throw new Error('Missing operator before parenthesis');operators.push(token);return;}
    if(token.type===')'){if(expectingValue)throw new Error('Empty or incomplete parenthesis');while(operators.length&&operators.at(-1).type!=='(')output.push(operators.pop());if(!operators.length)throw new Error('Unmatched closing parenthesis');operators.pop();expectingValue=false;return;}
    if(expectingValue){if(token.type==='-'){output.push({type:'number',value:0});}else throw new Error('Formula has an operator without a left value');}
    while(operators.length&&precedence[operators.at(-1).type]>=precedence[token.type])output.push(operators.pop());operators.push(token);expectingValue=true;
  });
  if(expectingValue)throw new Error('Formula ends with an operator');while(operators.length){const token=operators.pop();if(token.type==='(')throw new Error('Unmatched opening parenthesis');output.push(token);}
  const dependencies=[...new Set(output.filter(token=>token.type==='ref').map(token=>token.value))];
  return {dependencies,evaluate(values){const stack=[];for(const token of output){if(token.type==='number')stack.push(token.value);else if(token.type==='ref'){if(!values.has(token.value))return null;stack.push(values.get(token.value));}else{const right=stack.pop(),left=stack.pop();if(token.type==='/'&&right===0)return null;const result=token.type==='+'?left+right:token.type==='-'?left-right:token.type==='*'?left*right:left/right;if(!Number.isFinite(result))return null;stack.push(result);}}return stack.length===1?stack[0]:null;}};
}

export function addDerivedColumn(dataset,{name,formula}) {
  const cleanName=String(name||'').trim();if(!cleanName)throw new Error('Derived column needs a name');if(dataset.columns.some(column=>column.name===cleanName))throw new Error(`Column name “${cleanName}” already exists`);
  const compiled=compileColumnFormula(formula);const letter=columnLetter(dataset.columns.length);const rows=dataset.energy.length;const values=[];
  for(let row=0;row<rows;row+=1){const map=new Map(dataset.columns.map(column=>[column.letter,column.values[row]]));values.push(compiled.evaluate(map));}
  const column={letter,name:cleanName,formula:String(formula).toUpperCase(),dependencies:compiled.dependencies,values,derived:true};dataset.columns.push(column);dataset.derivedColumns.push(column);return column;
}

export function calculateOrbitalMetric(dataset,metric) {
  // Named metrics are semantic. Never substitute a different orbital merely
  // because it occupies the same spreadsheet position in another PDOS file.
  const column=metric.sourceName
    ?dataset.columns.find(item=>item.name===metric.sourceName)
    :(metric.sourceLetter?dataset.columns.find(item=>item.letter===metric.sourceLetter):null);
  if(!column||column.energy||column.values.some(value=>value===null||!Number.isFinite(value)))return {value:null,status:'missing source column'};
  const points=getDosFillPoints(dataset.energy,column.values,Boolean(metric.rangeEnabled),metric.xMin??'',metric.xMax??'');
  if(points.length<2)return {value:null,status:'empty or invalid range'};
  let area=0,moment=0;for(let index=1;index<points.length;index+=1){const left=points[index-1],right=points[index],dx=right.x-left.x;area+=dx*(left.y+right.y)/2;moment+=dx*(left.x*left.y+right.x*right.y)/2;}
  if(metric.type==='centre'){if(Math.abs(area)<1e-14)return {value:null,status:'zero integrated weight'};return {value:moment/area,status:'ok'};}
  return {value:area,status:'ok'};
}

export function evaluateMetrics(datasets,metrics) {
  return datasets.map(dataset=>({sheetName:dataset.name,filename:dataset.filename,results:Object.fromEntries(metrics.map(metric=>[metric.name,calculateOrbitalMetric(dataset,metric)]))}));
}

export function metricsToCsv(rows,metrics) {
  const quote=value=>`"${String(value??'').replaceAll('"','""')}"`;
  return [['Sheet name',...metrics.map(metric=>metric.name)].map(quote).join(','),...rows.map(row=>[row.sheetName,...metrics.map(metric=>row.results[metric.name]?.value??'')].map(quote).join(','))].join('\n')+'\n';
}

const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const xcell=(value,row,col)=>{const ref=`${columnLetter(col)}${row}`;return typeof value==='number'?`<c r="${ref}"><v>${value}</v></c>`:`<c r="${ref}" t="inlineStr"><is><t>${esc(value)}</t></is></c>`;};
const worksheet=rows=>`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews><sheetData>${rows.map((row,index)=>`<row r="${index+1}">${row.map((value,col)=>xcell(value,index+1,col)).join('')}</row>`).join('')}</sheetData><autoFilter ref="A1:${columnLetter(rows[0].length-1)}${rows.length}"/></worksheet>`;

export async function buildOrbitalMetricsWorkbook(rows,metrics,formulas=[]) {
  const summary=[['Sheet name',...metrics.map(metric=>metric.name)],...rows.map(row=>[row.sheetName,...metrics.map(metric=>row.results[metric.name]?.value??'')])];
  const definitions=[['Metric name','Type','Source column','Range','From X','To X'],...metrics.map(metric=>[metric.name,metric.type,metric.sourceName,metric.rangeEnabled?'finite':'full',metric.rangeEnabled?metric.xMin:'−∞',metric.rangeEnabled?metric.xMax:'+∞']),[],['Derived column','Formula'],...formulas.map(item=>[item.name,item.formula])];
  const zip=new JSZip();zip.file('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');zip.folder('_rels').file('.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');zip.folder('xl').file('workbook.xml','<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Summary" sheetId="1" r:id="rId1"/><sheet name="Definitions" sheetId="2" r:id="rId2"/></sheets></workbook>');zip.folder('xl').folder('_rels').file('workbook.xml.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>');zip.folder('xl').folder('worksheets').file('sheet1.xml',worksheet(summary)).file('sheet2.xml',worksheet(definitions));return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}

export function applyOrbitalMetricsTemplate(dataset,template) {
  dataset.columns=dataset.columns.slice(0,dataset.baseColumnCount);dataset.derivedColumns=[];dataset.warnings=[];
  const sourceNames=new Map(Object.entries(template.columnMap||{}));
  for(const definition of template.derivedColumns){
    const formula=String(definition.formula).replace(/\b[A-Z]+\b/g,letter=>{const sourceName=sourceNames.get(letter);if(!sourceName)return letter;const target=dataset.columns.find(column=>column.name===sourceName);return target?.letter||`MISSING_${letter}`;});
    try{const column=addDerivedColumn(dataset,{name:definition.name,formula});sourceNames.set(definition.letter||column.letter,definition.name);}catch(error){dataset.warnings.push(`${definition.name}: ${error.message}`);dataset.columns.push({letter:columnLetter(dataset.columns.length),name:definition.name,formula:definition.formula,values:Array(dataset.energy.length).fill(null),derived:true});}
  }
  return template.metrics.map(metric=>({...metric}));
}

export function serializeOrbitalMetricsTemplate(name,derivedColumns,metrics,columns=[]){return JSON.stringify({format:'padarthkhoj-orbital-metrics-template',version:1,name:String(name||'Orbital metrics template'),columnMap:Object.fromEntries(columns.map(column=>[column.letter,column.name])),derivedColumns:derivedColumns.map(({letter,name:columnName,formula})=>({letter,name:columnName,formula})),metrics:metrics.map(metric=>({...metric}))},null,2);}
export function parseOrbitalMetricsTemplate(text){let value;try{value=typeof text==='string'?JSON.parse(text):text;}catch{throw new Error('Template is not valid JSON');}if(value?.format!=='padarthkhoj-orbital-metrics-template'||value.version!==1||!Array.isArray(value.metrics)||!Array.isArray(value.derivedColumns))throw new Error('Unsupported orbital-metrics template');return value;}
