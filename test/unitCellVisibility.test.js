import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { ThreeViewer } from '../src/components/ThreeViewer.js';
import { VisSelectViewer } from '../src/components/VisSelectViewer.js';
import { setUnitCellVisible } from '../src/lib/unitCellVisibility.js';

for (const Viewer of [ThreeViewer, VisSelectViewer]) {
  test(`${Viewer.name}: box toggle preserves other objects and survives rebuilding edges`, () => {
    const attributes = {};
    const button = { setAttribute: (key, value) => { attributes[key] = value; } };
    const viewer = {
      scene: new THREE.Scene(), bondLines: [], unitCellVisible: true,
      bondUI: { querySelector: () => button },
    };
    const atom = new THREE.Mesh();
    const chemicalBond = new THREE.LineSegments();
    const placementSphere = new THREE.Mesh();
    viewer.scene.add(atom, chemicalBond, placementSphere);
    const lattice = [[30, 0, 0], [0, 30, 0], [0, 0, 20]];
    Viewer.prototype._drawCellBox.call(viewer, lattice, 1, 2, 3);
    assert.equal(viewer.bondLines.length, 12);
    assert.ok(viewer.bondLines.every(line => line.visible));
    const geometry = viewer.bondLines[0].geometry;

    setUnitCellVisible(viewer, false);
    assert.ok(viewer.bondLines.every(line => !line.visible));
    assert.equal(viewer.bondLines[0].geometry, geometry);
    assert.equal(button.textContent, 'Show box');
    assert.equal(attributes['aria-pressed'], 'false');
    assert.ok(atom.visible && chemicalBond.visible && placementSphere.visible);
    const visibleObjects = [];
    viewer.scene.traverseVisible(object => visibleObjects.push(object));
    assert.ok(!visibleObjects.includes(viewer.bondLines[0]));

    viewer.bondLines.forEach(line => viewer.scene.remove(line));
    viewer.bondLines = [];
    Viewer.prototype._drawCellBox.call(viewer, lattice, 1, 2, 3);
    assert.ok(viewer.bondLines.every(line => !line.visible));
    setUnitCellVisible(viewer, true);
    assert.ok(viewer.bondLines.every(line => line.visible));
    assert.equal(button.textContent, 'Hide box');
    assert.equal(attributes['aria-pressed'], 'true');
  });
}
