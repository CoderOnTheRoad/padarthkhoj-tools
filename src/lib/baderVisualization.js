export const CHARGE_PALETTE = { gain: '#22c55e', neutral: '#e2e8f0', loss: '#ef4444' };

export function chargeColour(charge, limit, style = 'solid') {
  const { gain, neutral, loss } = CHARGE_PALETTE;
  if (!Number.isFinite(charge) || Math.abs(charge) < 1e-8) return neutral;
  const end = charge < 0 ? gain : loss;
  if (style !== 'gradient') return end;
  const denominator = typeof limit === 'object'
    ? (charge < 0 ? Math.abs(limit.min) : Math.abs(limit.max))
    : Math.abs(limit);
  const t = Math.min(1, Math.abs(charge) / Math.max(denominator, 1e-8));
  const rgb = hex => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  return '#' + rgb(neutral).map((start, i) => Math.round(start + (rgb(end)[i] - start) * t).toString(16).padStart(2, '0')).join('');
}

export function parseAtomNumberSelection(input, atomCount) {
  const selected = new Set(), errors = [];
  const cleaned = String(input ?? '').replace(/[\[\](){}]/g, ' ').trim();
  if (!cleaned) return { indices: [], errors: ['Enter atom numbers or ranges.'] };
  for (const token of cleaned.split(/[;,\s]+/).filter(Boolean)) {
    const single = token.match(/^(\d+)$/), range = token.match(/^(\d+)-(\d+)$/);
    if (single) {
      const value = Number(single[1]);
      if (value < 1 || value > atomCount) errors.push(`${token} is outside 1–${atomCount}`);
      else selected.add(value - 1);
    } else if (range) {
      const start = Number(range[1]), end = Number(range[2]);
      if (start > end) errors.push(`${token} is a reversed range`);
      else if (start < 1 || end > atomCount) errors.push(`${token} is outside 1–${atomCount}`);
      else for (let value=start; value<=end; value++) selected.add(value-1);
    } else errors.push(`${token} is not a valid atom number or range`);
  }
  return { indices:[...selected].sort((a,b)=>a-b), errors };
}

export function filterAtoms(records, mode, species=[], expression='') {
  if (mode === 'species') {
    const wanted = new Set(species);
    const indices = records.flatMap((record,index)=>wanted.has(record.element)?[index]:[]);
    return { indices, errors:wanted.size ? (indices.length?[]:['No atoms match the selected species.']) : ['Select at least one species.'] };
  }
  if (mode === 'numbers') return parseAtomNumberSelection(expression,records.length);
  return { indices:records.map((_,index)=>index), errors:[] };
}

export function unselectedAtomAppearance(mode) {
  if (mode === 'hide') return { visible:false, colour:null };
  if (mode === 'grey') return { visible:true, colour:'#94a3b8' };
  return { visible:true, colour:null };
}

export function baderLabelParts(mode, placement, record) {
  if (mode === 'none') return [];
  const charge = `${record.baderCharge >= 0 ? '+' : ''}${record.baderCharge.toFixed(3)} e`;
  const identity = mode === 'type' || mode === 'typeCharge' ? record.element : `#${record.index}`;
  if (mode === 'charge') return [{ role:placement === 'centre' ? 'centre' : 'outside', text:charge }];
  if (mode === 'atom' || mode === 'type') return [{ role:placement === 'centre' ? 'centre' : 'outside', text:identity }];
  if (placement === 'centre') return [{ role:'centre', text:identity }, { role:'outside', text:charge }];
  return [{ role:'outside', text:`${identity}  ${charge}` }];
}

export const overlaps = (a, b) => !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);

// Preserve the complete on-screen vertical and horizontal field of view when
// the requested image has a different aspect ratio. A narrower export needs a
// wider vertical FOV so its horizontal FOV does not crop the current scene.
export function containedVerticalFov(verticalFovDegrees, sourceAspect, targetAspect) {
  if (targetAspect >= sourceAspect) return verticalFovDegrees;
  const half = Math.tan(verticalFovDegrees * Math.PI / 360);
  return 2 * Math.atan(half * sourceAspect / targetAspect) * 180 / Math.PI;
}

// All dimensions are in the target render's pixels, never fixed world units.
// Hide a crowded label instead of covering an atom, another label or a toolbar.
export function placeLabel(anchor, width, height, obstacles, viewport) {
  const gap = 6 * (viewport.scale || 1);
  const dx = anchor.radius + gap + width / 2;
  const dy = anchor.radius + gap + height / 2;
  for (const [x, y] of [[anchor.x, anchor.y-dy], [anchor.x, anchor.y+dy], [anchor.x+dx, anchor.y], [anchor.x-dx, anchor.y]]) {
    const box = { left:x-width/2, right:x+width/2, top:y-height/2, bottom:y+height/2 };
    if (box.left < 0 || box.top < 0 || box.right > viewport.width || box.bottom > viewport.height) continue;
    if (!obstacles.some(other => overlaps(box, other))) return { x, y, box };
  }
  return null;
}
