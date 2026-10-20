// Hand-worked examples for calculators 16-18: insulation, baseboard and trim, grout.
// Each matches the worked example in that calculator's guide.
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../src/assets/js/formulas.js');
const close = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

test('insulation: 120 ft of 8 ft wall, 2 doors, 10 windows, R-13 batts', () => {
  const r = F.insulation({ mode: 'walls', wallLength: 120, wallHeight: 8, doors: 2, windows: 10, wallR: 13 });
  close(r.area, 768);                // 960 - 2 x 21 - 10 x 15
  assert.equal(r.bagSqFt, 106.56);
  assert.equal(r.bags, 8);           // 768 / 106.56 = 7.21
});

test('insulation: R-19 batts and a bag size from the label', () => {
  assert.equal(F.insulation({ mode: 'walls', wallLength: 40, wallHeight: 8, wallR: 19 }).bags, 5); // 320 / 78.79 = 4.06
  assert.equal(F.insulation({ mode: 'walls', wallLength: 40, wallHeight: 8, wallR: 19, bagSqFt: 100 }).bags, 4);
});

test('insulation: chart rows are read exactly', () => {
  close(F.blownFor('fiberglass', 38).bagsPer1000, 19.5);
  close(F.blownFor('fiberglass', 38).inches, 13);
  close(F.blownFor('cellulose', 49).bagsPer1000, 70.8);
  close(F.blownFor('fiberglass', 6.5).bagsPer1000, 3.3); // halfway from R-0 to R-13
});

test('insulation: 1,000 sq ft attic with 3.5 in of old fiberglass, topped up to R-49', () => {
  const r = F.insulation({ mode: 'attic', area: 1000, material: 'fiberglass', targetR: 49, existingIn: 3.5, existingType: 'fiberglass' });
  close(r.existingR, 8.75);          // 3.5 in x R-2.5
  close(r.addR, 40.25);
  close(r.bagsPer1000, 20.81);       // 19.5 + 0.375 x (23.0 - 19.5)
  close(r.inches, 13.66);            // 13 + 0.375 x 1.75
  assert.equal(r.bags, 21);
  const c = F.insulation({ mode: 'attic', area: 1000, material: 'cellulose', targetR: 49, existingIn: 3.5, existingType: 'fiberglass' });
  close(c.bagsPer1000, 56.69);       // 52.6 + 0.375 x (63.5 - 52.6)
  assert.equal(c.bags, 57);
});

test('insulation: nothing to add when the attic already meets the target', () => {
  const r = F.insulation({ mode: 'attic', area: 800, material: 'cellulose', targetR: 38, existingIn: 12, existingType: 'cellulose' });
  assert.equal(r.addR, 0); assert.equal(r.bags, 0);
});

test('insulation: R-30 batts over an attic floor', () => {
  const r = F.insulation({ mode: 'attic', area: 1000, material: 'batts', battR: 30, existingIn: 3.5, existingType: 'fiberglass' });
  assert.equal(r.bags, 18);          // 1000 / 58.67 = 17.04
  close(r.totalR, 38.75);
});

test('baseboard: 12x14 room, one 36 in door, 16 ft pieces, casing on 2 door sides and 2 windows', () => {
  const r = F.baseboard({ mode: 'room', length: 14, width: 12, openings: 1, openingIn: 36, wastePct: 10, pieceFt: 16,
    casing: true, doorSides: 2, casedWindows: 2 });
  close(r.perimeter, 52); close(r.linearFt, 49);
  assert.equal(r.pieces, 4);         // 49 x 1.1 / 16 = 3.37
  assert.equal(r.casingFt, 66); assert.equal(r.casingPieces, 12);
  assert.equal(r.nails, 174);        // 2 x 37 at the baseboard + 2 x 50 at the casing
  assert.equal(r.caulkTubes, 3);     // 115 ft / 55 ft per tube
  assert.equal(r.shoePieces, 0);
});

test('baseboard: wall-by-wall total with shoe molding and 8 ft pieces', () => {
  const r = F.baseboard({ mode: 'walls', totalLength: 100, openings: 3, openingIn: 36, wastePct: 10, pieceFt: 8, shoe: true });
  close(r.linearFt, 91);
  assert.equal(r.pieces, 13);        // 100.1 / 8 = 12.5
  assert.equal(r.shoePieces, 13);
  assert.equal(r.nails, 207);        // 3 x 69 spots
  assert.equal(r.caulkTubes, 2); assert.equal(r.casingPieces, 0);
});

test('grout: joint volume matches the CBP chart for 12x12x3/8 in tile at 1/8 in', () => {
  close(F.groutCuInPerSqFt(12, 12, 0.125, 0.375), 1.1077, 0.0001);
  const r = F.grout({ area: 100, tileL: 12, tileW: 12, jointIn: 0.125, thicknessIn: 0.375, type: 'sanded', wastePct: 10 });
  close(r.sqFtPer25, 347.2, 0.1);    // CBP Polyblend Plus sanded chart: 348 sq ft per 25 lb
  close(r.lb, 7.92);
  assert.equal(r.bags25, 1); assert.equal(r.bags7, 0); // 7.9 lb is over a 7 lb bag
});

test('grout: sanded uses a 7 lb bag for a small remainder', () => {
  const r = F.grout({ area: 60, tileL: 6, tileW: 6, jointIn: 0.25, thicknessIn: 0.25, type: 'sanded', wastePct: 10 });
  close(r.lb, 12.11, 0.01);          // 60 x 2.8224 cu in x 1.1 x 0.065
  assert.equal(r.bags25, 1); assert.equal(r.bags7, 0); // 12.1 lb is more than 7, so one 25 lb bag
  const r2 = F.grout({ area: 300, tileL: 12, tileW: 24, jointIn: 0.1875, thicknessIn: 0.375, type: 'sanded', wastePct: 10 });
  close(r2.sqFtPer25, 309.4, 0.1);   // CBP chart: 310 sq ft per 25 lb
  close(r2.lb, 26.66);
  assert.equal(r2.bags25, 1); assert.equal(r2.bags7, 1); // 25 lb + 7 lb
});

test('grout: non-sanded 10 lb boxes and pre-mixed gallons match CBP charts', () => {
  const u = F.grout({ area: 100, tileL: 12, tileW: 12, jointIn: 0.0625, thicknessIn: 0.375, type: 'unsanded', wastePct: 10 });
  close(u.sqFtPer10, 289, 0.5);      // chart: 289 sq ft per 10 lb
  assert.equal(u.boxes10, 1);
  const p = F.grout({ area: 100, tileL: 12, tileW: 12, jointIn: 0.125, thicknessIn: 0.375, type: 'premixed', wastePct: 10 });
  close(p.sqFtPerGal, 198.6, 0.1);   // chart: 199 sq ft per gallon
  close(p.gallons, 0.554);
  assert.equal(p.buyGallons, 1); assert.equal(p.buyQuarts, 0);
  const q = F.grout({ area: 40, tileL: 12, tileW: 12, jointIn: 0.125, thicknessIn: 0.375, type: 'premixed', wastePct: 10 });
  assert.equal(q.buyGallons, 0); assert.equal(q.buyQuarts, 1); // 0.22 gal
});

test('grout: warns when the joint is outside the grout type range', () => {
  assert.equal(F.grout({ area: 10, tileL: 12, tileW: 12, jointIn: 0.25, thicknessIn: 0.375, type: 'unsanded' }).jointOk, false);
  assert.equal(F.grout({ area: 10, tileL: 12, tileW: 12, jointIn: 0.0625, thicknessIn: 0.375, type: 'sanded' }).jointOk, false);
});
