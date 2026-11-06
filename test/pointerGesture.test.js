import test from 'node:test';
import assert from 'node:assert/strict';
import { isPointerDrag } from '../src/lib/pointerGesture.js';

test('ordinary click jitter is not classified as a camera drag', () => {
  assert.equal(isPointerDrag({ x: 100, y: 100 }, { x: 103, y: 104 }), false);
});

test('deliberate pointer movement is classified as a camera drag', () => {
  assert.equal(isPointerDrag({ x: 100, y: 100 }, { x: 107, y: 100 }), true);
});

test('hover movement without a press origin never blocks a click', () => {
  assert.equal(isPointerDrag(null, { x: 300, y: 250 }), false);
});
