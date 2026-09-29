import { parseCIFSymmetry } from './cifSymmetry.js';

export function parseCIF(text) {
  // Attach full symmetry/ibrav data (accessible as result.symmetry)
  let _symmetry = null;
  try { _symmetry = parseCIFSymmetry(text); } catch { /* optional metadata */ }
  const lines = text.split(/\r?\n/);

  function getVal(key) {
    const k = key.toLowerCase();
    for(let j=0; j<lines.length; j++) {
      const l = lines[j].trim().toLowerCase();
      if(l.startsWith(k)) {
        const parts = lines[j].trim().split(/\s+/);
        if(parts.length > 1) return parts[1].replace(/[()]/g,'');
        if(j+1 < lines.length) return lines[j+1].trim().replace(/[()]/g,'');
      }
    }
    return null;
  }

  // ── Burai-style algebraic symmetry formula parser ────────────────────────
  // Mirrors CIFSymmetricFormula.java exactly:
  // Pattern: [+-]([0-9]+/[0-9]+|[0-9]+)?([xyz](/[0-9]+)?)?
  function parseSymFormula(formula) {
    let s = formula.trim();
    // Prepend '+' if no leading sign (mirrors Burai)
    if (s.charAt(0) !== '-' && s.charAt(0) !== '+') s = '+' + s;

    const re = /[+-]([0-9]+\/[0-9]+|[0-9]+)?([xyz](\/[0-9]+)?)?/gi;
    let xC = 0, yC = 0, zC = 0, ct = 0;
    let m;

    while ((m = re.exec(s)) !== null) {
      const term = m[0];
      const sign = term[0] === '-' ? -1 : 1;

      const varMatch = term.match(/[xyz]/i);
      const varPos   = varMatch ? term.toLowerCase().indexOf(varMatch[0].toLowerCase()) : -1;
      const beforeVar = varPos > 0 ? term.slice(1, varPos) : (varMatch ? '' : term.slice(1));
      const afterVar  = varMatch ? term.slice(varPos + 1) : '';

      let coeff;
      if (beforeVar === '' || beforeVar === undefined) {
        coeff = sign * 1.0;
      } else {
        const fracParts = beforeVar.split('/');
        if (fracParts.length === 2) {
          coeff = sign * parseInt(fracParts[0]) / parseInt(fracParts[1]);
        } else {
          const num = parseFloat(beforeVar);
          coeff = sign * (isNaN(num) ? 1.0 : num);
        }
      }

      // Handle /denom after variable letter (e.g. x/2)
      if (afterVar) {
        const denomMatch = afterVar.match(/^\/([0-9]+)$/);
        if (denomMatch) coeff /= parseInt(denomMatch[1]);
      }

      if (!varMatch)                          { ct += coeff; }
      else if (varMatch[0].toLowerCase() === 'x') { xC += coeff; }
      else if (varMatch[0].toLowerCase() === 'y') { yC += coeff; }
      else if (varMatch[0].toLowerCase() === 'z') { zC += coeff; }
    }
    return { xC, yC, zC, ct };
  }

  function applySymOp(op3, fx, fy, fz) {
    return [
      op3[0].xC*fx + op3[0].yC*fy + op3[0].zC*fz + op3[0].ct,
      op3[1].xC*fx + op3[1].yC*fy + op3[1].zC*fz + op3[1].ct,
      op3[2].xC*fx + op3[2].yC*fy + op3[2].zC*fz + op3[2].ct,
    ];
  }

  function wrapFrac(v) { return ((v % 1) + 1) % 1; }

  function fracToCart(mat, fx, fy, fz) {
    return [
      mat[0][0]*fx + mat[0][1]*fy + mat[0][2]*fz,
      mat[1][0]*fx + mat[1][1]*fy + mat[1][2]*fz,
      mat[2][0]*fx + mat[2][1]*fy + mat[2][2]*fz,
    ];
  }

  try {
    const a = parseFloat(getVal('_cell_length_a')) || 5;
    const b = parseFloat(getVal('_cell_length_b')) || 5;
    const c = parseFloat(getVal('_cell_length_c')) || 5;
    const alpha = (parseFloat(getVal('_cell_angle_alpha')) || 90) * Math.PI/180;
    const beta  = (parseFloat(getVal('_cell_angle_beta'))  || 90) * Math.PI/180;
    const gamma = (parseFloat(getVal('_cell_angle_gamma')) || 90) * Math.PI/180;
    const cell  = {a,b,c,alpha,beta,gamma};

    const cosg = Math.cos(gamma), sing = Math.sin(gamma);
    const cosb = Math.cos(beta);
    const cosa = Math.cos(alpha);
    const vol  = Math.sqrt(1 - cosa*cosa - cosb*cosb - cosg*cosg + 2*cosa*cosb*cosg);
    const mat  = [
      [a, b*cosg, c*cosb],
      [0, b*sing, c*(cosa - cosb*cosg)/sing],
      [0, 0,      c*vol/sing],
    ];

    // ── PASS 1: Parse all loop_ blocks ────────────────────────────────────
    const rawPrimAtoms = []; // {sym, fx, fy, fz, occ}
    const parsedOps    = []; // each is [{xC,yC,zC,ct}, {..}, {..}]
    let inLoop = false, headers = [];

    for(let j=0; j<lines.length; j++) {
      const l = lines[j].trim();
      if(l.toLowerCase() === 'loop_') { inLoop = true; headers = []; continue; }
      if(!inLoop) continue;

      if(l.startsWith('_')) {
        headers.push(l.toLowerCase().split(/\s+/)[0]);
        continue;
      }

      // ── Symmetry ops loop ──
      const symXYZCol1 = '_symmetry_equiv_pos_as_xyz';
      const symXYZCol2 = '_space_group_symop_operation_xyz';
      const isSymLoop  = headers.includes(symXYZCol1) || headers.includes(symXYZCol2);

      if(isSymLoop) {
        const col = headers.indexOf(symXYZCol1) >= 0
          ? headers.indexOf(symXYZCol1)
          : headers.indexOf(symXYZCol2);

        for(let k=j; k<lines.length; k++) {
          const row = lines[k].trim();
          if(!row || row.startsWith('_') || row.toLowerCase()==='loop_' || row.startsWith('#')) break;

          const quoted = row.match(/['"]([^'"]+)['"]/);
          const rowParts = row.replace(/['"]/g,'').trim().split(/\s+/);
          const opStr = quoted?.[1] || ((rowParts.length > 1 && col < rowParts.length)
            ? rowParts[col]
            : rowParts[0]);

          if(opStr && opStr.includes(',')) {
            const sub = opStr.split(',');
            if(sub.length >= 3) {
              parsedOps.push([
                parseSymFormula(sub[0]),
                parseSymFormula(sub[1]),
                parseSymFormula(sub[2]),
              ]);
            }
          }
          j = k;
        }
        inLoop = false; continue;
      }

      // ── Atom site loop ──
      if(headers.includes('_atom_site_fract_x')) {
        const colLabel  = headers.indexOf('_atom_site_label');
        const colSym    = headers.indexOf('_atom_site_type_symbol');
        const colFx     = headers.indexOf('_atom_site_fract_x');
        const colFy     = headers.indexOf('_atom_site_fract_y');
        const colFz     = headers.indexOf('_atom_site_fract_z');
        const colOcc    = headers.indexOf('_atom_site_occupancy');

        for(let k=j; k<lines.length; k++) {
          const row = lines[k].trim();
          if(!row || row.startsWith('_') || row.toLowerCase()==='loop_' || row.startsWith('#')) break;
          const parts = row.split(/\s+/);

          // Extract element symbol
          let sym = '';
          if(colSym >= 0 && parts[colSym]) {
            sym = parts[colSym];
          } else if(colLabel >= 0 && parts[colLabel]) {
            // e.g. "Cu2" → "Cu", "C1" → "C"
            const lm = parts[colLabel].match(/^([A-Z][a-z]?)/);
            sym = lm ? lm[1] : '';
          }
          if(!sym) { j = k; continue; }

          const fx  = colFx  >= 0 ? parseFloat(parts[colFx].replace(/[()]/g,''))  : NaN;
          const fy  = colFy  >= 0 ? parseFloat(parts[colFy].replace(/[()]/g,''))  : NaN;
          const fz  = colFz  >= 0 ? parseFloat(parts[colFz].replace(/[()]/g,''))  : NaN;
          const occ = colOcc >= 0 ? parseFloat(parts[colOcc].replace(/[()]/g,'')) : 1.0;
          if(isNaN(fx) || isNaN(fy) || isNaN(fz)) { j = k; continue; }

          const label = colLabel >= 0 && parts[colLabel] ? parts[colLabel].replace(/['"]/g,'') : `${sym}${rawPrimAtoms.length+1}`;
          rawPrimAtoms.push({ sym, label, fx, fy, fz, occ, sourceSiteIndex:rawPrimAtoms.length });
          j = k;
        }
        inLoop = false;
      }
    }

    if(!rawPrimAtoms.length) return null;

    // Always ensure identity op is present
    const identityOp = [parseSymFormula('x'), parseSymFormula('y'), parseSymFormula('z')];
    if(parsedOps.length === 0) parsedOps.push(identityOp);

    // ── PASS 2: Deduplicate primitive atoms (Burai RMIN = 1e-4 fractional) ─
    const RMIN_PRIM_SQ = 1e-4 * 1e-4;
    const keepFlags = new Array(rawPrimAtoms.length).fill(true);
    for(let i=0; i<rawPrimAtoms.length; i++) {
      if(!keepFlags[i]) continue;
      for(let j=i+1; j<rawPrimAtoms.length; j++) {
        if(!keepFlags[j]) continue;
        const ai = rawPrimAtoms[i], aj = rawPrimAtoms[j];
        const dx = aj.fx-ai.fx, dy = aj.fy-ai.fy, dz = aj.fz-ai.fz;
        if(dx*dx + dy*dy + dz*dz < RMIN_PRIM_SQ) {
          // Drop lower occupancy; if equal drop the later one
          if(aj.occ > ai.occ) keepFlags[i] = false;
          else                 keepFlags[j] = false;
        }
      }
    }
    const primAtoms = rawPrimAtoms.filter((_,i) => keepFlags[i]);

    // ── PASS 3: Apply sym ops + deduplicate in Cartesian (Burai R_MIN=1e-3 Å)
    const R_MIN_SQ = 1e-3 * 1e-3;
    const expandedAtoms = [];

    for(const base of primAtoms) {
      for(let operationIndex=0; operationIndex<parsedOps.length; operationIndex++) {
        const op=parsedOps[operationIndex];
        let [nfx, nfy, nfz] = applySymOp(op, base.fx, base.fy, base.fz);

        // Pack into cell [0, 1) — mirrors packAtomIntoCell
        nfx = wrapFrac(nfx);
        nfy = wrapFrac(nfy);
        nfz = wrapFrac(nfz);

        const [nx, ny, nz] = fracToCart(mat, nfx, nfy, nfz);

        // Burai: hasAtomAt checks Cartesian distance < R_MIN
        let dup = false;
        for(const ex of expandedAtoms) {
          const dx = nx-ex.x, dy = ny-ex.y, dz = nz-ex.z;
          if(dx*dx + dy*dy + dz*dz < R_MIN_SQ) { dup = true; break; }
        }

        if(!dup) {
          expandedAtoms.push({sym:base.sym,label:parsedOps.length>1?`${base.label}_${operationIndex+1}`:base.label,fx:nfx,fy:nfy,fz:nfz,x:nx,y:ny,z:nz,occupancy:base.occ,sourceSiteIndex:base.sourceSiteIndex,symmetryOperationIndex:operationIndex,symmetryGenerated:parsedOps.length>1});
        }
      }
    }

    return {cell, atoms: expandedAtoms, mat, symmetry: _symmetry, symmetryOperationCount:parsedOps.length, asymmetricAtomCount:primAtoms.length};
  } catch(e) { console.error('CIF parse error:', e); return null; }
}

export function exportCIF(state) {
  const {cell, atoms} = state.cifData;
  const {a,b,c,alpha,beta,gamma} = cell;
  const toDeg = v => (v * 180/Math.PI).toFixed(4);
  let out = `# CIF generated by QE Studio\n\ndata_structure\n\n`;
  out += `_cell_length_a   ${a.toFixed(6)}\n`;
  out += `_cell_length_b   ${b.toFixed(6)}\n`;
  out += `_cell_length_c   ${c.toFixed(6)}\n`;
  out += `_cell_angle_alpha ${toDeg(alpha)}\n`;
  out += `_cell_angle_beta  ${toDeg(beta)}\n`;
  out += `_cell_angle_gamma ${toDeg(gamma)}\n\n`;
  out += `loop_\n  _atom_site_label\n  _atom_site_type_symbol\n  _atom_site_fract_x\n  _atom_site_fract_y\n  _atom_site_fract_z\n`;
  atoms.forEach((a,i) => {
    out += `  ${(a.sym+i).padEnd(6)} ${a.sym.padEnd(4)} ${a.fx.toFixed(6)} ${a.fy.toFixed(6)} ${a.fz.toFixed(6)}\n`;
  });
  return out;
}
