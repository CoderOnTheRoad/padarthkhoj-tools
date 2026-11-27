// ─── Math helpers ─────────────────────────────────────────────────────────────
const BOHR2ANG = 0.529177210903;

function dot(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
function cross(a, b) {
  return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
}
function norm(a) { return Math.sqrt(dot(a, a)); }

function cellVecsToParams(v1, v2, v3) {
  const a = norm(v1), b = norm(v2), c = norm(v3);
  const cl = v => Math.max(-1, Math.min(1, v));
  const al = Math.acos(cl(dot(v2, v3) / (b * c))) * 180 / Math.PI;
  const be = Math.acos(cl(dot(v1, v3) / (a * c))) * 180 / Math.PI;
  const ga = Math.acos(cl(dot(v1, v2) / (a * b))) * 180 / Math.PI;
  return { a, b, c, al, be, ga, vol: Math.abs(dot(v1, cross(v2, v3))) };
}

function inv3(m) {
  const [a,b,c,d,e,f,g,h,i] = m;
  const det = a*(e*i-f*h) - b*(d*i-f*g) + c*(d*h-e*g);
  return [
    (e*i-f*h)/det, (c*h-b*i)/det, (b*f-c*e)/det,
    (f*g-d*i)/det, (a*i-c*g)/det, (c*d-a*f)/det,
    (d*h-e*g)/det, (b*g-a*h)/det, (a*e-b*d)/det,
  ];
}

function cartToFrac(pos, v1, v2, v3) {
  const M = [v1[0],v2[0],v3[0], v1[1],v2[1],v3[1], v1[2],v2[2],v3[2]];
  const inv = inv3(M);
  return [
    inv[0]*pos[0]+inv[1]*pos[1]+inv[2]*pos[2],
    inv[3]*pos[0]+inv[4]*pos[1]+inv[5]*pos[2],
    inv[6]*pos[0]+inv[7]*pos[1]+inv[8]*pos[2],
  ];
}

// ─── Parse helpers ────────────────────────────────────────────────────────────
function cellParamScale(line, aA) {
  const av = line.match(/alat\s*=\s*([\d.Ee+\-]+)/i);
  if (av) return parseFloat(av[1]) * BOHR2ANG;
  const u = ((line.match(/[(\{]\s*([a-zA-Z]+)\s*[)\}]/i) || [])[1] || 'angstrom').toLowerCase();
  if (u === 'bohr') return BOHR2ANG;
  if (u === 'alat') return aA || 1;
  return 1;
}

function atomPosUnit(line, aA) {
  const av = line.match(/alat\s*=\s*([\d.Ee+\-]+)/i);
  if (av) return { scale: parseFloat(av[1]) * BOHR2ANG, isCrystal: false };
  const u = ((line.match(/[(\{]\s*([a-zA-Z]+)\s*[)\}]/i) || [])[1] || 'angstrom').toLowerCase();
  if (u === 'crystal') return { scale: 1, isCrystal: true };
  if (u === 'bohr')    return { scale: BOHR2ANG, isCrystal: false };
  if (u === 'alat')    return { scale: aA || 1, isCrystal: false };
  return { scale: 1, isCrystal: false };
}

// ─── Main parser ──────────────────────────────────────────────────────────────
export function parseQEOutput(text) {
  const lines = text.split('\n');
  const R = {
    isVCRelax: false, isRelaxed: false, calcType: 'unknown',
    nSteps: 0, initial: null, final: null,
    energiesRy: [], forcesRyBohr: [], pressuresKbar: [], scfIterations: [],
    finalEnergyRy: null, finalForceRyBohr: null, finalPressureKbar: null,
    convergenceAchieved: false, jobDone: false, errors: [], warnings: [],
    expectedAtomCount: null, finalCoordinatesComplete: false,
  };

  // Numerical and run-status history. These fields are additive and are used
  // by benchmark/reporting clients without changing structure extraction.
  for (const [index, line] of lines.entries()) {
    let match;
    if ((match = line.match(/!\s*total energy\s*=\s*([-+\d.Ee]+)\s*Ry/i))) R.energiesRy.push(Number(match[1]));
    // QE prints the units explicitly in some versions and only in the
    // surrounding heading in others. Accept both official layouts.
    if ((match = line.match(/Total force\s*=\s*([-+\d.Ee]+)(?:\s*Ry\/Bohr)?/i))) R.forcesRyBohr.push(Number(match[1]));
    if ((match = line.match(/P\s*=\s*([-+\d.Ee]+)(?:\s*(?:kbar|Kbar))?/))) R.pressuresKbar.push(Number(match[1]));
    if ((match = line.match(/iteration\s*#\s*(\d+)/i))) R.scfIterations.push(Number(match[1]));
    if (/convergence has been achieved/i.test(line)) R.convergenceAchieved = true;
    if (/JOB DONE\./i.test(line)) R.jobDone = true;
    if (/convergence NOT achieved|Error in routine|%%%%%/i.test(line)) {
      const message = line.trim();
      if (message && !/^%+$/.test(message)) R.errors.push({ line: index + 1, message });
    }
  }
  R.finalEnergyRy = R.energiesRy.at(-1) ?? null;
  R.finalForceRyBohr = R.forcesRyBohr.at(-1) ?? null;
  R.finalPressureKbar = R.pressuresKbar.at(-1) ?? null;

  // Determine calculation type
  for (const l of lines) {
    if (/calculation\s*=\s*['"]?vc-relax/i.test(l)) { R.isVCRelax = true; R.calcType = 'vc-relax'; break; }
    if (/calculation\s*=\s*['"]?relax/i.test(l)) { R.calcType = 'relax'; break; }
    if (/calculation\s*=\s*['"]?scf/i.test(l)) { R.calcType = 'scf'; break; }
  }
  if (R.calcType === 'unknown') {
    const cellCards = lines.filter(l => /^\s*CELL_PARAMETERS/i.test(l)).length;
    const hasVariableCellEvidence = cellCards > 1 || lines.some(l => /new unit-cell volume/i.test(l));
    const hasIonicRelaxationEvidence = lines.some(l => /Begin final coordinates|number of bfgs steps/i.test(l));
    if (hasVariableCellEvidence) R.calcType = 'vc-relax';
    else if (hasIonicRelaxationEvidence) R.calcType = 'relax';
    else if (lines.some(l => /Program PWSCF/i.test(l))) R.calcType = 'scf';
  }
  R.isVCRelax = R.calcType === 'vc-relax';

  // Lattice constant (alat)
  let alat = null;
  for (const l of lines) {
    const m = l.match(/lattice parameter \(alat\)\s*=\s*([\d.]+)/);
    if (m) { alat = parseFloat(m[1]) * BOHR2ANG; break; }
  }

  // Initial cell vectors (crystal axes)
  let initVecs = null;
  for (let i = 0; i < lines.length; i++) {
    if (/crystal axes.*units of alat/i.test(lines[i])) {
      const vecs = [];
      for (let j = i+1; j < Math.min(i+6, lines.length); j++) {
        const m = lines[j].match(/a\(\d\)\s*=\s*\(\s*([-\d.Ee+]+)\s+([-\d.Ee+]+)\s+([-\d.Ee+]+)\s*\)/);
        if (m) vecs.push([parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])]);
        if (vecs.length === 3) break;
      }
      if (vecs.length === 3 && alat) {
        initVecs = [vecs[0].map(x=>x*alat), vecs[1].map(x=>x*alat), vecs[2].map(x=>x*alat)];
        break;
      }
    }
  }

  // Initial atomic positions
  let initAtoms = [];
  for (let i = 0; i < lines.length; i++) {
    if (/site n\.\s+atom\s+positions/i.test(lines[i])) {
      for (let j = i+1; j < lines.length; j++) {
        const m = lines[j].match(/\d+\s+(\w+)\s+tau\s*\(\s*\d+\s*\)\s*=\s*\(\s*([-\d.Ee+]+)\s+([-\d.Ee+]+)\s+([-\d.Ee+]+)\s*\)/);
        if (m) initAtoms.push({ elem: m[1], x: parseFloat(m[2])*alat, y: parseFloat(m[3])*alat, z: parseFloat(m[4])*alat });
        else if (initAtoms.length > 0 && /^\s*$/.test(lines[j])) break;
        else if (initAtoms.length > 0 && lines[j].includes('---')) break;
      }
      if (initAtoms.length > 0) break;
    }
  }
  if (initVecs && initAtoms.length > 0)
    R.initial = { vecs: initVecs, params: cellVecsToParams(...initVecs), atoms: initAtoms, coordType: 'angstrom' };

  // Only complete coordinate snapshots can be selected for display or export.
  const declared = text.match(/number of atoms\/cell\s*=\s*(\d+)/i) || text.match(/\bnat\s*=\s*(\d+)/i);
  const expected = declared ? Number(declared[1]) : initAtoms.length || null;
  R.expectedAtomCount = expected;
  const validCell = vecs => vecs?.length === 3 && vecs.every(v => v.length === 3 && v.every(Number.isFinite))
    && Math.abs(dot(vecs[0], cross(vecs[1], vecs[2]))) > 1e-12;
  const validAtoms = atoms => atoms.length > 0 && (!expected || atoms.length === expected)
    && atoms.every(atom => [atom.x, atom.y, atom.z].every(Number.isFinite));
  if (R.initial && (!validCell(initVecs) || !validAtoms(initAtoms))) {
    R.warnings.push('Initial coordinates are incomplete or invalid and were not selected.');
    R.initial = null;
  }
  let currentCell = validCell(initVecs) ? initVecs : null;
  let lastFinalBlock = null, openFinalBlock = null;
  const snapshots = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/Begin final coordinates/i.test(line)) {
      openFinalBlock = { closed: false, valid: true, snapshots: [] };
      lastFinalBlock = openFinalBlock;
    } else if (/End final coordinates/i.test(line)) {
      if (openFinalBlock) { openFinalBlock.closed = true; openFinalBlock = null; }
    } else if (/^\s*CELL_PARAMETERS/i.test(line)) {
      const vecs = [], scale = cellParamScale(line, alat);
      for (let j = i+1; j < lines.length && vecs.length < 3; j++) {
        if (!lines[j].trim()) continue;
        const m = lines[j].match(/^\s*([-\d.Ee+]+)\s+([-\d.Ee+]+)\s+([-\d.Ee+]+)/);
        if (!m) break;
        vecs.push(m.slice(1,4).map(value => Number(value)*scale));
      }
      currentCell = validCell(vecs) ? vecs : null;
      if (!currentCell) {
        R.warnings.push('Incomplete or invalid CELL_PARAMETERS block; dependent coordinates were not selected.');
        if (openFinalBlock) openFinalBlock.valid = false;
      }
    } else if (/^\s*ATOMIC_POSITIONS/i.test(line)) {
      const {scale, isCrystal} = atomPosUnit(line, alat), atoms = [];
      for (let j = i+1; j < lines.length; j++) {
        if (!lines[j].trim() && !atoms.length) continue;
        const m = lines[j].match(/^\s*([A-Za-z]+[0-9]*)\s+([-\d.Ee+]+)\s+([-\d.Ee+]+)\s+([-\d.Ee+]+)/);
        if (!m) break;
        atoms.push({elem:m[1].replace(/[0-9]+$/, ''),x:Number(m[2])*scale,y:Number(m[3])*scale,z:Number(m[4])*scale});
      }
      if (currentCell && validAtoms(atoms)) {
        const snapshot = {vecs:currentCell,params:cellVecsToParams(...currentCell),atoms,coordType:isCrystal?'crystal':'angstrom'};
        snapshots.push(snapshot);
        if (openFinalBlock) openFinalBlock.snapshots.push(snapshot);
      } else {
        R.warnings.push(`Incomplete or invalid ATOMIC_POSITIONS block (${atoms.length} rows; expected ${expected ?? 'unknown'}); it was not selected.`);
        if (openFinalBlock) openFinalBlock.valid = false;
      }
    }
  }
  R.nSteps = snapshots.length;
  const finalSnapshot = lastFinalBlock?.snapshots.at(-1);
  R.finalCoordinatesComplete = Boolean(expected && lastFinalBlock?.closed && lastFinalBlock.valid && finalSnapshot);
  // isRelaxed is retained for compatibility and denotes a complete final-coordinate
  // block, not independent certification of electronic or ionic convergence.
  R.isRelaxed = R.finalCoordinatesComplete;
  if (R.finalCoordinatesComplete) R.final = {...finalSnapshot,source:'final'};
  else {
    if (lastFinalBlock) R.warnings.push('Final-coordinate block is incomplete or cannot be validated; using the latest complete geometry.');
    if (!expected) R.warnings.push('Expected atom count is unavailable; final-coordinate completeness cannot be certified.');
    const latest = snapshots.at(-1);
    if (latest) R.final = {...latest,source:'latest'};
    else if (R.initial) R.final = {...R.initial,source:'initial'};
  }

  return R;
}

// ─── CIF generator ────────────────────────────────────────────────────────────
export function generateCIF(structure, filename) {
  const { vecs, params, atoms, coordType } = structure;
  const { a, b, c, al, be, ga } = params;
  const date = new Date().toISOString().slice(0, 10);

  // Convert all atoms to fractional coords
  let fa = coordType === 'crystal'
    ? atoms.map(at => ({ elem: at.elem, fx: at.x, fy: at.y, fz: at.z }))
    : atoms.map(at => {
        const [fx, fy, fz] = cartToFrac([at.x, at.y, at.z], ...vecs);
        return { elem: at.elem, fx, fy, fz };
      });

  // Wrap to [0,1)
  fa = fa.map(a => ({
    elem: a.elem,
    fx: ((a.fx % 1) + 1) % 1,
    fy: ((a.fy % 1) + 1) % 1,
    fz: ((a.fz % 1) + 1) % 1,
  }));

  const fn = (filename || 'structure').replace(/\.(out|log|pwout|txt)$/i, '');

  let cif = `# Generated by QE Studio\n# Source: ${filename}\n# Date: ${date}\n\n`;
  cif += `data_${fn.replace(/[^A-Za-z0-9_]/g, '_')}\n\n`;
  cif += `_cell_length_a  ${a.toFixed(8)}\n`;
  cif += `_cell_length_b  ${b.toFixed(8)}\n`;
  cif += `_cell_length_c  ${c.toFixed(8)}\n`;
  cif += `_cell_angle_alpha  ${al.toFixed(6)}\n`;
  cif += `_cell_angle_beta   ${be.toFixed(6)}\n`;
  cif += `_cell_angle_gamma  ${ga.toFixed(6)}\n\n`;
  cif += `_symmetry_space_group_name_H-M  'P 1'\n`;
  cif += `_symmetry_Int_Tables_number     1\n\n`;
  cif += `loop_\n  _atom_site_label\n  _atom_site_type_symbol\n`;
  cif += `  _atom_site_fract_x\n  _atom_site_fract_y\n  _atom_site_fract_z\n`;

  const counter = {};
  for (const at of fa) {
    counter[at.elem] = (counter[at.elem] || 0) + 1;
    const lbl = (at.elem + counter[at.elem]).padEnd(8);
    cif += `  ${lbl} ${at.elem.padEnd(4)}  ${at.fx.toFixed(8)}  ${at.fy.toFixed(8)}  ${at.fz.toFixed(8)}\n`;
  }
  return cif;
}

// ─── ATOMIC_POSITIONS generator ───────────────────────────────────────────────
export function generateAtomicPositions(structure) {
  const { atoms, coordType } = structure;
  let o = `ATOMIC_POSITIONS {${coordType}}\n`;
  for (const at of atoms) {
    o += `${at.elem.padEnd(3)}   ${at.x.toFixed(8).padStart(16)}   ${at.y.toFixed(8).padStart(16)}   ${at.z.toFixed(8).padStart(16)}\n`;
  }
  return o;
}
