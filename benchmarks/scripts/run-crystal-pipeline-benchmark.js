import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { findBonds } from '../../src/lib/bonding.js';
import { exportCIF, parseCIF } from '../../src/lib/cifParser.js';
import { cifToQE } from '../../src/lib/cifToQE.js';
import { computeKPoints, parseCIFSymmetry } from '../../src/lib/cifSymmetry.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),rules=[],cases=[];
const inputs=[
  {id:'triclinic',path:path.resolve(root,'../test/fixtures/triclinic.cif'),expectedAtoms:2,expectedLattice:'triclinic'},
  {id:'nacl-symmetry',path:path.resolve(root,'../test/fixtures/nacl-symmetry.cif'),expectedAtoms:3,expectedLattice:'cubic',symmetryExpanded:true},
  {id:'halfc1-real',path:path.join(root,'fixtures/bader/qe-real-002/halfc1.cif'),expectedAtoms:204},
  {id:'full-real',path:path.join(root,'fixtures/bader/qe-real-001/full.cif'),expectedAtoms:336},
];
const check=(scope,rule,passed,detail)=>rules.push({scope,rule,status:passed?'pass':'fail',detail});
const wrap=value=>((value%1)+1)%1;
const mapBondAtoms=parsed=>parsed.atoms.map(atom=>({element:atom.sym,cart:{x:atom.x,y:atom.y,z:atom.z},frac:{x:atom.fx,y:atom.fy,z:atom.fz}}));
const elementCounts=atoms=>Object.fromEntries([...atoms.reduce((map,atom)=>map.set(atom.sym,(map.get(atom.sym)||0)+1),new Map())].sort());

for(const input of inputs){
  const text=await readFile(input.path,'utf8'),started=performance.now(),parsed=parseCIF(text),parseMs=performance.now()-started;
  check(input.id,'parser returned structure',Boolean(parsed?.atoms?.length),parsed?`${parsed.atoms.length} atoms`:'null');
  check(input.id,'expected atom count',parsed.atoms.length===input.expectedAtoms,`${parsed.atoms.length} atoms`);
  check(input.id,'finite fractional coordinates',parsed.atoms.every(atom=>[atom.fx,atom.fy,atom.fz].every(Number.isFinite)),'all finite');
  check(input.id,'fractional coordinates packed',parsed.atoms.every(atom=>[atom.fx,atom.fy,atom.fz].every(value=>value>=0&&value<1)),'all within [0,1)');
  check(input.id,'finite Cartesian coordinates',parsed.atoms.every(atom=>[atom.x,atom.y,atom.z].every(Number.isFinite)),'all finite');
  const symmetry=parseCIFSymmetry(text),kmesh=computeKPoints(parsed.cell.a,parsed.cell.b,parsed.cell.c);
  check(input.id,'valid lattice classification',Boolean(symmetry.lattice)&&Number.isInteger(symmetry.ibrav),`${symmetry.lattice}; ibrav ${symmetry.ibrav}`);
  if(input.expectedLattice)check(input.id,'expected lattice',symmetry.lattice===input.expectedLattice,symmetry.lattice);
  check(input.id,'positive k mesh',[kmesh.kx,kmesh.ky,kmesh.kz].every(value=>Number.isInteger(value)&&value>=1),`${kmesh.kx}×${kmesh.ky}×${kmesh.kz}`);
  if(input.symmetryExpanded)check(input.id,'symmetry expansion and deduplication',parsed.atoms.length===3&&JSON.stringify(elementCounts(parsed.atoms))===JSON.stringify({Cl:1,Na:2}),JSON.stringify(elementCounts(parsed.atoms)));

  const bondAtoms=mapBondAtoms(parsed),bondStarted=performance.now(),bondsTight=findBonds(bondAtoms,parsed.mat,{scale:.8}),bondsDefault=findBonds(bondAtoms,parsed.mat,{scale:1.15}),bondMs=performance.now()-bondStarted;
  check(input.id,'bond scaling monotonic',bondsDefault.length>=bondsTight.length,`${bondsTight.length} at 80%; ${bondsDefault.length} at 115%`);
  check(input.id,'bond distances finite',bondsDefault.every(bond=>Number.isFinite(bond.distance)&&bond.distance>0),'all positive and finite');
  const pair=bondAtoms.length>1?[bondAtoms[0].element,bondAtoms[1].element]:['H','H'];
  const blocked=findBonds(bondAtoms,parsed.mat,{scale:2,rules:[{a:pair[0],b:pair[1],min:100,max:101}]});
  check(input.id,'custom pair threshold applied',blocked.every(bond=>![bond.i,bond.j].includes(0)||![bond.i,bond.j].includes(1)||pair[0]!==bondAtoms[bond.i].element||pair[1]!==bondAtoms[bond.j].element&&pair[0]!==bondAtoms[bond.j].element),`${blocked.length} remaining bonds`);

  const originalCount=parsed.atoms.length,editedAtoms=parsed.atoms.map(atom=>({...atom})),replacement=editedAtoms[0].sym==='O'?'N':'O';
  editedAtoms[0].sym=replacement;editedAtoms[0].fx=wrap(editedAtoms[0].fx+.001);editedAtoms[0].fy=wrap(editedAtoms[0].fy+.002);editedAtoms[0].fz=wrap(editedAtoms[0].fz+.003);
  editedAtoms.pop();const source=editedAtoms[Math.min(1,editedAtoms.length-1)];editedAtoms.push({...source,sym:'H',fx:wrap(source.fx+.017),fy:wrap(source.fy+.019),fz:wrap(source.fz+.023)});
  const edited={...parsed,atoms:editedAtoms},exportStarted=performance.now(),exported=exportCIF({cifData:edited}),reparsed=parseCIF(exported),crystal=cifToQE(exported,'crystal',6),angstrom=cifToQE(exported,'angstrom',6),exportMs=performance.now()-exportStarted;
  check(input.id,'edit atom count invariant',reparsed.atoms.length===originalCount,`${reparsed.atoms.length} atoms after delete + add`);
  check(input.id,'element replacement',reparsed.atoms[0].sym===replacement,`${parsed.atoms[0].sym} → ${replacement}`);
  check(input.id,'fractional displacement',Math.abs(reparsed.atoms[0].fx-editedAtoms[0].fx)<1e-6&&Math.abs(reparsed.atoms[0].fy-editedAtoms[0].fy)<1e-6&&Math.abs(reparsed.atoms[0].fz-editedAtoms[0].fz)<1e-6,'Δfrac = 0.001, 0.002, 0.003');
  check(input.id,'added atom preserved',reparsed.atoms.at(-1).sym==='H','last atom H');
  check(input.id,'cell round trip',['a','b','c','alpha','beta','gamma'].every(key=>Math.abs(reparsed.cell[key]-parsed.cell[key])<1e-5),'six cell parameters preserved');
  check(input.id,'QE crystal conversion',crystal.atomCount===originalCount&&/^ATOMIC_POSITIONS \{crystal\}/.test(crystal.text),`${crystal.atomCount} atoms`);
  check(input.id,'QE Cartesian conversion',angstrom.atomCount===originalCount&&/^ATOMIC_POSITIONS \{angstrom\}/.test(angstrom.text),`${angstrom.atomCount} atoms`);
  check(input.id,'QE species include edits',crystal.species.includes(replacement)&&crystal.species.includes('H'),crystal.species.join(', '));
  check(input.id,'clean exports',!/(?:NaN|undefined|Infinity)/.test(exported+crystal.text+angstrom.text),'no invalid numeric tokens');
  cases.push({case:input.id,source_sha256:createHash('sha256').update(text).digest('hex'),atoms:parsed.atoms.length,species:Object.keys(elementCounts(parsed.atoms)).length,lattice:symmetry.lattice,ibrav:symmetry.ibrav,k_mesh:`${kmesh.kx}x${kmesh.ky}x${kmesh.kz}`,bonds_80_percent:bondsTight.length,bonds_115_percent:bondsDefault.length,parse_ms:parseMs,bond_ms:bondMs,edit_export_qe_ms:exportMs});
}

const periodicAtoms=[{element:'H',cart:{x:.1,y:0,z:0},frac:{x:.01,y:0,z:0}},{element:'H',cart:{x:9.9,y:0,z:0},frac:{x:.99,y:0,z:0}}],periodicCell=[[10,0,0],[0,10,0],[0,0,10]];
const periodic=findBonds(periodicAtoms,periodicCell,{rules:[{a:'H',b:'H',min:.1,max:.3}]});check('periodic bonding','minimum-image bond detected',periodic.length===1&&Math.abs(periodic[0].distance-.2)<1e-12,periodic.length?`${periodic[0].distance} Å`:'missing');
for(const [name,text] of [['missing atoms','data_x\n_cell_length_a 5\n_cell_length_b 5\n_cell_length_c 5'],['non-numeric coordinates','data_x\n_cell_length_a 5\n_cell_length_b 5\n_cell_length_c 5\nloop_\n_atom_site_label\n_atom_site_fract_x\n_atom_site_fract_y\n_atom_site_fract_z\nC1 bad 0 0']]){const parsed=parseCIF(text);check('invalid CIF',name,parsed===null||parsed.atoms.length===0,parsed===null?'null':'zero atoms');}

const passed=rules.filter(rule=>rule.status==='pass').length,report={schemaVersion:1,benchmarkType:'Crystal Structure Studio CIF editing, bonding, round trip, and QE conversion',environment:{timestampUtc:new Date().toISOString(),node:process.version,platform:process.platform,architecture:process.arch,osRelease:os.release(),cpu:os.cpus()[0]?.model??'unavailable'},summary:{structures:cases.length,totalAtoms:cases.reduce((sum,item)=>sum+item.atoms,0),largestStructureAtoms:Math.max(...cases.map(item=>item.atoms)),rules:rules.length,passed,failed:rules.length-passed},rules,cases};
const csv=[Object.keys(cases[0]),...cases.map(Object.values)].map(row=>row.map(value=>`"${String(value??'').replaceAll('"','""')}"`).join(',')).join('\n')+'\n',results=path.join(root,'results');await mkdir(results,{recursive:true});await Promise.all([writeFile(path.join(results,'latest-crystal-pipeline.json'),JSON.stringify(report,null,2)+'\n'),writeFile(path.join(results,'latest-crystal-pipeline-cases.csv'),csv)]);
console.log(`Crystal pipeline benchmark: ${passed}/${rules.length} rules passed across ${cases.length} structures and ${report.summary.totalAtoms} atoms.`);
if(passed!==rules.length)process.exitCode=1;
