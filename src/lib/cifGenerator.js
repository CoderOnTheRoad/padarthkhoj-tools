import { parseCIF as parseExpandedCIF } from './cifParser.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CIF Generator — Core Logic Library
// Standalone, no external state dependencies.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── CIF Parser ──────────────────────────────────────────────────────────────
/**
 * Parse a CIF file text into a structured object.
 * Returns { atoms, rawLines, loopStart, dataStart, colOrder, cols, coordType, cell, lattMat }
 *
 * Every atom gets cx/cy/cz = Cartesian Angstroms.
 * For fractional-coordinate CIFs (the common case) these are computed from the
 * cell parameters (_cell_length_a/b/c and _cell_angle_alpha/beta/gamma).
 */
export function parseCIF(text) {
  const lines    = text.split('\n');
  const atoms    = [];
  const rawLines = lines.slice();

  // ── 1. Extract cell parameters ──────────────────────────────────────────
  const cell = { a: 10, b: 10, c: 10, alpha: 90, beta: 90, gamma: 90 };

  const stripSU = s => String(s).replace(/\(.*?\)/, '');

  for (const line of lines) {
    const t = line.trim();
    const tryExtract = (keyword, prop) => {
      const re = new RegExp(`^${keyword}\\s+(.+)$`, 'i');
      const m  = t.match(re);
      if (m) {
        const v = parseFloat(stripSU(m[1].trim()));
        if (!isNaN(v)) cell[prop] = v;
      }
    };
    tryExtract('_cell_length_a',   'a');
    tryExtract('_cell_length_b',   'b');
    tryExtract('_cell_length_c',   'c');
    tryExtract('_cell_angle_alpha','alpha');
    tryExtract('_cell_angle_beta', 'beta');
    tryExtract('_cell_angle_gamma','gamma');
  }

  // ── 2. Build fractional → Cartesian lattice matrix ──────────────────────
  // Convention:  a-vec along x,  b-vec in xy-plane,  c-vec general
  const toRad = d => d * Math.PI / 180;
  const { a, b, c } = cell;
  const ca = Math.cos(toRad(cell.alpha));
  const cb = Math.cos(toRad(cell.beta));
  const cg = Math.cos(toRad(cell.gamma));
  const sg = Math.sin(toRad(cell.gamma));
  const cv = (ca - cb * cg) / Math.max(sg, 1e-10);
  const cw = Math.sqrt(Math.max(0, 1 - cb * cb - cv * cv));

  // Each column of lattMat is one lattice vector in Cartesian:
  //   M[:,0] = a-vec,  M[:,1] = b-vec,  M[:,2] = c-vec
  const lattMat = [
    [a,  b * cg,  c * cb],
    [0,  b * sg,  c * cv],
    [0,  0,       c * cw],
  ];

  const fractToCart = (xf, yf, zf) => ({
    cx: lattMat[0][0] * xf + lattMat[0][1] * yf + lattMat[0][2] * zf,
    cy: lattMat[1][0] * xf + lattMat[1][1] * yf + lattMat[1][2] * zf,
    cz: lattMat[2][0] * xf + lattMat[2][1] * yf + lattMat[2][2] * zf,
  });

  // ── 3. Find the atom_site loop ───────────────────────────────────────────
  let loopStart = -1;
  let cols      = {};
  let colOrder  = [];
  let dataStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.toLowerCase() !== 'loop_') continue;

    const tmpCols  = {};
    const tmpOrder = [];
    let j = i + 1;
    while (j < lines.length) {
      const lt = lines[j].trim();
      if (lt.startsWith('_')) {
        tmpCols[lt.toLowerCase()] = tmpOrder.length;
        tmpOrder.push(lt.toLowerCase());
        j++;
      } else { break; }
    }
    const hasLabel = Object.keys(tmpCols).some(k => k.includes('_atom_site_label') || k.includes('_atom_site_type'));
    const hasX     = Object.keys(tmpCols).some(k => k.includes('_atom_site_fract_x') || k.includes('_atom_site_cartn_x') || k.includes('_atom_site_x'));
    if (hasLabel && hasX) {
      cols = tmpCols; colOrder = tmpOrder; loopStart = i; dataStart = j;
      break;
    }
  }

  // ── 4. Parse atom rows ────────────────────────────────────────────────────
  const findCol = (...keys) => {
    for (const key of keys)
      for (const col of colOrder)
        if (col.includes(key)) return cols[col];
    return -1;
  };

  const idxLabel = findCol('_atom_site_label');
  const idxType  = findCol('_atom_site_type_symbol', '_atom_site_type');
  const idxX     = findCol('_atom_site_fract_x', '_atom_site_cartn_x', '_atom_site_x');
  const idxY     = findCol('_atom_site_fract_y', '_atom_site_cartn_y', '_atom_site_y');
  const idxZ     = findCol('_atom_site_fract_z', '_atom_site_cartn_z', '_atom_site_z');
  const isFract  = colOrder.some(c => c.includes('fract'));

  if (dataStart >= 0 && colOrder.length > 0) {
    for (let i = dataStart; i < lines.length; i++) {
      const t = lines[i].trim();
      if (!t || t.startsWith('#') || t.startsWith('_') || t.toLowerCase() === 'loop_') break;

      const tokens = tokenizeCIFLine(t);
      if (tokens.length < colOrder.length) continue;

      const label   = idxLabel >= 0 ? tokens[idxLabel] : `A${atoms.length + 1}`;
      const typeRaw = idxType  >= 0 ? tokens[idxType]  : label.replace(/[0-9+\-]/g, '');
      const xRaw    = idxX    >= 0 ? tokens[idxX]     : '0';
      const yRaw    = idxY    >= 0 ? tokens[idxY]     : '0';
      const zRaw    = idxZ    >= 0 ? tokens[idxZ]     : '0';

      const xf = parseFloat(stripSU(xRaw)) || 0;
      const yf = parseFloat(stripSU(yRaw)) || 0;
      const zf = parseFloat(stripSU(zRaw)) || 0;

      const cartPos = isFract ? fractToCart(xf, yf, zf) : { cx: xf, cy: yf, cz: zf };

      atoms.push({
        id:        atoms.length,
        label,
        element:   cleanElement(typeRaw || label),
        x:         stripSU(xRaw),
        y:         stripSU(yRaw),
        z:         stripSU(zRaw),
        cx:        cartPos.cx,   // Cartesian Å — used for 3D rendering
        cy:        cartPos.cy,
        cz:        cartPos.cz,
        rawTokens: tokens,
        lineIndex: i,
      });
    }
  }

  const coordType = isFract ? 'fractional' : 'cartesian';
  if(isFract){
    const expanded=parseExpandedCIF(text);
    if(expanded?.atoms?.length){
      const sourceAtoms=atoms.slice();
      const completeAtoms=expanded.atoms.map((atom,index)=>{
        const source=sourceAtoms[atom.sourceSiteIndex]||sourceAtoms[0];
        return {id:index,label:atom.label,element:atom.sym,x:atom.fx,y:atom.fy,z:atom.fz,cx:atom.x,cy:atom.y,cz:atom.z,occupancy:atom.occupancy,sourceSiteIndex:atom.sourceSiteIndex,symmetryOperationIndex:atom.symmetryOperationIndex,symmetryGenerated:atom.symmetryGenerated,rawTokens:source?.rawTokens||[],lineIndex:source?.lineIndex??-1};
      });
      return {atoms:completeAtoms,rawLines,loopStart,dataStart,colOrder,cols,coordType,cell,lattMat,symmetryOperationCount:expanded.symmetryOperationCount,asymmetricAtomCount:expanded.asymmetricAtomCount};
    }
  }
  return {atoms,rawLines,loopStart,dataStart,colOrder,cols,coordType,cell,lattMat,symmetryOperationCount:1,asymmetricAtomCount:atoms.length};
}

function tokenizeCIFLine(line) {
  const tokens = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === ' ' || line[i] === '\t') { i++; continue; }
    if (line[i] === "'") {
      let j = i + 1;
      while (j < line.length && line[j] !== "'") j++;
      tokens.push(line.slice(i + 1, j));
      i = j + 1;
    } else if (line[i] === '"') {
      let j = i + 1;
      while (j < line.length && line[j] !== '"') j++;
      tokens.push(line.slice(i + 1, j));
      i = j + 1;
    } else {
      let j = i;
      while (j < line.length && line[j] !== ' ' && line[j] !== '\t') j++;
      tokens.push(line.slice(i, j));
      i = j;
    }
  }
  return tokens;
}

function cleanElement(s) {
  const m = s.match(/^([A-Z][a-z]?)/);
  return m ? m[1] : s;
}

// ─── Combination Engine ──────────────────────────────────────────────────────
/**
 * Generate Cartesian product of substitution sets.
 */
export function generateCombinations(configs) {
  const active = configs.filter(c => c.substitutions && c.substitutions.length > 0);
  if (!active.length) return [];

  const product = (sets) => {
    if (!sets.length) return [[]];
    const [first, ...rest] = sets;
    const restProd = product(rest);
    return first.flatMap(item => restProd.map(r => [item, ...r]));
  };

  const sets = active.map(c => c.substitutions.map(elem => ({ atomId: c.atomId, element: elem })));
  return product(sets);
}

export function countCombinations(configs) {
  const active = configs.filter(c => c.substitutions && c.substitutions.length > 0);
  if (!active.length) return 0;
  return active.reduce((acc, c) => acc * c.substitutions.length, 1);
}

// ─── CIF Serialiser ──────────────────────────────────────────────────────────
/**
 * Apply a combination to parsed CIF data and produce a new CIF string.
 */
export function applyCombination(parsed, combo, sourceName) {
  const subs     = new Map(combo.map(c => [c.atomId, c.element]));
  const newLines = parsed.rawLines.slice();

  for (const atom of parsed.atoms) {
    if (!subs.has(atom.id)) continue;
    const newElem = subs.get(atom.id);
    const oldLine = newLines[atom.lineIndex];
    if (!oldLine) continue;

    const tokens   = tokenizeCIFLine(oldLine.trim());
    const idxLabel = findColIdx(parsed.colOrder, '_atom_site_label');
    const idxType  = findColIdx(parsed.colOrder, '_atom_site_type_symbol', '_atom_site_type');

    if (idxType  >= 0 && tokens[idxType]  !== undefined) tokens[idxType]  = newElem;
    if (idxLabel >= 0 && tokens[idxLabel] !== undefined) tokens[idxLabel] = tokens[idxLabel].replace(/^[A-Z][a-z]?/, newElem);

    newLines[atom.lineIndex] = '  ' + tokens.join('   ');
  }

  const commentHeader = [
    `# Generated by QE Studio — Multiple CIF Generator`,
    `# Source: ${sourceName}`,
    `# Substitutions: ${combo.map(c => `atom${c.atomId}\u2192${c.element}`).join(', ')}`,
    '',
  ].join('\n');

  return commentHeader + newLines.join('\n');
}

function findColIdx(colOrder, ...keys) {
  for (const key of keys) {
    if (colOrder.includes(key.toLowerCase())) return colOrder.indexOf(key.toLowerCase());
  }
  for (const key of keys) {
    const kl = key.toLowerCase().replace(/^_/, '');
    for (let i = 0; i < colOrder.length; i++) {
      if (colOrder[i].includes(kl)) return i;
    }
  }
  return -1;
}

// ─── File Naming ─────────────────────────────────────────────────────────────
export function buildFilename(index, combo, atoms, baseName) {
  const base = baseName.replace(/\.cif$/i, '');
  const subs = combo.map(c => c.element).join('_');
  return `${base}_${index + 1}_${subs}.cif`;
}

// ─── ZIP Exporter ─────────────────────────────────────────────────────────────
export async function exportZIP(files, zipName = 'qe_structures.zip') {
  let JSZip;
  try {
    JSZip = (await import('jszip')).default;
  } catch {
    throw new Error('JSZip not available — run: npm install jszip');
  }
  const zip = new JSZip();
  for (const { name, content } of files) zip.file(name, content);
  const blob = await zip.generateAsync({ type: 'blob' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = zipName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

// ─── Element catalogue ────────────────────────────────────────────────────────
export const COMMON_ELEMENTS = [
  'H','He','Li','Be','B','C','N','O','F','Ne',
  'Na','Mg','Al','Si','P','S','Cl','Ar',
  'K','Ca','Sc','Ti','V','Cr','Mn','Fe','Co','Ni','Cu','Zn',
  'Ga','Ge','As','Se','Br','Kr',
  'Rb','Sr','Y','Zr','Nb','Mo','Tc','Ru','Rh','Pd','Ag','Cd',
  'In','Sn','Sb','Te','I','Xe',
  'Cs','Ba','La','Ce','Pr','Nd','Sm','Eu','Gd','Tb','Dy','Ho','Er','Tm','Yb','Lu',
  'Hf','Ta','W','Re','Os','Ir','Pt','Au','Hg','Tl','Pb','Bi',
];
