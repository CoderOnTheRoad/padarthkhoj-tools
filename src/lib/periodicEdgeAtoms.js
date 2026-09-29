import { findBonds } from './bonding.js';

const isZeroTranslation = translation => translation.every(value => value === 0);

function translatedCartesian(cart, lattice, translation) {
  return {
    x: cart.x + lattice[0][0] * translation[0] + lattice[0][1] * translation[1] + lattice[0][2] * translation[2],
    y: cart.y + lattice[1][0] * translation[0] + lattice[1][1] * translation[1] + lattice[1][2] * translation[2],
    z: cart.z + lattice[2][0] * translation[0] + lattice[2][1] * translation[1] + lattice[2][2] * translation[2],
  };
}

// Generate only the periodic copies needed to complete bonds crossing cell faces.
// sourceIndex always points to the real atom stored in the CIF/model.
export function findPeriodicEdgeReplicas(atoms, lattice, options = {}) {
  if (!lattice || !atoms.length || atoms.some(atom => !atom.frac)) return [];
  const replicas = new Map();
  const add = (sourceIndex, translation) => {
    if (isZeroTranslation(translation)) return;
    const key = `${sourceIndex}:${translation.join(',')}`;
    if (replicas.has(key)) return;
    replicas.set(key, {
      sourceIndex,
      translation,
      cart: translatedCartesian(atoms[sourceIndex].cart, lattice, translation),
    });
  };

  findBonds(atoms, lattice, options).forEach(({ i, j }) => {
    const a = atoms[i].frac;
    const b = atoms[j].frac;
    const bTranslation = [
      -Math.round(b.x - a.x),
      -Math.round(b.y - a.y),
      -Math.round(b.z - a.z),
    ];
    add(j, bTranslation);
    add(i, bTranslation.map(value => -value));
  });
  return [...replicas.values()];
}

export function periodicAtomTargets(viewer) {
  return [...viewer.atomMeshes, ...(viewer.periodicReplicaMeshes || [])];
}

export function clearPeriodicEdgeAtoms(viewer) {
  (viewer.periodicReplicaMeshes || []).forEach(mesh => viewer.scene.remove(mesh));
  viewer.periodicReplicaMeshes = [];
}

export function syncPeriodicEdgeAtoms(viewer) {
  (viewer.periodicReplicaMeshes || []).forEach(replica => {
    const source = viewer.atomMeshes[replica.userData.atomIdx];
    if (!source) return;
    replica.visible = source.visible;
    replica.layers.mask = source.layers.mask;
    replica.scale.copy(source.scale);
  });
}

export function renderPeriodicEdgeAtoms(viewer) {
  clearPeriodicEdgeAtoms(viewer);
  if (!viewer.periodicEdgeVisible || !viewer.bondLattice) return;
  const centre = viewer.bondCentre || { x: 0, y: 0, z: 0 };
  findPeriodicEdgeReplicas(viewer.bondAtoms, viewer.bondLattice, viewer.bondSettings).forEach(replica => {
    const source = viewer.atomMeshes[replica.sourceIndex];
    if (!source) return;
    const mesh = source.clone();
    mesh.position.set(replica.cart.x - centre.x, replica.cart.y - centre.y, replica.cart.z - centre.z);
    mesh.userData = {
      ...source.userData,
      atomIdx: replica.sourceIndex,
      periodicReplica: true,
      periodicTranslation: replica.translation,
    };
    viewer.scene.add(mesh);
    viewer.periodicReplicaMeshes.push(mesh);
  });
  syncPeriodicEdgeAtoms(viewer);
}

export function setupPeriodicEdgeAtoms(viewer) {
  viewer.periodicEdgeVisible = false;
  viewer.periodicReplicaMeshes = [];
  viewer.refreshPeriodicEdges = () => renderPeriodicEdgeAtoms(viewer);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'periodic-edge-toggle';
  button.textContent = 'Show edges';
  button.title = 'Show visualization-only periodic atom copies at unit-cell edges';
  const popover = viewer.bondUI?.querySelector('.bond-popover');
  viewer.bondUI?.insertBefore(button, popover || null);
  viewer.periodicEdgeButton = button;
  button.addEventListener('click', event => {
    event.stopPropagation();
    viewer.periodicEdgeVisible = !viewer.periodicEdgeVisible;
    button.textContent = viewer.periodicEdgeVisible ? 'Hide edges' : 'Show edges';
    button.setAttribute('aria-pressed', String(viewer.periodicEdgeVisible));
    renderPeriodicEdgeAtoms(viewer);
  });
}

export function disposePeriodicEdgeAtoms(viewer) {
  clearPeriodicEdgeAtoms(viewer);
  viewer.periodicEdgeButton?.remove();
  viewer.refreshPeriodicEdges = null;
}
