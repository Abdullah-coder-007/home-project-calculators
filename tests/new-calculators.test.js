// Hand-worked examples for calculators 6-15 (see each guide's worked example).
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../src/assets/js/formulas.js');
const close = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
const rect = (l, w) => [{ type: 'rect', l, w }];

test('square footage: 12x15 room plus conversions and cost', () => {
  const r = F.area({ shapes: rect(15, 12), pricePerSqFt: 3 });
  close(r.sqft, 180); close(r.sqyd, 20); close(r.sqm, 16.72); close(r.cost, 540);
});

test('cubic yards: 10x10 at 6 in, and depth in feet', () => {
  close(F.volume({ shapes: rect(10, 10), depth: 6, depthUnit: 'in' }).cuYd, 1.852);
  close(F.volume({ shapes: rect(10, 10), depth: 1, depthUnit: 'ft', wastePct: 10 }).cuFt, 110);
  close(F.volume({ shapes: rect(3, 3), depth: 1, depthUnit: 'ft' }).cuM, 0.2549, 0.001);
});

test('drywall: 12x14 room, 8 ft walls, 1 door, 2 windows, ceiling, 4x8 sheets', () => {
  const r = F.drywall({ length: 14, width: 12, height: 8, doors: 1, windows: 2, ceiling: true, sheet: '4x8', wastePct: 10, corners: 0 });
  close(r.wall, 365); close(r.area, 533);
  assert.equal(r.sheets, 19);        // 533 * 1.1 / 32 = 18.3
  assert.equal(r.screws, 608);
  assert.equal(r.buckets, 2);        // 4.8 gal
  assert.equal(r.tapeRolls, 1);      // 202.5 ft
});

test('drywall: 4x12 sheets and corner bead', () => {
  const r = F.drywall({ length: 10, width: 10, height: 9, sheet: '4x12', wastePct: 0, corners: 2 });
  assert.equal(r.sheets, 8);         // 360 / 48 = 7.5
  assert.equal(r.cornerBead, 4);     // 2 corners x 2 pieces for 9 ft walls
});

test('wallpaper: 14x12 room, 8 ft walls, 1 door, standard double roll, no repeat', () => {
  const r = F.wallpaper({ length: 14, width: 12, height: 8, doors: 1, rollWidthIn: 20.5, rollLengthFt: 33, repeatIn: 0 });
  assert.equal(r.strips, 30); assert.equal(r.perRoll, 3); assert.equal(r.rolls, 10);
});

test('wallpaper: a 24 in pattern repeat means fewer strips per roll', () => {
  const r = F.wallpaper({ length: 14, width: 12, height: 8, doors: 1, rollWidthIn: 20.5, rollLengthFt: 33, repeatIn: 24 });
  assert.equal(r.perRoll, 3); // 124 in strips: 396 / 124 = 3.19
  const r2 = F.wallpaper({ length: 14, width: 12, height: 9, doors: 1, rollWidthIn: 20.5, rollLengthFt: 33, repeatIn: 24 });
  assert.equal(r2.perRoll, 2); assert.equal(r2.rolls, 15);
});

test('fence: 100 ft, posts every 8 ft, 2 rails, 5.5 in pickets with 0.5 in gaps', () => {
  const r = F.fence({ length: 100, postSpacing: 8, height: 6, rails: 2, picketWidthIn: 5.5, gapIn: 0.5, holeDiameterIn: 10, holeDepthIn: 30 });
  assert.equal(r.posts, 14); assert.equal(r.sections, 13); assert.equal(r.rails, 26);
  assert.equal(r.pickets, 200); assert.equal(r.bags, 30); assert.equal(r.postLength, 10);
});

test('deck: 16x12 ft, 5.5 in boards, 1/8 in gap, 16 ft boards, joists 16 in apart', () => {
  const r = F.deck({ length: 16, width: 12, boardWidthIn: 5.5, gapIn: 0.125, boardLengthFt: 16, joistSpacingIn: 16, wastePct: 10 });
  assert.equal(r.rows, 26); assert.equal(r.boards, 29); assert.equal(r.joists, 13);
  assert.equal(r.joistLength, 12); assert.equal(r.screws, 676);
});

test('roofing: 40x30 house, 12 in overhang, 6/12 gable', () => {
  const r = F.roofing({ length: 40, width: 30, overhangIn: 12, pitch: 6, roofType: 'gable' });
  close(r.factor, 1.118, 0.001); close(r.area, 1502.6, 0.5);
  assert.equal(r.bundles, 50); assert.equal(r.nails, 5440);
  assert.equal(r.underlaymentRolls, 2); assert.equal(r.dripEdgePieces, 15);
});

test('roofing: hip roof uses 15% waste', () => {
  assert.equal(F.roofing({ length: 40, width: 30, overhangIn: 12, pitch: 6, roofType: 'hip' }).waste, 0.15);
});

test('pavers: 12x12 patio, 4x8 in pavers, 4 in base, 1 in sand, 48 ft of edge', () => {
  const r = F.pavers({ shapes: rect(12, 12), paverL: 8, paverW: 4, wastePct: 10, edgeFt: 48, baseIn: 4, sandIn: 1 });
  assert.equal(r.pavers, 713);
  close(r.baseCuYd, 1.975); close(r.baseTons, 2.765);
  assert.equal(r.sandBags, 24); assert.equal(r.edgePieces, 7);
});

test('stairs: 108 in total rise, 10 in treads, 36 in wide', () => {
  const r = F.stairs({ totalRiseIn: 108, maxRiserIn: 7.75, treadIn: 10, widthIn: 36, stringerSpacingIn: 16 });
  assert.equal(r.risers, 14); close(r.riser, 7.714); assert.equal(r.treads, 13);
  assert.equal(r.run, 130); close(r.stringerFt, 14.09); assert.equal(r.stringerBoard, 16);
  assert.equal(r.stringers, 4); assert.ok(r.riserOk && r.treadOk);
});

test('stairs: flags a tread under 10 in', () => {
  assert.equal(F.stairs({ totalRiseIn: 100, treadIn: 9 }).treadOk, false);
});

test('lawn: 1,000 sq ft of 16x24 sod slabs and tall fescue seed', () => {
  const r = F.lawn({ shapes: rect(40, 25), pieceSqFt: 2.6667, palletSqFt: 450, seedRate: 6, bagLb: 25 });
  assert.equal(r.pieces, 394); assert.equal(r.pallets, 3);
  close(r.seedLb, 6); assert.equal(r.seedBags, 1);
});

test('new calculators never return NaN or negatives on empty input', () => {
  for (const fn of ['area', 'volume', 'drywall', 'wallpaper', 'fence', 'deck', 'roofing', 'pavers', 'stairs', 'lawn']) {
    const o = F[fn]({});
    for (const [k, v] of Object.entries(o)) if (typeof v === 'number') assert.ok(Number.isFinite(v) && v >= 0, `${fn}.${k}=${v}`);
  }
});
