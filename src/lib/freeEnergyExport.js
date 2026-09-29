// ═══════════════════════════════════════════════════════════════════════════════
// Free Energy Plotter — Export Engine
// ═══════════════════════════════════════════════════════════════════════════════
import { groupRows } from './freeEnergyParser.js';

/**
 * Convert a canvas to a PNG Blob.
 */
export function canvasToBlob(canvas) {
  return new Promise(res => canvas.toBlob(blob => res(blob), 'image/png'));
}

/**
 * Trigger a PNG download from a Blob.
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Build a ZIP of files and trigger download.
 * files = [{ name, blob }]
 */
export async function downloadZIP(files, zipName) {
  let JSZip;
  try { JSZip = (await import('jszip')).default; }
  catch { throw new Error('JSZip not available — npm install jszip'); }
  const zip = new JSZip();
  for (const { name, blob } of files) {
    const ab = await blob.arrayBuffer();
    zip.file(name, ab);
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(zipBlob, zipName);
}

/**
 * Compute pixel dimensions from user export config.
 *   widthIn, heightIn  — inches (may be undefined)
 *   widthPx, heightPx  — pixels (may be undefined)
 *   dpi                — dots per inch
 */
export function computePixelDims(cfg) {
  const dpi = Number(cfg.dpi) || 300;
  let w, h;
  if (cfg.unitMode === 'px') {
    w = Number(cfg.widthPx)  || 1800;
    h = Number(cfg.heightPx) || 1200;
  } else {
    w = Math.round((Number(cfg.widthIn)  || 6) * dpi);
    h = Math.round((Number(cfg.heightIn) || 4) * dpi);
  }
  return { w, h };
}

/**
 * Render one sub-branch in isolation by temporarily filtering rows.
 */
function renderBranch(plotEngine, sb, rows, widthPx, heightPx, darkMode) {
  const orig = plotEngine.rows;
  plotEngine.setData(rows.filter(r => r.subBranch === sb));
  const c = plotEngine.renderToOffscreen(widthPx, heightPx, darkMode);
  plotEngine.setData(orig);
  return c;
}

/**
 * Full bulk export with progress callback.
 * mode: 'combined' | 'each' | 'both'
 * onProgress(msg, current, total)
 */
export async function bulkExport(plotEngine, rows, cfg, onProgress) {
  const { w, h }     = computePixelDims(cfg);
  const darkMode     = cfg.background !== 'white';
  const mode         = cfg.mode || 'combined';
  const prefix       = cfg.prefix || '';
  const grouped      = groupRows(rows);
  const subBranches  = [...grouped.keys()].sort();

  const files = [];
  let total = 0;
  if (mode === 'combined' || mode === 'both') total += 1;
  if (mode === 'each'     || mode === 'both') total += subBranches.length;
  let done = 0;

  // Combined
  if (mode === 'combined' || mode === 'both') {
    if (onProgress) onProgress(`Rendering combined plot…`, done, total);
    const canvas = plotEngine.renderToOffscreen(w, h, darkMode);
    const blob   = await canvasToBlob(canvas);
    files.push({ name: `${prefix}free_energy_combined.png`, blob });
    done++;
  }

  // Per-sub-branch
  if (mode === 'each' || mode === 'both') {
    for (const sb of subBranches) {
      if (onProgress) onProgress(`Rendering branch "${sb}" (${done + 1}/${total})…`, done, total);
      await new Promise(r => setTimeout(r, 0)); // yield to avoid freeze
      const canvas = renderBranch(plotEngine, sb, rows, w, h, darkMode);
      const blob   = await canvasToBlob(canvas);
      files.push({ name: `${prefix}branch_${sb}.png`, blob });
      done++;
    }
  }

  if (files.length === 1) {
    downloadBlob(files[0].blob, files[0].name);
  } else {
    if (onProgress) onProgress('Bundling ZIP…', done, total);
    await downloadZIP(files, `${prefix}free_energy_export.zip`);
  }

  if (onProgress) onProgress('Done!', total, total);
}
