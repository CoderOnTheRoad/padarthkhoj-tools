import test from 'node:test';
import assert from 'node:assert/strict';
import {parseQEOutput} from '../src/lib/qeParser.js';
import {parseQEOut,patchInputFile} from '../src/lib/qeInputGenerator.js';
import {parsePdosFile,parseVaspDoscar} from '../src/lib/pdosAnalysis.js';

const header=`calculation='relax'\nnumber of atoms/cell = 2\nlattice parameter (alat) = 10.0 a.u.\ncrystal axes: (cart. coord. in units of alat)\na(1) = (1 0 0)\na(2) = (0 1 0)\na(3) = (0 0 1)\nsite n. atom positions (alat units)\n1 Si tau(1) = (0 0 0)\n2 Si tau(2) = (0.25 0.25 0.25)\n\n`;
const atoms=`ATOMIC_POSITIONS (angstrom)\nSi 0 0 0\nSi 1.4 1.4 1.4\n`;
const cell=`CELL_PARAMETERS (angstrom)\n6 0 0\n0 6 0\n0 0 6\n`;

test('truncation inside final atoms retains the complete initial geometry in both parsers',()=>{
 const text=header+'Begin final coordinates\nATOMIC_POSITIONS (angstrom)\nSi 0 0 0\n';
 const p=parseQEOutput(text),r=parseQEOut(text);
 assert.equal(p.isRelaxed,false);assert.equal(p.jobDone,false);assert.equal(p.final.source,'initial');assert.equal(p.final.atoms.length,2);assert.match(p.warnings.join(' '),/incomplete/i);
 assert.equal(r.isRelaxed,false);assert.equal(r.finalAtoms.length,2);
 const patched=patchInputFile('&SYSTEM\n nat=2\n ibrav=0\n/\n'+cell+atoms,r);assert.match(patched.text,/Si\s+1\.322943/);
});

test('a full atom list without the final end marker is latest geometry rather than final',()=>{
 const p=parseQEOutput(header+'Begin final coordinates\n'+atoms);
 assert.equal(p.finalCoordinatesComplete,false);assert.equal(p.final.source,'latest');assert.equal(p.final.atoms.length,2);
});

test('a truncated final cell cannot be paired with fallback lattice vectors',()=>{
 const text=header+atoms+'Begin final coordinates\nCELL_PARAMETERS (angstrom)\n6 0 0\n0 6 0\n'+atoms+'End final coordinates\n';
 const p=parseQEOutput(text);assert.equal(p.isRelaxed,false);assert.equal(p.final.source,'latest');assert.ok(Math.abs(p.final.params.a-5.29177210903)<1e-10);
 assert.equal(parseQEOut(text).finalAtoms.length,2);
});

test('fixed-cell fallback skips a partial latest ionic snapshot',()=>{
 const p=parseQEOutput(header+atoms+'ATOMIC_POSITIONS (angstrom)\nSi 9 9 9\n');
 assert.equal(p.final.atoms.length,2);assert.equal(p.final.atoms[0].x,0);assert.equal(p.nSteps,1);
});

test('an excess atom in a closed final block is rejected',()=>{
 const p=parseQEOutput(header+'Begin final coordinates\n'+atoms+'Si 3 3 3\nEnd final coordinates\n');
 assert.equal(p.isRelaxed,false);assert.equal(p.final.source,'initial');assert.equal(p.final.atoms.length,2);
});

test('an incomplete later final block does not inherit the earlier end marker',()=>{
 const p=parseQEOutput(header+'Begin final coordinates\n'+atoms+'End final coordinates\nBegin final coordinates\nATOMIC_POSITIONS (angstrom)\nSi 9 9 9\n');
 assert.equal(p.isRelaxed,false);assert.equal(p.final.source,'latest');assert.equal(p.final.atoms.length,2);
});

test('incomplete initial geometry is unavailable for export or restart generation',()=>{
 const text=header.replace('number of atoms/cell = 2','number of atoms/cell = 3');const p=parseQEOutput(text),r=parseQEOut(text);
 assert.equal(p.initial,null);assert.equal(p.final,null);assert.equal(r.finalAtoms,null);assert.equal(r.initAtoms.length,0);
});

test('closed complete final coordinates and JOB DONE remain separate status fields',()=>{
 const p=parseQEOutput(header+'Begin final coordinates\n'+atoms+'End final coordinates\n');
 assert.equal(p.finalCoordinatesComplete,true);assert.equal(p.final.source,'final');assert.equal(p.jobDone,false);
});

test('earlier SCF convergence does not make a later incomplete final geometry complete',()=>{
 const p=parseQEOutput(header+'convergence has been achieved\nBegin final coordinates\nATOMIC_POSITIONS (angstrom)\nSi 0 0 0\nError in routine electrons (1)\n');
 assert.equal(p.convergenceAchieved,true);assert.equal(p.isRelaxed,false);assert.equal(p.errors.length,1);
});

const doscar=['1 1 1 0','1 1 1 1 1','0','CAR','Fe','10 -10 2 5.2 1','-1 1 2 0 0','0 2 3 1 1','10 -10 2 5.2 1','-1 1 2 3 4 5 6','0 2 3 4 5 6 7'].join('\n');
test('truncated VASP projected DOS is rejected',()=>{assert.throws(()=>parseVaspDoscar(doscar.slice(0,doscar.lastIndexOf('\n'))),/incomplete/i);});
test('unrecognized VASP projected columns are rejected',()=>{assert.throws(()=>parseVaspDoscar(doscar.replace('-1 1 2 3 4 5 6','-1 1 2 3 4 5').replace('0 2 3 4 5 6 7','0 2 3 4 5 6')),/Unsupported/);});
test('a malformed QE projection row is rejected while a shorter complete grid cannot certify run completion',()=>{
 assert.throws(()=>parsePdosFile('x.pdos_atm#1(C)_wfc#1(s)','-1 2 3\n0 2\n'),/inconsistent/);
 const p=parsePdosFile('x.pdos_atm#1(C)_wfc#1(s)','-1 2 3\n0 2 4\n');assert.equal(p.energy.length,2);
});
