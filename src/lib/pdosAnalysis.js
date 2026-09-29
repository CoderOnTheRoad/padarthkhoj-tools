const ORBITAL_COMPONENTS = Object.freeze({
  s: ['s'],
  p: ['pz', 'px', 'py'],
  d: ['dz2', 'dzx', 'dzy', 'dx2-y2', 'dxy'],
  // QE prints seven real-harmonic f projections. Neutral labels avoid assigning
  // a convention that may differ between QE versions/pseudopotentials.
  f: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7'],
});

const FILENAME_RE = /\.pdos_atm#(?<atom>\d+)\((?<species>[^)]+)\)_wfc#(?<wfc>\d+)\((?<orbital>[spdf])\)$/i;

export function parsePdosFilename(filename) {
  const match = String(filename).match(FILENAME_RE);
  if (!match?.groups) throw new Error('Filename is not a recognized QE projwfc.x PDOS file');
  return {
    filename: String(filename),
    atomNumber: Number(match.groups.atom),
    species: match.groups.species.trim(),
    wfcNumber: Number(match.groups.wfc),
    orbital: match.groups.orbital.toLowerCase(),
  };
}

function numericRows(text) {
  const rows = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const values = line.split(/\s+/).map(Number);
    if (values.some(value => !Number.isFinite(value))) {
      // Permit an uncommented textual header, but never silently skip malformed
      // data once numeric rows have started.
      if (!rows.length) continue;
      throw new Error('Non-numeric value found inside the PDOS data table');
    }
    rows.push(values);
  }
  if (!rows.length) throw new Error('No numeric PDOS data were found');
  const width = rows[0].length;
  if (width < 3) throw new Error('A PDOS row must contain energy, LDOS and projection columns');
  if (rows.some(row => row.length !== width)) throw new Error('PDOS rows have inconsistent column counts');
  return rows;
}

export function parsePdosText(text, metadata) {
  const orbital = metadata.orbital;
  const components = ORBITAL_COMPONENTS[orbital];
  if (!components) throw new Error(`Unsupported orbital channel: ${orbital}`);
  const rows = numericRows(text);
  const width = rows[0].length;
  const nonSpinWidth = 2 + components.length;
  const spinWidth = 3 + 2 * components.length;
  let spinMode;
  if (width === nonSpinWidth) spinMode = 'non-spin';
  else if (width === spinWidth) spinMode = 'spin';
  else {
    throw new Error(
      `Unexpected ${orbital}-PDOS layout (${width} columns); expected ${nonSpinWidth} non-spin or ${spinWidth} spin columns`,
    );
  }

  const energy = rows.map(row => row[0]);
  const channels = {};
  if (spinMode === 'non-spin') {
    channels.LDOS = rows.map(row => row[1]);
    components.forEach((component, index) => {
      channels[component] = rows.map(row => row[2 + index]);
    });
  } else {
    channels.LDOS_up = rows.map(row => row[1]);
    channels.LDOS_down = rows.map(row => row[2]);
    components.forEach((component, index) => {
      channels[`${component}_up`] = rows.map(row => row[3 + 2 * index]);
      channels[`${component}_down`] = rows.map(row => row[4 + 2 * index]);
    });
  }
  return { ...metadata, spinMode, energy, channels, pointCount: energy.length };
}

export function parsePdosFile(filename, text) {
  return parsePdosText(text, parsePdosFilename(filename));
}

const VASP_LM_COMPONENTS = Object.freeze({
  s: ['s'],
  p: ['py', 'pz', 'px'],
  d: ['dxy', 'dyz', 'dz2', 'dxz', 'dx2-y2'],
  f: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7'],
});

function doscarNumbers(line, context) {
  const values = String(line ?? '').trim().split(/\s+/).filter(Boolean).map(Number);
  if (!values.length || values.some(value => !Number.isFinite(value))) throw new Error(`Invalid numeric data in ${context}`);
  return values;
}

function vaspProjectedLayout(width) {
  const layouts = {
    4: { spinMode: 'non-spin', orbitals: ['s', 'p', 'd'], resolved: false },
    5: { spinMode: 'non-spin', orbitals: ['s', 'p', 'd', 'f'], resolved: false },
    7: { spinMode: 'spin', orbitals: ['s', 'p', 'd'], resolved: false },
    9: { spinMode: 'spin', orbitals: ['s', 'p', 'd', 'f'], resolved: false },
    10: { spinMode: 'non-spin', orbitals: ['s', 'p', 'd'], resolved: true },
    17: { spinMode: 'non-spin', orbitals: ['s', 'p', 'd', 'f'], resolved: true },
    19: { spinMode: 'spin', orbitals: ['s', 'p', 'd'], resolved: true },
    33: { spinMode: 'spin', orbitals: ['s', 'p', 'd', 'f'], resolved: true },
  };
  return layouts[width] || null;
}

export function parseVaspDoscar(text, filename = 'DOSCAR') {
  const lines = String(text).split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 7) throw new Error('DOSCAR is incomplete');
  const firstHeader = doscarNumbers(lines[0], 'DOSCAR header');
  const ionCount = Math.trunc(firstHeader[0]);
  if (!Number.isInteger(ionCount) || ionCount < 1) throw new Error('Could not determine the number of ions from DOSCAR');
  const dosHeader = doscarNumbers(lines[5], 'DOSCAR DOS header');
  const nedos = Math.trunc(dosHeader[2]);
  const fermiEnergy = dosHeader[3];
  if (!Number.isInteger(nedos) || nedos < 1) throw new Error('Could not determine NEDOS from DOSCAR');
  let cursor = 6 + nedos; // Skip the total-DOS block.
  if (lines.length <= cursor) throw new Error('DOSCAR does not contain ion-projected DOS blocks');

  const records = [];
  let detectedLayout = null;
  for (let ion = 1; ion <= ionCount; ion += 1) {
    if (cursor >= lines.length) throw new Error(`DOSCAR is missing the projected block for ion ${ion}`);
    const blockHeader = doscarNumbers(lines[cursor], `ion ${ion} header`);
    const blockNedos = Math.trunc(blockHeader[2]);
    if (blockNedos !== nedos) throw new Error(`Ion ${ion} uses NEDOS=${blockNedos}; expected ${nedos}`);
    cursor += 1;
    const rows = [];
    for (let point = 0; point < nedos; point += 1) {
      if (cursor >= lines.length) throw new Error(`Projected block for ion ${ion} is incomplete`);
      rows.push(doscarNumbers(lines[cursor], `ion ${ion} projected DOS`));
      cursor += 1;
    }
    const width = rows[0].length;
    if (rows.some(row => row.length !== width)) throw new Error(`Ion ${ion} has inconsistent projected-DOS columns`);
    const layout = vaspProjectedLayout(width);
    if (!layout) throw new Error(`Unsupported VASP projected-DOS layout with ${width} columns (noncollinear/SOC or unknown LORBIT layout)`);
    if (detectedLayout && (detectedLayout.spinMode !== layout.spinMode || detectedLayout.resolved !== layout.resolved || detectedLayout.orbitals.length !== layout.orbitals.length)) {
      throw new Error(`Ion ${ion} uses a different projected-DOS layout`);
    }
    detectedLayout = layout;
    const energy = rows.map(row => row[0]);
    let column = 1;
    for (const orbital of layout.orbitals) {
      const components = layout.resolved ? VASP_LM_COMPONENTS[orbital] : [orbital];
      const channels = {};
      for (const component of components) {
        if (layout.spinMode === 'spin') {
          channels[`${component}_up`] = rows.map(row => row[column]);
          channels[`${component}_down`] = rows.map(row => row[column + 1]);
          column += 2;
        } else {
          channels[component] = rows.map(row => row[column]);
          column += 1;
        }
      }
      records.push({
        filename: `${filename} · ion ${ion} · ${orbital}`,
        sourceFilename: filename,
        sourceCode: 'VASP',
        atomNumber: ion,
        species: 'Unknown',
        wfcNumber: 1,
        orbital,
        spinMode: layout.spinMode,
        energy: [...energy],
        channels,
        pointCount: energy.length,
        fermiEnergy,
      });
    }
  }
  return {
    records,
    sourceCode: 'VASP',
    ionCount,
    fermiEnergy,
    spinMode: detectedLayout.spinMode,
    orbitalResolution: detectedLayout.resolved ? 'lm-resolved' : 'l-resolved',
    warning: 'DOSCAR does not provide reliable chemical-species labels by itself; use atom-number selection.',
  };
}

export function parseVaspPoscarSpecies(text, filename = 'POSCAR') {
  const lines = String(text).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length < 7) throw new Error(`${filename} is incomplete`);
  const speciesTokens = lines[5].split(/\s+/).filter(Boolean);
  if (speciesTokens.every(token => /^\d+$/.test(token))) {
    throw new Error(`${filename} uses the legacy VASP 4 format without explicit species names`);
  }
  if (speciesTokens.some(token => !/^[A-Za-z][A-Za-z0-9_+-]*$/.test(token))) throw new Error(`Could not read species names from ${filename}`);
  const countTokens = lines[6].split(/\s+/).filter(Boolean);
  if (countTokens.length !== speciesTokens.length || countTokens.some(token => !/^\d+$/.test(token) || Number(token) < 1)) {
    throw new Error(`Species counts in ${filename} do not match its species list`);
  }
  const speciesByAtom = new Map();
  let atomNumber = 1;
  speciesTokens.forEach((species, index) => {
    const count = Number(countTokens[index]);
    for (let offset = 0; offset < count; offset += 1) speciesByAtom.set(atomNumber++, species);
  });
  return {
    sourceCode: 'VASP POSCAR',
    companionType: 'vasp-structure',
    filename,
    species: speciesTokens,
    counts: countTokens.map(Number),
    speciesByAtom,
    atomCount: atomNumber - 1,
    records: [],
    fermiEnergy: null,
    warning: null,
  };
}

export function parsePdosUpload(filename, text) {
  if (/^DOSCAR(?:\..*)?$/i.test(String(filename).trim())) return parseVaspDoscar(text, filename);
  if (/^(?:POSCAR|CONTCAR)(?:\..*)?$/i.test(String(filename).trim())) return parseVaspPoscarSpecies(text, filename);
  const record = parsePdosFile(filename, text);
  record.sourceFilename = filename;
  record.sourceCode = 'Quantum ESPRESSO';
  return { records: [record], sourceCode: 'Quantum ESPRESSO', fermiEnergy: null, warning: null };
}

export function validatePdosCollection(records, tolerance = 1e-7) {
  if (!records.length) throw new Error('No valid PDOS files are selected');
  const mode = records[0].spinMode;
  const reference = records[0].energy;
  for (const record of records) {
    if (record.spinMode !== mode) throw new Error('Spin-polarized and non-spin-polarized files cannot be summed together');
    if (record.energy.length !== reference.length) throw new Error(`${record.filename} uses a different number of energy points`);
    for (let i = 0; i < reference.length; i += 1) {
      if (Math.abs(record.energy[i] - reference[i]) > tolerance) {
        throw new Error(`${record.filename} uses an incompatible energy grid`);
      }
    }
  }
  return { spinMode: mode, pointCount: reference.length };
}

export function summarizePdosRecords(records) {
  const species = [...new Set(records.map(record => record.species))].sort();
  const atoms = [...new Map(records.map(record => [record.atomNumber, {
    atomNumber: record.atomNumber,
    species: record.species,
  }])).values()].sort((a, b) => a.atomNumber - b.atomNumber);
  const orbitals = [...new Set(records.map(record => record.orbital))].sort();
  return { species, atoms, orbitals };
}

export function parseAtomNumberSelection(value) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error('Enter at least one atom number');
  const numbers = new Set();
  for (const token of text.split(',')) {
    const part = token.trim();
    if (!part) continue;
    if (/^\d+$/.test(part)) {
      const number = Number(part);
      if (number < 1) throw new Error('Atom numbers must be positive integers');
      numbers.add(number);
      continue;
    }
    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (!range) throw new Error(`Invalid atom selection: ${part}`);
    const start = Number(range[1]); const end = Number(range[2]);
    if (start < 1 || end < 1 || end < start) throw new Error(`Invalid atom range: ${part}`);
    if (end - start > 100000) throw new Error(`Atom range is too large: ${part}`);
    for (let number = start; number <= end; number += 1) numbers.add(number);
  }
  if (!numbers.size) throw new Error('Enter at least one atom number');
  return [...numbers].sort((a, b) => a - b);
}

export function sumPdosRecords(records, { fermiEnergy = 0 } = {}) {
  const { spinMode } = validatePdosCollection(records);
  const energy = records[0].energy.map(value => value - Number(fermiEnergy || 0));
  const channelNames = [...new Set(records.flatMap(record => Object.keys(record.channels)))];
  const channels = Object.fromEntries(channelNames.map(name => [name, new Array(energy.length).fill(0)]));
  for (const record of records) {
    for (const [name, values] of Object.entries(record.channels)) {
      for (let i = 0; i < energy.length; i += 1) channels[name][i] += values[i];
    }
  }
  return { energy, channels, spinMode, fileCount: records.length };
}

export function pdosResultToCsv(result) {
  const names = Object.keys(result.channels);
  const lines = [["Energy_eV", ...names].join(',')];
  for (let i = 0; i < result.energy.length; i += 1) {
    lines.push([result.energy[i], ...names.map(name => result.channels[name][i])].join(','));
  }
  return `${lines.join('\n')}\n`;
}

function safeFilenamePart(value) {
  return String(value).trim().replace(/\.pdos_atm#.*$/i, '').replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'pdos';
}

export function buildPdosExportFilename({ sourceFilenames = [], selectionMode = 'all', atomNumbers = [], species = [], orbitals = [], extension = 'csv' } = {}) {
  const sources = [...new Set(sourceFilenames.map(safeFilenamePart))];
  const source = sources.length === 1 ? sources[0] : sources.length > 1 ? `${sources[0]}_plus_${sources.length - 1}` : 'padarthkhoj';
  let selection = 'all_atoms';
  if (selectionMode === 'species') selection = `species_${species.map(safeFilenamePart).join('_') || 'selected'}`;
  else if (selectionMode === 'manual' || selectionMode === 'detected') selection = `atoms_${atomNumbers.join('_') || 'selected'}`;
  const orbital = orbitals.length ? orbitals.map(safeFilenamePart).join('_') : 'all_orbitals';
  return `${source}_${selection}_${orbital}_pdos.${safeFilenamePart(extension)}`;
}

export { ORBITAL_COMPONENTS };
