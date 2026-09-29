// ═══════════════════════════════════════════════════════════════════════════════
// Free Energy Plotter — Data Parser & Processor
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parse a 3-column text/CSV into rows [{branch, subBranch, energy}].
 * Accepts comma, tab, semicolon, or whitespace delimiters.
 * Strips comment lines (#) and auto-detects header rows.
 */
export function parseCSV(text) {
  const rows = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    // Split on comma / tab / semicolon / multiple spaces
    const parts = line.split(/[,;\t]+|\s{2,}|\s+/).map(p => p.trim()).filter(Boolean);
    if (parts.length < 3) continue;

    // Skip header rows
    if (isNaN(Number(parts[0]))) continue;

    const branch    = parseInt(parts[0]);
    const subBranch = String(parts[1]).trim();
    const energy    = parseFloat(parts[2]);

    if (isNaN(branch) || !subBranch || isNaN(energy)) continue;
    rows.push({ branch, subBranch, energy });
  }
  return rows;
}

/**
 * Group rows by subBranch, sort each group by branch index.
 * @returns {Map<string, Array<{branch, energy}>>}
 */
export function groupRows(rows) {
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.subBranch)) grouped.set(row.subBranch, []);
    grouped.get(row.subBranch).push({ branch: row.branch, energy: row.energy });
  }
  for (const arr of grouped.values()) {
    arr.sort((a, b) => a.branch - b.branch);
  }
  return grouped;
}

/**
 * Sorted list of all unique sub-branch labels.
 */
export function getSubBranches(rows) {
  return [...new Set(rows.map(r => r.subBranch))].sort();
}

/**
 * Sorted list of all unique branch indices (used as x positions).
 */
export function getUniqueBranches(rows) {
  return [...new Set(rows.map(r => r.branch))].sort((a, b) => a - b);
}

/**
 * Compute a nice Y range with padding.
 */
export function getYRange(rows, paddingFrac = 0.15) {
  if (!rows.length) return { min: -2, max: 2 };
  const energies = rows.map(r => r.energy);
  const rawMin   = Math.min(...energies);
  const rawMax   = Math.max(...energies);
  const span     = rawMax - rawMin || 4;
  return { min: rawMin - span * paddingFrac, max: rawMax + span * paddingFrac };
}

/**
 * Compute a "nice" tick interval for a given range and desired tick count.
 */
export function niceInterval(range, targetCount = 5) {
  if (!range || !targetCount) return 1;
  const raw = Math.abs(range) / targetCount;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  let nice;
  if      (norm < 1.5) nice = 1;
  else if (norm < 3)   nice = 2;
  else if (norm < 7)   nice = 5;
  else                  nice = 10;
  return nice * mag;
}

/**
 * Default auto-color palette (publication-friendly).
 */
export const PALETTE = [
  '#4f87ff', '#ff6b6b', '#51cf66', '#ffd43b',
  '#cc5de8', '#ff922b', '#20c997', '#f06595',
  '#74c0fc', '#a9e34b', '#e599f7', '#ffa94d',
];
