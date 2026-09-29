import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { parseCIF, exportCIF } from '../src/lib/cifParser.js';
import { parseCIF as parseVisualGeneratorCIF } from '../src/lib/cifGenerator.js';
import { cifToQE } from '../src/lib/cifToQE.js';
import {
  buildCellVectors,
  buildCelldm,
  computeKPoints,
  findIbrav,
  findLattice,
  parseCIFSymmetry,
} from '../src/lib/cifSymmetry.js';
import { generateCIF, parseQEOutput } from '../src/lib/qeParser.js';
import { generateBaderWorkflow, generateBandsWorkflow, generateChargeWorkflow, generateDOSWorkflow, generatePWWorkflow, generateQEInput, generateVibrationalWorkflow, OCCUPATION_OPTIONS, SMEARING_OPTIONS } from '../src/lib/qeGenerator.js';
import { getYRange, groupRows, parseCSV } from '../src/lib/freeEnergyParser.js';
import { escapeHTML } from '../src/lib/html.js';
import { getPseudosForElement, PSEUDOPOTENTIALS } from '../src/data/pseudos.js';
import { NO3_TO_NH3_INTERMEDIATES } from '../src/data/nrrIntermediates.js';
import { HER_INTERMEDIATES, N2_TO_NH3_INTERMEDIATES, OER_ORR_INTERMEDIATES } from '../src/data/reactionPathways.js';
import { CO2RR_C2H4_PATH, CO2RR_CHO_ALTERNATIVE, CO2RR_ETHANOL_PATH } from '../src/data/co2rrIntermediates.js';
import { buildIntermediateCIF, evaluatePlacement, evaluatePlacementVolume, getTemplateAdsorptionAxis, placeAnchoredIntermediate, placeIntermediate, suggestPlacementSpheres } from '../src/lib/intermediateMaker.js';
import { buildBaderWorkbook, calculateBaderCharge, parseACF, parseBaderReference, parseBaderWorkbook, parseQEInputAtoms, parseQEInputStructure, parseVaspPoscar, structureFromBaderRecords } from '../src/lib/baderAnalysis.js';
import JSZip from 'jszip';
import { findBonds } from '../src/lib/bonding.js';
import { findPeriodicEdgeReplicas } from '../src/lib/periodicEdgeAtoms.js';
import { parseCustomPathwayJSON, serializeCustomPathway, templateFromCIF } from '../src/lib/customPathway.js';
import { applyDosTemplate, createDatasetView, getDosFillPoints, parseDosCsv, parseDosTemplate, serializeDosTemplate } from '../src/lib/scientificDosPlot.js';
import { buildPdosExportFilename, parseAtomNumberSelection, parsePdosFile, parsePdosFilename, parsePdosUpload, parseVaspDoscar, parseVaspPoscarSpecies, pdosResultToCsv, sumPdosRecords, validatePdosCollection } from '../src/lib/pdosAnalysis.js';
import { addDerivedColumn, applyOrbitalMetricsTemplate, buildOrbitalMetricsWorkbook, calculateOrbitalMetric, compileColumnFormula, evaluateMetrics, metricsToCsv, parseOrbitalMetricsCsv, parseOrbitalMetricsTemplate, serializeOrbitalMetricsTemplate } from '../src/lib/orbitalMetrics.js';
import { PlotEngine } from '../src/lib/freeEnergyPlot.js';
import { buildZpeTsWorkbook, calculateZpeTs, parseFrequencyInput, zpeTsToCsv } from '../src/lib/zpeTs.js';

const fixture = name => readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const closeTo = (actual, expected, tolerance = 1e-8) => {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`);
};

test('periodic edge atoms complete boundary bonds without changing source atoms', () => {
  const atoms = [
    { element:'C', cart:{x:9.5,y:5,z:5}, frac:{x:.95,y:.5,z:.5} },
    { element:'C', cart:{x:.5,y:5,z:5}, frac:{x:.05,y:.5,z:.5} },
  ];
  const before = structuredClone(atoms);
  const lattice = [[10,0,0],[0,10,0],[0,0,10]];
  const replicas = findPeriodicEdgeReplicas(atoms,lattice);
  assert.equal(replicas.length,2);
  assert.deepEqual(replicas.map(item=>item.sourceIndex).sort(),[0,1]);
  assert.deepEqual(replicas.map(item=>item.cart.x).sort((a,b)=>a-b),[-.5,10.5]);
  assert.deepEqual(atoms,before);
});

test('periodic edge atoms are omitted for non-periodic coordinates', () => {
  const atoms = [{ element:'C', cart:{x:0,y:0,z:0}, frac:null }];
  assert.deepEqual(findPeriodicEdgeReplicas(atoms,[[1,0,0],[0,1,0],[0,0,1]]),[]);
});

test('ZPE and TS calculator reproduces exact harmonic thermochemistry', () => {
  const parsed=parseFrequencyInput('1.5216, 1.9174\n24.8485; bad');
  assert.deepEqual(parsed.values,[1.5216,1.9174,24.8485]);
  assert.equal(parsed.invalid.length,1);
  const result=calculateZpeTs([1.5216,1.9174,24.8485,36.1835,43.8909,110.7545,110.905],298.15);
  closeTo(result.totals.zpeEv,0.6824294216367939,1e-12);
  closeTo(result.totals.tsEv,0.12098833031881037,1e-12);
  closeTo(result.totals.freeEnergyCorrectionEv,0.6085633427548203,1e-12);
});

test('ZPE and TS calculator excludes zero and imaginary modes and exports auditable files', async () => {
  const result=calculateZpeTs([-2,0,10],300);
  assert.equal(result.modes.length,1);
  assert.deepEqual(result.rejected.map(item=>item.reason),['Imaginary/negative mode','Zero mode']);
  assert.match(zpeTsToCsv(result),/Vibrational free-energy correction/);
  const blob=await buildZpeTsWorkbook(result),zip=await JSZip.loadAsync(await blob.arrayBuffer());
  assert.ok(zip.file('xl/worksheets/sheet1.xml'));
  assert.ok(zip.file('xl/worksheets/sheet2.xml'));
});

test('ZPE Excel benchmark fixture preserves only the 23 user-approved sheets', async () => {
  const dataset=JSON.parse(await readFile(new URL('../benchmarks/fixtures/zpe-ts/excel-reference-cases.json',import.meta.url),'utf8'));
  assert.equal(dataset.cases.length,23);
  assert.deepEqual(dataset.source.excludedSheets,['Sheet1','Sheet2','CH4_ads','CO2_adsorbed']);
  const ids=dataset.cases.map(item=>item.id),sheets=dataset.cases.map(item=>item.sheet);
  assert.equal(new Set(ids).size,ids.length);
  dataset.source.excludedSheets.forEach(name=>assert.ok(!sheets.includes(name)));
  dataset.cases.forEach(item=>{
    assert.ok(item.frequenciesThz.length>0,`${item.sheet} must retain at least one frequency`);
    assert.ok(item.frequenciesThz.every(value=>Number.isFinite(value)&&value>0),`${item.sheet} frequencies must be finite and positive`);
    assert.ok(Number.isFinite(item.excelResults.zpeEv)&&Number.isFinite(item.excelResults.tsEv),`${item.sheet} must retain Excel ZPE and TS`);
  });
  const peroxide=dataset.cases.find(item=>item.sheet==='H2O2');
  closeTo(peroxide.excelResults.zpeEv,0.6829094513108614,0);
  closeTo(peroxide.excelResults.tsEv,0.11759612011576814,0);
});

test('PDOS parser recognizes QE filenames and non-spin orbital layouts', () => {
  const meta = parsePdosFilename('calc.pdos_atm#12(Fe)_wfc#3(p)');
  assert.deepEqual({ atom: meta.atomNumber, species: meta.species, wfc: meta.wfcNumber, orbital: meta.orbital },
    { atom: 12, species: 'Fe', wfc: 3, orbital: 'p' });
  const parsed = parsePdosFile(meta.filename, '-1 2 0.1 0.2 0.3\n0 3 0.4 0.5 0.6\n');
  assert.equal(parsed.spinMode, 'non-spin');
  assert.deepEqual(parsed.channels.pz, [0.1, 0.4]);
  assert.deepEqual(parsed.channels.py, [0.3, 0.6]);
});

test('PDOS parser recognizes spin layouts and sums compatible files with a Fermi shift', () => {
  const textA = '-1 1 2 0.1 0.2\n0 3 4 0.3 0.4\n';
  const textB = '-1 5 6 0.5 0.6\n0 7 8 0.7 0.8\n';
  const records = [
    parsePdosFile('a.pdos_atm#1(Fe)_wfc#1(s)', textA),
    parsePdosFile('a.pdos_atm#2(Fe)_wfc#1(s)', textB),
  ];
  const result = sumPdosRecords(records, { fermiEnergy: -0.5 });
  assert.equal(result.spinMode, 'spin');
  assert.deepEqual(result.energy, [-0.5, 0.5]);
  assert.deepEqual(result.channels.LDOS_up, [6, 10]);
  assert.match(pdosResultToCsv(result), /^Energy_eV,LDOS_up,LDOS_down,s_up,s_down/m);
});

test('PDOS validation rejects mixed spin modes and incompatible grids', () => {
  const nonSpin = parsePdosFile('a.pdos_atm#1(C)_wfc#1(s)', '-1 1 .2\n0 2 .3\n');
  const spin = parsePdosFile('a.pdos_atm#2(C)_wfc#1(s)', '-1 1 1 .2 .2\n0 2 2 .3 .3\n');
  assert.throws(() => validatePdosCollection([nonSpin, spin]), /cannot be summed/);
  const shifted = parsePdosFile('a.pdos_atm#3(C)_wfc#1(s)', '-1.1 1 .2\n0 2 .3\n');
  assert.throws(() => validatePdosCollection([nonSpin, shifted]), /incompatible energy grid/);
});

test('PDOS manual atom selection accepts comma lists and inclusive ranges', () => {
  assert.deepEqual(parseAtomNumberSelection('1, 4, 7-10, 4'), [1, 4, 7, 8, 9, 10]);
  assert.throws(() => parseAtomNumberSelection('1, wrong'), /Invalid atom selection/);
  assert.throws(() => parseAtomNumberSelection('8-3'), /Invalid atom range/);
});

test('VASP DOSCAR parser reads non-spin lm-resolved projected blocks and Fermi energy', () => {
  const total = ['10 -10 2 4.5 1', '-1 1 0', '0 2 1'];
  const projected = ion => [`10 -10 2 4.5 1`, `-1 ${ion} 2 3 4 5 6 7 8 9`, `0 ${ion + 1} 3 4 5 6 7 8 9 10`];
  const text = ['2 2 1 0', '1 1 1 1 1', '0', 'CAR', 'FeO', ...total, ...projected(1), ...projected(2)].join('\n');
  const parsed = parseVaspDoscar(text);
  assert.equal(parsed.fermiEnergy, 4.5);
  assert.equal(parsed.orbitalResolution, 'lm-resolved');
  assert.equal(parsed.records.length, 6);
  const ion2d = parsed.records.find(record => record.atomNumber === 2 && record.orbital === 'd');
  assert.deepEqual(ion2d.channels.dxy, [5, 6]);
  assert.deepEqual(ion2d.channels['dx2-y2'], [9, 10]);
});

test('VASP DOSCAR parser reads spin-polarized l-resolved projected blocks', () => {
  const text = ['1 1 1 0', '1 1 1 1 1', '0', 'CAR', 'Fe', '10 -10 2 5.2 1', '-1 1 2 0 0', '0 2 3 1 1', '10 -10 2 5.2 1', '-1 1 2 3 4 5 6', '0 2 3 4 5 6 7'].join('\n');
  const parsed = parsePdosUpload('DOSCAR', text);
  assert.equal(parsed.spinMode, 'spin');
  assert.equal(parsed.records.length, 3);
  assert.deepEqual(parsed.records.find(record => record.orbital === 'p').channels.p_down, [4, 5]);
});

test('VASP POSCAR parser maps ordered ion numbers to chemical species', () => {
  const poscar = ['Fe oxide', '1.0', '1 0 0', '0 1 0', '0 0 1', 'Fe O', '2 3', 'Direct', '0 0 0'].join('\n');
  const parsed = parseVaspPoscarSpecies(poscar);
  assert.equal(parsed.atomCount, 5);
  assert.deepEqual(parsed.species, ['Fe', 'O']);
  assert.equal(parsed.speciesByAtom.get(1), 'Fe');
  assert.equal(parsed.speciesByAtom.get(2), 'Fe');
  assert.equal(parsed.speciesByAtom.get(3), 'O');
  assert.equal(parsed.speciesByAtom.get(5), 'O');
});

test('Scientific DOS plotter parses standardized spin CSV files', () => {
  const dataset = parseDosCsv('Energy_eV,d_up,d_down\n-1,2,1\n0,3,2\n', 'Fe.csv');
  assert.equal(dataset.name, 'Fe');
  assert.equal(dataset.spinMode, 'spin');
  assert.deepEqual(dataset.energy, [-1, 0]);
  assert.deepEqual(dataset.channels.d_down, [1, 2]);
});

test('Scientific DOS templates round-trip and apply semantic spin styling', () => {
  const dataset = createDatasetView(parseDosCsv('Energy_eV,p_up,p_down\n-1,2,1\n0,3,2\n'));
  const restored = parseDosTemplate(serializeDosTemplate('Paper', { lineWidth: 3, palette: 'vivid', fontFamily: 'Times New Roman', legendPosition: 'bottom-left', xMin: -4, xMax: 3 }, { down: { lineStyle: 'dotted' } }));
  applyDosTemplate(dataset, restored);
  assert.equal(dataset.style.lineWidth, 3);
  assert.equal(dataset.style.fontFamily, 'Times New Roman');
  assert.equal(dataset.style.legendPosition, 'bottom-left');
  assert.equal(dataset.style.xMin, -4);
  assert.equal(dataset.channelStyles.p_down.lineStyle, 'dotted');
});

test('DOS fill points use the full curve by default and interpolate custom X boundaries', () => {
  const full=getDosFillPoints([-2,0,2],[0,4,0]);
  assert.deepEqual(full,[{x:-2,y:0},{x:0,y:4},{x:2,y:0}]);
  const limited=getDosFillPoints([-2,0,2],[0,4,0],true,-1,1);
  assert.deepEqual(limited,[{x:-1,y:2},{x:0,y:4},{x:1,y:2}]);
  assert.deepEqual(getDosFillPoints([-2,0,2],[0,4,0],true,1,-1),[]);
});

test('DOS templates preserve per-curve fill styling and apply it by channel order', () => {
  const first=createDatasetView(parseDosCsv('Energy_eV,p,d\n-1,2,1\n0,3,2\n'));
  first.channelStyles.p={...first.channelStyles.p,fillEnabled:true,fillColor:'#123456',fillOpacity:.3,fillRangeEnabled:true,fillXMin:-.5,fillXMax:.5};
  const entries=Object.entries(first.channelStyles);
  const template=parseDosTemplate(serializeDosTemplate('Filled',first.style,{byName:Object.fromEntries(entries),byIndex:entries.map(([,value])=>value)}));
  const second=createDatasetView(parseDosCsv('Energy_eV,s,f\n-1,2,1\n0,3,2\n'));
  applyDosTemplate(second,template);
  assert.equal(second.channelStyles.s.fillEnabled,true);
  assert.equal(second.channelStyles.s.fillColor,'#123456');
  assert.equal(second.channelStyles.s.fillXMin,-.5);
});

test('Orbital metrics parser assigns spreadsheet letters and evaluates safe formulas', () => {
  const dataset=parseOrbitalMetricsCsv('Energy_eV,dxy,dyz\n-2,0,2\n0,2,4\n2,0,2\n','sample.csv');
  assert.deepEqual(dataset.columns.map(column=>`${column.letter}:${column.name}`),['A:Energy_eV','B:dxy','C:dyz']);
  const formula=compileColumnFormula('(B + C) / 2');
  assert.deepEqual(formula.dependencies,['B','C']);
  const derived=addDerivedColumn(dataset,{name:'t2g_average',formula:'(B + C) / 2'});
  assert.equal(derived.letter,'D');
  assert.deepEqual(derived.values,[1,3,1]);
  assert.throws(()=>compileColumnFormula('window.alert(1)'),/Unsupported formula token|Missing operator/);
});

test('Orbital occupancy and centre use trapezoidal integration with finite ranges', () => {
  const dataset=parseOrbitalMetricsCsv('Energy_eV,dxy\n-2,0\n0,2\n2,0\n');
  closeTo(calculateOrbitalMetric(dataset,{type:'occupancy',sourceName:'dxy',rangeEnabled:false}).value,4);
  closeTo(calculateOrbitalMetric(dataset,{type:'centre',sourceName:'dxy',rangeEnabled:false}).value,0);
  closeTo(calculateOrbitalMetric(dataset,{type:'occupancy',sourceName:'dxy',rangeEnabled:true,xMin:-1,xMax:1}).value,3);
});

test('Orbital metric templates leave missing source columns empty across CSV files', async () => {
  const source=parseOrbitalMetricsCsv('Energy_eV,dxy,dyz\n-1,1,2\n0,1,2\n');
  addDerivedColumn(source,{name:'d_sum',formula:'B+C'});
  const metric={name:'d_sum_occupancy',type:'occupancy',sourceName:'d_sum',rangeEnabled:false,xMin:'',xMax:''};
  const template=parseOrbitalMetricsTemplate(serializeOrbitalMetricsTemplate('d metrics',source.derivedColumns,[metric],source.columns));
  const target=parseOrbitalMetricsCsv('Energy_eV,dxy\n-1,1\n0,1\n','missing.csv');
  applyOrbitalMetricsTemplate(target,template);
  const rows=evaluateMetrics([source,target],[metric]);
  assert.equal(rows[1].results.d_sum_occupancy.value,null);
  assert.match(metricsToCsv(rows,[metric]),/"missing",""/);
  const workbook=await buildOrbitalMetricsWorkbook(rows,[metric],source.derivedColumns);
  const zip=await JSZip.loadAsync(await workbook.arrayBuffer());
  assert.ok(zip.file('xl/worksheets/sheet1.xml'));
  assert.ok(zip.file('xl/worksheets/sheet2.xml'));
});

test('Orbital metrics never substitute a same-position but different orbital', () => {
  const dataset=parseOrbitalMetricsCsv('Energy_eV,dxy up\n-1,2\n0,2\n','d-sheet.csv');
  const result=calculateOrbitalMetric(dataset,{type:'occupancy',sourceName:'pxy up',sourceLetter:'B',rangeEnabled:false});
  assert.equal(result.value,null);
  assert.equal(result.status,'missing source column');
});

test('Free Energy Plotter interaction redraws retain the selected theme', () => {
  const previousWindow=globalThis.window,draws=[];
  globalThis.window={devicePixelRatio:1};
  const engine=Object.create(PlotEngine.prototype);
  engine.canvas={clientWidth:100,clientHeight:80,width:0,height:0};
  engine.ctx={save(){},scale(){},restore(){}};
  engine._scene=(_ctx,_width,_height,dark)=>draws.push(dark);
  engine.render(false);
  engine.render();
  assert.deepEqual(draws,[false,false]);
  if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;
});

test('PDOS exports use recognizable source and selection filenames', () => {
  assert.equal(buildPdosExportFilename({ sourceFilenames: ['sample.pdos_atm#1(Fe)_wfc#3(d)'], selectionMode: 'species', species: ['Fe'], orbitals: ['d'] }), 'sample_species_Fe_d_pdos.csv');
  assert.equal(buildPdosExportFilename({ sourceFilenames: ['DOSCAR'], selectionMode: 'manual', atomNumbers: [1, 4, 7], orbitals: ['p', 'd'], extension: 'png' }), 'DOSCAR_atoms_1_4_7_p_d_pdos.png');
});

test('Custom Pathway Builder anchors uploaded molecular coordinates and round-trips JSON', async () => {
  const parsed = parseVisualGeneratorCIF(await fixture('triclinic.cif'));
  const template = templateFromCIF(parsed, 1, { name:'CHO*', sourceFilename:'cho.cif', id:'cho' });
  assert.equal(template.bindingAtom, 1);
  closeTo(template.atoms[1].x, 0); closeTo(template.atoms[1].y, 0); closeTo(template.atoms[1].z, 0);
  const restored = parseCustomPathwayJSON(serializeCustomPathway({ name:'CO2 reduction', intermediates:[template] }));
  assert.equal(restored.name, 'CO2 reduction'); assert.equal(restored.intermediates[0].label, 'CHO*'); assert.equal(restored.intermediates[0].sourceFilename, 'cho.cif');
});

test('Custom Pathway Builder rejects malformed pathway data', () => {
  assert.throws(() => parseCustomPathwayJSON('{broken'), /not valid JSON/);
  assert.throws(() => parseCustomPathwayJSON(JSON.stringify({format:'padarthkhoj-custom-pathway',version:1,pathway:{name:'x',intermediates:[]}})), /no intermediates/);
});

test('classifies common Bravais lattices and maps their ibrav values', () => {
  assert.equal(findLattice(5, 5, 5, 90, 90, 90), 'cubic');
  assert.equal(findLattice(4, 4, 6, 90, 90, 90), 'tetragonal');
  assert.equal(findLattice(4, 5, 6, 90, 90, 90), 'orthorhombic');
  assert.equal(findLattice(4, 4, 6, 90, 90, 120), 'hexagonal');
  assert.equal(findIbrav('Fm-3m', 'cubic'), 2);
  assert.equal(findIbrav('I4/mmm', 'tetragonal'), 7);
  assert.equal(findIbrav('P1', 'triclinic'), 14);
});

test('builds non-orthogonal vectors and QE cell parameters consistently', () => {
  const rad = degrees => degrees * Math.PI / 180;
  const vectors = buildCellVectors(4.1, 5.2, 6.3, rad(70), rad(80), rad(75));
  closeTo(Math.hypot(...vectors[0]), 4.1);
  closeTo(Math.hypot(...vectors[1]), 5.2);
  closeTo(Math.hypot(...vectors[2]), 6.3);

  const celldm = buildCelldm(14, 4.1, 5.2, 6.3, rad(70), rad(80), rad(75));
  closeTo(celldm[2], 5.2 / 4.1);
  closeTo(celldm[3], 6.3 / 4.1);
  closeTo(celldm[4], Math.cos(rad(70)));
  assert.deepEqual(computeKPoints(4, 5, 10, 0.05), { kx: 5, ky: 4, kz: 2 });
});

test('expands CIF symmetry operations and deduplicates special positions', async () => {
  const parsed = parseCIF(await fixture('nacl-symmetry.cif'));
  assert.ok(parsed);
  assert.equal(parsed.atoms.length, 3);
  assert.deepEqual(parsed.atoms.map(atom => atom.sym).sort(), ['Cl', 'Na', 'Na']);
  assert.ok(parsed.atoms.every(atom => [atom.fx, atom.fy, atom.fz].every(v => v >= 0 && v < 1)));
});

test('CIF editor export round-trips cell and fractional coordinates', async () => {
  const original = parseCIF(await fixture('triclinic.cif'));
  const reparsed = parseCIF(exportCIF({ cifData: original }));
  assert.equal(reparsed.atoms.length, original.atoms.length);
  for (const key of ['a', 'b', 'c', 'alpha', 'beta', 'gamma']) {
    closeTo(reparsed.cell[key], original.cell[key], 1e-5);
  }
  for (let i = 0; i < original.atoms.length; i++) {
    assert.equal(reparsed.atoms[i].sym, original.atoms[i].sym);
    for (const key of ['fx', 'fy', 'fz']) closeTo(reparsed.atoms[i][key], original.atoms[i][key], 1e-6);
  }
});

test('Visual CIF generator parser agrees with the CIF editor structure', async () => {
  const text = await fixture('triclinic.cif');
  const editor = parseCIF(text);
  const visual = parseVisualGeneratorCIF(text);
  assert.equal(visual.atoms.length, editor.atoms.length);
  for (const key of ['a', 'b', 'c']) closeTo(visual.cell[key], editor.cell[key]);
  for (let i = 0; i < editor.atoms.length; i++) {
    closeTo(Number(visual.atoms[i].x), editor.atoms[i].fx);
    closeTo(Number(visual.atoms[i].y), editor.atoms[i].fy);
    closeTo(Number(visual.atoms[i].z), editor.atoms[i].fz);
    closeTo(visual.atoms[i].cx, editor.atoms[i].x);
    closeTo(visual.atoms[i].cy, editor.atoms[i].y);
    closeTo(visual.atoms[i].cz, editor.atoms[i].z);
  }
});

test('all CIF workflows expand quoted translation operations containing spaces',()=>{
  const text=`data_translated
_cell_length_a 9
_cell_length_b 4
_cell_length_c 12
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 90
loop_
_space_group_symop_operation_xyz
'x, y, z'
'x+1/3, y, z'
'x+2/3, y, z'
loop_
_atom_site_label
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
_atom_site_type_symbol
C1 0.1 0.2 0.3 C
O1 0.2 0.2 0.3 O`;
  const editor=parseCIF(text),visual=parseVisualGeneratorCIF(text);
  assert.equal(editor.asymmetricAtomCount,2);assert.equal(editor.symmetryOperationCount,3);assert.equal(editor.atoms.length,6);
  assert.equal(visual.asymmetricAtomCount,2);assert.equal(visual.symmetryOperationCount,3);assert.equal(visual.atoms.length,6);
  assert.deepEqual(visual.atoms.map(atom=>atom.element).sort(),['C','C','C','O','O','O']);
  assert.ok(visual.atoms.every(atom=>[atom.x,atom.y,atom.z].every(value=>value>=0&&value<1)));
});

test('CIF to QE conversion preserves fractional coordinates and converts Cartesian values', async () => {
  const text = await fixture('triclinic.cif');
  const crystal = cifToQE(text, 'crystal', 6);
  assert.equal(crystal.atomCount, 2);
  assert.deepEqual(crystal.species, ['C', 'O']);
  assert.match(crystal.text, /C\s+0\.125000\s+0\.250000\s+0\.375000/);

  const angstrom = cifToQE(text, 'angstrom', 6);
  const editor = parseCIF(text);
  const firstLine = angstrom.text.split('\n')[1].trim().split(/\s+/);
  closeTo(Number(firstLine[1]), editor.atoms[0].x, 1e-6);
  closeTo(Number(firstLine[2]), editor.atoms[0].y, 1e-6);
  closeTo(Number(firstLine[3]), editor.atoms[0].z, 1e-6);
});

test('extracts symmetry metadata and derived lattice settings', async () => {
  const symmetry = parseCIFSymmetry(await fixture('triclinic.cif'));
  assert.equal(symmetry.itNumber, 1);
  assert.equal(symmetry.sgName, 'P1');
  assert.equal(symmetry.lattice, 'triclinic');
  assert.equal(symmetry.ibrav, 14);
});

test('parses final vc-relax coordinates and exports a reparsable CIF', async () => {
  const result = parseQEOutput(await fixture('vc-relax.out'));
  assert.equal(result.calcType, 'vc-relax');
  assert.equal(result.isRelaxed, true);
  assert.equal(result.nSteps, 2);
  assert.equal(result.final.atoms.length, 2);
  closeTo(result.final.params.a, 5.43);
  closeTo(result.final.atoms[1].x, 0.251);

  const generated = generateCIF(result.final, 'vc-relax.out');
  const reparsed = parseCIF(generated);
  assert.equal(reparsed.atoms.length, 2);
  closeTo(reparsed.cell.a, 5.43);
  closeTo(reparsed.atoms[1].fx, 0.251);
});

test('QE output parser records energies, forces, pressure, iterations, and run status', () => {
  const parsed = parseQEOutput(`calculation = 'scf'\niteration # 1\n! total energy = -10.5 Ry\nTotal force = 0.012 Ry/Bohr\nP= -3.4 kbar\nconvergence has been achieved\nJOB DONE.`);
  assert.deepEqual(parsed.energiesRy, [-10.5]);
  assert.deepEqual(parsed.forcesRyBohr, [0.012]);
  assert.deepEqual(parsed.pressuresKbar, [-3.4]);
  assert.deepEqual(parsed.scfIterations, [1]);
  assert.equal(parsed.finalEnergyRy, -10.5);
  assert.equal(parsed.convergenceAchieved, true);
  assert.equal(parsed.jobDone, true);
  assert.deepEqual(parsed.errors, []);
});

test('parses, groups, and ranges free-energy data deterministically', () => {
  const rows = parseCSV('step,path,energy\n1,A,0\n2,A,-0.5\n1,B,0.2\n# ignored');
  assert.equal(rows.length, 3);
  assert.deepEqual(groupRows(rows).get('A'), [
    { branch: 1, energy: 0 },
    { branch: 2, energy: -0.5 },
  ]);
  assert.deepEqual(getYRange(rows, 0.1), { min: -0.57, max: 0.27 });
});

test('escapes file-derived values before HTML interpolation', () => {
  assert.equal(
    escapeHTML(`<img src=x onerror="alert('x')"> &`),
    '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp;',
  );
});

test('pseudopotential choices are restricted to the supplied UPF inventory', () => {
  assert.equal(PSEUDOPOTENTIALS.length, 1292);
  assert.equal(new Set(PSEUDOPOTENTIALS).size, PSEUDOPOTENTIALS.length);
  assert.ok(PSEUDOPOTENTIALS.every(name => /\.(?:UPF|upf)$/.test(name)));
  assert.ok(getPseudosForElement('Cl').includes('Cl.pbesol-n-kjpaw_psl.0.1.UPF'));
  assert.ok(getPseudosForElement('Hg').includes('Hg.pz-dn-rrkjus_psl.0.2.2.UPF'));
  assert.ok(getPseudosForElement('Mn').includes('Mn.upf'));
  assert.ok(getPseudosForElement('Sc').includes('Sc_pbe_v1.uspp.F.UPF'));
  assert.ok(getPseudosForElement('Cl').every(name => name.startsWith('Cl.')));
});

test('DOS protocol generates a coordinated SCF, NSCF, DOS, and submit workflow', async () => {
  const cifData = parseCIF(await fixture('triclinic.cif'));
  cifData.filename = 'sample.cif';
  const workflow = generateDOSWorkflow(cifData, {
    baseName: 'sample',
    kx: 1, ky: 2, kz: 1,
    outdir: "'./qe-tmp'",
  });

  assert.deepEqual(workflow.files.map(file => file.filename), [
    'sample_scf.in',
    'sample_nscf.in',
    'sample_dos.in',
    'sample_submit.sh',
  ]);
  const [scf, nscf, dos, submit] = workflow.files.map(file => file.text);
  assert.match(scf, /calculation\s+=\s+'scf'/);
  assert.match(scf, /prefix\s+=\s+'sample'/);
  assert.match(scf, /K_POINTS automatic\n\s+1 2 1/);
  assert.match(scf, /occupations\s+=\s+"smearing"/);
  assert.doesNotMatch(scf, /\bnbnd\s+=/);

  assert.match(nscf, /calculation\s+=\s+'nscf'/);
  assert.match(nscf, /prefix\s+=\s+'sample'/);
  assert.match(nscf, /outdir\s+=\s+'\.\/qe-tmp'/);
  assert.match(nscf, /occupations\s+=\s+"tetrahedra"/);
  assert.match(nscf, new RegExp(`nbnd\\s+=\\s+${cifData.atoms.length * 4}`));
  assert.match(nscf, /K_POINTS automatic\n\s+3 6 3/);
  assert.doesNotMatch(nscf, /^\s*smearing\s+=/m);
  assert.doesNotMatch(nscf, /^\s*degauss\s+=/m);

  assert.match(dos, /^&DOS$/m);
  assert.match(dos, /prefix\s+=\s+'sample'/);
  assert.match(dos, /outdir\s+=\s+'\.\/qe-tmp'/);
  assert.match(dos, /fildos\s+=\s+'sample\.dos'/);
  assert.doesNotMatch(dos, /ATOMIC_POSITIONS|K_POINTS|ATOMIC_SPECIES/);

  assert.match(submit, /^#!\/usr\/bin\/env bash/);
  assert.match(submit, /set -euo pipefail/);
  assert.match(submit, /pw\.x -i 'sample_scf\.in' \| tee 'sample_scf\.out'/);
  assert.match(submit, /pw\.x -i 'sample_nscf\.in' \| tee 'sample_nscf\.out'/);
  assert.match(submit, /dos\.x -i 'sample_dos\.in' \| tee 'sample_dos\.out'/);
});

test('existing single-file SCF generation remains available', async () => {
  const cifData = parseCIF(await fixture('triclinic.cif'));
  cifData.filename = 'single.cif';
  const text = generateQEInput('scf', cifData, { prefix: "'single_scf'" });
  assert.match(text, /calculation\s+=\s+'scf'/);
  assert.match(text, /prefix\s+=\s+'single_scf'/);
  assert.match(text, /vdw_corr\s+=\s+'dft-d3'/);
  assert.doesNotMatch(text, /xdm_a[12]\s+=/);
});

test('XDM damping coefficients are omitted for PBE unless explicitly overridden', async () => {
  const cifData = parseCIF(await fixture('triclinic.cif'));
  const automatic = generateQEInput('scf', cifData, { vdw_corr: "'xdm'" });
  assert.match(automatic, /vdw_corr\s+=\s+'xdm'/);
  assert.doesNotMatch(automatic, /xdm_a[12]\s+=/);

  const overridden = generateQEInput('scf', cifData, {
    vdw_corr: "'xdm'",
    xdm_a1: '0.7',
    xdm_a2: '1.6',
  });
  assert.match(overridden, /xdm_a1\s+=\s+0\.7/);
  assert.match(overridden, /xdm_a2\s+=\s+1\.6/);
});

test('all canonical Quantum ESPRESSO smearing methods are available and generated', async () => {
  assert.deepEqual(SMEARING_OPTIONS.map(option => option.value), [
    '"gaussian"',
    '"methfessel-paxton"',
    '"marzari-vanderbilt"',
    '"fermi-dirac"',
  ]);
  const cifData = parseCIF(await fixture('triclinic.cif'));
  for (const option of SMEARING_OPTIONS) {
    const text = generateQEInput('scf', cifData, { smearing: option.value });
    assert.match(text, new RegExp(`smearing\\s+=\\s+${option.value}`));
  }
});

test('occupation choices use smearing for SCF and tetrahedra for DOS NSCF', async () => {
  assert.deepEqual(OCCUPATION_OPTIONS.map(option => option.value), [
    '"smearing"',
    '"fixed"',
    '"tetrahedra"',
  ]);
  const cifData = parseCIF(await fixture('triclinic.cif'));
  const workflow = generateDOSWorkflow(cifData, { baseName: 'occupation-check' });
  assert.match(workflow.files[0].text, /occupations\s+=\s+"smearing"/);
  assert.match(workflow.files[0].text, /^\s*smearing\s+=/m);
  assert.match(workflow.files[1].text, /occupations\s+=\s+"tetrahedra"/);
  assert.doesNotMatch(workflow.files[1].text, /^\s*smearing\s+=/m);
  assert.doesNotMatch(workflow.files[1].text, /^\s*degauss\s+=/m);
});

test('Bands protocol generates SCF, band-path NSCF, bands.x, and submit inputs', async () => {
  const cifData = parseCIF(await fixture('triclinic.cif'));
  cifData.filename = 'first.cif';
  const workflow = generateBandsWorkflow(cifData, { baseName: 'first', outdir: '"./out"' });
  assert.deepEqual(workflow.files.map(file => file.filename), [
    'first_scf.in', 'first_nscf.in', 'first_bands.in', 'first_submit.sh',
  ]);
  const [scf, nscf, bands, submit] = workflow.files.map(file => file.text);
  assert.match(scf, /calculation\s+=\s+'scf'/);
  assert.match(scf, /K_POINTS automatic/);
  assert.match(nscf, /calculation\s+=\s+'bands'/);
  assert.match(nscf, /occupations\s+=\s+"smearing"/);
  assert.match(nscf, /smearing\s+=\s+"gaussian"/);
  assert.match(nscf, /K_POINTS crystal_b\n5/);
  assert.match(nscf, /0\.000000 0\.500000 0\.000000 20 !Y/);
  assert.match(nscf, /WARNING: the suggested k path is only a starting point/);
  assert.match(bands, /^&BANDS$/m);
  assert.match(bands, /prefix\s+=\s+'first'/);
  assert.match(bands, /filband\s+=\s+'first_H1\.out'/);
  assert.doesNotMatch(bands, /\blsym\s+=/);
  assert.doesNotMatch(bands, /ATOMIC_POSITIONS|K_POINTS/);
  assert.match(submit, /^#!\/usr\/bin\/env bash/);
  assert.match(submit, /set -euo pipefail/);
  assert.match(submit, /pw\.x -i 'first_scf\.in' \| tee 'first_scf\.out'/);
  assert.match(submit, /pw\.x -i 'first_nscf\.in' \| tee 'first_nscf\.out'/);
  assert.match(submit, /bands\.x -i 'first_bands\.in' \| tee 'first_bands\.out'/);
});

test('Bands workflow recommends a path from detected lattice and keeps alternatives selectable', async () => {
  const cifData = parseCIF(await fixture('triclinic.cif'));
  cifData.symmetry.ibrav = 4;
  const recommended = generateBandsWorkflow(cifData, { baseName: 'hex' });
  assert.equal(recommended.params.bandPathPreset, 'hexagonal');
  assert.deepEqual(recommended.params.kPath.map(point => point.label), ['G','M','K','G','A','L','H','A']);

  const alternative = generateBandsWorkflow(cifData, { baseName: 'hex', bandPathPreset: 'simple-cubic' });
  assert.equal(alternative.params.bandPathPreset, 'simple-cubic');
  assert.deepEqual(alternative.params.kPath.map(point => point.label), ['G','X','M','G','R','X']);
});

test('QE inputs use readable angstrom lattice parameters for non-zero ibrav', async () => {
  const cifData = parseCIF(await fixture('triclinic.cif'));
  cifData.symmetry.ibrav = 6;
  cifData.symmetry.cell.a = 30;
  cifData.symmetry.cell.b = 30;
  cifData.symmetry.cell.c = 20.00001;

  const input = generateQEInput('scf', cifData);
  assert.match(input, /ibrav\s+=\s+6,/);
  assert.match(input, /\ba\s+=\s+30\.000000,/);
  assert.match(input, /\bc\s+=\s+20\.000010,/);
  assert.doesNotMatch(input, /\bb\s+=/);
  assert.doesNotMatch(input, /celldm\s*\(/i);
});

test('Charge Density protocol generates SCF, pp.x, and submit files', async () => {
  const cifData = parseCIF(await fixture('triclinic.cif'));
  cifData.filename = 'charge-sample.cif';
  const workflow = generateChargeWorkflow(cifData, {
    baseName: 'charge-sample', outdir: "'/scratch/qe/out'", kx: 2, ky: 3, kz: 1,
  });
  assert.deepEqual(workflow.files.map(file => file.filename), [
    'charge-sample_scf.in', 'charge-sample_charge.in', 'charge-sample_submit.sh',
  ]);
  const [scf, charge, submit] = workflow.files.map(file => file.text);
  assert.match(scf, /calculation\s+=\s+'scf'/);
  assert.match(scf, /prefix\s+=\s+'charge-sample'/);
  assert.match(scf, /K_POINTS automatic\n\s+2 3 1/);
  assert.match(charge, /^&INPUTPP$/m);
  assert.match(charge, /prefix\s+=\s+'charge-sample'/);
  assert.match(charge, /outdir\s+=\s+'\/scratch\/qe\/out'/);
  assert.match(charge, /plot_num\s+=\s+0/);
  assert.match(charge, /^&PLOT$/m);
  assert.match(charge, /iflag\s+=\s+3/);
  assert.match(charge, /output_format\s+=\s+6/);
  assert.match(charge, /fileout\s+=\s+'charge-sample\.cube'/);
  assert.doesNotMatch(charge, /ATOMIC_POSITIONS|K_POINTS|ATOMIC_SPECIES/);
  assert.match(submit, /set -euo pipefail/);
  assert.match(submit, /pw\.x -i 'charge-sample_scf\.in' \| tee 'charge-sample_scf\.out'/);
  assert.match(submit, /pp\.x -i 'charge-sample_charge\.in' \| tee 'charge-sample_charge\.out'/);
});

test('Bader protocol generates SCF, all-electron, valence, and submit files', async () => {
  const cifData = parseCIF(await fixture('triclinic.cif'));
  const workflow = generateBaderWorkflow(cifData, { baseName: 'full', outdir: "'/scratch/qe/out'" });
  assert.deepEqual(workflow.files.map(file => file.filename), [
    'full_scf.in', 'full_allelectron.in', 'full_valenceelectron.in', 'full_submit.sh',
  ]);
  const [scf, allElectron, valence, submit] = workflow.files.map(file => file.text);
  assert.match(scf, /calculation\s+=\s+'scf'/);
  assert.match(allElectron, /plot_num\s+=\s+21/);
  assert.match(allElectron, /filplot\s+=\s+'full_allelec'/);
  assert.match(allElectron, /fileout\s+=\s+'full_allelec\.cube'/);
  assert.match(valence, /plot_num\s+=\s+0/);
  assert.match(valence, /filplot\s+=\s+'full_valence'/);
  assert.match(valence, /fileout\s+=\s+'full_valence\.cube'/);
  for (const ppInput of [allElectron, valence]) {
    assert.match(ppInput, /^&INPUTPP$/m);
    assert.match(ppInput, /^&PLOT$/m);
    assert.match(ppInput, /output_format\s+=\s+6/);
    assert.doesNotMatch(ppInput, /ATOMIC_POSITIONS|K_POINTS/);
  }
  assert.match(submit, /pw\.x -i 'full_scf\.in' \| tee 'full_scf\.out'/);
  assert.match(submit, /pp\.x -i 'full_allelectron\.in' \| tee 'full_allelectron\.out'/);
  assert.match(submit, /pp\.x -i 'full_valenceelectron\.in' \| tee 'full_valenceelectron\.out'/);
});

test('Vibrational protocol generates the DFT-D3 Hessian workflow and runner', async () => {
  const cifData = parseCIF(await fixture('triclinic.cif'));
  const workflow = generateVibrationalWorkflow(cifData, { baseName: 'H2', vdw_corr: '"dft-d3"' });
  assert.deepEqual(workflow.files.map(file => file.filename), [
    'H2_scf.in', 'H2_hess.in', 'H2_ph.in', 'H2_dyn.in', 'H2_submit.sh',
  ]);
  const [scf, hess, ph, dyn, submit] = workflow.files.map(file => file.text);
  assert.match(scf, /calculation\s+=\s+'scf'/);
  assert.match(scf, /vdw_corr\s+=\s+"dft-d3"/);
  assert.match(scf, /dftd3_threebody\s+=\s+\.false\./);
  assert.match(hess, /^&INPUT$/m);
  assert.match(hess, /filhess\s+=\s+'H2\.hess'/);
  assert.match(ph, /^&INPUTPH$/m);
  assert.match(ph, /tr2_ph\s+=\s+1\.0d-14/);
  assert.match(ph, /fildyn\s+=\s+'H2\.dyn'/);
  assert.match(ph, /dftd3_hess\s+=\s+'H2\.hess'/);
  assert.match(ph, /0\.00 0\.00 0\.00/);
  assert.match(dyn, /fildyn\s+=\s+'H2\.dyn'/);
  assert.match(dyn, /asr\s+=\s+'crystal'/);
  assert.match(submit, /pw\.x -i 'H2_scf\.in'/);
  assert.match(submit, /d3hess\.x -i 'H2_hess\.in'/);
  assert.match(submit, /ph\.x -i 'H2_ph\.in'/);
  assert.match(submit, /dynmat\.x -i 'H2_dyn\.in'/);
});

test('Vibrational protocol skips D3 Hessian execution for non-D3 SCF', async () => {
  const cifData = parseCIF(await fixture('triclinic.cif'));
  const workflow = generateVibrationalWorkflow(cifData, { baseName: 'plain', vdw_corr: '""' });
  const hess = workflow.files[1].text;
  const ph = workflow.files[2].text;
  const submit = workflow.files[4].text;
  assert.match(hess, /Hessian stage is not required/);
  assert.doesNotMatch(ph, /dftd3_hess/);
  assert.match(submit, /d3hess\.x skipped/);
  assert.doesNotMatch(submit, /^d3hess\.x/m);
});

test('SCF and relaxation protocols each generate a pw.x submit script', async () => {
  const cifData = parseCIF(await fixture('triclinic.cif'));
  const scf = generatePWWorkflow('scf', cifData, { baseName: 'sample' });
  assert.deepEqual(scf.files.map(file => file.filename), ['sample_scf.in', 'sample_submit.sh']);
  assert.match(scf.files[0].text, /calculation\s+=\s+'scf'/);
  assert.match(scf.files[1].text, /pw\.x -i 'sample_scf\.in' \| tee 'sample_scf\.out'/);
  assert.match(scf.files[1].text, /set -euo pipefail/);

  const relax = generatePWWorkflow('relax', cifData, { baseName: 'sample' });
  assert.deepEqual(relax.files.map(file => file.filename), ['sample_relax.in', 'sample_submit.sh']);
  assert.match(relax.files[0].text, /calculation\s+=\s+'vc-relax'/);
  assert.match(relax.files[1].text, /pw\.x -i 'sample_relax\.in' \| tee 'sample_relax\.out'/);
});

test('Intermediate Maker constrains the binding atom to the selected radius', () => {
  const template = NO3_TO_NH3_INTERMEDIATES.find(item => item.id === 'NH3');
  const active = { cx: 2, cy: 3, cz: 4 };
  const placed = placeIntermediate(template, active, { radius: 1.75, direction: { x: 0, y: 0, z: 1 }, rotation: { x: 20, y: 30, z: 40 } });
  const binding = placed.find(atom => atom.binding);
  closeTo(Math.hypot(binding.x - active.cx, binding.y - active.cy, binding.z - active.cz), 1.75);
  assert.equal(placed.length, 4);
});

test('HER pathway places its single adsorbed H atom at the selected anchor', () => {
  const active = { cx: 1, cy: 2, cz: 3 };
  const placed = placeAnchoredIntermediate(HER_INTERMEDIATES[0], active, {
    distance: 1.7,
    direction: { x: 0, y: 0, z: 1 },
  });
  assert.equal(placed.length, 1);
  assert.equal(placed[0].element, 'H');
  assert.equal(placed[0].binding, true);
  assert.ok(Math.abs(placed[0].x - 1) < 1e-12);
  assert.ok(Math.abs(placed[0].y - 2) < 1e-12);
  assert.ok(Math.abs(placed[0].z - 4.7) < 1e-12);
});

test('OER/ORR templates preserve supplied OH and OOH relaxed bond lengths', () => {
  const oh = OER_ORR_INTERMEDIATES.find(item => item.id === 'OH');
  const ooh = OER_ORR_INTERMEDIATES.find(item => item.id === 'OOH');
  const distance = (a, b) => Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z);
  assert.equal(OER_ORR_INTERMEDIATES.map(item => item.id).join(','), 'O,OH,OOH');
  assert.ok(Math.abs(distance(oh.atoms[0], oh.atoms[1]) - 0.98728) < 1e-6);
  assert.ok(Math.abs(distance(ooh.atoms[0], ooh.atoms[1]) - 1.20225) < 1e-4);
  assert.ok(Math.abs(distance(ooh.atoms[0], ooh.atoms[2]) - 1.00034) < 1e-4);
  assert.equal(ooh.bindingAtom, 1);
});

test('N2-to-NH3 pathway preserves the supplied Ni-bound adsorbate sequence', () => {
  assert.equal(N2_TO_NH3_INTERMEDIATES.map(item => item.id).join(','), 'NNH,NNH2,NHNH,NHNH2,NH2NH2,N,NH,NH2,NH3');
  assert.ok(N2_TO_NH3_INTERMEDIATES.every(item => item.bindingAtom === 0));
  assert.ok(N2_TO_NH3_INTERMEDIATES.every(item => item.atoms[0].element === 'N'));
  const nnh = N2_TO_NH3_INTERMEDIATES[0];
  const nnDistance = Math.hypot(nnh.atoms[1].x, nnh.atoms[1].y, nnh.atoms[1].z);
  assert.ok(Math.abs(nnDistance - 1.212) < 0.002);
});

test('CO2RR C2 pathways share the literature-supported sequence and branch late', () => {
  assert.deepEqual(CO2RR_C2H4_PATH.map(item => item.id), ['co2','cooh','co','co-co','coh','cocoh','cco','chco','chcho','ch2cho','c2h4']);
  assert.deepEqual(CO2RR_ETHANOL_PATH.map(item => item.id), ['co2','cooh','co','co-co','coh','cocoh','cco','chco','chcho','ch2cho','ch3cho','ch3ch2o','ch3ch2oh']);
  assert.equal(CO2RR_CHO_ALTERNATIVE.at(-1).id, 'cho');
  assert.equal(CO2RR_C2H4_PATH.find(item => item.id === 'co2').bindingAtom, 1);
  assert.equal(CO2RR_C2H4_PATH.find(item => item.id === 'cco').bindingAtom, 1);
  assert.equal(CO2RR_C2H4_PATH.find(item => item.id === 'chcho').atoms[4].element, 'O');
  for (const template of [...CO2RR_C2H4_PATH, ...CO2RR_ETHANOL_PATH]) {
    const binding = template.atoms[template.bindingAtom];
    closeTo(binding.x, 0); closeTo(binding.y, 0); closeTo(binding.z, 0);
  }
});

test('Intermediate Maker detects collisions and exports a reparsable CIF', async () => {
  const parsed = parseVisualGeneratorCIF(await fixture('triclinic.cif'));
  const template = NO3_TO_NH3_INTERMEDIATES.find(item => item.id === 'N');
  const placed = placeIntermediate(template, parsed.atoms[0], { radius: 1.7, direction: { x: 0, y: 0, z: 1 } });
  const validation = evaluatePlacement(parsed.atoms, placed, 0, 1.6);
  assert.equal(typeof validation.valid, 'boolean');
  const text = buildIntermediateCIF(parsed, placed, 'test_N');
  const reparsed = parseCIF(text);
  assert.equal(reparsed.atoms.length, parsed.atoms.length + 1);
  assert.equal(reparsed.atoms.at(-1).sym, 'N');
});

test('Intermediate Maker validates the adjustable intermediate volume sphere', () => {
  const catalyst = [{ cx: 0, cy: 0, cz: 0 }, { cx: 3, cy: 0, cz: 0 }];
  const placed = [
    { x: 1.7, y: 0, z: 0, binding: true },
    { x: 1.7, y: 0.8, z: 0, binding: false },
  ];
  const clear = evaluatePlacementVolume(catalyst, placed, 0, 1.0);
  assert.equal(clear.valid, true);
  assert.equal(clear.maximumExtent, 0.8);
  const overlapping = evaluatePlacementVolume(catalyst, placed, 0, 1.4);
  assert.equal(overlapping.catalystAtomsInside, 1);
  const tooSmall = evaluatePlacementVolume(catalyst, placed, 0, 0.5);
  assert.equal(tooSmall.atomsOutside, 1);
});

test('Intermediate Maker ranks suggested sphere centres by catalyst clearance', () => {
  const catalyst = [
    { cx: 0, cy: 0, cz: 0 },
    { cx: 2, cy: 0, cz: 0 },
    { cx: 0, cy: 2, cz: 0 },
  ];
  const suggestions = suggestPlacementSpheres(catalyst, 0, 1.8, 0.5, 4);
  assert.equal(suggestions.length, 4);
  assert.equal(suggestions[0].clear, true);
  suggestions.forEach(item => closeTo(Math.hypot(item.centre.x, item.centre.y, item.centre.z), 1.8, 1e-10));
});

test('anchored intermediates align their molecular axis with the outward surface vector', () => {
  const template = NO3_TO_NH3_INTERMEDIATES.find(item => item.id === 'NH3');
  const active = { cx: 2, cy: 3, cz: 4 };
  const outward = { x: 1, y: 0, z: 0 };
  const placed = placeAnchoredIntermediate(template, active, { distance: 1.8, direction: outward });
  const binding = placed.find(atom => atom.binding);
  closeTo(binding.x - active.cx, 1.8);
  closeTo(binding.y - active.cy, 0);
  const others = placed.filter(atom => !atom.binding);
  const centroid = others.reduce((sum, atom) => ({ x:sum.x+atom.x/others.length, y:sum.y+atom.y/others.length, z:sum.z+atom.z/others.length }), { x:0,y:0,z:0 });
  assert.ok(centroid.x - binding.x > 0, 'adsorbate must extend outward from its binding anchor');
  const axis = getTemplateAdsorptionAxis(template);
  closeTo(Math.hypot(axis.x, axis.y, axis.z), 1);
});

test('Bader analysis parses ACF rows and calculates signed ionic charge', () => {
  const acf = parseACF(`# X Y Z CHARGE MIN DIST ATOMIC VOL
  1 0.0 0.0 0.0 8.140837 1.940149 64.992061
  2 1.0 1.0 1.0 7.859147 2.931500 237.846813
  NUMBER OF ELECTRONS: 16.0000`);
  assert.equal(acf.rows.length, 2);
  closeTo(calculateBaderCharge(acf.rows[0], 'Na', 2), 0.859163);
  closeTo(calculateBaderCharge(acf.rows[1], 'Cl', 10), -0.859147);
  assert.equal(acf.metadata.number_of_electrons, 16);
});

test('Bader analysis obtains ordered atom identities from the SCF input', () => {
  const atoms = parseQEInputAtoms(`&SYSTEM
 nat = 2,
 ntyp = 2,
/
ATOMIC_SPECIES
Na 22.99 Na.UPF
Cl 35.45 Cl.UPF
ATOMIC_POSITIONS {crystal}
Na 0.0 0.0 0.0
Cl 0.5 0.5 0.5
K_POINTS automatic
8 8 8 0 0 0
`);
  assert.deepEqual(atoms.map(atom => atom.element), ['Na', 'Cl']);
});

test('Bader SCF atom numbering follows ATOMIC_POSITIONS order regardless of coordinate unit', () => {
  const atoms = parseQEInputAtoms(`&SYSTEM
 nat = 3,
/
ATOMIC_POSITIONS (angstrom)
C 6.5560707055 8.3096515277 19.5489325037
C 5.8167498194 7.8263769511 18.5219037280
N 7.5851133056 6.0856414583 18.1000000000
`);
  assert.deepEqual(atoms.map((atom, index) => ({ atomNumber:index + 1, element:atom.element })), [
    { atomNumber:1, element:'C' },
    { atomNumber:2, element:'C' },
    { atomNumber:3, element:'N' },
  ]);
});

test('Bader POSCAR parsing provides ordered species and a directly viewable structure', () => {
  const parsed = parseVaspPoscar(`NaCl test
2.0
1 0 0
0 1 0
0 0 1
Na Cl
1 1
Direct
0 0 0
0.5 0.5 0.5
`, 'POSCAR');
  assert.equal(parsed.source, 'VASP');
  assert.deepEqual(parsed.atoms.map(atom => atom.element), ['Na', 'Cl']);
  assert.equal(parsed.structure.atoms.length, 2);
  closeTo(parsed.structure.atoms[1].cx, 1);
  closeTo(parsed.structure.cell.a, 2);
});

test('Bader structure input detection distinguishes QE input from VASP POSCAR content', () => {
  const qe = parseBaderReference(`&SYSTEM\n nat=1\n/\nATOMIC_POSITIONS angstrom\nC 0 0 0\n`, 'unknown.txt');
  const vasp = parseBaderReference(`carbon
1
2 0 0
0 2 0
0 0 2
C
1
Cartesian
0.25 0.5 0.75
`, 'structure.txt');
  assert.equal(qe.source, 'Quantum ESPRESSO');
  assert.equal(qe.structure, null);
  assert.equal(vasp.source, 'VASP');
  closeTo(vasp.structure.atoms[0].cz, 0.75);
});

test('QE Bader structure parsing restores CELL_PARAMETERS and crystal coordinates',()=>{
  const structure=parseQEInputStructure(`&SYSTEM
 nat=2, ibrav=0,
/
CELL_PARAMETERS (angstrom)
 4 0 0
 0 5 0
 0 0 6
ATOMIC_POSITIONS (crystal)
Na 0 0 0
Cl 0.5 0.5 0.5
K_POINTS gamma`);
  assert.deepEqual(structure.lattMat,[[4,0,0],[0,5,0],[0,0,6]]);
  assert.deepEqual(structure.atoms.map(atom=>[atom.cx,atom.cy,atom.cz]),[[0,0,0],[2,2.5,3]]);
});

test('QE Bader structure parsing supports readable tetragonal lattice parameters',()=>{
  const structure=parseQEInputStructure(`&SYSTEM
 nat=1, ibrav=6, a=30, c=20,
/
ATOMIC_POSITIONS (angstrom)
C 1 2 3`);
  assert.deepEqual(structure.lattMat,[[30,0,0],[0,30,0],[0,0,20]]);
  assert.deepEqual([structure.atoms[0].cx,structure.atoms[0].cy,structure.atoms[0].cz],[1,2,3]);
});

test('legacy Bader coordinates rebuild a non-periodic visualization without a cell',()=>{
  const structure=structureFromBaderRecords([{index:1,element:'C',x:1,y:2,z:3}]);
  assert.equal(structure.lattMat,null);assert.equal(structure.reconstructed,true);
  assert.deepEqual([structure.atoms[0].cx,structure.atoms[0].cy,structure.atoms[0].cz],[1,2,3]);
});

test('real VASP Bader mismatch fixture is detected before charge-to-element mapping', async () => {
  const root=new URL('../benchmarks/fixtures/bader/vasp-mismatch-001/',import.meta.url);
  const acf=parseACF(await readFile(new URL('ACF.dat',root),'utf8'));
  const structure=parseVaspPoscar(await readFile(new URL('CONTCAR',root),'utf8'),'CONTCAR');
  assert.equal(acf.rows.length,156);
  assert.equal(structure.atoms.length,152);
  assert.notEqual(acf.rows.length,structure.atoms.length);
});

test('corrected real VASP Bader fixture matches atom order and coordinates', async () => {
  const root=new URL('../benchmarks/fixtures/bader/vasp-real-001/',import.meta.url);
  const acf=parseACF(await readFile(new URL('ACF.dat',root),'utf8'));
  const structure=parseVaspPoscar(await readFile(new URL('CONTCAR',root),'utf8'),'CONTCAR');
  assert.equal(acf.rows.length,156);assert.equal(structure.atoms.length,156);
  const displacement=acf.rows.map((row,index)=>Math.hypot(row.x-structure.atoms[index].cx,row.y-structure.atoms[index].cy,row.z-structure.atoms[index].cz));
  assert.ok(Math.max(...displacement)<1e-3);
  const composition=structure.atoms.reduce((counts,atom)=>({...counts,[atom.element]:(counts[atom.element]||0)+1}),{});
  assert.deepEqual(composition,{Cu:10,S:6,O:13,F:12,N:3,C:40,H:72});
});

test('real QE Bader fixture preserves SCF atom order and matching counts', async () => {
  const root=new URL('../benchmarks/fixtures/bader/qe-real-001/',import.meta.url);
  const acf=parseACF(await readFile(new URL('ACF.dat',root),'utf8'));
  const atoms=parseQEInputAtoms(await readFile(new URL('full_scf.in',root),'utf8'));
  assert.equal(acf.rows.length,336);assert.equal(atoms.length,336);
  const composition=atoms.reduce((counts,atom)=>({...counts,[atom.element]:(counts[atom.element]||0)+1}),{});
  assert.deepEqual(composition,{C:200,N:16,H:120});
  const core={C:0,N:0,H:0};
  const charges=acf.rows.map((row,index)=>calculateBaderCharge(row,atoms[index].element,core[atoms[index].element]));
  assert.ok(charges.every(Number.isFinite));
  closeTo(charges.reduce((sum,value)=>sum+value,0),1432-1430.1339,1e-8);
});

test('second real QE Bader fixture identifies neutral valence-density convention', async () => {
  const root=new URL('../benchmarks/fixtures/bader/qe-real-002/',import.meta.url);
  const acf=parseACF(await readFile(new URL('ACF.dat',root),'utf8'));
  const atoms=parseQEInputAtoms(await readFile(new URL('halfc1_scf.in',root),'utf8'));
  assert.equal(acf.rows.length,204);assert.equal(atoms.length,204);
  const composition=atoms.reduce((counts,atom)=>({...counts,[atom.element]:(counts[atom.element]||0)+1}),{});
  assert.deepEqual(composition,{C:116,N:8,H:80});
  const core={C:2,N:2,H:0};
  const total=acf.rows.reduce((sum,row,index)=>sum+calculateBaderCharge(row,atoms[index].element,core[atoms[index].element]),0);
  const atomicElectronSum=acf.rows.reduce((sum,row)=>sum+row.electrons,0);
  closeTo(total,584-atomicElectronSum,1e-8);
  closeTo(total,584-acf.metadata.number_of_electrons,2e-4);
});

test('Bader Excel export preserves ACF columns and formula-derived charge', async () => {
  const records = [{ index:1,x:0,y:0,z:0,electrons:8.140837,minDistance:1.940149,atomicVolume:64.992061,element:'Na',atomicNumber:11,coreElectrons:2,baderCharge:0.859163 }];
  const blob = await buildBaderWorkbook(records, { number_of_electrons:9 });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const results = await zip.file('xl/worksheets/sheet1.xml').async('string');
  assert.match(results, /ATOM TYPE/);
  assert.match(results, /<t>Na<\/t>/);
  assert.match(results, /BADER CHARGE/);
  assert.match(results, /<f>Metadata!B2-Metadata!C2-F2<\/f>/);
  assert.ok(zip.file('xl/worksheets/sheet2.xml'));
});

test('Bader workbook round-trip restores charges and an embedded structure', async () => {
  const records=[{index:1,x:0,y:0,z:0,electrons:8.140837,minDistance:1.940149,atomicVolume:64.992061,element:'Na',atomicNumber:11,coreElectrons:2,baderCharge:.859163}];
  const structure={coordType:'fractional',lattMat:[[5,0,0],[0,5,0],[0,0,5]],atoms:[{element:'Na',x:0,y:0,z:0,cx:0,cy:0,cz:0}]};
  const blob=await buildBaderWorkbook(records,{number_of_electrons:9},{structure,source:'VASP',sourceName:'POSCAR'});
  const restored=await parseBaderWorkbook(await blob.arrayBuffer());
  assert.equal(restored.version,2);assert.equal(restored.source,'VASP');assert.equal(restored.sourceName,'POSCAR');
  assert.deepEqual(restored.records,records);
  assert.deepEqual(restored.structure,{...structure,atoms:[{...structure.atoms[0],id:0,label:'Na1'}]});
});

test('legacy Bader workbook restores charge data without inventing a structure', async () => {
  const records=[{index:1,x:0,y:0,z:0,electrons:8.140837,minDistance:1.940149,atomicVolume:64.992061,element:'Na',atomicNumber:11,coreElectrons:2,baderCharge:.859163}];
  const blob=await buildBaderWorkbook(records,{number_of_electrons:9});
  const restored=await parseBaderWorkbook(await blob.arrayBuffer());
  assert.equal(restored.version,1);assert.equal(restored.structure,null);assert.deepEqual(restored.records,records);
});

test('shared CIF bond engine applies covalent and custom VESTA-style distance rules', () => {
  const atoms = [
    { element:'C', cart:{x:0,y:0,z:0}, frac:{x:0,y:0,z:0} },
    { element:'C', cart:{x:1.4,y:0,z:0}, frac:{x:.14,y:0,z:0} },
    { element:'H', cart:{x:5,y:0,z:0}, frac:{x:.5,y:0,z:0} },
  ];
  const lattice = [[10,0,0],[0,10,0],[0,0,10]];
  assert.equal(findBonds(atoms,lattice,{scale:1.15}).length,1);
  const custom = findBonds(atoms,lattice,{scale:1.15,rules:[{a:'C',b:'H',min:3,max:6}]});
  assert.equal(custom.filter(bond => bond.i===0 && bond.j===2).length,1);
});
