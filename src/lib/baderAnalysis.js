import JSZip from 'jszip';

export const ATOMIC_NUMBERS = Object.fromEntries(`H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U`.split(' ').map((symbol,index)=>[symbol,index+1]));

export function parseACF(text) {
  const rows=[]; const metadata={};
  String(text).split(/\r?\n/).forEach(line=>{
    const match=line.trim().match(/^(\d+)\s+([-+\d.Ee]+)\s+([-+\d.Ee]+)\s+([-+\d.Ee]+)\s+([-+\d.Ee]+)\s+([-+\d.Ee]+)\s+([-+\d.Ee]+)/);
    if(match) rows.push({index:Number(match[1]),x:Number(match[2]),y:Number(match[3]),z:Number(match[4]),electrons:Number(match[5]),minDistance:Number(match[6]),atomicVolume:Number(match[7])});
    const footer=line.match(/^\s*(VACUUM CHARGE|VACUUM VOLUME|NUMBER OF ELECTRONS):\s*([-+\d.Ee]+)/i);
    if(footer) metadata[footer[1].toLowerCase().replaceAll(' ','_')]=Number(footer[2]);
  });
  if(!rows.length) throw new Error('No atomic rows were found in ACF.dat');
  return {rows,metadata};
}

export function parseQEInputAtoms(text) {
  const source=String(text);
  const natMatch=source.match(/\bnat\s*=\s*(\d+)/i);
  const expected=natMatch?Number(natMatch[1]):null;
  const lines=source.split(/\r?\n/);
  const start=lines.findIndex(line=>/^\s*ATOMIC_POSITIONS\b/i.test(line));
  if(start<0)throw new Error('SCF input does not contain an ATOMIC_POSITIONS block');
  const stop=/^\s*(K_POINTS|CELL_PARAMETERS|ATOMIC_SPECIES|CONSTRAINTS|OCCUPATIONS|ATOMIC_FORCES|HUBBARD|SOLVENTS|&|\/)\b/i;
  const atoms=[];
  for(let index=start+1;index<lines.length;index++){
    const line=lines[index].replace(/!.*/,'').trim();
    if(!line)continue;
    if(stop.test(line))break;
    const tokens=line.split(/\s+/);
    if(!/^[A-Z][a-z]?$/.test(tokens[0])||tokens.length<4||tokens.slice(1,4).some(value=>!Number.isFinite(Number(value))))break;
    atoms.push({element:tokens[0],x:Number(tokens[1]),y:Number(tokens[2]),z:Number(tokens[3])});
    if(expected&&atoms.length===expected)break;
  }
  if(!atoms.length)throw new Error('No atoms were found below ATOMIC_POSITIONS in the SCF input');
  if(expected&&atoms.length!==expected)throw new Error(`SCF input declares nat=${expected} but ${atoms.length} positions were parsed`);
  return atoms;
}

const BOHR_TO_ANGSTROM=0.529177210903;
const qeValue=(source,name)=>{const match=String(source).match(new RegExp(`\\b${name.replace(/[()]/g,'\\$&')}\\s*=\\s*([-+\\d.Ee]+)`,'i'));return match?Number(match[1]):null;};
const fracToCart=(matrix,x,y,z)=>[matrix[0][0]*x+matrix[0][1]*y+matrix[0][2]*z,matrix[1][0]*x+matrix[1][1]*y+matrix[1][2]*z,matrix[2][0]*x+matrix[2][1]*y+matrix[2][2]*z];

export function parseQEInputStructure(text) {
  const source=String(text),ordered=parseQEInputAtoms(source);
  const lines=source.split(/\r?\n/);
  const a=qeValue(source,'a')??(qeValue(source,'celldm(1)')*BOHR_TO_ANGSTROM||null);
  const b=qeValue(source,'b'),c=qeValue(source,'c')??(a&&qeValue(source,'celldm(3)')?a*qeValue(source,'celldm(3)'):null);
  const cellStart=lines.findIndex(line=>/^\s*CELL_PARAMETERS\b/i.test(line));
  let lattMat=null;
  if(cellStart>=0){
    const vectors=lines.slice(cellStart+1,cellStart+4).map(line=>line.replace(/!.*/, '').trim().split(/\s+/).slice(0,3).map(Number));
    if(vectors.length===3&&vectors.every(vector=>vector.length===3&&vector.every(Number.isFinite))){
      const unit=(lines[cellStart].match(/[({]\s*([^)}\s]+)/)?.[1]||'alat').toLowerCase();
      const factor=unit.startsWith('ang')?1:unit==='bohr'?BOHR_TO_ANGSTROM:a;
      if(Number.isFinite(factor))lattMat=[[vectors[0][0]*factor,vectors[1][0]*factor,vectors[2][0]*factor],[vectors[0][1]*factor,vectors[1][1]*factor,vectors[2][1]*factor],[vectors[0][2]*factor,vectors[1][2]*factor,vectors[2][2]*factor]];
    }
  } else {
    const ibrav=qeValue(source,'ibrav');
    if(ibrav===1&&a)lattMat=[[a,0,0],[0,a,0],[0,0,a]];
    if(ibrav===4&&a&&c)lattMat=[[a,-a/2,0],[0,a*Math.sqrt(3)/2,0],[0,0,c]];
    if(ibrav===6&&a&&c)lattMat=[[a,0,0],[0,a,0],[0,0,c]];
    if(ibrav===8&&a&&b&&c)lattMat=[[a,0,0],[0,b,0],[0,0,c]];
  }
  if(!lattMat)return null;
  const positionHeader=lines.find(line=>/^\s*ATOMIC_POSITIONS\b/i.test(line))||'';
  const unit=(positionHeader.match(/[({]\s*([^)}\s]+)/)?.[1]||positionHeader.trim().split(/\s+/)[1]||'alat').toLowerCase();
  const atoms=ordered.map((atom,index)=>{
    let cart,fx,fy,fz;
    if(unit.startsWith('crystal')){fx=atom.x;fy=atom.y;fz=atom.z;cart=fracToCart(lattMat,fx,fy,fz);}
    else {const factor=unit.startsWith('ang')?1:unit==='bohr'?BOHR_TO_ANGSTROM:a;if(!Number.isFinite(factor))return null;cart=[atom.x*factor,atom.y*factor,atom.z*factor];}
    return {id:index,label:`${atom.element}${index+1}`,element:atom.element,x:fx,y:fy,z:fz,cx:cart[0],cy:cart[1],cz:cart[2]};
  });
  return atoms.some(atom=>!atom)?null:{atoms,lattMat,coordType:unit.startsWith('crystal')?'fractional':'cartesian'};
}

const vectorLength=vector=>Math.hypot(...vector);
const vectorAngle=(a,b)=>Math.acos(Math.max(-1,Math.min(1,a.reduce((sum,value,index)=>sum+value*b[index],0)/(vectorLength(a)*vectorLength(b)))))*180/Math.PI;

export function parseVaspPoscar(text, filename='POSCAR') {
  const lines=String(text).split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  if(lines.length<8)throw new Error(`${filename} is not a complete POSCAR/CONTCAR`);
  const rawScale=Number(lines[1]);
  if(!Number.isFinite(rawScale)||rawScale===0)throw new Error(`${filename} has an invalid VASP scale factor`);
  const rawVectors=lines.slice(2,5).map((line,index)=>{const values=line.split(/\s+/).slice(0,3).map(Number);if(values.length!==3||values.some(value=>!Number.isFinite(value)))throw new Error(`${filename} has an invalid lattice vector on line ${index+3}`);return values;});
  const determinant=Math.abs(rawVectors[0][0]*(rawVectors[1][1]*rawVectors[2][2]-rawVectors[1][2]*rawVectors[2][1])-rawVectors[0][1]*(rawVectors[1][0]*rawVectors[2][2]-rawVectors[1][2]*rawVectors[2][0])+rawVectors[0][2]*(rawVectors[1][0]*rawVectors[2][1]-rawVectors[1][1]*rawVectors[2][0]));
  if(determinant<1e-12)throw new Error(`${filename} has a singular lattice`);
  const scale=rawScale>0?rawScale:Math.cbrt(Math.abs(rawScale)/determinant);
  const vectors=rawVectors.map(vector=>vector.map(value=>value*scale));
  const species=lines[5].split(/\s+/);
  if(species.every(token=>/^\d+$/.test(token)))throw new Error(`${filename} uses VASP 4 format without element names; use a VASP 5+ POSCAR/CONTCAR`);
  if(species.some(token=>!ATOMIC_NUMBERS[token]))throw new Error(`${filename} contains an unrecognized element in its species line`);
  const counts=lines[6].split(/\s+/).map(Number);
  if(counts.length!==species.length||counts.some(count=>!Number.isInteger(count)||count<1))throw new Error(`${filename} species counts do not match its element list`);
  const atomCount=counts.reduce((sum,count)=>sum+count,0);
  let cursor=7;
  if(/^s(?:elective)?/i.test(lines[cursor]))cursor+=1;
  const coordinateLine=lines[cursor++]||'';
  const direct=/^[dD]/.test(coordinateLine);
  const cartesian=/^[cCkK]/.test(coordinateLine);
  if(!direct&&!cartesian)throw new Error(`${filename} does not declare Direct or Cartesian coordinates`);
  if(lines.length<cursor+atomCount)throw new Error(`${filename} declares ${atomCount} atoms but has too few position rows`);
  const expandedElements=species.flatMap((element,index)=>Array(counts[index]).fill(element));
  const lattMat=[[vectors[0][0],vectors[1][0],vectors[2][0]],[vectors[0][1],vectors[1][1],vectors[2][1]],[vectors[0][2],vectors[1][2],vectors[2][2]]];
  const atoms=expandedElements.map((element,index)=>{
    const values=lines[cursor+index].split(/\s+/).slice(0,3).map(Number);
    if(values.length!==3||values.some(value=>!Number.isFinite(value)))throw new Error(`${filename} has an invalid position for atom ${index+1}`);
    const cart=direct?[
      values[0]*vectors[0][0]+values[1]*vectors[1][0]+values[2]*vectors[2][0],
      values[0]*vectors[0][1]+values[1]*vectors[1][1]+values[2]*vectors[2][1],
      values[0]*vectors[0][2]+values[1]*vectors[1][2]+values[2]*vectors[2][2],
    ]:values.map(value=>value*scale);
    return {id:index,label:`${element}${index+1}`,element,x:direct?values[0]:undefined,y:direct?values[1]:undefined,z:direct?values[2]:undefined,cx:cart[0],cy:cart[1],cz:cart[2]};
  });
  return {source:'VASP',atoms,structure:{atoms,lattMat,coordType:direct?'fractional':'cartesian',cell:{a:vectorLength(vectors[0]),b:vectorLength(vectors[1]),c:vectorLength(vectors[2]),alpha:vectorAngle(vectors[1],vectors[2]),beta:vectorAngle(vectors[0],vectors[2]),gamma:vectorAngle(vectors[0],vectors[1])}}};
}

export function parseBaderReference(text, filename='structure input') {
  if(/^\s*ATOMIC_POSITIONS\b/im.test(String(text)))return {source:'Quantum ESPRESSO',atoms:parseQEInputAtoms(text),structure:parseQEInputStructure(text)};
  return parseVaspPoscar(text,filename);
}

export function structureFromBaderRecords(records) {
  return {coordType:'cartesian',lattMat:null,reconstructed:true,atoms:records.map((record,index)=>({id:index,label:`${record.element}${record.index}`,element:record.element,x:undefined,y:undefined,z:undefined,cx:requiredNumber(record.x,`X coordinate for atom ${record.index}`),cy:requiredNumber(record.y,`Y coordinate for atom ${record.index}`),cz:requiredNumber(record.z,`Z coordinate for atom ${record.index}`)}))};
}

export function calculateBaderCharge(row, element, coreElectrons) {
  const atomicNumber=ATOMIC_NUMBERS[element];
  if(!atomicNumber) throw new Error(`Atomic number is unavailable for ${element}`);
  return atomicNumber-Number(coreElectrons)-row.electrons;
}

const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const colName=index=>{let name='';for(let n=index+1;n;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;return name;};
const cell=(value,row,col,style=0,formula=null)=>{
  const ref=`${colName(col)}${row}`;
  if(formula)return `<c r="${ref}" s="${style}"><f>${esc(formula)}</f><v>${Number(value)}</v></c>`;
  if(typeof value==='number')return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t>${esc(value)}</t></is></c>`;
};
const sheetXml=(rows,widths,freeze=true)=>`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" showGridLines="0">${freeze?'<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>':''}</sheetView></sheetViews><cols>${widths.map((width,index)=>`<col min="${index+1}" max="${index+1}" width="${width}" customWidth="1"/>`).join('')}</cols><sheetData>${rows.map((cells,index)=>`<row r="${index+1}">${cells.join('')}</row>`).join('')}</sheetData><autoFilter ref="A1:${colName(widths.length-1)}${rows.length}"/></worksheet>`;

const structureRows = (structure, source, sourceName) => {
  const rows=[];
  const add=(values,style=0)=>{const row=rows.length+1;rows.push(values.map((value,col)=>cell(value,row,col,style)));};
  add(['PADARTHKHOJ BADER PROJECT',2],1);
  add(['SOURCE',source||'Unknown']);
  add(['SOURCE FILE',sourceName||'']);
  add(['COORDINATE TYPE',structure.coordType||'cartesian']);
  add([]);
  add(['LATTICE VECTOR','X (Å)','Y (Å)','Z (Å)'],1);
  const matrix=structure.lattMat;
  if(matrix) ['a','b','c'].forEach((name,index)=>add([name,matrix[0][index],matrix[1][index],matrix[2][index]]));
  add([]);
  add(['ATOM','ELEMENT','FRACTIONAL X','FRACTIONAL Y','FRACTIONAL Z','CARTESIAN X (Å)','CARTESIAN Y (Å)','CARTESIAN Z (Å)'],1);
  structure.atoms.forEach((atom,index)=>add([index+1,atom.element,atom.x??'',atom.y??'',atom.z??'',atom.cx,atom.cy,atom.cz]));
  return rows;
};

export async function buildBaderWorkbook(records, metadata={}, project={}) {
  const resultRows=[];
  resultRows.push(['#','ATOM TYPE','X','Y','Z','CHARGE','MIN DIST','ATOMIC VOL','BADER CHARGE'].map((value,col)=>cell(value,1,col,1)));
  records.forEach((record,index)=>{
    const row=index+2; const formula=`Metadata!B${row}-Metadata!C${row}-F${row}`;
    const values=[record.index,record.element,record.x,record.y,record.z,record.electrons,record.minDistance,record.atomicVolume];
    resultRows.push([...values.map((value,col)=>cell(value,row,col,col<2?0:2)),cell(record.baderCharge,row,8,record.baderCharge>0?3:record.baderCharge<0?4:2,formula)]);
  });
  const metaRows=[['ATOM','ATOMIC NUMBER','CORE ELECTRONS','ELEMENT'].map((value,col)=>cell(value,1,col,1))];
  records.forEach((record,index)=>metaRows.push([record.index,record.atomicNumber,record.coreElectrons,record.element].map((value,col)=>cell(value,index+2,col,col===0||col===3?0:2))));
  const noteStart=records.length+4;
  metaRows.push([cell('Charge convention',noteStart,0,1),cell('Bader charge = atomic number − core electrons − integrated Bader electrons',noteStart,1,0)]);
  Object.entries(metadata).forEach(([key,value],index)=>metaRows.push([cell(key.replaceAll('_',' '),noteStart+1+index,0,1),cell(value,noteStart+1+index,1,2)]));

  const hasStructure=Boolean(project.structure?.atoms?.length&&project.structure?.lattMat);
  const sheetCount=hasStructure?3:2;
  const zip=new JSZip();
  zip.file('[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${Array.from({length:sheetCount},(_,index)=>`<Override PartName="/xl/worksheets/sheet${index+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`);
  zip.folder('_rels').file('.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.folder('xl').file('workbook.xml',`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Bader Results" sheetId="1" r:id="rId1"/><sheet name="Metadata" sheetId="2" r:id="rId2"/>${hasStructure?'<sheet name="Structure" sheetId="3" r:id="rId3"/>':''}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`);
  zip.folder('xl').folder('_rels').file('workbook.xml.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${Array.from({length:sheetCount},(_,index)=>`<Relationship Id="rId${index+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index+1}.xml"/>`).join('')}<Relationship Id="rId${sheetCount+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.folder('xl').file('styles.xml',`<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="10"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Aptos"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFEE2E2"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="2" fontId="0" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/><xf numFmtId="2" fontId="0" fillId="4" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/></cellXfs></styleSheet>`);
  zip.folder('xl').folder('worksheets').file('sheet1.xml',sheetXml(resultRows,[7,13,14,14,14,14,14,16,18]));
  zip.folder('xl').folder('worksheets').file('sheet2.xml',sheetXml(metaRows,[12,18,18,16,70],false));
  if(hasStructure)zip.folder('xl').folder('worksheets').file('sheet3.xml',sheetXml(structureRows(project.structure,project.source,project.sourceName),[25,18,18,18,18,22,22,22],false));
  return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}

const decodeXml=value=>String(value??'').replace(/&#(\d+);/g,(_,code)=>String.fromCharCode(Number(code))).replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const columnIndex=reference=>[...reference.replace(/\d/g,'')].reduce((value,letter)=>value*26+letter.charCodeAt(0)-64,0)-1;
const parseSheetRows=(xml,sharedStrings=[])=>[...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map(row=>{
  const values=[];
  for(const match of row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)){
    const ref=match[1].match(/\br="([A-Z]+\d+)"/)?.[1];
    if(!ref)continue;
    const inline=match[2].match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/)?.[1];
    const numeric=match[2].match(/<v>([\s\S]*?)<\/v>/)?.[1];
    values[columnIndex(ref)]=inline!==undefined?decodeXml(inline):numeric!==undefined&&/\bt="s"/.test(match[1])?sharedStrings[Number(numeric)]??'':numeric!==undefined?Number(numeric):'';
  }
  return values;
});
const requiredNumber=(value,label)=>{const number=Number(value);if(!Number.isFinite(number))throw new Error(`Bader workbook has an invalid ${label}`);return number;};
const optionalNumber=(value,label)=>value===''||value===undefined?undefined:requiredNumber(value,label);

export async function parseBaderWorkbook(data) {
  let zip;
  try { zip=await JSZip.loadAsync(data); } catch { throw new Error('The selected file is not a readable XLSX workbook.'); }
  const sharedFile=zip.file('xl/sharedStrings.xml');
  const sharedStrings=sharedFile?[...(await sharedFile.async('string')).matchAll(/<si>([\s\S]*?)<\/si>/g)].map(match=>decodeXml([...match[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(text=>text[1]).join(''))):[];
  const resultsFile=zip.file('xl/worksheets/sheet1.xml'),metadataFile=zip.file('xl/worksheets/sheet2.xml');
  if(!resultsFile||!metadataFile)throw new Error('This is not a Padarthkhoj Bader workbook: required result and metadata sheets are missing.');
  const results=parseSheetRows(await resultsFile.async('string'),sharedStrings);
  const headers=(results[0]||[]).map(value=>String(value).trim().toUpperCase());
  for(const required of ['#','ATOM TYPE','X','Y','Z','CHARGE','MIN DIST','ATOMIC VOL','BADER CHARGE'])if(!headers.includes(required))throw new Error(`This workbook is missing the required “${required}” column.`);
  const at=name=>headers.indexOf(name);
  const metadataRows=parseSheetRows(await metadataFile.async('string'),sharedStrings);
  const atomMetadata=new Map(metadataRows.slice(1).filter(row=>Number.isInteger(Number(row[0]))).map(row=>[Number(row[0]),row]));
  const records=results.slice(1).filter(row=>row.some(value=>value!==undefined&&value!=='')).map((row,index)=>{
    const atomIndex=requiredNumber(row[at('#')],`atom number on data row ${index+2}`);
    const element=String(row[at('ATOM TYPE')]??'').trim();
    if(!ATOMIC_NUMBERS[element])throw new Error(`Bader workbook has an unrecognized element “${element}” on data row ${index+2}.`);
    const meta=atomMetadata.get(atomIndex);
    if(!meta)throw new Error(`Bader workbook metadata is missing atom ${atomIndex}.`);
    return {index:atomIndex,element,x:requiredNumber(row[at('X')],`X coordinate for atom ${atomIndex}`),y:requiredNumber(row[at('Y')],`Y coordinate for atom ${atomIndex}`),z:requiredNumber(row[at('Z')],`Z coordinate for atom ${atomIndex}`),electrons:requiredNumber(row[at('CHARGE')],`integrated charge for atom ${atomIndex}`),minDistance:requiredNumber(row[at('MIN DIST')],`minimum distance for atom ${atomIndex}`),atomicVolume:requiredNumber(row[at('ATOMIC VOL')],`atomic volume for atom ${atomIndex}`),baderCharge:requiredNumber(row[at('BADER CHARGE')],`Bader charge for atom ${atomIndex}`),atomicNumber:requiredNumber(meta[1],`atomic number for atom ${atomIndex}`),coreElectrons:requiredNumber(meta[2],`core-electron count for atom ${atomIndex}`)};
  });
  if(!records.length)throw new Error('The Bader workbook contains no atom records.');
  if(new Set(records.map(record=>record.index)).size!==records.length)throw new Error('The Bader workbook contains duplicate atom numbers.');
  const metadata={};
  metadataRows.forEach(row=>{if(typeof row[0]==='string'&&Number.isFinite(Number(row[1]))&&!['ATOM','Charge convention'].includes(row[0]))metadata[row[0].trim().replaceAll(' ','_')]=Number(row[1]);});
  let structure=null,source='Imported workbook',sourceName='';
  const structureFile=zip.file('xl/worksheets/sheet3.xml');
  if(structureFile){
    const rows=parseSheetRows(await structureFile.async('string'),sharedStrings);
    if(rows[0]?.[0]==='PADARTHKHOJ BADER PROJECT'){
      source=String(rows.find(row=>row[0]==='SOURCE')?.[1]||source);
      sourceName=String(rows.find(row=>row[0]==='SOURCE FILE')?.[1]||'');
      const coordinateType=String(rows.find(row=>row[0]==='COORDINATE TYPE')?.[1]||'cartesian');
      const latticeStart=rows.findIndex(row=>row[0]==='LATTICE VECTOR');
      const atomStart=rows.findIndex(row=>row[0]==='ATOM'&&row[1]==='ELEMENT');
      if(latticeStart<0||atomStart<0)throw new Error('The embedded Structure sheet is incomplete.');
      const vectors=rows.slice(latticeStart+1,latticeStart+4).map((row,index)=>[1,2,3].map(col=>requiredNumber(row[col],`lattice component ${index+1}`)));
      const lattMat=[[vectors[0][0],vectors[1][0],vectors[2][0]],[vectors[0][1],vectors[1][1],vectors[2][1]],[vectors[0][2],vectors[1][2],vectors[2][2]]];
      const atoms=rows.slice(atomStart+1).filter(row=>Number.isInteger(Number(row[0]))).map((row,index)=>({id:index,label:`${row[1]}${index+1}`,element:String(row[1]),x:optionalNumber(row[2],`fractional X for structure atom ${index+1}`),y:optionalNumber(row[3],`fractional Y for structure atom ${index+1}`),z:optionalNumber(row[4],`fractional Z for structure atom ${index+1}`),cx:requiredNumber(row[5],`Cartesian X for structure atom ${index+1}`),cy:requiredNumber(row[6],`Cartesian Y for structure atom ${index+1}`),cz:requiredNumber(row[7],`Cartesian Z for structure atom ${index+1}`)}));
      if(atoms.length!==records.length)throw new Error(`Embedded structure has ${atoms.length} atoms but the Bader table has ${records.length}.`);
      const mismatch=atoms.findIndex((atom,index)=>atom.element!==records[index].element);
      if(mismatch>=0)throw new Error(`Embedded structure atom ${mismatch+1} does not match the Bader table.`);
      structure={atoms,lattMat,coordType:coordinateType};
    }
  }
  return {records,metadata,structure,source,sourceName,version:structure?2:1};
}
