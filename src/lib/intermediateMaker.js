const deg = value => Number(value || 0) * Math.PI / 180;

export function directionFromAngles(azimuthDeg, elevationDeg) {
  const azimuth = deg(azimuthDeg);
  const elevation = deg(elevationDeg);
  return {
    x: Math.cos(elevation) * Math.cos(azimuth),
    y: Math.cos(elevation) * Math.sin(azimuth),
    z: Math.sin(elevation),
  };
}

export function anglesFromDirection(direction) {
  const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
  return {
    azimuth: Math.atan2(direction.y, direction.x) * 180 / Math.PI,
    elevation: Math.asin(direction.z / length) * 180 / Math.PI,
  };
}

function rotatePoint(point, rotation = {}) {
  const rx = deg(rotation.x), ry = deg(rotation.y), rz = deg(rotation.z);
  let { x, y, z } = point;
  [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
  [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
  [x, y] = [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz)];
  return { x, y, z };
}

const normalize = vector => {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
};
const dot = (a, b) => a.x*b.x + a.y*b.y + a.z*b.z;
const cross = (a, b) => ({ x: a.y*b.z-a.z*b.y, y: a.z*b.x-a.x*b.z, z: a.x*b.y-a.y*b.x });

function rotateAroundAxis(point, axis, angle) {
  const unit = normalize(axis);
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  const projection = dot(unit, point) * (1 - cosine);
  const perpendicular = cross(unit, point);
  return {
    x: point.x*cosine + perpendicular.x*sine + unit.x*projection,
    y: point.y*cosine + perpendicular.y*sine + unit.y*projection,
    z: point.z*cosine + perpendicular.z*sine + unit.z*projection,
  };
}

function alignVector(point, from, to) {
  const source = normalize(from), target = normalize(to);
  const cosine = Math.max(-1, Math.min(1, dot(source, target)));
  if (cosine > 1 - 1e-10) return { ...point };
  if (cosine < -1 + 1e-10) {
    const helper = Math.abs(source.x) < 0.8 ? { x:1, y:0, z:0 } : { x:0, y:1, z:0 };
    return rotateAroundAxis(point, cross(source, helper), Math.PI);
  }
  const axis = normalize(cross(source, target));
  return rotateAroundAxis(point, axis, Math.acos(cosine));
}

export function getTemplateAdsorptionAxis(template) {
  const others = template.atoms.filter((_, index) => index !== template.bindingAtom);
  if (!others.length) return { x: 0, y: 0, z: 1 };
  return normalize(others.reduce((sum, atom) => ({ x:sum.x+atom.x, y:sum.y+atom.y, z:sum.z+atom.z }), { x:0, y:0, z:0 }));
}

export function placeAnchoredIntermediate(template, activeAtom, options = {}) {
  const distance = Math.max(0.1, Number(options.distance) || 1.8);
  const outward = normalize(options.direction || { x:0, y:0, z:1 });
  const anchor = {
    x: activeAtom.cx + outward.x * distance,
    y: activeAtom.cy + outward.y * distance,
    z: activeAtom.cz + outward.z * distance,
  };
  const sourceAxis = getTemplateAdsorptionAxis(template);
  const tilt = deg(options.tilt || 0);
  const tiltDirection = normalize(Math.abs(outward.z) < 0.9 ? cross(outward, { x:0, y:0,z:1 }) : cross(outward, { x:0,y:1,z:0 }));
  return template.atoms.map((atom, index) => {
    let offset = alignVector(atom, sourceAxis, outward);
    if (tilt) offset = rotateAroundAxis(offset, tiltDirection, tilt);
    if (options.twist) offset = rotateAroundAxis(offset, outward, deg(options.twist));
    return { element:atom.element, x:anchor.x+offset.x, y:anchor.y+offset.y, z:anchor.z+offset.z, binding:index===template.bindingAtom };
  });
}

export function placeIntermediate(template, activeAtom, options = {}) {
  const radius = Math.max(0.1, Number(options.radius) || 1.7);
  const direction = options.direction || directionFromAngles(options.azimuth ?? 0, options.elevation ?? 60);
  const norm = Math.hypot(direction.x, direction.y, direction.z) || 1;
  const unit = { x: direction.x / norm, y: direction.y / norm, z: direction.z / norm };
  const anchor = {
    x: activeAtom.cx + unit.x * radius,
    y: activeAtom.cy + unit.y * radius,
    z: activeAtom.cz + unit.z * radius,
  };
  return template.atoms.map((atom, index) => {
    const offset = rotatePoint(atom, options.rotation);
    return {
      element: atom.element,
      x: anchor.x + offset.x,
      y: anchor.y + offset.y,
      z: anchor.z + offset.z,
      binding: index === template.bindingAtom,
    };
  });
}

export function evaluatePlacement(catalystAtoms, placedAtoms, activeIndex, minimumDistance = 1.6) {
  let closest = Infinity;
  let closestPair = null;
  let collisions = 0;
  placedAtoms.forEach((placed, placedIndex) => {
    catalystAtoms.forEach((atom, atomIndex) => {
      if (atomIndex === activeIndex && placed.binding) return;
      const distance = Math.hypot(placed.x - atom.cx, placed.y - atom.cy, placed.z - atom.cz);
      if (distance < closest) {
        closest = distance;
        closestPair = { placedIndex, atomIndex, distance };
      }
      if (distance < minimumDistance) collisions++;
    });
  });
  return { valid: collisions === 0, collisions, closest, closestPair };
}

export function evaluatePlacementVolume(catalystAtoms, placedAtoms, activeIndex, radius = 1.2) {
  const bindingAtom = placedAtoms.find(atom => atom.binding);
  if (!bindingAtom) return { valid: false, catalystAtomsInside: 0, atomsOutside: placedAtoms.length, maximumExtent: Infinity };
  const volumeRadius = Math.max(0.1, Number(radius) || 1.2);
  let catalystAtomsInside = 0;
  catalystAtoms.forEach((atom, atomIndex) => {
    if (atomIndex === activeIndex) return;
    const distance = Math.hypot(atom.cx - bindingAtom.x, atom.cy - bindingAtom.y, atom.cz - bindingAtom.z);
    if (distance < volumeRadius) catalystAtomsInside++;
  });
  let maximumExtent = 0;
  let atomsOutside = 0;
  placedAtoms.forEach(atom => {
    const distance = Math.hypot(atom.x - bindingAtom.x, atom.y - bindingAtom.y, atom.z - bindingAtom.z);
    maximumExtent = Math.max(maximumExtent, distance);
    if (distance > volumeRadius) atomsOutside++;
  });
  return { valid: catalystAtomsInside === 0 && atomsOutside === 0, catalystAtomsInside, atomsOutside, maximumExtent };
}

export function suggestPlacementSpheres(catalystAtoms, activeIndex, centreDistance = 1.8, sphereRadius = 3, limit = 6) {
  const active = catalystAtoms[activeIndex];
  if (!active) return [];
  const samples = 240;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const candidates = [];
  for (let index = 0; index < samples; index++) {
    const y = 1 - (index / (samples - 1)) * 2;
    const radial = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * index;
    const direction = { x: Math.cos(theta) * radial, y, z: Math.sin(theta) * radial };
    const centre = {
      x: active.cx + direction.x * centreDistance,
      y: active.cy + direction.y * centreDistance,
      z: active.cz + direction.z * centreDistance,
    };
    let atomsInside = 0;
    let closest = Infinity;
    catalystAtoms.forEach((atom, atomIndex) => {
      if (atomIndex === activeIndex) return;
      const distance = Math.hypot(atom.cx - centre.x, atom.cy - centre.y, atom.cz - centre.z);
      closest = Math.min(closest, distance);
      if (distance <= sphereRadius) atomsInside++;
    });
    candidates.push({ direction, centre, atomsInside, closest, clear: atomsInside === 0 });
  }
  candidates.sort((a, b) => a.atomsInside - b.atomsInside || b.closest - a.closest);
  const chosen = [];
  for (const candidate of candidates) {
    const separated = chosen.every(item => (
      item.direction.x * candidate.direction.x + item.direction.y * candidate.direction.y + item.direction.z * candidate.direction.z
    ) < 0.82);
    if (separated) chosen.push(candidate);
    if (chosen.length >= limit) break;
  }
  return chosen;
}

function invert3(matrix) {
  const [a,b,c] = matrix;
  const det = a[0]*(b[1]*c[2]-b[2]*c[1]) - a[1]*(b[0]*c[2]-b[2]*c[0]) + a[2]*(b[0]*c[1]-b[1]*c[0]);
  if (Math.abs(det) < 1e-12) throw new Error('Cannot export CIF: singular lattice matrix');
  return [
    [(b[1]*c[2]-b[2]*c[1])/det, (a[2]*c[1]-a[1]*c[2])/det, (a[1]*b[2]-a[2]*b[1])/det],
    [(b[2]*c[0]-b[0]*c[2])/det, (a[0]*c[2]-a[2]*c[0])/det, (a[2]*b[0]-a[0]*b[2])/det],
    [(b[0]*c[1]-b[1]*c[0])/det, (a[1]*c[0]-a[0]*c[1])/det, (a[0]*b[1]-a[1]*b[0])/det],
  ];
}

const wrap = value => ((value % 1) + 1) % 1;

export function buildIntermediateCIF(parsed, placedAtoms, title = 'intermediate') {
  const inverse = invert3(parsed.lattMat);
  const toFractional = ({ x, y, z }) => ({
    x: wrap(inverse[0][0]*x + inverse[0][1]*y + inverse[0][2]*z),
    y: wrap(inverse[1][0]*x + inverse[1][1]*y + inverse[1][2]*z),
    z: wrap(inverse[2][0]*x + inverse[2][1]*y + inverse[2][2]*z),
  });
  const counts = new Map();
  const rows = parsed.atoms.map(atom => ({ element: atom.element, frac: toFractional({ x: atom.cx, y: atom.cy, z: atom.cz }) }));
  placedAtoms.forEach(atom => rows.push({ element: atom.element, frac: toFractional(atom) }));
  const atomRows = rows.map(({ element, frac }) => {
    const count = (counts.get(element) || 0) + 1;
    counts.set(element, count);
    return `${element}${count} ${element} ${frac.x.toFixed(8)} ${frac.y.toFixed(8)} ${frac.z.toFixed(8)} 1.0`;
  }).join('\n');
  const { cell } = parsed;
  return `# Generated by QE Studio Intermediate Maker\n# Initial placement only; geometry optimization is required.\ndata_${String(title).replace(/[^A-Za-z0-9_-]/g, '_')}\n_symmetry_space_group_name_H-M 'P1'\n_symmetry_Int_Tables_number 1\n_cell_length_a ${cell.a.toFixed(8)}\n_cell_length_b ${cell.b.toFixed(8)}\n_cell_length_c ${cell.c.toFixed(8)}\n_cell_angle_alpha ${cell.alpha.toFixed(8)}\n_cell_angle_beta ${cell.beta.toFixed(8)}\n_cell_angle_gamma ${cell.gamma.toFixed(8)}\nloop_\n_atom_site_label\n_atom_site_type_symbol\n_atom_site_fract_x\n_atom_site_fract_y\n_atom_site_fract_z\n_atom_site_occupancy\n${atomRows}\n`;
}
