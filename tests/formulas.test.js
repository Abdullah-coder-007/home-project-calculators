// Run with: node --test tests/
// Every expected value below was worked out by hand from the formula notes
// on the methodology page, so a change to a formula has to be deliberate.
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../src/assets/js/formulas.js');

const close = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

test('area: rectangles, triangles, circles and cut-outs', () => {
  close(F.totalArea([{ type: 'rect', l: 12, w: 10 }]), 120);
  close(F.totalArea([{ type: 'rect', l: 12, w: 10 }, { type: 'rect', l: 6, w: 4 }]), 144);
  close(F.totalArea([{ type: 'tri', b: 10, h: 6 }]), 30);
  close(F.totalArea([{ type: 'circle', d: 10 }]), 78.54);
  close(F.totalArea([{ type: 'rect', l: 12, w: 10 }, { type: 'rect', l: 4, w: 3, subtract: true }]), 108);
  assert.equal(F.totalArea([{ type: 'rect', l: 2, w: 2 }, { type: 'rect', l: 5, w: 5, subtract: true }]), 0);
});

test('paint: 12x14 room, 8 ft walls, 1 door, 2 windows, 2 coats', () => {
  const r = F.paint({ length: 14, width: 12, height: 8, doors: 1, windows: 2, coats: 2, coverage: 350 });
  close(r.wallArea, 365);
  close(r.wallGallons, 2.0857, 0.001);
  assert.deepEqual(r.wallBuy, { gallons: 2, quarts: 1 });
  assert.equal(r.tapeRolls, 1);
  assert.equal(r.ceilingArea, 0);
});

test('paint: ceiling and primer are separate line items', () => {
  const r = F.paint({ length: 14, width: 12, height: 8, doors: 0, windows: 0, coats: 2, coverage: 350, ceiling: true, primer: true });
  close(r.ceilingArea, 168);
  close(r.ceilingGallons, 0.96, 0.001);
  assert.deepEqual(r.ceilingBuy, { gallons: 1, quarts: 0 });
  close(r.primerGallons, (416 + 168) / 350, 0.001);
});

test('paint purchase rounding', () => {
  assert.deepEqual(F.paintPurchase(2), { gallons: 2, quarts: 0 });
  assert.deepEqual(F.paintPurchase(2.2), { gallons: 2, quarts: 1 });
  assert.deepEqual(F.paintPurchase(2.3), { gallons: 3, quarts: 0 });
  assert.deepEqual(F.paintPurchase(0.2), { gallons: 0, quarts: 1 });
  assert.deepEqual(F.paintPurchase(0), { gallons: 0, quarts: 0 });
});

test('concrete: 10x10 slab, 4 in thick, 10% waste, 80 lb bags', () => {
  const r = F.concrete({ mode: 'slab', length: 10, width: 10, thicknessIn: 4, wastePct: 10, bagSize: 80 });
  close(r.cuFt, 33.333);
  close(r.cuFtTotal, 36.667);
  close(r.cuYd, 1.358);
  assert.equal(r.bags, 62);
  assert.equal(r.readyMixYd, 1.5);
  assert.equal(r.suggestReadyMix, true);
});

test('concrete: four 12 in post holes, 36 in deep, no waste', () => {
  const r = F.concrete({ mode: 'round', diameterIn: 12, depthIn: 36, count: 4, wastePct: 0, bagSize: 80 });
  close(r.cuFt, 9.4248);
  assert.equal(r.bags, 16);
});

test('concrete: footing and smaller bags', () => {
  const r = F.concrete({ mode: 'footing', length: 20, widthIn: 12, depthIn: 12, wastePct: 0, bagSize: 60 });
  close(r.cuFt, 20);
  assert.equal(r.bags, 45); // 20 / 0.45 = 44.4
});

test('tile: 100 sq ft of 12x12 tile, 1/8 in joints, straight lay', () => {
  const r = F.tile({ area: 100, tileL: 12, tileW: 12, jointIn: 0.125, thicknessIn: 0.375, pattern: 'straight', boxSqFt: 15, trowel: '1/4x3/8' });
  close(r.areaWithWaste, 110);
  assert.equal(r.tiles, 108);
  assert.equal(r.boxes, 8);
  close(r.groutLb, 8.04, 0.02);
  assert.equal(r.thinsetBags, 2);
});

test('tile: diagonal pattern uses 15% waste unless overridden', () => {
  assert.equal(F.tile({ area: 100, tileL: 12, tileW: 24, pattern: 'diagonal' }).wastePct, 15);
  assert.equal(F.tile({ area: 100, tileL: 12, tileW: 24, pattern: 'diagonal', wastePct: 12 }).wastePct, 12);
});

test('bulk: 200 sq ft of mulch at 3 in', () => {
  const r = F.bulk({ material: 'mulch', area: 200, depthIn: 3 });
  close(r.cuFt, 50);
  close(r.cuYd, 1.852);
  assert.equal(r.bags, 25);
  assert.equal(r.bulkYd, 2);
});

test('bulk: 100 sq ft of gravel at 4 in, in tons', () => {
  const r = F.bulk({ material: 'gravel', area: 100, depthIn: 4 });
  close(r.cuYd, 1.2346);
  close(r.tons, 1.728);
});

test('flooring: 150 sq ft, straight, 20 sq ft boxes, underlayment and trim', () => {
  const r = F.flooring({ area: 150, pattern: 'straight', boxSqFt: 20, underlayment: true, underlaymentSqFt: 100, trimFt: 50 });
  close(r.areaWithWaste, 165);
  assert.equal(r.boxes, 9);
  assert.equal(r.boughtSqFt, 180);
  assert.equal(r.rolls, 2);
  assert.equal(r.trimPieces, 7);
});

test('empty inputs never produce NaN or negative quantities', () => {
  const outs = [F.paint({}), F.concrete({}), F.tile({}), F.bulk({}), F.flooring({})];
  for (const o of outs) {
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'number') assert.ok(Number.isFinite(v) && v >= 0, `${k}=${v}`);
    }
  }
});
