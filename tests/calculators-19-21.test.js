// Hand-worked examples for calculators 19-21: gravel driveway, retaining wall, brick.
// Each matches the worked example in that calculator's guide.
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../src/assets/js/formulas.js');
const close = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

test('driveway: dense-graded stone factor comes from Penn State (0.04 t per sq ft at 6 in)', () => {
  close(F.DENSE_TONS_PER_YD, 2.16, 1e-9);
  // 100 ft x 10 ft at 6 in compacted, no extra: Penn State's 1,000 sq ft x 0.04 = 40 tons
  const r = F.driveway({ area: 1000, baseIn: 0, middleIn: 0, topIn: 6, wastePct: 0 });
  close(r.top.tons, 40);
});

test('driveway: 60 x 12 ft, 4 in of #3, 4 in of #57, 4 in of #411, 10% extra', () => {
  const r = F.driveway({ shapes: [{ type: 'rect', l: 60, w: 12 }], baseIn: 4, middleIn: 4, topIn: 4, wastePct: 10 });
  close(r.area, 720);
  close(r.base.cuYd, 8.889, 0.001);         // 720 x 4/12 / 27
  close(r.base.tons, 13.69);                // x 1.4 x 1.1
  assert.equal(r.base.buyTons, 14);
  assert.equal(r.middle.buyTons, 14);
  close(r.top.tons, 21.12);                 // 8.889 x 2.16 x 1.1
  assert.equal(r.top.buyTons, 21.5);
  assert.equal(r.buyTons, 49.5);
  assert.equal(r.depthIn, 12);
  assert.equal(r.fabricSqFt, 792);
  assert.equal(r.truckloads, 4);
});

test('driveway: a skipped layer adds nothing, and an empty area buys nothing', () => {
  const r = F.driveway({ area: 500, baseIn: 0, middleIn: 4, topIn: 3, wastePct: 10 });
  assert.equal(r.base.buyTons, 0);
  assert.equal(r.depthIn, 7);
  assert.equal(F.driveway({ area: 0, baseIn: 4, middleIn: 4, topIn: 4 }).buyTons, 0);
});

test('retaining wall: 20 ft long, 2 ft tall, 12 x 4 x 7 in block, caps and drain pipe', () => {
  const r = F.retainingWall({ length: 20, height: 2, blockL: 12, blockH: 4, blockD: 7, wastePct: 5, caps: true, capL: 12, pipe: true });
  assert.equal(r.exposedCourses, 6);
  assert.equal(r.buriedCourses, 1);
  assert.equal(r.courses, 7);
  assert.equal(r.perCourse, 20);
  assert.equal(r.blocks, 147);              // 140 x 1.05
  assert.equal(r.trenchIn, 19);             // block depth + 6 in each side, over the 18 in minimum
  close(r.baseCuYd, 0.586, 0.001);          // 20 x 19/12 x 6/12 / 27
  close(r.baseTons, 1.27);
  close(r.drainCuYd, 1.728, 0.001);         // 20 x 1 x 28/12 / 27
  close(r.drainTons, 2.42);
  assert.equal(r.pipePieces, 2);
  assert.equal(r.caps, 21);
  assert.equal(r.adhesiveTubes, 3);         // 2 beads x 20 ft / 13.6 ft
  assert.equal(r.needsEngineer, false);
  assert.equal(r.overSmallBlockLimit, false);
});

test('retaining wall: bigger block, 4 ft wall uses a 24 in trench and is flagged', () => {
  const r = F.retainingWall({ length: 30, height: 4, blockL: 18, blockH: 8, blockD: 12, wastePct: 0 });
  assert.equal(r.exposedCourses, 6);
  assert.equal(r.buriedCourses, 1);
  assert.equal(r.perCourse, 20);
  assert.equal(r.blocks, 140);
  assert.equal(r.trenchIn, 24);
  assert.equal(r.caps, 0); assert.equal(r.pipePieces, 0);
  assert.equal(r.overSmallBlockLimit, true);
  assert.equal(r.needsEngineer, false);
  assert.equal(F.retainingWall({ length: 10, height: 4.5 }).needsEngineer, true);
});

test('brick: 30 x 8 ft wall, 1 door, 2 windows, modular brick, veneer ties', () => {
  const r = F.brick({ wallLength: 30, wallHeight: 8, doors: 1, windows: 2, size: 'modular', wastePct: 5, veneer: true });
  close(r.area, 189);                       // 240 - 21 - 2 x 15
  close(r.netBricks, 1275.75);              // 189 x 6.75
  assert.equal(r.bricks, 1340);             // x 1.05
  close(r.mortarCuFt, 10.33);               // 1275.75 x 8.1 / 1000
  assert.equal(r.mortarBags, 35);           // 1275.75 / 37 per bag = 34.5
  assert.equal(r.ties, 90);                 // 71 + 7 for the door + 6 for each window
  assert.equal(r.tieBoxes, 1);
});

test('brick: other sizes follow BIA Table 4, and no ties for a garden wall', () => {
  const q = F.brick({ wallLength: 10, wallHeight: 10, size: 'queen', wastePct: 0 });
  assert.equal(q.bricks, 550);
  close(q.mortarCuFt, 6.71);                // BIA: 6.7 cu ft per 100 sq ft
  assert.equal(q.mortarBags, 23);           // 6.71 / 0.2997
  assert.equal(q.ties, 0);
  const k = F.brick({ wallLength: 10, wallHeight: 10, size: 'king', wastePct: 0 });
  assert.equal(k.bricks, 455);
  close(k.mortarCuFt, 6.46);                // BIA: 6.5
  assert.equal(F.brick({ wallLength: 10, wallHeight: 10, size: 'utility', wastePct: 0 }).bricks, 300);
});
