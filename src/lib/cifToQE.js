// ─── Full CIF tokenizer / parser ──────────────────────────────────────────────
export function parseCIFFull(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const tokens = [];
  let inBlock = false, blockVal = '';

  for (const line of lines) {
    if (!inBlock && line.startsWith(';')) {
      inBlock = true;
      blockVal = line.slice(1) + '\n';
      continue;
    }
    if (inBlock) {
      if (line.startsWith(';')) {
        inBlock = false;
        tokens.push({ type: 'value', val: blockVal.trim() });
        blockVal = '';
      } else {
        blockVal += line + '\n';
      }
      continue;
    }
    const commentIdx = line.indexOf('#');
    const stripped = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
    const re = /'[^']*'|"[^"]*"|\S+/g;
    let m;
    while ((m = re.exec(stripped)) !== null) {
      const raw = m[0];
      if (raw.toLowerCase() === 'loop_') {
        tokens.push({ type: 'loop' });
      } else if (raw.startsWith('_')) {
        tokens.push({ type: 'key', val: raw.toLowerCase() });
      } else if (raw.startsWith("'") || raw.startsWith('"')) {
        tokens.push({ type: 'value', val: raw.slice(1, -1) });
      } else if (raw === '.' || raw === '?') {
        tokens.push({ type: 'value', val: null });
      } else {
        tokens.push({ type: 'value', val: raw });
      }
    }
  }

  const data = {};
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok.type === 'key') {
      i++;
      if (i < tokens.length && tokens[i].type === 'value') {
        data[tok.val] = tokens[i].val;
        i++;
      }
    } else if (tok.type === 'loop') {
      i++;
      const keys = [];
      while (i < tokens.length && tokens[i].type === 'key') {
        keys.push(tokens[i].val);
        i++;
      }
      const rows = [];
      while (i < tokens.length && tokens[i].type === 'value') {
        const row = {};
        for (let k = 0; k < keys.length; k++) {
          row[keys[k]] = tokens[i] ? tokens[i].val : null;
          i++;
        }
        rows.push(row);
      }
      keys.forEach(k => { data[k] = rows.map(r => r[k]); });
      data['__loops__'] = data['__loops__'] || [];
      data['__loops__'].push({ keys, rows });
    } else {
      i++;
    }
  }
  return data;
}

// ─── Fractional → Cartesian ───────────────────────────────────────────────────
function fracToCart(fx, fy, fz, a, b, c, al, be, ga) {
  const toRad = Math.PI / 180;
  const ca = Math.cos(al * toRad);
  const cb = Math.cos(be * toRad);
  const cg = Math.cos(ga * toRad);
  const sg = Math.sin(ga * toRad);
  const v  = Math.sqrt(1 - ca*ca - cb*cb - cg*cg + 2*ca*cb*cg);
  const Bx = b * cg, By = b * sg;
  const Cx = c * cb;
  const Cy = c * (ca - cb * cg) / sg;
  const Cz = c * v / sg;
  return [
    fx * a  + fy * Bx + fz * Cx,
    fy * By + fz * Cy,
    fz * Cz,
  ];
}

// ─── Extract element symbol from CIF label ────────────────────────────────────
function labelToElem(label) {
  if (!label) return '?';
  const m = label.match(/^([A-Z][a-z]?)/);
  return m ? m[1] : label;
}

// ─── CIF → QE ATOMIC_POSITIONS converter ─────────────────────────────────────
export function cifToQE(cifText, coordMode, decimals) {
  const d = parseCIFFull(cifText);

  // Cell parameters
  const strip = v => parseFloat(String(v || '').replace(/\(.*\)/, ''));
  const a  = strip(d['_cell_length_a']);
  const b  = strip(d['_cell_length_b']);
  const c  = strip(d['_cell_length_c']);
  const al = strip(d['_cell_angle_alpha']) || 90;
  const be = strip(d['_cell_angle_beta'])  || 90;
  const ga = strip(d['_cell_angle_gamma']) || 90;
  const hasCell = !isNaN(a) && !isNaN(b) && !isNaN(c);

  // Find atom_site loop
  const loops = d['__loops__'] || [];
  let atomLoop = null;
  for (const loop of loops) {
    if (loop.keys.some(k => k.includes('_atom_site'))) { atomLoop = loop; break; }
  }
  if (!atomLoop) throw new Error('No _atom_site loop found in CIF');

  const { keys, rows } = atomLoop;
  const col = name => keys.find(k => k.includes(name)) || null;

  const symCol = col('type_symbol') || col('label');
  const fxCol  = col('fract_x');
  const fyCol  = col('fract_y');
  const fzCol  = col('fract_z');
  const cxCol  = col('cartn_x');
  const cyCol  = col('cartn_y');
  const czCol  = col('cartn_z');
  const useCartesian = cxCol && cyCol && czCol && !(fxCol && fyCol && fzCol);

  const atoms = [];
  for (const row of rows) {
    const rawSym = row[symCol] || '?';
    const elem = labelToElem(rawSym);
    let x, y, z;

    if (useCartesian) {
      x = strip(row[cxCol]); y = strip(row[cyCol]); z = strip(row[czCol]);
    } else {
      const fx = strip(row[fxCol]);
      const fy = strip(row[fyCol]);
      const fz = strip(row[fzCol]);
      if (coordMode === 'crystal') {
        [x, y, z] = [fx, fy, fz];
      } else {
        if (!hasCell) throw new Error('Cell parameters missing; cannot convert fractional → Cartesian');
        [x, y, z] = fracToCart(fx, fy, fz, a, b, c, al, be, ga);
      }
    }
    if (!isNaN(x) && !isNaN(y) && !isNaN(z)) atoms.push({ elem, x, y, z });
  }

  if (!atoms.length) throw new Error('No valid atomic positions found in CIF');

  const dp  = parseInt(decimals) || 8;
  const w   = dp + 4;
  const tag = coordMode === 'crystal' ? '{crystal}' : '{angstrom}';

  let text = `ATOMIC_POSITIONS ${tag}\n`;
  for (const at of atoms) {
    text += `${at.elem.padEnd(3)}   ${at.x.toFixed(dp).padStart(w)}   ${at.y.toFixed(dp).padStart(w)}   ${at.z.toFixed(dp).padStart(w)}\n`;
  }

  const species = [...new Set(atoms.map(a => a.elem))].sort();
  const sg = d['_symmetry_space_group_name_h-m']
          || d['_space_group_name_h-m_alt']
          || d['_symmetry_space_group_name_hall']
          || '–';
  const cellStr = hasCell ? `${a.toFixed(3)}×${b.toFixed(3)}×${c.toFixed(3)} Å` : '–';

  return { text, atomCount: atoms.length, species, cellStr, sg };
}
