import JSZip from 'jszip';

export const PHYSICAL_CONSTANTS = Object.freeze({
  planckJs: 6.62607015e-34,
  boltzmannJK: 1.380649e-23,
  electronVoltJ: 1.602176634e-19,
  avogadroMol: 6.02214076e23,
  speedOfLightCms: 2.99792458e10,
});

export function parseFrequencyInput(text) {
  const tokens=String(text??'').split(/[\s,;]+/).filter(Boolean),values=[],invalid=[];
  tokens.forEach((token,index)=>{const value=Number(token);if(Number.isFinite(value))values.push(value);else invalid.push({token,index:index+1,reason:'not a number'});});
  return {values,invalid};
}

export function calculateZpeTs(frequenciesThz,temperatureK=298.15) {
  const temperature=Number(temperatureK);
  if(!Number.isFinite(temperature)||temperature<=0)throw new Error('Temperature must be greater than 0 K.');
  const {planckJs:h,boltzmannJK:kB,electronVoltJ:eV,avogadroMol:NA,speedOfLightCms:c}=PHYSICAL_CONSTANTS;
  const kTj=kB*temperature,kTev=kTj/eV;
  const modes=[],rejected=[];
  frequenciesThz.forEach((raw,index)=>{
    const frequency=Number(raw);
    if(!Number.isFinite(frequency)){rejected.push({index:index+1,value:raw,reason:'Not a finite number'});return;}
    if(frequency<0){rejected.push({index:index+1,value:frequency,reason:'Imaginary/negative mode'});return;}
    if(frequency===0){rejected.push({index:index+1,value:frequency,reason:'Zero mode'});return;}
    const hz=frequency*1e12,quantumJ=h*hz,quantumEv=quantumJ/eV,x=quantumJ/kTj;
    const occupation=x>700?0:1/Math.expm1(x);
    const entropyFactor=x>700?0:x*occupation-Math.log1p(-Math.exp(-x));
    const zpeEv=quantumEv/2,thermalEv=quantumEv*occupation,entropyEvK=(kB/eV)*entropyFactor,tsEv=kTev*entropyFactor;
    modes.push({index:index+1,frequencyThz:frequency,wavenumberCm1:hz/c,quantumEv,x,occupation,zpeEv,thermalEv,entropyEvK,entropyJMolK:entropyEvK*eV*NA,tsEv,freeEnergyCorrectionEv:zpeEv+thermalEv-tsEv});
  });
  const sum=key=>modes.reduce((total,mode)=>total+mode[key],0);
  const zpeEv=sum('zpeEv'),thermalEv=sum('thermalEv'),entropyEvK=sum('entropyEvK'),entropyJMolK=sum('entropyJMolK'),tsEv=sum('tsEv'),freeEnergyCorrectionEv=sum('freeEnergyCorrectionEv');
  return {temperatureK:temperature,kTev,modes,rejected,totals:{zpeEv,zpeKjMol:zpeEv*eV*NA/1000,thermalEv,entropyEvK,entropyJMolK,tsEv,tsKjMol:tsEv*eV*NA/1000,freeEnergyCorrectionEv,freeEnergyCorrectionKjMol:freeEnergyCorrectionEv*eV*NA/1000}};
}

const csvCell=value=>`"${String(value??'').replaceAll('"','""')}"`;
export function zpeTsToCsv(result) {
  const rows=[['Mode','Frequency (THz)','Wavenumber (cm^-1)','hν (eV)','x = hν/kBT','Occupation','ZPE (eV)','Thermal vibrational energy (eV)','S_vib (eV/K)','S_vib (J/mol/K)','T*S_vib (eV)','Vibrational free-energy correction (eV)'],...result.modes.map(m=>[m.index,m.frequencyThz,m.wavenumberCm1,m.quantumEv,m.x,m.occupation,m.zpeEv,m.thermalEv,m.entropyEvK,m.entropyJMolK,m.tsEv,m.freeEnergyCorrectionEv]),[],['Temperature (K)',result.temperatureK],['kBT (eV)',result.kTev],['Total ZPE (eV)',result.totals.zpeEv],['Total S_vib (J/mol/K)',result.totals.entropyJMolK],['Total T*S_vib (eV)',result.totals.tsEv],['Total vibrational free-energy correction (eV)',result.totals.freeEnergyCorrectionEv]];
  if(result.rejected.length)rows.push([],['Excluded input','Value','Reason'],...result.rejected.map(item=>[item.index,item.value,item.reason]));
  return rows.map(row=>row.map(csvCell).join(',')).join('\n')+'\n';
}

const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const letter=index=>{let out='';for(let n=index+1;n;n=Math.floor((n-1)/26))out=String.fromCharCode(65+(n-1)%26)+out;return out;};
const cell=(value,row,col)=>{const ref=`${letter(col)}${row}`;return typeof value==='number'?`<c r="${ref}"><v>${value}</v></c>`:`<c r="${ref}" t="inlineStr"><is><t>${esc(value)}</t></is></c>`;};
const sheetXml=rows=>`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews><sheetData>${rows.map((row,i)=>`<row r="${i+1}">${row.map((v,j)=>cell(v,i+1,j)).join('')}</row>`).join('')}</sheetData></worksheet>`;
export async function buildZpeTsWorkbook(result) {
  const calculations=[['Mode','Frequency (THz)','Wavenumber (cm^-1)','hν (eV)','x = hν/kBT','Occupation','ZPE (eV)','Thermal E_vib (eV)','S_vib (eV/K)','S_vib (J/mol/K)','T*S_vib (eV)','F_vib correction (eV)'],...result.modes.map(m=>[m.index,m.frequencyThz,m.wavenumberCm1,m.quantumEv,m.x,m.occupation,m.zpeEv,m.thermalEv,m.entropyEvK,m.entropyJMolK,m.tsEv,m.freeEnergyCorrectionEv])];
  const summary=[['Quantity','Value','Unit'],['Temperature',result.temperatureK,'K'],['Accepted modes',result.modes.length,''],['Excluded modes',result.rejected.length,''],['ZPE',result.totals.zpeEv,'eV'],['ZPE',result.totals.zpeKjMol,'kJ/mol'],['S_vib',result.totals.entropyEvK,'eV/K'],['S_vib',result.totals.entropyJMolK,'J/mol/K'],['T*S_vib',result.totals.tsEv,'eV'],['T*S_vib',result.totals.tsKjMol,'kJ/mol'],['Thermal vibrational energy',result.totals.thermalEv,'eV'],['ZPE + U_thermal - T*S_vib',result.totals.freeEnergyCorrectionEv,'eV'],[],['Formula','Definition','Meaning'],['x','hν/(kBT)','Dimensionless vibrational temperature'],['ZPE','1/2 Σhν','Zero-point vibrational energy'],['S_vib','kB Σ[x/(exp(x)-1) - ln(1-exp(-x))]','Quantum harmonic vibrational entropy'],['T*S_vib','kBT Σ[x/(exp(x)-1) - ln(1-exp(-x))]','Vibrational entropy contribution multiplied by temperature'],['F_vib correction','ZPE + Σ[hν/(exp(x)-1)] - T*S_vib','Harmonic vibrational Helmholtz correction'],[],['Excluded mode','Value (THz)','Reason'],...result.rejected.map(m=>[m.index,m.value,m.reason])];
  const zip=new JSZip();zip.file('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');zip.folder('_rels').file('.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');zip.folder('xl').file('workbook.xml','<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Summary &amp; formulas" sheetId="1" r:id="rId1"/><sheet name="Per-mode calculations" sheetId="2" r:id="rId2"/></sheets></workbook>');zip.folder('xl').folder('_rels').file('workbook.xml.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>');zip.folder('xl').folder('worksheets').file('sheet1.xml',sheetXml(summary)).file('sheet2.xml',sheetXml(calculations));return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
