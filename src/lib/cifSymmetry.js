/**
 * cifSymmetry.js
 * Ports the full cif2qe.sh algorithm (Carlo Nervi, v1.2) to JavaScript.
 *
 * Exports:
 *   findLattice(a, b, c, alpha, beta, gamma)  → lattice system string
 *   findIbrav(spaceGroup, lattice)            → QE ibrav integer
 *   buildCelldm(ibrav, a, b, c, alphaRad, betaRad, gammaRad) → { celldm1..6 }
 *   buildCellVectors(a, b, c, al, be, ga)    → [[ax,ay,az],[bx,...],[cx,...]] in Å
 *   computeKPoints(a, b, c, sep=0.07)        → { kx, ky, kz }
 *   getIbravLabel(ibrav)                     → human-readable label string
 *   INT_TABLES                               → array[1..230] of HM symbol strings
 *   parseCIFSymmetry(cifText)                → { sgName, itNumber, ibrav, lattice, celldm, kpts, cellVecs }
 */

// ─── International Tables (1-indexed, position 0 unused) ─────────────────────
export const INT_TABLES = [
  null, // 0 unused
  // 1-2 Triclinic
  'P1','P-1',
  // 3-15 Monoclinic
  'P2','P2(1)','C2','Pm','Pc','Cm','Cc','P2/m','P2(1)/m','C2/m','P2/c','P2(1)/c','C2/c',
  // 16-74 Orthorhombic
  'P222','P222(1)','P2(1)2(1)2','P2(1)2(1)2(1)','C222(1)','C222','F222','I222','I2(1)2(1)2(1)',
  'Pmm2','Pmc2(1)','Pcc2','Pma2','Pca2(1)','Pnc2','Pmn2(1)','Pba2','Pna2(1)','Pnn2',
  'Cmm2','Cmc2(1)','Ccc2','Amm2','Abm2','Ama2','Aba2','Fmm2','Fdd2','Imm2','Iba2','Ima2',
  'Pmmm','Pnnn','Pccm','Pban','Pmma','Pnna','Pmna','Pcca','Pbam','Pccn','Pbcm','Pnnm','Pmmn','Pbcn','Pbca',
  'Pnma','Cmcm','Cmca','Cmmm','Cccm','Cmma','Ccca','Fmmm','Fddd','Immm','Ibam','Ibca','Imma',
  // 75-142 Tetragonal
  'P4','P4(1)','P4(2)','P4(3)','I4','I4(1)','P-4','I-4','P4/m','P4(2)/m','P4/n','P4(2)/n','I4/m','I4(1)/a',
  'P422','P42(1)2','P4(1)22','P4(1)2(1)2','P4(2)22','P4(2)2(1)2','P4(3)22','P4(3)2(1)2','I422','I4(1)22',
  'P4mm','P4bm','P4(2)cm','P4(2)nm','P4cc','P4nc','P4(2)mc','P4(2)bc','I4mm','I4cm','I4(1)md','I4(1)cd',
  'P-42m','P-42c','P-42(1)m','P-42(1)c','P-4m2','P-4c2','P-4b2','P-4n2','I-4m2','I-4c2','I-42m','I-42d',
  'P4/mmm','P4/mcc','P4/nbm','P4/nnc','P4/mbm','P4/mnc','P4/nmm','P4/ncc',
  'P4(2)/mmc','P4(2)/mcm','P4(2)/nbc','P4(2)/nnm','P4(2)/mbc','P4(2)/mnm','P4(2)/nmc','P4(2)/ncm',
  'I4/mmm','I4/mcm','I4(1)/amd','I4(1)/acd',
  // 143-167 Trigonal
  'P3','P3(1)','P3(2)','R3','P-3','R-3',
  'P312','P321','P3(1)12','P3(1)21','P3(2)12','P3(2)21','R32',
  'P3m1','P31m','P3c1','P31c','R3m','R3c',
  'P-31m','P-31c','P-3m1','P-3c1','R-3m','R-3c',
  // 168-194 Hexagonal
  'P6','P6(1)','P6(5)','P6(2)','P6(4)','P6(3)','P-6','P6/m','P6(3)/m',
  'P622','P6(1)22','P6(5)22','P6(2)22','P6(4)22','P6(3)22',
  'P6mm','P6cc','P6(3)cm','P6(3)mc','P-6m2','P-6c2','P-62m','P-62c',
  'P6/mmm','P6/mcc','P6(3)/mcm','P6(3)/mmc',
  // 195-230 Cubic
  'P23','F23','I23','P2(1)3','I2(1)3',
  'Pm-3','Pn-3','Fm-3','Fd-3','Im-3','Pa-3','Ia-3',
  'P432','P4(2)32','F432','F4(1)32','I432','P4(3)32','P4(1)32','I4(1)32',
  'P-43m','F4-3m','I-43m','P-43n','F-43c','I-43d',
  'Pm-3m','Pn-3n','Pm-3n','Pn-3m','Fm-3m','Fm-3c','Fd-3m','Fd-3c','Im-3m','Ia-3d',
];

// ─── Tolerances ───────────────────────────────────────────────────────────────
const THR = 1e-4;
const BOHR2ANG = 0.52917720859;

function abs(x) { return x < 0 ? -x : x; }

// ─── Find Bravais lattice system from cell parameters (mirrors Find_Lattice) ──
export function findLattice(a, b, c, alpha, beta, gamma) {
  const ea = abs(alpha - 90.0) < THR;
  const eb = abs(beta  - 90.0) < THR;
  const eg = abs(gamma - 90.0) < THR;
  const eg120 = abs(gamma - 120.0) < THR;

  if (ea && eg) {
    if (eb) {
      if (abs(a - b) < THR && abs(a - c) < THR) return 'cubic';
      if (abs(a - b) < THR)                      return 'tetragonal';
      return 'orthorhombic';
    }
    return 'monoclinic';
  }
  if (ea && eb && eg120) return 'hexagonal';
  if (abs(alpha - beta) < THR && abs(alpha - gamma) < THR &&
      abs(a - b) < THR && abs(a - c) < THR)       return 'rhombohedral';
  return 'triclinic';
}

// ─── Find ibrav from spacegroup + lattice (mirrors Find_ibrav) ────────────────
export function findIbrav(spaceGroup, lattice) {
  const sg = spaceGroup || '';
  // Detect centering from first character after any leading space
  const first = sg.trim()[0] || 'P';
  const prim  = first === 'P';
  const body  = first === 'I';
  const face  = first === 'F';
  const base  = first === 'C' || first === 'A' || first === 'B';

  switch (lattice) {
    case 'cubic':
      if (prim) return 1;
      if (face) return 2;
      if (body) return 3;
      return 1;
    case 'tetragonal':
      if (prim) return 6;
      if (body) return 7;
      return 6;
    case 'orthorhombic':
      if (prim) return 8;
      if (base) return 9;
      if (face) return 10;
      if (body) return 11;
      return 8;
    case 'monoclinic':
      if (prim) return -12;
      if (base) return 13;
      return -12;
    case 'triclinic':
      return 14;
    case 'hexagonal':
      return 4;
    case 'rhombohedral':
      return prim ? 4 : 5;
    default:
      return 0;
  }
}

// ─── Human-readable ibrav description ────────────────────────────────────────
export function getIbravLabel(ibrav) {
  const MAP = {
    0:   'ibrav=0 — Free (CELL_PARAMETERS)',
    1:   'ibrav=1 — Simple Cubic (sc)',
    2:   'ibrav=2 — FCC',
    3:   'ibrav=3 — BCC',
    4:   'ibrav=4 — Hexagonal / Trigonal',
    5:   'ibrav=5 — Trigonal (Rhombohedral, hex axes)',
    '-5':'ibrav=-5 — Trigonal (Rhombohedral, rhomb axes)',
    6:   'ibrav=6 — Simple Tetragonal (st)',
    7:   'ibrav=7 — Body-centred Tetragonal (bct)',
    8:   'ibrav=8 — Simple Orthorhombic (so)',
    9:   'ibrav=9 — Base-centred Orthorhombic (bco)',
    10:  'ibrav=10 — Face-centred Orthorhombic (fco)',
    11:  'ibrav=11 — Body-centred Orthorhombic',
    12:  'ibrav=12 — Simple Monoclinic (unique axis c)',
    '-12':'ibrav=-12 — Simple Monoclinic (unique axis b)',
    13:  'ibrav=13 — Base-centred Monoclinic',
    14:  'ibrav=14 — Triclinic',
  };
  return MAP[ibrav] || MAP[String(ibrav)] || `ibrav=${ibrav}`;
}

// ─── Build celldm array from cell parameters (mirrors cif2qe.sh) ──────────────
export function buildCelldm(ibrav, a, b, c, alphaRad, betaRad, gammaRad) {
  const cel1 = a / BOHR2ANG; // celldm(1) always = a in bohr
  const bA = b / a, cA = c / a;
  const cosa = Math.cos(alphaRad), cosb = Math.cos(betaRad), cosg = Math.cos(gammaRad);
  const res = { 1: cel1 };

  const i = Math.abs(ibrav);
  if (i === 4 || i === 6 || i === 7) { res[3] = cA; }
  else if (i === 5)                   { res[4] = cosa; }
  else if (i === 14) {
    res[2] = bA; res[3] = cA;
    res[4] = cosa; res[5] = cosb; res[6] = cosg;
  }
  else if (ibrav === -12) {
    res[2] = bA; res[3] = cA; res[5] = cosb;
  }
  else if (i === 13) {
    res[2] = bA; res[3] = cA; res[4] = cosg;
  }
  else if (i === 8 || i === 9 || i === 10 || i === 11) {
    res[2] = bA; res[3] = cA;
  }
  else if (i === 12) {
    res[2] = bA; res[3] = cA; res[4] = cosg;
  }
  // ibrav 1,2,3 only need celldm(1)
  return res;
}

// ─── Build Cartesian cell vectors (as used by cif2qe.sh for ibrav=0) ──────────
export function buildCellVectors(a, b, c, alphaRad, betaRad, gammaRad) {
  const cosa = Math.cos(alphaRad), cosb = Math.cos(betaRad), cosg = Math.cos(gammaRad);
  const sing = Math.sin(gammaRad);
  const vol  = Math.sqrt(1 - cosa*cosa - cosb*cosb - cosg*cosg + 2*cosa*cosb*cosg);

  return [
    [a,                    0,           0],
    [b * cosg,             b * sing,    0],
    [c * cosb, c * (cosa - cosb*cosg)/sing, c * vol / sing],
  ];
}

// ─── K-point mesh from lattice parameters (sep = 0.07 Å⁻¹ default) ───────────
export function computeKPoints(a, b, c, sep = 0.07) {
  const kx = Math.max(1, Math.round(1 / (a * sep)));
  const ky = Math.max(1, Math.round(1 / (b * sep)));
  const kz = Math.max(1, Math.round(1 / (c * sep)));
  return { kx, ky, kz };
}

// ─── Lightweight CIF value extractor (reused internally) ─────────────────────
function getCIFValue(text, key) {
  const re = new RegExp(`^\\s*${key}\\s+([^\\n]+)`, 'im');
  const m  = text.match(re);
  if (!m) return null;
  let v = m[1].trim().replace(/[()]/g, '').replace(/^['"]|['"]$/g, '');
  return v || null;
}

function stripUncert(v) {
  return v ? parseFloat(String(v).replace(/\(.*\)/, '')) : NaN;
}

// ─── Main entry-point: extract all symmetry / ibrav info from CIF text ────────
export function parseCIFSymmetry(cifText) {
  const text = cifText || '';

  // Cell parameters
  const a     = stripUncert(getCIFValue(text, '_cell_length_a'));
  const b     = stripUncert(getCIFValue(text, '_cell_length_b'));
  const c     = stripUncert(getCIFValue(text, '_cell_length_c'));
  const alpha = stripUncert(getCIFValue(text, '_cell_angle_alpha')) || 90;
  const beta  = stripUncert(getCIFValue(text, '_cell_angle_beta'))  || 90;
  const gamma = stripUncert(getCIFValue(text, '_cell_angle_gamma')) || 90;

  const alphaRad = alpha * Math.PI / 180;
  const betaRad  = beta  * Math.PI / 180;
  const gammaRad = gamma * Math.PI / 180;

  // Space group
  let sgName = getCIFValue(text, '_symmetry_space_group_name_H-M')
            || getCIFValue(text, '_space_group_name_H-M_alt')
            || getCIFValue(text, '_symmetry_space_group_name_Hall')
            || getCIFValue(text, '_space_group_name_Hall')
            || '';

  // IT number — try both common keys
  const itRaw  = getCIFValue(text, '_symmetry_Int_Tables_number')
              || getCIFValue(text, '_space_group_IT_number');
  const itNumber = itRaw ? parseInt(itRaw) : null;

  // If we have an IT number, look up the canonical HM name
  if (itNumber && itNumber >= 1 && itNumber <= 230 && INT_TABLES[itNumber]) {
    sgName = INT_TABLES[itNumber];
  }

  // Derive lattice system and ibrav
  const lattice = (!isNaN(a) && !isNaN(b) && !isNaN(c))
    ? findLattice(a, b, c, alpha, beta, gamma)
    : 'triclinic';

  const ibrav = findIbrav(sgName, lattice);

  // Build celldm
  const celldm = (!isNaN(a))
    ? buildCelldm(ibrav, a, b, c, alphaRad, betaRad, gammaRad)
    : {};

  // K-points
  const kpts = (!isNaN(a)) ? computeKPoints(a, b, c) : { kx: 1, ky: 1, kz: 1 };

  // Cell vectors in bohr (for CELL_PARAMETERS {bohr})
  const cellVecsAng  = (!isNaN(a)) ? buildCellVectors(a, b, c, alphaRad, betaRad, gammaRad) : null;
  const cellVecsBohr = cellVecsAng
    ? cellVecsAng.map(v => v.map(x => x / BOHR2ANG))
    : null;

  return {
    sgName,
    itNumber,
    ibrav,
    lattice,
    celldm,
    kpts,
    cellVecsAng,
    cellVecsBohr,
    cell: { a, b, c, alpha, beta, gamma, alphaRad, betaRad, gammaRad },
  };
}
