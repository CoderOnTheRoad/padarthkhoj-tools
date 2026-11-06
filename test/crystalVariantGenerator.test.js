import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatCoordinate, VisMultiCifGeneratorPage } from '../src/pages/VisMultiCifGenerator.js';
import { parseCIF } from '../src/lib/cifGenerator.js';

test('selecting a parsed CIF atom displays replacement controls and accepts an element', () => {
  const parsed = parseCIF(readFileSync(new URL('./fixtures/nacl-symmetry.cif', import.meta.url), 'utf8'));
  assert.equal(typeof parsed.atoms[0].x, 'number');
  const nodes = new Map();
  for (const id of ['#vg-sel-count', '#vg-sel-list', '#vg-sub-meta', '#vg-sub-body', '#vg-ctrl-body']) {
    nodes.set(id, { innerHTML: '', textContent: '', querySelectorAll: () => [], querySelector: () => null });
  }
  const page = Object.create(VisMultiCifGeneratorPage.prototype);
  page.container = { querySelector: id => nodes.get(id) || null };
  page._state = { parsed, selectedOrder: [0], substitutions: new Map(), generated: [] };
  page._refreshRight();
  assert.equal(nodes.get('#vg-sel-count').textContent, '1 selected');
  assert.match(nodes.get('#vg-sub-body').innerHTML, /id="vg-inp-0"/);
  page._addSub(0, 'Fe');
  assert.deepEqual(page._state.substitutions.get(0), ['Fe']);
  assert.match(nodes.get('#vg-sub-body').innerHTML, /data-elem="Fe"/);
  assert.match(nodes.get('#vg-ctrl-body').innerHTML, /vg-gen-btn/);
});

test('crystal variant selection renders numeric coordinates from the extended CIF parser', () => {
  assert.equal(formatCoordinate(0.123456789), '0.12345');
  assert.equal(formatCoordinate(-0.25), '-0.25');
});

test('crystal variant selection still renders legacy string coordinates', () => {
  assert.equal(formatCoordinate('0.987654321'), '0.98765');
  assert.equal(formatCoordinate(undefined), '—');
});
