// ─── Constants ────────────────────────────────────────────────────────────────
const BOHR2ANG = 0.529177210903;

// ─── Unit helpers ─────────────────────────────────────────────────────────────
function cellParamScale(line, alatAng) {
  const av = line.match(/alat\s*=\s*([\d.Ee+\-]+)/i);
  if (av) return parseFloat(av[1]) * BOHR2ANG;
  const u = ((line.match(/[(\{]\s*([a-zA-Z]+)\s*[)\}]/i) || [])[1] || 'angstrom').toLowerCase();
  if (u === 'bohr') return BOHR2ANG;
  if (u === 'alat') return alatAng || 1;
  return 1;
}
function atomPosUnit(line, alatAng) {
  const av = line.match(/alat\s*=\s*([\d.Ee+\-]+)/i);
  if (av) return { scale: parseFloat(av[1]) * BOHR2ANG, isCrystal: false };
  const u = ((line.match(/[(\{]\s*([a-zA-Z]+)\s*[)\}]/i) || [])[1] || 'angstrom').toLowerCase();
  if (u === 'crystal') return { scale: 1, isCrystal: true };
  if (u === 'bohr')    return { scale: BOHR2ANG, isCrystal: false };
  if (u === 'alat')    return { scale: alatAng || 1, isCrystal: false };
  return { scale: 1, isCrystal: false };
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────
function dot(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
function norm(a) { return Math.sqrt(dot(a, a)); }
function clamp(v) { return Math.max(-1, Math.min(1, v)); }

function vecsToLattice(v1, v2, v3) {
  const a = norm(v1), b = norm(v2), c = norm(v3);
  const cosBC = clamp(dot(v2, v3) / (b * c));
  const cosAC = clamp(dot(v1, v3) / (a * c));
  const cosAB = clamp(dot(v1, v2) / (a * b));
  const alpha = Math.acos(cosBC) * 180 / Math.PI;
  const beta  = Math.acos(cosAC) * 180 / Math.PI;
  const gamma = Math.acos(cosAB) * 180 / Math.PI;
  const aB = a / BOHR2ANG;
  return { a, b, c, alpha, beta, gamma, aB, bA: b/a, cA: c/a, cosBC, cosAC, cosAB };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARSE QE OUTPUT FILE
// ═══════════════════════════════════════════════════════════════════════════════
export function parseQEOut(text) {
  const lines = text.split('\n');
  const P = {};

  for (const l of lines) { const m = l.match(/bravais-lattice index\s*=\s*(\d+)/); if (m) { P.ibrav = parseInt(m[1]); break; } }

  P.alatBohr = null; P.alatAng = null;
  for (const l of lines) { const m = l.match(/lattice parameter \(alat\)\s*=\s*([\d.]+)/); if (m) { P.alatBohr = parseFloat(m[1]); P.alatAng = P.alatBohr * BOHR2ANG; break; } }

  P.celldm = {};
  for (const l of lines) {
    const re = /celldm\((\d)\)\s*=\s*([\d.\-+Ee]+)/g; let m;
    while ((m = re.exec(l)) !== null) P.celldm[parseInt(m[1])] = parseFloat(m[2]);
    if (Object.keys(P.celldm).length >= 6) break;
  }

  for (const l of lines) {
    let m;
    if ((m = l.match(/number of atoms\/cell\s*=\s*(\d+)/))) P.nat = parseInt(m[1]);
    if ((m = l.match(/number of atomic types\s*=\s*(\d+)/))) P.ntyp = parseInt(m[1]);
    if ((m = l.match(/kinetic-energy cutoff\s*=\s*([\d.]+)\s*Ry/))) P.ecutwfc = parseFloat(m[1]);
    if ((m = l.match(/charge density cutoff\s*=\s*([\d.]+)\s*Ry/))) P.ecutrho = parseFloat(m[1]);
    if ((m = l.match(/scf convergence threshold\s*=\s*([\d.E\-+]+)/i))) P.conv_thr = m[1];
    if ((m = l.match(/mixing beta\s*=\s*([\d.]+)/))) P.mixing_beta = parseFloat(m[1]);
    if ((m = l.match(/number of iterations used\s*=\s*(\d+)\s+(\w+)\s+mixing/))) { P.mixing_ndim = parseInt(m[1]); P.mixing_mode = m[2].toLowerCase(); }
    if ((m = l.match(/energy convergence thresh\.\s*=\s*([\d.E\-+]+)/i))) P.etot_conv_thr = m[1];
    if ((m = l.match(/force convergence thresh\.\s*=\s*([\d.E\-+]+)/i))) P.forc_conv_thr = m[1];
    if ((m = l.match(/nstep\s*=\s*(\d+)/))) P.nstep = parseInt(m[1]);
  }

  P.occupations = 'smearing'; P.smearing = 'gaussian'; P.degauss = null;
  for (const l of lines) {
    let m;
    if ((m = l.match(/Gaussian smearing.*width.*=\s*([\d.E\-+]+)/i))) { P.degauss = parseFloat(m[1]); P.smearing = 'gaussian'; }
    if ((m = l.match(/Methfessel-Paxton.*width\s*([\d.E\-+]+)/i)))      { P.degauss = parseFloat(m[1]); P.smearing = 'mp'; }
    if ((m = l.match(/Marzari-Vanderbilt.*width\s*([\d.E\-+]+)/i)))     { P.degauss = parseFloat(m[1]); P.smearing = 'mv'; }
    if ((m = l.match(/Fermi-Dirac.*width\s*([\d.E\-+]+)/i)))            { P.degauss = parseFloat(m[1]); P.smearing = 'fd'; }
  }

  P.nspin = 1;
  if (/Starting magnetic structure/i.test(text)) P.nspin = 2;
  if (/non-collinear/i.test(text)) P.nspin = 4;
  P.nosym = /No symmetry found/i.test(text);
  P.vdw_corr = null;
  if (/DFT-D3/i.test(text))   P.vdw_corr = "'dft-d3'";
  else if (/DFT-D2/i.test(text)) P.vdw_corr = "'dft-d'";
  else if (/Tkatchenko/i.test(text)) P.vdw_corr = "'ts-vdw'";

  P.calcType = 'relax'; P.isVCRelax = false;
  if (/calculation\s*=\s*['"]?\s*vc-relax/i.test(text)) { P.calcType = 'vc-relax'; P.isVCRelax = true; }
  if (!P.isVCRelax && /^\s*CELL_PARAMETERS\s*[\(\{]/im.test(text)) { P.calcType = 'vc-relax'; P.isVCRelax = true; }

  P.species = []; let inST = false;
  for (const l of lines) {
    if (/atomic species\s+valence\s+mass\s+pseudopotential/i.test(l)) { inST = true; continue; }
    if (inST) {
      if (/^\s*$/.test(l) || /Starting magnetic/i.test(l)) { inST = false; continue; }
      const m = l.match(/^\s*(\S+)\s+([\d.]+)\s+([\d.]+)\s+(\S+)\s*\(/);
      if (m) P.species.push({ name: m[1], mass: parseFloat(m[3]), pseudo: m[4] });
    }
  }

  P.pseudo_dir = './pseudo/';
  for (let i = 0; i < lines.length; i++) {
    if (/read from file/i.test(lines[i])) {
      const nl = (lines[i+1] || lines[i]).trim();
      const m = nl.match(/^(.+\/)([^\/]+\.UPF)$/i);
      if (m) { P.pseudo_dir = m[1]; break; }
      const m2 = lines[i].match(/(\/[^\s]+\/)([A-Z][a-z]?[^\s\/]+\.UPF)/i);
      if (m2) { P.pseudo_dir = m2[1]; break; }
    }
  }

  P.kmode = 'gamma'; P.kpoints = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/number of k points=\s*(\d+)/);
    if (m) {
      P.nk = parseInt(m[1]);
      if (P.nk === 1) { P.kmode = 'gamma'; }
      else {
        P.kmode = 'crystal';
        for (let j = i+1; j < Math.min(i+2+P.nk, lines.length); j++) {
          const km = lines[j].match(/k\(\s*\d+\s*\)\s*=\s*\(\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\),\s*wk\s*=\s*([\d.]+)/);
          if (km) P.kpoints.push({ x: parseFloat(km[1]), y: parseFloat(km[2]), z: parseFloat(km[3]), wk: parseFloat(km[4]) });
        }
      }
      break;
    }
  }

  P.initVecs = null;
  for (let i = 0; i < lines.length; i++) {
    if (/crystal axes.*units of alat/i.test(lines[i])) {
      const vecs = [];
      for (let j = i+1; j < Math.min(i+6, lines.length); j++) {
        const m = lines[j].match(/a\(\d\)\s*=\s*\(\s*([-\d.Ee+]+)\s+([-\d.Ee+]+)\s+([-\d.Ee+]+)\s*\)/);
        if (m) vecs.push([parseFloat(m[1])*P.alatAng, parseFloat(m[2])*P.alatAng, parseFloat(m[3])*P.alatAng]);
        if (vecs.length === 3) break;
      }
      if (vecs.length === 3) { P.initVecs = vecs; break; }
    }
  }

  P.initAtoms = [];
  for (let i = 0; i < lines.length; i++) {
    if (/site n\..*positions.*alat units/i.test(lines[i])) {
      for (let j = i+1; j < lines.length; j++) {
        const m = lines[j].match(/\d+\s+([A-Za-z]+)\s+tau\s*\(\s*\d+\s*\)\s*=\s*\(\s*([-\d.Ee+]+)\s+([-\d.Ee+]+)\s+([-\d.Ee+]+)\s*\)/);
        if (m) P.initAtoms.push({ elem: m[1], x: parseFloat(m[2])*P.alatAng, y: parseFloat(m[3])*P.alatAng, z: parseFloat(m[4])*P.alatAng });
        else if (P.initAtoms.length > 0 && /^\s*$/.test(lines[j])) break;
        else if (P.initAtoms.length > 0 && !/^\s+\d+\s/.test(lines[j])) break;
      }
      if (P.initAtoms.length > 0) break;
    }
  }

  P.isRelaxed = false; P.finalVecs = null; P.finalAtoms = null; P.finalAtomUnit = 'angstrom'; P.nSteps = 0;
  for (const l of lines) { if (/bfgs converged in/i.test(l) || /number of scf cycles/i.test(l)) P.nSteps++; }

  let bfc = -1, efc = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/Begin final coordinates/i.test(lines[i])) bfc = i;
    if (/End final coordinates/i.test(lines[i]))   efc = i;
  }

  if (bfc >= 0) {
    P.isRelaxed = true;
    const block = lines.slice(bfc, efc > bfc ? efc : lines.length);
    for (let i = 0; i < block.length; i++) {
      if (/^\s*CELL_PARAMETERS/i.test(block[i])) {
        const sc = cellParamScale(block[i], P.alatAng); const vecs = [];
        for (let j = i+1; j < Math.min(i+6, block.length); j++) {
          const m = block[j].match(/^\s*([-\d.Ee+]+)\s+([-\d.Ee+]+)\s+([-\d.Ee+]+)/);
          if (m) vecs.push([parseFloat(m[1])*sc, parseFloat(m[2])*sc, parseFloat(m[3])*sc]);
          if (vecs.length === 3) break;
        }
        if (vecs.length === 3) P.finalVecs = vecs;
      }
      if (/^\s*ATOMIC_POSITIONS/i.test(block[i])) {
        const { scale: asc, isCrystal } = atomPosUnit(block[i], P.alatAng);
        P.finalAtomUnit = isCrystal ? 'crystal' : 'angstrom'; P.finalAtoms = [];
        for (let j = i+1; j < block.length; j++) {
          const am = block[j].match(/^\s*([A-Za-z]+[0-9]*)\s+([-\d.Ee+]+)\s+([-\d.Ee+]+)\s+([-\d.Ee+]+)/);
          if (am) P.finalAtoms.push({ elem: am[1].replace(/\d+$/, ''), x: parseFloat(am[2])*asc, y: parseFloat(am[3])*asc, z: parseFloat(am[4])*asc });
          else if (P.finalAtoms.length > 0 && !/^\s*[-\d]/.test(block[j])) break;
        }
      }
    }
  }

  // Fallbacks
  if (!P.finalAtoms) {
    let lastAP = -1;
    for (let i = 0; i < lines.length; i++) if (/^\s*ATOMIC_POSITIONS/i.test(lines[i])) lastAP = i;
    if (lastAP >= 0) {
      const { scale: asc, isCrystal } = atomPosUnit(lines[lastAP], P.alatAng);
      P.finalAtomUnit = isCrystal ? 'crystal' : 'angstrom'; P.finalAtoms = [];
      for (let j = lastAP+1; j < lines.length; j++) {
        const am = lines[j].match(/^\s*([A-Za-z]+[0-9]*)\s+([-\d.Ee+]+)\s+([-\d.Ee+]+)\s+([-\d.Ee+]+)/);
        if (am) P.finalAtoms.push({ elem: am[1].replace(/\d+$/, ''), x: parseFloat(am[2])*asc, y: parseFloat(am[3])*asc, z: parseFloat(am[4])*asc });
        else if (P.finalAtoms.length > 0 && !/^\s*[-\d]/.test(lines[j])) break;
      }
    }
  }
  if (P.isVCRelax && !P.finalVecs) {
    let lastCP = -1;
    for (let i = 0; i < lines.length; i++) if (/^\s*CELL_PARAMETERS/i.test(lines[i])) lastCP = i;
    if (lastCP >= 0) {
      const sc = cellParamScale(lines[lastCP], P.alatAng); const vecs = [];
      for (let j = lastCP+1; j < Math.min(lastCP+6, lines.length); j++) {
        const m = lines[j].match(/^\s*([-\d.Ee+]+)\s+([-\d.Ee+]+)\s+([-\d.Ee+]+)/);
        if (m) vecs.push([parseFloat(m[1])*sc, parseFloat(m[2])*sc, parseFloat(m[3])*sc]);
        if (vecs.length === 3) break;
      }
      if (vecs.length === 3) P.finalVecs = vecs;
    }
  }
  return P;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODE A: COMBINE — surgically patch the original .in file
// ═══════════════════════════════════════════════════════════════════════════════
function parseOriginalIn(text) {
  const lines = text.split('\n');
  const info = { ibrav: null, cellStyle: 'celldm', hasCellCard: false };
  for (const l of lines) {
    const mi = l.match(/\bibrav\s*=\s*([-\d]+)/i);
    if (mi) info.ibrav = parseInt(mi[1]);
    if (/^\s*[Aa]\s*=/.test(l)) info.cellStyle = 'ABC';
    if (/^\s*CELL_PARAMETERS/i.test(l)) info.hasCellCard = true;
  }
  if (info.ibrav === 0) info.hasCellCard = true;
  return info;
}

export function patchInputFile(originalIn, P) {
  const fN = (n, d = 10) => { const s = n.toFixed(d); return n >= 0 ? ' ' + s : s; };
  const inLines = originalIn.split('\n');
  const out = [];
  let i = 0;
  const changes = { atoms: false, cell: false, atomUnit: 'angstrom', cellMethod: '' };

  const inInfo = parseOriginalIn(originalIn);
  const ibrav  = inInfo.ibrav;
  let lat = null;
  if (P.finalVecs) lat = vecsToLattice(...P.finalVecs);

  function relevantCelldm(ibr) {
    if (ibr === null) return [];
    ibr = Math.abs(ibr);
    if (ibr === 0)  return [];
    if (ibr <= 3)   return [1];
    if (ibr === 4)  return [1, 3];
    if (ibr === 5)  return [1, 4];
    if (ibr === 6)  return [1, 3];
    if (ibr === 7)  return [1, 3];
    if (ibr <= 11)  return [1, 2, 3];
    if (ibr <= 13)  return [1, 2, 3, 4];
    if (ibr === 14) return [1, 2, 3, 4, 5, 6];
    return [1, 2, 3];
  }

  function newCelldmVal(k, ibr, lat) {
    if (!lat) return null;
    ibr = Math.abs(ibr || 0);
    if (k === 1) return lat.aB;
    if (k === 2) return lat.bA;
    if (k === 3) return lat.cA;
    if (k === 4) return (ibr === 12 || ibr === 13) ? lat.cosAB : lat.cosBC;
    if (k === 5) return lat.cosAC;
    if (k === 6) return lat.cosAB;
    return null;
  }

  function newABCVal(key, lat) {
    if (!lat) return null;
    const k = key.trim().toLowerCase();
    if (k === 'a') return lat.a;
    if (k === 'b') return lat.b;
    if (k === 'c') return lat.c;
    if (k === 'cosab') return lat.cosAB;
    if (k === 'cosac') return lat.cosAC;
    if (k === 'cosbc') return lat.cosBC;
    return null;
  }

  const relevant = relevantCelldm(ibrav);
  let inSystemNL = false;

  while (i < inLines.length) {
    const l = inLines[i];

    if (/^\s*&SYSTEM\b/i.test(l)) inSystemNL = true;
    if (inSystemNL && /^\s*\/\s*$/.test(l)) inSystemNL = false;

    // ── ibrav≠0, vc-relax: update celldm or A/B/C ──
    if (P.isVCRelax && P.finalVecs && ibrav !== 0 && inSystemNL && lat) {
      const mCD = l.match(/^(\s*celldm\s*\(\s*)(\d)(\s*\)\s*=\s*)([\d.Ee+\-]+)(.*)/i);
      if (mCD) {
        const k = parseInt(mCD[2]);
        if (relevant.includes(k)) {
          const nv = newCelldmVal(k, ibrav, lat);
          if (nv !== null) { out.push(`${mCD[1]}${k}${mCD[3]}${nv.toFixed(9)}${mCD[5]}`); changes.cell = true; changes.cellMethod = 'celldm'; i++; continue; }
        }
        out.push(l); i++; continue;
      }

      const mABC = l.match(/^(\s*)([A-Za-z]+)(\s*=\s*)([\d.Ee+\-]+)(.*)/);
      if (mABC && /^(A|B|C|cosAB|cosAC|cosBC)$/i.test(mABC[2])) {
        const nv = newABCVal(mABC[2], lat);
        if (nv !== null) { out.push(`${mABC[1]}${mABC[2]}${mABC[3]}${nv.toFixed(9)}${mABC[5]}`); changes.cell = true; changes.cellMethod = 'ABC'; i++; continue; }
      }
    }

    // ── ibrav=0, vc-relax: replace CELL_PARAMETERS card ──
    if (/^\s*CELL_PARAMETERS/i.test(l) && P.isVCRelax && P.finalVecs && ibrav === 0) {
      out.push('CELL_PARAMETERS (angstrom)');
      for (const v of P.finalVecs) out.push(`   ${fN(v[0])}  ${fN(v[1])}  ${fN(v[2])}`);
      changes.cell = true; changes.cellMethod = 'card';
      i++;
      let skipped = 0;
      while (i < inLines.length && skipped < 3) {
        if (/^\s*([-\d.Ee+]+)\s+([-\d.Ee+]+)\s+([-\d.Ee+]+)/.test(inLines[i])) { skipped++; i++; }
        else break;
      }
      continue;
    }

    // ── Replace ATOMIC_POSITIONS block ──
    if (/^\s*ATOMIC_POSITIONS/i.test(l) && P.finalAtoms) {
      const unitTag = P.finalAtomUnit === 'crystal' ? '{crystal}' : '{angstrom}';
      out.push(`ATOMIC_POSITIONS ${unitTag}`);
      for (const at of P.finalAtoms) out.push(`${at.elem.padEnd(3)} ${fN(at.x)}  ${fN(at.y)}  ${fN(at.z)}`);
      changes.atoms = true; changes.atomUnit = P.finalAtomUnit;
      i++;
      while (i < inLines.length) {
        if (/^\s*[A-Za-z][a-z]?\s+([-\d.Ee+]+)\s+([-\d.Ee+]+)\s+([-\d.Ee+]+)/.test(inLines[i])) i++;
        else break;
      }
      continue;
    }

    out.push(l);
    i++;
  }
  return { text: out.join('\n'), changes, ibrav, inInfo };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODE B: RECONSTRUCT — build .in from scratch
// ═══════════════════════════════════════════════════════════════════════════════
export function buildIN(P, useInitial) {
  const atoms   = useInitial ? P.initAtoms  : (P.finalAtoms  || P.initAtoms);
  const vecs    = useInitial ? P.initVecs   : (P.finalVecs   || P.initVecs);
  const atomTag = useInitial ? 'angstrom'   : (P.finalAtomUnit || 'angstrom');
  const L = [];
  const fN = (n, d = 10) => { const s = n.toFixed(d); return n >= 0 ? ' ' + s : s; };
  const needIbrav0 = (P.isVCRelax && !useInitial) || P.ibrav === 0;

  L.push('&CONTROL');
  L.push(`  calculation   = '${P.calcType}',`);
  L.push(`  restart_mode  = 'from_scratch',`);
  L.push(`  prefix        = 'pwscf',`);
  L.push(`  outdir        = './out/',`);
  L.push(`  pseudo_dir    = '${P.pseudo_dir}',`);
  L.push(`  tprnfor       = .true.,`);
  L.push(`  tstress       = ${P.isVCRelax ? '.true.,' : '.false.,'}`);
  if (P.etot_conv_thr) L.push(`  etot_conv_thr = ${P.etot_conv_thr},`);
  if (P.forc_conv_thr) L.push(`  forc_conv_thr = ${P.forc_conv_thr},`);
  if (P.nstep)         L.push(`  nstep         = ${P.nstep},`);
  L.push('/\n');

  L.push('&SYSTEM');
  if (needIbrav0) {
    L.push(`  ibrav         = 0,`);
  } else {
    L.push(`  ibrav         = ${P.ibrav ?? 0},`);
    for (let i = 1; i <= 6; i++) if (P.celldm[i] && Math.abs(P.celldm[i]) > 1e-8) L.push(`  celldm(${i})     = ${P.celldm[i].toFixed(6)},`);
  }
  L.push(`  nat           = ${atoms ? atoms.length : (P.nat || 0)},`);
  L.push(`  ntyp          = ${P.ntyp ?? P.species.length},`);
  L.push(`  ecutwfc       = ${P.ecutwfc ?? 40},`);
  if (P.ecutrho && P.ecutrho !== (P.ecutwfc || 40) * 4) L.push(`  ecutrho       = ${P.ecutrho},`);
  if (P.nspin && P.nspin > 1) L.push(`  nspin         = ${P.nspin},`);
  if (P.nspin === 2) for (const sp of P.species) L.push(`  starting_magnetization(${P.species.indexOf(sp)+1}) = 0.0,`);
  if (P.nosym)       L.push(`  nosym         = .true.,`);
  if (P.occupations) L.push(`  occupations   = '${P.occupations}',`);
  if (P.smearing)    L.push(`  smearing      = '${P.smearing}',`);
  if (P.degauss)     L.push(`  degauss       = ${P.degauss},`);
  if (P.vdw_corr)    L.push(`  vdw_corr      = ${P.vdw_corr},`);
  L.push('/\n');

  L.push('&ELECTRONS');
  if (P.conv_thr)    L.push(`  conv_thr      = ${P.conv_thr},`);
  if (P.mixing_beta) L.push(`  mixing_beta   = ${P.mixing_beta},`);
  if (P.mixing_ndim) L.push(`  mixing_ndim   = ${P.mixing_ndim},`);
  if (P.mixing_mode && P.mixing_mode !== 'plain') L.push(`  mixing_mode   = '${P.mixing_mode}',`);
  L.push('/\n');

  if (P.calcType === 'relax' || P.calcType === 'vc-relax') { L.push('&IONS'); L.push(`  ion_dynamics  = 'bfgs',`); L.push('/\n'); }
  if (P.calcType === 'vc-relax') { L.push('&CELL'); L.push(`  cell_dynamics = 'bfgs',`); L.push('/\n'); }

  L.push('ATOMIC_SPECIES');
  for (const sp of P.species) L.push(`  ${sp.name.padEnd(4)} ${sp.mass.toFixed(5)}   ${sp.pseudo}`);
  L.push('');

  if (needIbrav0 && vecs) {
    L.push('CELL_PARAMETERS (angstrom)');
    for (const v of vecs) L.push(`  ${fN(v[0])}  ${fN(v[1])}  ${fN(v[2])}`);
    L.push('');
  }

  if (P.kmode === 'gamma') { L.push('K_POINTS gamma'); }
  else if (P.kpoints && P.kpoints.length > 0) {
    L.push('K_POINTS crystal'); L.push(`${P.kpoints.length}`);
    for (const k of P.kpoints) L.push(`  ${k.x.toFixed(7)}  ${k.y.toFixed(7)}  ${k.z.toFixed(7)}  ${k.wk.toFixed(7)}`);
  } else { L.push('K_POINTS automatic\n  1 1 1  0 0 0'); }
  L.push('');

  L.push(`ATOMIC_POSITIONS {${atomTag}}`);
  if (atoms) for (const at of atoms) L.push(`${at.elem.padEnd(3)} ${fN(at.x)}  ${fN(at.y)}  ${fN(at.z)}`);
  L.push('');
  return L.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYNTAX HIGHLIGHTER
// ═══════════════════════════════════════════════════════════════════════════════
function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

export function hlCode(code) {
  return code.split('\n').map(line => {
    const e = escHtml(line);
    if (/^\s*!/.test(line)) return `<span class="if-sy-com">${e}</span>`;
    if (/^\s*&[A-Z]/i.test(line)) return `<span class="if-sy-nl">${e}</span>`;
    if (/^\s*\/\s*$/.test(line)) return `<span class="if-sy-sl">${e}</span>`;
    if (/^\s*(ATOMIC_SPECIES|ATOMIC_POSITIONS|K_POINTS|CELL_PARAMETERS)\b/i.test(line)) return `<span class="if-sy-card">${e}</span>`;
    const am = line.match(/^(\s*)([A-Za-z][a-z]?)(\s+[-\d. ]+)$/);
    if (am) { const nums = escHtml(am[3]).replace(/([-\d.Ee+]+)/g, '<span class="if-sy-num">$1</span>'); return `${am[1]}<span class="if-sy-elem">${am[2]}</span>${nums}`; }
    if (/^\s*[-\d.]/.test(line)) return e.replace(/([-\d.Ee+]+)/g, '<span class="if-sy-num">$1</span>');
    if (/^\s*\w[\w_()\d]*\s*=/.test(line)) return e.replace(/^(\s*)([\w_()\d]+)(\s*=\s*)(.+)$/, '$1<span class="if-sy-kw">$2</span>$3<span class="if-sy-val">$4</span>');
    return e;
  }).join('\n');
}

export function hlDiff(oldTxt, newTxt) {
  const oldSet = new Set(oldTxt.split('\n').map(l => l.trim()));
  return newTxt.split('\n').map(line => {
    const trimmed = line.trim();
    const hlLine = hlCode(line);
    const isStruct = /^\s*[A-Za-z][a-z]?\s+[-\d]/.test(line) || /^\s*[-\d.]+\s+[-\d.]+\s+[-\d.]/.test(line);
    if (isStruct && trimmed && !oldSet.has(trimmed)) return `<span class="if-diff-changed">${hlLine}</span>`;
    return hlLine;
  }).join('\n');
}
