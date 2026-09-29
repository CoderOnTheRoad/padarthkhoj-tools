import { getAtomicMass } from '../data/elements.js';
import { getPseudosForElement } from '../data/pseudos.js';
import { buildCellVectors, getIbravLabel } from './cifSymmetry.js';

export const PROTOCOLS = [
  {
    id: 'relax', name: 'Structural Relaxation',
    desc: 'Optimize atomic positions and lattice parameters until forces and stresses converge.',
    tag: 'calculation = "relax"', color: '#00d4ff',
  },
  {
    id: 'scf', name: 'Self-Consistent Field',
    desc: 'Ground state electron density and total energy via DFT self-consistency.',
    tag: 'calculation = "scf"', color: '#7c3aed',
  },
  {
    id: 'dos', name: 'Density of States',
    desc: 'Electronic density of states from non-self-consistent calculation on a dense k-mesh.',
    tag: 'calculation = "nscf" + DOS', color: '#10b981',
  },
  {
    id: 'band', name: 'Band Structure',
    desc: 'Electronic band structure along high-symmetry k-paths in the Brillouin zone.',
    tag: 'calculation = "bands"', color: '#f59e0b',
  },
  {
    id: 'charge', name: 'Charge Density',
    desc: 'Compute and visualize the real-space charge density of the ground state.',
    tag: 'pp.x — charge', color: '#ef4444',
  },
  {
    id: 'bader', name: 'Bader Charge Calculation',
    desc: 'Generate valence and all-electron cube densities for external Bader charge analysis.',
    tag: 'pw.x + pp.x — Bader', color: '#fb7185',
  },
  {
    id: 'phonon', name: 'Vibrational Energy',
    desc: 'Phonon dispersion and density of states via density functional perturbation theory.',
    tag: 'ph.x — DFPT', color: '#ec4899',
  },
];

// ─── Available ibrav options for the UI selector ──────────────────────────────
export const IBRAV_OPTIONS = [
  { value: 0,   label: 'ibrav=0 — Free (CELL_PARAMETERS)' },
  { value: 1,   label: 'ibrav=1 — Simple Cubic (sc)' },
  { value: 2,   label: 'ibrav=2 — FCC' },
  { value: 3,   label: 'ibrav=3 — BCC' },
  { value: 4,   label: 'ibrav=4 — Hexagonal / Trigonal' },
  { value: 5,   label: 'ibrav=5 — Trigonal (Rhombohedral, hex axes)' },
  { value: -5,  label: 'ibrav=-5 — Trigonal (Rhombohedral, rhomb axes)' },
  { value: 6,   label: 'ibrav=6 — Simple Tetragonal' },
  { value: 7,   label: 'ibrav=7 — Body-centred Tetragonal (bct)' },
  { value: 8,   label: 'ibrav=8 — Simple Orthorhombic' },
  { value: 9,   label: 'ibrav=9 — Base-centred Orthorhombic' },
  { value: 10,  label: 'ibrav=10 — Face-centred Orthorhombic' },
  { value: 11,  label: 'ibrav=11 — Body-centred Orthorhombic' },
  { value: 12,  label: 'ibrav=12 — Simple Monoclinic (unique axis c)' },
  { value: -12, label: 'ibrav=-12 — Simple Monoclinic (unique axis b)' },
  { value: 13,  label: 'ibrav=13 — Base-centred Monoclinic' },
  { value: 14,  label: 'ibrav=14 — Triclinic' },
];

// Canonical pw.x smearing keywords from the official INPUT_PW documentation.
// QE also accepts short aliases, but generated files use the descriptive forms.
export const SMEARING_OPTIONS = [
  { value: '"gaussian"', label: 'Gaussian', note: 'Ordinary Gaussian spreading (QE default)' },
  { value: '"methfessel-paxton"', label: 'Methfessel–Paxton', note: 'First-order Methfessel–Paxton spreading' },
  { value: '"marzari-vanderbilt"', label: 'Marzari–Vanderbilt (cold)', note: 'Cold smearing by Marzari, Vanderbilt, De Vita and Payne' },
  { value: '"fermi-dirac"', label: 'Fermi–Dirac', note: 'Fermi–Dirac occupation broadening' },
];

export const OCCUPATION_OPTIONS = [
  { value: '"smearing"', label: 'Smearing', note: 'Default for SCF, especially metals' },
  { value: '"fixed"', label: 'Fixed', note: 'For insulating systems with a gap' },
  { value: '"tetrahedra"', label: 'Tetrahedra (Blöchl)', note: 'Default for DOS NSCF; requires a uniform automatic k-grid' },
];

// Common crystal-coordinate labels for the interactive band-path builder.
// Users must verify that a selected path matches their structure's Bravais lattice.
export const BAND_K_POINT_OPTIONS = [
  { label: 'G', name: 'Γ (Gamma)', x: 0, y: 0, z: 0 },
  { label: 'M', name: 'M', x: 0, y: 0.5, z: 0 },
  { label: 'K', name: 'K', x: -1 / 3, y: 2 / 3, z: 0 },
  { label: 'X', name: 'X', x: 0.5, y: 0, z: 0.5 },
  { label: 'L', name: 'L', x: 0.5, y: 0.5, z: 0.5 },
  { label: 'W', name: 'W', x: 0.5, y: 0.25, z: 0.75 },
  { label: 'R', name: 'R', x: 0.5, y: 0.5, z: 0.5 },
  { label: 'A', name: 'A', x: 0, y: 0, z: 0.5 },
  { label: 'Z', name: 'Z', x: 0, y: 0, z: 0.5 },
  { label: 'H', name: 'H', x: 1 / 3, y: 1 / 3, z: 0.5 },
  { label: 'N', name: 'N', x: 0, y: 0.5, z: 0 },
  { label: 'P', name: 'P', x: 0.25, y: 0.25, z: 0.25 },
  { label: 'S', name: 'S', x: 0.5, y: 0.5, z: 0 },
  { label: 'Y', name: 'Y', x: 0, y: 0.5, z: 0 },
  { label: 'T', name: 'T', x: 0, y: 0.5, z: 0.5 },
  { label: 'U', name: 'U', x: 0.5, y: 0, z: 0.5 },
];

export const DEFAULT_BAND_K_PATH = [
  { label: 'G', x: 0, y: 0, z: 0, points: 20 },
  { label: 'M', x: 0, y: 0.5, z: 0, points: 20 },
  { label: 'K', x: -1 / 3, y: 2 / 3, z: 0, points: 20 },
  { label: 'G', x: 0, y: 0, z: 0, points: 20 },
];

const pathFromLabels = labels => labels.map(label => {
  const point = BAND_K_POINT_OPTIONS.find(option => option.label === label) || BAND_K_POINT_OPTIONS[0];
  return { label: point.label, x: point.x, y: point.y, z: point.z, points: 20 };
});

export const BAND_PATH_PRESETS = [
  { id: 'hexagonal', name: 'Hexagonal: Γ–M–K–Γ–A–L–H–A', ibravs: [4, 5, -5], labels: ['G','M','K','G','A','L','H','A'] },
  { id: 'simple-cubic', name: 'Simple cubic: Γ–X–M–Γ–R–X', ibravs: [1], labels: ['G','X','M','G','R','X'] },
  { id: 'fcc', name: 'FCC: Γ–X–W–K–Γ–L–U–W–L–K', ibravs: [2], labels: ['G','X','W','K','G','L','U','W','L','K'] },
  { id: 'bcc', name: 'BCC: Γ–H–N–Γ–P–H–P–N', ibravs: [3], labels: ['G','H','N','G','P','H','P','N'] },
  { id: 'tetragonal', name: 'Tetragonal: Γ–X–M–Γ–Z–R–A–Z', ibravs: [6, 7], labels: ['G','X','M','G','Z','R','A','Z'] },
  { id: 'orthorhombic', name: 'Orthorhombic: Γ–X–S–Y–Γ–Z–U–R–T–Z', ibravs: [8, 9, 10, 11], labels: ['G','X','S','Y','G','Z','U','R','T','Z'] },
  { id: 'low-symmetry', name: 'Monoclinic/triclinic starter: Γ–X–Y–Γ–Z', ibravs: [0, 12, -12, 13, 14], labels: ['G','X','Y','G','Z'] },
];

export function getSuggestedBandPath(cifData, presetId) {
  const ibrav = Number(cifData?.symmetry?.ibrav ?? 0);
  const preset = BAND_PATH_PRESETS.find(item => item.id === presetId)
    || BAND_PATH_PRESETS.find(item => item.ibravs.includes(ibrav))
    || BAND_PATH_PRESETS.find(item => item.id === 'low-symmetry');
  return { presetId: preset.id, presetName: preset.name, kPath: pathFromLabels(preset.labels) };
}

const BOHR2ANG = 0.52917720859;
function fmt(v)  { return v.toFixed(8).padStart(14); }
function fmtF(v) { return v.toFixed(8).padStart(14); }

// QE accepts either celldm(1..6) or the more readable A/B/C and cosine
// convention. Keep the generated files in the latter form so lattice lengths
// remain in angstrom, as they appear in the source CIF and in BURAI inputs.
function latticeParametersForIbrav(ibrav, a, b, c, alphaRad, betaRad, gammaRad) {
  const values = {};
  const add = (name, value) => {
    if (Number.isFinite(value)) values[name] = value;
  };

  add('a', a);

  const i = Math.abs(ibrav);
  if ([8, 9, 10, 11, 12, 13, 14].includes(i)) add('b', b);
  if ([4, 6, 7, 8, 9, 10, 11, 12, 13, 14].includes(i)) add('c', c);

  // QE angle names identify the two lattice vectors forming the angle:
  // cosAB = cos(gamma), cosAC = cos(beta), cosBC = cos(alpha).
  if ([5, 12, 13, 14].includes(i) && ibrav !== -12) add('cosab', Math.cos(gammaRad));
  if (ibrav === -12 || i === 14) add('cosac', Math.cos(betaRad));
  if (i === 14) add('cosbc', Math.cos(alphaRad));

  return values;
}

function isMetal(sym) {
  const metals = [
    'Li','Be','Na','Mg','Al','K','Ca','Sc','Ti','V','Cr','Mn','Fe','Co','Ni','Cu','Zn',
    'Rb','Sr','Y','Zr','Nb','Mo','Tc','Ru','Rh','Pd','Ag','Cd','In','Sn',
    'Cs','Ba','La','Ce','Pr','Nd','Pm','Sm','Eu','Gd','Tb','Dy','Ho','Er','Tm','Yb','Lu',
    'Hf','Ta','W','Re','Os','Ir','Pt','Au','Hg','Tl','Pb','Bi',
  ];
  return metals.includes(sym);
}

/**
 * generateQEInput
 *
 * @param {string} protocol  — protocol id ('relax', 'scf', ...)
 * @param {object} cifData   — parsed CIF data (includes cifData.symmetry from parseCIF)
 * @param {object} params    — user-overridable parameters
 *   params.ibrav           — overridden ibrav (number); if undefined, use auto-detected
 *   params.useIbrav        — boolean; if false, force ibrav=0 / CELL_PARAMETERS
 */
export function generateQEInput(protocol, cifData, params = {}) {
  const { cell, atoms } = cifData;
  const sym = cifData.symmetry || null;

  const uniqueElems = [...new Set(atoms.map(a => a.sym))];
  const nat   = atoms.length;
  const ntyp  = uniqueElems.length;
  const speciesParams = params.speciesParams || {};

  // ── Resolve ibrav ────────────────────────────────────────────────────────────
  // Priority: user override → auto-detected → 0
  let ibrav;
  if (params.useIbrav === false) {
    ibrav = 0;
  } else if (params.ibrav !== undefined && params.ibrav !== null && params.ibrav !== '') {
    ibrav = parseInt(params.ibrav);
  } else {
    ibrav = (sym && sym.ibrav !== undefined) ? sym.ibrav : 0;
  }

  // ── Cell parameters ──────────────────────────────────────────────────────────
  const cellParams = sym ? sym.cell : null;
  const a  = cellParams ? cellParams.a  : (cell ? cell.a : null);
  const b  = cellParams ? cellParams.b  : (cell ? cell.b : null);
  const c  = cellParams ? cellParams.c  : (cell ? cell.c : null);
  const alphaRad = cellParams ? cellParams.alphaRad : (cell ? cell.alpha : Math.PI/2);
  const betaRad  = cellParams ? cellParams.betaRad  : (cell ? cell.beta  : Math.PI/2);
  const gammaRad = cellParams ? cellParams.gammaRad : (cell ? cell.gamma : Math.PI/2);

  // ── Named lattice parameters for non-zero ibrav ──────────────────────────────
  const latticeParameters = ibrav !== 0
    ? latticeParametersForIbrav(ibrav, a, b, c, alphaRad, betaRad, gammaRad)
    : {};

  // ── K-points ──────────────────────────────────────────────────────────────────
  let kpts = (sym && sym.kpts) ? sym.kpts : { kx: 1, ky: 1, kz: 1 };
  if (params.kx !== undefined) kpts = { kx: parseInt(params.kx)||1, ky: parseInt(params.ky)||1, kz: parseInt(params.kz)||1 };

  // ── Cell vectors (for ibrav=0) ────────────────────────────────────────────────
  let cellVecsBohr = (sym && sym.cellVecsBohr) ? sym.cellVecsBohr : null;
  if (!cellVecsBohr && a && !isNaN(a)) {
    const vecsAng = buildCellVectors(a, b, c, alphaRad, betaRad, gammaRad);
    cellVecsBohr = vecsAng.map(v => v.map(x => x / BOHR2ANG));
  }

  // ── Protocol-specific calculation keyword ────────────────────────────────────
  const calcMap = { relax: 'vc-relax', scf: 'scf', 'dos-scf': 'scf', 'dos-nscf': 'nscf', 'bands-scf': 'scf', 'bands-nscf': 'bands', 'charge-scf': 'scf', 'bader-scf': 'scf', band: 'bands', charge: 'scf', phonon: 'scf' };
  const calculation = params.calculation || calcMap[protocol] || 'scf';

  // ── Merged parameter defaults ─────────────────────────────────────────────────
  const p = {
    prefix:       params.prefix        || `'${(cifData.filename || 'structure').replace('.cif','')}_${protocol}'`,
    outdir:       params.outdir        || "'./tmp'",
    pseudo_dir:   params.pseudo_dir    || "'./upf_files'",
    forc_conv_thr:params.forc_conv_thr || '1.0e-3',
    etot_conv_thr:params.etot_conv_thr || '1.0e-4',
    nstep:        params.nstep        || '400',
    ecutwfc:      params.ecutwfc       || '60',
    ecutrho:      params.ecutrho       || '480',
    nspin:        params.nspin         || '2',
    vdw_corr:     params.vdw_corr      || "'dft-d3'",
    occupations:  params.occupations  || "'smearing'",
    smearing:     params.smearing      || "'gaussian'",
    degauss:      params.degauss       || '1.0e-2',
  };

  // ── Comments header ──────────────────────────────────────────────────────────
  let out = `! Generated by QE Studio (cif2qe algorithm)\n`;
  if (protocol === 'dos-scf') {
    out += `! DOS workflow — step 1/3: run this file with pw.x before the NSCF step.\n`;
  } else if (protocol === 'dos-nscf') {
    out += `! DOS workflow — step 2/3: run this file with pw.x after a successful SCF step.\n`;
  } else if (protocol === 'bands-scf') {
    out += `! Bands workflow — step 1/3: converge the charge density with pw.x.\n`;
  } else if (protocol === 'bands-nscf') {
    out += `! Bands workflow — step 2/3: run the non-self-consistent band path with pw.x.\n`;
    out += `! WARNING: the suggested k path is only a starting point. Cross-verify it with literature or a trusted Brillouin-zone resource for this exact structure and cell convention.\n`;
  } else if (protocol === 'charge-scf') {
    out += `! Charge-density workflow — step 1/2: converge the ground-state density with pw.x.\n`;
  } else if (protocol === 'bader-scf') {
    out += `! Bader workflow — step 1/3: converge the ground-state density with pw.x.\n`;
  }
  if (protocol.startsWith('dos-') || protocol.startsWith('bands-') || protocol.startsWith('charge-') || protocol.startsWith('bader-')) {
    out += `! IMPORTANT: prefix and outdir must remain identical throughout this workflow.\n`;
  }
  out += `! IMPORTANT: verify ecutwfc/ecutrho, pseudopotentials, spin, and k-point convergence for your material.\n`;
  if (sym) {
    out += `!   Space Group: ${sym.sgName || '–'}\n`;
    out += `!   IT Number:   ${sym.itNumber || '–'}\n`;
    out += `!   Lattice:     ${sym.lattice || '–'}\n`;
    if (a && !isNaN(a))
      out += `!   a=${a.toFixed(4)}  b=${(b||0).toFixed(4)}  c=${(c||0).toFixed(4)}  α=${(cellParams.alpha||90).toFixed(2)}°  β=${(cellParams.beta||90).toFixed(2)}°  γ=${(cellParams.gamma||90).toFixed(2)}°\n`;
    out += `!   Detected ibrav=${ibrav}${ibrav !== 0 ? ` (${getIbravLabel(ibrav).replace(/^ibrav=\d+\s*—\s*/,'')})` : ' → CELL_PARAMETERS used'}\n`;
  }
  out += `!\n`;

  // ── &CONTROL ─────────────────────────────────────────────────────────────────
  out += `&CONTROL\n`;
  out += `  calculation   = '${calculation}',\n`;
  out += `  restart_mode  = 'from_scratch',\n`;
  out += `  prefix        = ${p.prefix},\n`;
  out += `  outdir        = ${p.outdir},\n`;
  out += `  pseudo_dir    = ${p.pseudo_dir},\n`;
  out += `  tprnfor       = .true.,\n`;
  out += `  tstress       = .true.,\n`;
  out += `  etot_conv_thr = ${p.etot_conv_thr},\n`;
  out += `  forc_conv_thr = ${p.forc_conv_thr},\n`;
  out += `  nstep         = ${p.nstep},\n`;
  out += `/\n\n`;

  // ── &SYSTEM ───────────────────────────────────────────────────────────────────
  out += `&SYSTEM\n`;
  out += `  ibrav         = ${ibrav},\n`;

  if (ibrav !== 0) {
    Object.entries(latticeParameters).forEach(([name, value]) => {
      out += `  ${name.padEnd(13)} = ${value.toFixed(6)},\n`;
    });
  }

  out += `  nat           = ${nat},\n`;
  out += `  ntyp          = ${ntyp},\n`;
  out += `  ecutwfc       = ${p.ecutwfc},\n`;
  out += `  ecutrho       = ${p.ecutrho},\n`;
  out += `  nspin         = ${p.nspin},\n`;

  if (params.nbnd !== undefined && params.nbnd !== null && params.nbnd !== '') {
    out += `  nbnd          = ${Math.max(1, parseInt(params.nbnd) || nat * 4)},  ! IMPORTANT for NSCF: include enough empty bands\n`;
  }

  if (p.nspin == '2') {
    uniqueElems.forEach((elem, i) => {
      const sp  = speciesParams[elem] || {};
      const val = (sp.mag !== undefined && sp.mag !== '') ? sp.mag : (isMetal(elem) ? '0.2' : '0.0');
      out += `  starting_magnetization(${i+1}) = ${val},\n`;
    });
  }

  out += `  occupations   = ${p.occupations},\n`;
  if (/['"]smearing['"]/i.test(p.occupations)) {
    out += `  smearing      = ${p.smearing},  ! IMPORTANT: choose consistently with the material\n`;
    out += `  degauss       = ${p.degauss},  ! IMPORTANT: convergence-test this broadening\n`;
  } else {
    out += `  ! smearing and degauss are omitted because occupations is not 'smearing'\n`;
  }
  out += `  vdw_corr      = ${p.vdw_corr},\n`;
  if (/['"]dft-d3['"]/i.test(p.vdw_corr) && params.dftd3_threebody !== undefined) {
    out += `  dftd3_threebody = ${params.dftd3_threebody},  ! Keep false unless the selected QE workflow supports D3 three-body Hessians\n`;
  }
  if (/['"]xdm['"]/i.test(p.vdw_corr)) {
    out += `  ! For PBE/B86bPBE/PW86PBE/BLYP, QE supplies XDM damping coefficients.\n`;
    if (params.xdm_a1 !== undefined && params.xdm_a1 !== '') {
      out += `  xdm_a1        = ${params.xdm_a1},  ! OPTIONAL advanced override; verify for the chosen functional\n`;
    }
    if (params.xdm_a2 !== undefined && params.xdm_a2 !== '') {
      out += `  xdm_a2        = ${params.xdm_a2},  ! OPTIONAL advanced override in angstrom\n`;
    }
  }
  out += `/\n\n`;

  // ── &ELECTRONS ───────────────────────────────────────────────────────────────
  out += `&ELECTRONS\n`;
  out += `  electron_maxstep = 200,\n`;
  out += `  conv_thr      = 1.0D-7,\n`;
  out += `  mixing_beta   = 0.5,\n`;
  out += `  mixing_ndim   = 8,\n`;
  out += `  mixing_mode   = 'plain',\n`;
  out += `  diagonalization = 'david',\n`;
  out += `/\n\n`;

  // ── &IONS / &CELL ─────────────────────────────────────────────────────────────
  if (calculation === 'relax' || calculation === 'vc-relax') {
    out += `&IONS\n  ion_dynamics  = 'bfgs',\n/\n\n`;
  }
  if (calculation === 'vc-relax') {
    out += `&CELL\n  cell_dynamics = 'bfgs',\n/\n\n`;
  }

  // ── ATOMIC_SPECIES ────────────────────────────────────────────────────────────
  out += `ATOMIC_SPECIES\n`;
  uniqueElems.forEach(elem => {
    const mass   = getAtomicMass(elem);
    const sp     = speciesParams[elem] || {};
    const allowedPseudos = getPseudosForElement(elem);
    const pseudo = allowedPseudos.includes(sp.pseudo) ? sp.pseudo : allowedPseudos[0];
    if (!pseudo) throw new Error(`No allowed pseudopotential is configured for ${elem}`);
    out += `  ${elem.padEnd(4)} ${mass.toFixed(5)}   ${pseudo}\n`;
  });
  out += `\n`;

  // ── CELL_PARAMETERS (only for ibrav=0) ────────────────────────────────────────
  if (ibrav === 0) {
    const cellVecsAng = (sym && sym.cellVecsAng) ? sym.cellVecsAng : null;
    if (cellVecsAng) {
      out += `CELL_PARAMETERS (angstrom)\n`;
      cellVecsAng.forEach(v => {
        out += `  ${fmtF(v[0])}  ${fmtF(v[1])}  ${fmtF(v[2])}\n`;
      });
    } else if (cellVecsBohr) {
      out += `CELL_PARAMETERS {bohr}\n`;
      cellVecsBohr.forEach(v => {
        out += `  ${fmt(v[0])}  ${fmt(v[1])}  ${fmt(v[2])}\n`;
      });
    } else if (cifData.mat) {
      out += `CELL_PARAMETERS (angstrom)\n`;
      [0,1,2].forEach(i => {
        const row = [cifData.mat[0][i], cifData.mat[1][i], cifData.mat[2][i]];
        out += `  ${fmtF(row[0])}  ${fmtF(row[1])}  ${fmtF(row[2])}\n`;
      });
    }
    out += `\n`;
  }

  // ── K_POINTS ──────────────────────────────────────────────────────────────────
  if (protocol === 'bands-nscf') {
    const path = Array.isArray(params.kPath) && params.kPath.length >= 2 ? params.kPath : DEFAULT_BAND_K_PATH;
    out += `K_POINTS crystal_b\n${path.length}\n`;
    path.forEach(point => {
      const x = Number.isFinite(Number(point.x)) ? Number(point.x) : 0;
      const y = Number.isFinite(Number(point.y)) ? Number(point.y) : 0;
      const z = Number.isFinite(Number(point.z)) ? Number(point.z) : 0;
      const points = Math.max(1, parseInt(point.points) || 20);
      const label = String(point.label || 'K').replace(/[^A-Za-z0-9Γ_-]/g, '');
      out += `  ${x.toFixed(6)} ${y.toFixed(6)} ${z.toFixed(6)} ${points} !${label}\n`;
    });
    out += `\n`;
  } else {
    out += `K_POINTS automatic\n  ${kpts.kx} ${kpts.ky} ${kpts.kz}   0 0 0\n\n`;
  }

  // ── ATOMIC_POSITIONS ───────────────────────────────────────────────────────────
  const coordFormat = params.coordFormat || 'angstrom';
  const wrap = v => { v = ((v % 1) + 1) % 1; return v; };

  if (coordFormat === 'crystal') {
    out += `ATOMIC_POSITIONS {crystal}\n`;
    atoms.forEach(atom => {
      out += `  ${atom.sym.padEnd(4)} ${fmtF(wrap(atom.fx))}  ${fmtF(wrap(atom.fy))}  ${fmtF(wrap(atom.fz))}\n`;
    });
  } else {
    // Convert fractional coordinates to Cartesian angstrom using cell vectors
    const cellVecsForPos = (sym && sym.cellVecsAng) ? sym.cellVecsAng
      : (a && !isNaN(a)) ? buildCellVectors(a, b, c, alphaRad, betaRad, gammaRad)
      : null;

    out += `ATOMIC_POSITIONS {angstrom}\n`;
    atoms.forEach(atom => {
      if (cellVecsForPos) {
        const x = atom.fx * cellVecsForPos[0][0] + atom.fy * cellVecsForPos[1][0] + atom.fz * cellVecsForPos[2][0];
        const y = atom.fx * cellVecsForPos[0][1] + atom.fy * cellVecsForPos[1][1] + atom.fz * cellVecsForPos[2][1];
        const z = atom.fx * cellVecsForPos[0][2] + atom.fy * cellVecsForPos[1][2] + atom.fz * cellVecsForPos[2][2];
        out += `  ${atom.sym.padEnd(4)} ${fmtF(x)}  ${fmtF(y)}  ${fmtF(z)}\n`;
      } else {
        out += `  ${atom.sym.padEnd(4)} ${fmtF(atom.fx)}  ${fmtF(atom.fy)}  ${fmtF(atom.fz)}\n`;
      }
    });
  }
  out += `\n`;

  // ── Protocol-specific comments ───────────────────────────────────────────────
  if (protocol === 'band') {
    out += `\n! ─── Band structure k-path (edit as needed) ───\n`;
    out += `! K_POINTS crystal_b\n! 5\n!  0.0 0.0 0.0  40  ! Gamma\n!  0.5 0.0 0.5  40  ! X\n!  0.5 0.5 0.5  40  ! L\n!  0.0 0.0 0.0  1   ! Gamma\n`;
  }
  if (protocol === 'phonon') {
    out += `\n! ─── After SCF: run ph.x ───\n`;
    out += `! &inputph\n!   tr2_ph = 1.0e-14, prefix='pwscf', outdir='./tmp',\n!   epsil = .true., ldisp = .true.,\n!   nq1=4, nq2=4, nq3=4, fildyn='dyn',\n! /\n`;
  }

  return out;
}

function unquote(value) {
  return String(value ?? '').trim().replace(/^['"]|['"]$/g, '');
}

function qeQuote(value) {
  return `'${unquote(value).replace(/'/g, "''")}'`;
}

function safeBaseName(value) {
  const base = String(value || 'structure').replace(/\.cif$/i, '');
  return base.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'structure';
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

/**
 * Generate the complete DOS workflow: SCF, NSCF, dos.x, and a sequential shell runner.
 * All artifacts intentionally share prefix/outdir and a single mutable params object.
 */
export function generateDOSWorkflow(cifData, params = {}) {
  const baseName = safeBaseName(params.baseName || cifData.filename || 'structure');
  const prefix = qeQuote(params.prefix || baseName);
  const outdir = params.outdir || "'./tmp'";
  const autoK = cifData.symmetry?.kpts || { kx: 1, ky: 1, kz: 1 };
  const scfK = {
    kx: Math.max(1, parseInt(params.scfKx ?? params.kx ?? autoK.kx) || 1),
    ky: Math.max(1, parseInt(params.scfKy ?? params.ky ?? autoK.ky) || 1),
    kz: Math.max(1, parseInt(params.scfKz ?? params.kz ?? autoK.kz) || 1),
  };
  const nscfK = {
    kx: Math.max(1, parseInt(params.nscfKx) || scfK.kx * 3),
    ky: Math.max(1, parseInt(params.nscfKy) || scfK.ky * 3),
    kz: Math.max(1, parseInt(params.nscfKz) || scfK.kz * 3),
  };
  const nbnd = Math.max(1, parseInt(params.nbnd) || cifData.atoms.length * 4);

  const shared = {
    ...params,
    baseName,
    prefix,
    outdir,
    scfKx: scfK.kx, scfKy: scfK.ky, scfKz: scfK.kz,
    nscfKx: nscfK.kx, nscfKy: nscfK.ky, nscfKz: nscfK.kz,
    nbnd,
    dosEmin: params.dosEmin ?? '-20.0',
    dosEmax: params.dosEmax ?? '20.0',
    dosDeltaE: params.dosDeltaE ?? '0.01',
    occupations: params.occupations || '"smearing"',
    nscfOccupations: params.nscfOccupations || '"tetrahedra"',
    speciesParams: params.speciesParams || {},
  };

  const scfText = generateQEInput('dos-scf', cifData, {
    ...shared,
    calculation: 'scf',
    occupations: shared.occupations,
    kx: scfK.kx, ky: scfK.ky, kz: scfK.kz,
    nbnd: undefined,
  });
  const nscfText = generateQEInput('dos-nscf', cifData, {
    ...shared,
    calculation: 'nscf',
    occupations: shared.nscfOccupations,
    kx: nscfK.kx, ky: nscfK.ky, kz: nscfK.kz,
    nbnd,
  });

  const dosText = `! Generated by QE Studio\n` +
    `! DOS workflow — step 3/3: run with dos.x only after SCF and NSCF finish successfully.\n` +
    `! IMPORTANT: prefix and outdir must exactly match both pw.x inputs.\n` +
    `! OPTIONAL: Emin/Emax limit the reported energy window; choose values around the states of interest.\n` +
    `! OPTIONAL: DeltaE controls energy-grid spacing; smaller values increase resolution and output size.\n` +
    `&DOS\n` +
    `  prefix = ${prefix},\n` +
    `  outdir = ${outdir},\n` +
    `  fildos = ${qeQuote(`${baseName}.dos`)},\n` +
    `  Emin   = ${shared.dosEmin},\n` +
    `  Emax   = ${shared.dosEmax},\n` +
    `  DeltaE = ${shared.dosDeltaE},\n` +
    `/\n`;

  const names = {
    scf: `${baseName}_scf.in`,
    nscf: `${baseName}_nscf.in`,
    dos: `${baseName}_dos.in`,
    submit: `${baseName}_submit.sh`,
  };
  const submitText = `#!/usr/bin/env bash\n` +
    `# Generated by QE Studio — sequential DOS workflow runner.\n` +
    `# IMPORTANT: run this script where all three input files are present.\n` +
    `# IMPORTANT: pw.x and dos.x must be available on PATH; load your QE module first if needed.\n` +
    `# IMPORTANT: set -o pipefail makes a QE failure stop the workflow even when output is piped through tee.\n` +
    `# OPTIONAL: add mpirun/srun and scheduler directives required by your computing environment.\n` +
    `# CAREFUL: do not run NSCF or DOS using stale data from a different prefix/outdir.\n` +
    `set -euo pipefail\n\n` +
    `pw.x -i ${shellQuote(names.scf)} | tee ${shellQuote(`${baseName}_scf.out`)}\n` +
    `pw.x -i ${shellQuote(names.nscf)} | tee ${shellQuote(`${baseName}_nscf.out`)}\n` +
    `dos.x -i ${shellQuote(names.dos)} | tee ${shellQuote(`${baseName}_dos.out`)}\n`;

  return {
    params: shared,
    files: [
      { filename: names.scf, protocolId: 'dos-scf', text: scfText },
      { filename: names.nscf, protocolId: 'dos-nscf', text: nscfText },
      { filename: names.dos, protocolId: 'dos-post', text: dosText },
      { filename: names.submit, protocolId: 'dos-submit', text: submitText },
    ],
  };
}

/** Generate SCF, band-path pw.x, bands.x, and a sequential runner sharing prefix/outdir. */
export function generateBandsWorkflow(cifData, params = {}) {
  const baseName = safeBaseName(params.baseName || cifData.filename || 'structure');
  const prefix = qeQuote(params.prefix || baseName);
  const outdir = params.outdir || "'./tmp'";
  const autoK = cifData.symmetry?.kpts || { kx: 1, ky: 1, kz: 1 };
  const scfK = {
    kx: Math.max(1, parseInt(params.scfKx ?? params.kx ?? autoK.kx) || 1),
    ky: Math.max(1, parseInt(params.scfKy ?? params.ky ?? autoK.ky) || 1),
    kz: Math.max(1, parseInt(params.scfKz ?? params.kz ?? autoK.kz) || 1),
  };
  const suggested = getSuggestedBandPath(cifData, params.bandPathPreset);
  const kPath = (Array.isArray(params.kPath) && params.kPath.length >= 2 ? params.kPath : suggested.kPath)
    .map(point => ({ ...point }));
  const shared = {
    ...params, baseName, prefix, outdir, kPath,
    bandPathPreset: params.bandPathPreset || suggested.presetId,
    scfKx: scfK.kx, scfKy: scfK.ky, scfKz: scfK.kz,
    occupations: params.occupations || '"smearing"',
    nscfOccupations: params.nscfOccupations || '"smearing"',
    nscfSmearing: params.nscfSmearing || '"gaussian"',
    filband: params.filband || `${baseName}_H1.out`,
    speciesParams: params.speciesParams || {},
  };
  const scfText = generateQEInput('bands-scf', cifData, {
    ...shared, calculation: 'scf', occupations: shared.occupations,
    kx: scfK.kx, ky: scfK.ky, kz: scfK.kz,
  });
  const nscfText = generateQEInput('bands-nscf', cifData, {
    ...shared, calculation: 'bands', occupations: shared.nscfOccupations,
    smearing: shared.nscfSmearing, kPath,
  });
  const bandsText = `! Generated by QE Studio\n` +
    `! Run with bands.x after the SCF and band-path pw.x calculations finish.\n` +
    `! IMPORTANT: prefix and outdir must exactly match both pw.x inputs.\n` +
    `&BANDS\n` +
    `  outdir  = ${outdir},\n` +
    `  prefix  = ${prefix},\n` +
    `  filband = ${qeQuote(shared.filband)},\n` +
    `/\n`;
  const names = {
    scf: `${baseName}_scf.in`,
    nscf: `${baseName}_nscf.in`,
    bands: `${baseName}_bands.in`,
    submit: `${baseName}_submit.sh`,
  };
  const submitText = `#!/usr/bin/env bash\n` +
    `# Generated by QE Studio — sequential Bands workflow runner.\n` +
    `# IMPORTANT: run this script where all three input files are present.\n` +
    `# IMPORTANT: pw.x and bands.x must be available on PATH; load your QE module first if needed.\n` +
    `# IMPORTANT: set -o pipefail makes a QE failure stop the workflow even when output is piped through tee.\n` +
    `# OPTIONAL: add mpirun/srun and scheduler directives required by your computing environment.\n` +
    `# CAREFUL: cross-verify the selected k path and do not reuse stale data from another prefix/outdir.\n` +
    `set -euo pipefail\n\n` +
    `pw.x -i ${shellQuote(names.scf)} | tee ${shellQuote(`${baseName}_scf.out`)}\n` +
    `pw.x -i ${shellQuote(names.nscf)} | tee ${shellQuote(`${baseName}_nscf.out`)}\n` +
    `bands.x -i ${shellQuote(names.bands)} | tee ${shellQuote(`${baseName}_bands.out`)}\n`;
  return {
    params: shared,
    files: [
      { filename: names.scf, protocolId: 'bands-scf', text: scfText },
      { filename: names.nscf, protocolId: 'bands-nscf', text: nscfText },
      { filename: names.bands, protocolId: 'bands-post', text: bandsText },
      { filename: names.submit, protocolId: 'bands-submit', text: submitText },
    ],
  };
}

/** Generate an SCF input, pp.x charge-density input, and sequential runner. */
export function generateChargeWorkflow(cifData, params = {}) {
  const baseName = safeBaseName(params.baseName || cifData.filename || 'structure');
  const prefix = qeQuote(params.prefix || baseName);
  const outdir = params.outdir || "'./tmp'";
  const autoK = cifData.symmetry?.kpts || { kx: 1, ky: 1, kz: 1 };
  const scfK = {
    kx: Math.max(1, parseInt(params.scfKx ?? params.kx ?? autoK.kx) || 1),
    ky: Math.max(1, parseInt(params.scfKy ?? params.ky ?? autoK.ky) || 1),
    kz: Math.max(1, parseInt(params.scfKz ?? params.kz ?? autoK.kz) || 1),
  };
  const shared = {
    ...params, baseName, prefix, outdir,
    scfKx: scfK.kx, scfKy: scfK.ky, scfKz: scfK.kz,
    occupations: params.occupations || '"smearing"',
    chargeFilplot: params.chargeFilplot || baseName,
    chargePlotNum: params.chargePlotNum ?? '0',
    chargeNfile: params.chargeNfile ?? '1',
    chargeIflag: params.chargeIflag ?? '3',
    chargeOutputFormat: params.chargeOutputFormat ?? '6',
    chargeFileout: params.chargeFileout || `${baseName}.cube`,
    speciesParams: params.speciesParams || {},
  };
  const scfText = generateQEInput('charge-scf', cifData, {
    ...shared, calculation: 'scf', kx: scfK.kx, ky: scfK.ky, kz: scfK.kz,
  });
  const chargeText = `! Generated by QE Studio\n` +
    `! Charge-density workflow — step 2/2: run with pp.x after SCF finishes successfully.\n` +
    `! IMPORTANT: prefix and outdir must exactly match the pw.x SCF input.\n` +
    `! plot_num=0 selects total electron density; output_format=6 writes a Gaussian cube file.\n` +
    `&INPUTPP\n` +
    `  prefix   = ${prefix},\n` +
    `  outdir   = ${outdir},\n` +
    `  filplot  = ${qeQuote(shared.chargeFilplot)},\n` +
    `  plot_num = ${shared.chargePlotNum},\n` +
    `/\n` +
    `&PLOT\n` +
    `  nfile         = ${shared.chargeNfile},\n` +
    `  iflag         = ${shared.chargeIflag},\n` +
    `  output_format = ${shared.chargeOutputFormat},\n` +
    `  fileout       = ${qeQuote(shared.chargeFileout)},\n` +
    `/\n`;
  const names = {
    scf: `${baseName}_scf.in`, charge: `${baseName}_charge.in`, submit: `${baseName}_submit.sh`,
  };
  const submitText = `#!/usr/bin/env bash\n` +
    `# Generated by QE Studio — sequential Charge Density workflow runner.\n` +
    `# IMPORTANT: run this script where both input files are present.\n` +
    `# IMPORTANT: pw.x and pp.x must be available on PATH; load your QE module first if needed.\n` +
    `# OPTIONAL: add mpirun/srun and scheduler directives required by your computing environment.\n` +
    `set -euo pipefail\n\n` +
    `pw.x -i ${shellQuote(names.scf)} | tee ${shellQuote(`${baseName}_scf.out`)}\n` +
    `pp.x -i ${shellQuote(names.charge)} | tee ${shellQuote(`${baseName}_charge.out`)}\n`;
  return {
    params: shared,
    files: [
      { filename: names.scf, protocolId: 'charge-scf', text: scfText },
      { filename: names.charge, protocolId: 'charge-post', text: chargeText },
      { filename: names.submit, protocolId: 'charge-submit', text: submitText },
    ],
  };
}

/** Generate SCF plus all-electron and valence cube inputs used for Bader analysis. */
export function generateBaderWorkflow(cifData, params = {}) {
  const baseName = safeBaseName(params.baseName || cifData.filename || 'structure');
  const prefix = qeQuote(params.prefix || baseName);
  const outdir = params.outdir || "'./tmp'";
  const autoK = cifData.symmetry?.kpts || { kx: 1, ky: 1, kz: 1 };
  const scfK = {
    kx: Math.max(1, parseInt(params.scfKx ?? params.kx ?? autoK.kx) || 1),
    ky: Math.max(1, parseInt(params.scfKy ?? params.ky ?? autoK.ky) || 1),
    kz: Math.max(1, parseInt(params.scfKz ?? params.kz ?? autoK.kz) || 1),
  };
  const shared = {
    ...params, baseName, prefix, outdir,
    scfKx: scfK.kx, scfKy: scfK.ky, scfKz: scfK.kz,
    occupations: params.occupations || '"smearing"',
    allFilplot: params.allFilplot || `${baseName}_allelec`,
    allFileout: params.allFileout || `${baseName}_allelec.cube`,
    valenceFilplot: params.valenceFilplot || `${baseName}_valence`,
    valenceFileout: params.valenceFileout || `${baseName}_valence.cube`,
    baderNfile: params.baderNfile ?? '1',
    baderIflag: params.baderIflag ?? '3',
    baderOutputFormat: params.baderOutputFormat ?? '6',
    speciesParams: params.speciesParams || {},
  };
  const scfText = generateQEInput('bader-scf', cifData, {
    ...shared, calculation: 'scf', kx: scfK.kx, ky: scfK.ky, kz: scfK.kz,
  });
  const makePPInput = ({ kind, filplot, fileout, plotNum }) => `! Generated by QE Studio\n` +
    `! Bader workflow — ${kind}; run with pp.x after a successful SCF calculation.\n` +
    `! IMPORTANT: prefix and outdir must exactly match the pw.x SCF input.\n` +
    `&INPUTPP\n` +
    `  prefix   = ${prefix},\n` +
    `  outdir   = ${outdir},\n` +
    `  filplot  = ${qeQuote(filplot)},\n` +
    `  plot_num = ${plotNum},\n` +
    `/\n` +
    `&PLOT\n` +
    `  nfile         = ${shared.baderNfile},\n` +
    `  iflag         = ${shared.baderIflag},\n` +
    `  output_format = ${shared.baderOutputFormat},\n` +
    `  fileout       = ${qeQuote(fileout)},\n` +
    `/\n`;
  const allText = makePPInput({ kind: 'all-electron density (plot_num=21)', filplot: shared.allFilplot, fileout: shared.allFileout, plotNum: 21 });
  const valenceText = makePPInput({ kind: 'valence density (plot_num=0)', filplot: shared.valenceFilplot, fileout: shared.valenceFileout, plotNum: 0 });
  const names = {
    scf: `${baseName}_scf.in`,
    all: `${baseName}_allelectron.in`,
    valence: `${baseName}_valenceelectron.in`,
    submit: `${baseName}_submit.sh`,
  };
  const submitText = `#!/usr/bin/env bash\n` +
    `# Generated by QE Studio — sequential Bader density workflow.\n` +
    `# pw.x creates the SCF data; pp.x writes all-electron and valence cube files.\n` +
    `# OPTIONAL: add locally required scheduler, module, mpirun, or srun commands.\n` +
    `set -euo pipefail\n\n` +
    `pw.x -i ${shellQuote(names.scf)} | tee ${shellQuote(`${baseName}_scf.out`)}\n` +
    `pp.x -i ${shellQuote(names.all)} | tee ${shellQuote(`${baseName}_allelectron.out`)}\n` +
    `pp.x -i ${shellQuote(names.valence)} | tee ${shellQuote(`${baseName}_valenceelectron.out`)}\n`;
  return {
    params: shared,
    files: [
      { filename: names.scf, protocolId: 'bader-scf', text: scfText },
      { filename: names.all, protocolId: 'bader-all', text: allText },
      { filename: names.valence, protocolId: 'bader-valence', text: valenceText },
      { filename: names.submit, protocolId: 'bader-submit', text: submitText },
    ],
  };
}

/** Generate SCF, optional D3 Hessian, phonon, dynmat, and sequential runner inputs. */
export function generateVibrationalWorkflow(cifData, params = {}) {
  const baseName = safeBaseName(params.baseName || cifData.filename || 'structure');
  const prefix = qeQuote(params.prefix || baseName);
  const outdir = params.outdir || "'./tmp'";
  const autoK = cifData.symmetry?.kpts || { kx: 1, ky: 1, kz: 1 };
  const scfK = {
    kx: Math.max(1, parseInt(params.scfKx ?? params.kx ?? autoK.kx) || 1),
    ky: Math.max(1, parseInt(params.scfKy ?? params.ky ?? autoK.ky) || 1),
    kz: Math.max(1, parseInt(params.scfKz ?? params.kz ?? autoK.kz) || 1),
  };
  const vdwCorr = params.vdw_corr || '"dft-d3"';
  const usesD3 = /['"]dft-d3['"]/i.test(vdwCorr);
  const shared = {
    ...params, baseName, prefix, outdir, vdw_corr: vdwCorr, usesD3,
    scfKx: scfK.kx, scfKy: scfK.ky, scfKz: scfK.kz,
    occupations: params.occupations || '"smearing"',
    dftd3_threebody: params.dftd3_threebody ?? '.false.',
    hessFile: params.hessFile || `${baseName}.hess`,
    hessStep: params.hessStep || '',
    phTr2: params.phTr2 || '1.0d-14',
    dynFile: params.dynFile || `${baseName}.dyn`,
    qx: params.qx ?? '0.00', qy: params.qy ?? '0.00', qz: params.qz ?? '0.00',
    dynAsr: params.dynAsr || 'crystal',
    speciesParams: params.speciesParams || {},
  };
  const scfText = generateQEInput('phonon-scf', cifData, {
    ...shared, calculation: 'scf', kx: scfK.kx, ky: scfK.ky, kz: scfK.kz,
  });
  const hessText = usesD3
    ? `! Generated by QE Studio\n! DFT-D3 Hessian; run with d3hess.x after SCF and before ph.x.\n&INPUT\n  outdir = ${outdir},\n  prefix = ${prefix},\n  filhess = ${qeQuote(shared.hessFile)},\n${shared.hessStep ? `  step = ${shared.hessStep},\n` : ''}/\n`
    : `! Generated by QE Studio\n! Hessian stage is not required because vdw_corr is not DFT-D3.\n! The submit script intentionally skips d3hess.x.\n`;
  const phText = `! Generated by QE Studio\n! Run with ph.x after SCF${usesD3 ? ' and d3hess.x' : ''}.\n&INPUTPH\n` +
    `  outdir = ${outdir},\n  prefix = ${prefix},\n  tr2_ph = ${shared.phTr2},\n  fildyn = ${qeQuote(shared.dynFile)},\n` +
    (usesD3 ? `  dftd3_hess = ${qeQuote(shared.hessFile)},\n` : '') +
    `/\n${shared.qx} ${shared.qy} ${shared.qz}\n`;
  const dynText = `! Generated by QE Studio\n! Run with dynmat.x after ph.x.\n&INPUT\n  fildyn = ${qeQuote(shared.dynFile)},\n  asr = ${qeQuote(shared.dynAsr)},\n/\n`;
  const names = {
    scf: `${baseName}_scf.in`, hess: `${baseName}_hess.in`, ph: `${baseName}_ph.in`, dyn: `${baseName}_dyn.in`, submit: `${baseName}_submit.sh`,
  };
  const submitText = `#!/usr/bin/env bash\n# Generated by QE Studio — sequential Vibrational Energy workflow.\n` +
    `# d3hess.x is run only for a DFT-D3 SCF calculation.\n# OPTIONAL: add locally required scheduler, module, mpirun, or srun commands.\nset -euo pipefail\n\n` +
    `pw.x -i ${shellQuote(names.scf)} | tee ${shellQuote(`${baseName}_scf.out`)}\n` +
    (usesD3 ? `d3hess.x -i ${shellQuote(names.hess)} | tee ${shellQuote(`${baseName}_hess.out`)}\n` : `# d3hess.x skipped: SCF vdw_corr is not DFT-D3.\n`) +
    `ph.x -i ${shellQuote(names.ph)} | tee ${shellQuote(`${baseName}_ph.out`)}\n` +
    `dynmat.x -i ${shellQuote(names.dyn)} | tee ${shellQuote(`${baseName}_dyn.out`)}\n`;
  return {
    params: shared,
    files: [
      { filename: names.scf, protocolId: 'phonon-scf', text: scfText },
      { filename: names.hess, protocolId: 'phonon-hess', text: hessText },
      { filename: names.ph, protocolId: 'phonon-ph', text: phText },
      { filename: names.dyn, protocolId: 'phonon-dyn', text: dynText },
      { filename: names.submit, protocolId: 'phonon-submit', text: submitText },
    ],
  };
}

/** Generate a single pw.x calculation input plus a safe submit script. */
export function generatePWWorkflow(protocol, cifData, params = {}) {
  if (protocol !== 'scf' && protocol !== 'relax') throw new Error(`Unsupported pw.x workflow: ${protocol}`);
  const baseName = safeBaseName(params.baseName || cifData.filename || 'structure');
  const autoK = cifData.symmetry?.kpts || { kx: 1, ky: 1, kz: 1 };
  const k = {
    kx: Math.max(1, parseInt(params.kx ?? autoK.kx) || 1),
    ky: Math.max(1, parseInt(params.ky ?? autoK.ky) || 1),
    kz: Math.max(1, parseInt(params.kz ?? autoK.kz) || 1),
  };
  const inputName = `${baseName}_${protocol}.in`;
  const outputName = `${baseName}_${protocol}.out`;
  const shared = {
    ...params, baseName, ...k,
    prefix: params.prefix || qeQuote(`${baseName}_${protocol}`),
    occupations: params.occupations || '"smearing"',
    speciesParams: params.speciesParams || {},
  };
  const inputText = generateQEInput(protocol, cifData, shared);
  const submitText = `#!/usr/bin/env bash\n` +
    `# Generated by QE Studio — ${protocol === 'scf' ? 'SCF' : 'Structural Relaxation'} runner.\n` +
    `# IMPORTANT: pw.x must be available on PATH; load your QE module first if needed.\n` +
    `# OPTIONAL: add locally required scheduler, module, mpirun, or srun commands.\n` +
    `set -euo pipefail\n\n` +
    `pw.x -i ${shellQuote(inputName)} | tee ${shellQuote(outputName)}\n`;
  return {
    params: shared,
    files: [
      { filename: inputName, protocolId: protocol, text: inputText },
      { filename: `${baseName}_submit.sh`, protocolId: `${protocol}-submit`, text: submitText },
    ],
  };
}
