/*
 * Calcupine formulas.
 * Pure functions only: no DOM access. Shared by the browser pages and the
 * Node test suite (tests/formulas.test.js). All inputs are US units:
 * feet for lengths, inches where noted, square feet for areas.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PMF = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CU_FT_PER_CU_YD = 27;

  function num(v, fallback) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? n : (fallback === undefined ? 0 : fallback);
  }
  function pos(v) { return Math.max(0, num(v)); }
  function ceil(v) { return Math.ceil(v - 1e-9); }
  function round(v, dp) { var f = Math.pow(10, dp || 0); return Math.round(v * f) / f; }

  /* ---------- Area from a list of shapes ---------- */
  // shape: {type:'rect'|'tri'|'circle', l, w, b, h, d, subtract:boolean}, feet
  function shapeArea(s) {
    if (s.type === 'rect') return pos(s.l) * pos(s.w);
    if (s.type === 'tri') return 0.5 * pos(s.b) * pos(s.h);
    if (s.type === 'circle') { var r = pos(s.d) / 2; return Math.PI * r * r; }
    return 0;
  }
  function totalArea(shapes) {
    var t = 0;
    (shapes || []).forEach(function (s) { t += s.subtract ? -shapeArea(s) : shapeArea(s); });
    return Math.max(0, t);
  }

  /* ---------- Paint ---------- */
  var DOOR_SQFT = 21;   // 3 ft x 7 ft
  var WINDOW_SQFT = 15; // 3 ft x 5 ft
  var TAPE_ROLL_FT = 180; // 60-yard roll

  // Splits a gallon need into whole gallons plus an optional quart,
  // the way paint is sold. More than 1/4 gal left over buys another gallon.
  function paintPurchase(gallons) {
    if (gallons <= 0) return { gallons: 0, quarts: 0 };
    var whole = Math.floor(gallons + 1e-9);
    var rem = gallons - whole;
    if (rem <= 1e-9) return { gallons: whole, quarts: 0 };
    if (rem <= 0.25 + 1e-9) return { gallons: whole, quarts: 1 };
    return { gallons: whole + 1, quarts: 0 };
  }

  function paint(i) {
    var L = pos(i.length), W = pos(i.width), H = pos(i.height);
    var coats = Math.max(1, Math.round(num(i.coats, 2)));
    var coverage = num(i.coverage, 350) > 0 ? num(i.coverage, 350) : 350;
    var doors = Math.max(0, Math.round(num(i.doors))), windows = Math.max(0, Math.round(num(i.windows)));
    var perimeter = 2 * (L + W);
    var grossWall = perimeter * H;
    var openings = doors * DOOR_SQFT + windows * WINDOW_SQFT;
    var wallArea = Math.max(0, grossWall - openings);
    var ceilingArea = i.ceiling ? L * W : 0;

    var wallGallons = wallArea * coats / coverage;
    var ceilingGallons = ceilingArea * coats / coverage;
    var primerGallons = i.primer ? (wallArea + ceilingArea) / coverage : 0;

    // Tape: along ceiling line and baseboard, plus door (17 ft) and window (16 ft) trim.
    var tapeFt = perimeter * 2 + doors * 17 + windows * 16;

    return {
      perimeter: perimeter, grossWall: grossWall, openings: openings,
      wallArea: wallArea, ceilingArea: ceilingArea, coats: coats, coverage: coverage,
      wallGallons: wallGallons, ceilingGallons: ceilingGallons, primerGallons: primerGallons,
      wallBuy: paintPurchase(wallGallons), ceilingBuy: paintPurchase(ceilingGallons),
      primerBuy: paintPurchase(primerGallons),
      tapeRolls: wallArea > 0 ? ceil(tapeFt / TAPE_ROLL_FT) : 0
    };
  }

  /* ---------- Concrete ---------- */
  // Yield per bag in cubic feet (standard published yields for concrete mix).
  var BAG_YIELD = { 40: 0.30, 60: 0.45, 80: 0.60 };

  function concreteVolume(i) {
    // returns cubic feet before waste
    if (i.mode === 'footing') {
      return pos(i.length) * (pos(i.widthIn) / 12) * (pos(i.depthIn) / 12);
    }
    if (i.mode === 'round') {
      var r = pos(i.diameterIn) / 2 / 12;
      return Math.PI * r * r * (pos(i.depthIn) / 12) * Math.max(0, Math.round(num(i.count, 1)));
    }
    if (i.mode === 'square') {
      var side = pos(i.sideIn) / 12;
      return side * side * pos(i.columnHeight) * Math.max(0, Math.round(num(i.columnCount, 1)));
    }
    if (i.mode === 'steps') {
      // Solid steps: step k (from the bottom) is k risers tall. The top step can be a
      // deeper landing. Volume = width x rise x (run x (n-1)n/2 + n x landing).
      var n = Math.max(0, Math.round(num(i.steps, 0)));
      var rise = pos(i.riseIn) / 12, run = pos(i.runIn) / 12;
      var landing = Math.max(run, pos(i.landingIn) / 12);
      return pos(i.stepWidth) * rise * (run * (n - 1) * n / 2 + n * landing);
    }
    if (i.mode === 'curb') {
      // Curb (width x height) plus an optional gutter pan (width x thickness) along its length.
      return pos(i.curbLength) * ((pos(i.curbWidthIn) / 12) * (pos(i.curbHeightIn) / 12) +
        (pos(i.gutterWidthIn) / 12) * (pos(i.gutterThickIn) / 12));
    }
    // slab
    return pos(i.length) * pos(i.width) * (pos(i.thicknessIn) / 12);
  }

  function concrete(i) {
    var waste = Math.max(0, num(i.wastePct, 10)) / 100;
    var cuFt = concreteVolume(i);
    var cuFtTotal = cuFt * (1 + waste);
    var cuYd = cuFtTotal / CU_FT_PER_CU_YD;
    var bagSize = BAG_YIELD[i.bagSize] ? Number(i.bagSize) : 80;
    var bags = cuFtTotal > 0 ? ceil(cuFtTotal / BAG_YIELD[bagSize]) : 0;
    // Ready-mix is typically ordered in 1/4 yard steps.
    var readyMixYd = cuYd > 0 ? ceil(cuYd * 4) / 4 : 0;
    return {
      cuFt: cuFt, cuFtTotal: cuFtTotal, cuYd: cuYd, waste: waste,
      bagSize: bagSize, bagYield: BAG_YIELD[bagSize], bags: bags,
      readyMixYd: readyMixYd, suggestReadyMix: cuYd >= 1
    };
  }

  /* ---------- Tile ---------- */
  var PATTERN_WASTE = { straight: 10, diagonal: 15, herringbone: 20 };
  // Approximate thinset coverage (sq ft per 50 lb bag) by trowel notch.
  var THINSET_COVERAGE = { '1/4x1/4': 95, '1/4x3/8': 63, '1/2x1/2': 45 }; // midpoints of Custom Building Products' VersaBond chart
  var GROUT_LB_PER_CU_IN = 0.065; // typical sanded/unsanded cementitious grout

  function tile(i) {
    var area = pos(i.area);
    var tl = pos(i.tileL), tw = pos(i.tileW);
    var joint = pos(i.jointIn), thick = pos(i.thicknessIn);
    var wastePct = i.wastePct !== undefined && i.wastePct !== '' ? pos(i.wastePct)
      : (PATTERN_WASTE[i.pattern] || 10);
    var areaWithWaste = area * (1 + wastePct / 100);
    // Each tile plus one joint covers this many square feet.
    var tileCover = tl > 0 && tw > 0 ? ((tl + joint) * (tw + joint)) / 144 : 0;
    var tiles = tileCover > 0 ? ceil(areaWithWaste / tileCover) : 0;
    var boxCover = pos(i.boxSqFt);
    var boxes = boxCover > 0 ? ceil(areaWithWaste / boxCover) : 0;

    // Grout: joint volume per sq ft = 144 * (L + W) * J * T / (L * W), cubic inches.
    var groutCuInPerSqFt = tl > 0 && tw > 0 ? 144 * (tl + tw) * joint * thick / (tl * tw) : 0;
    var groutLb = area * groutCuInPerSqFt * GROUT_LB_PER_CU_IN * 1.10;

    var thinsetCov = THINSET_COVERAGE[i.trowel] || 70;
    var thinsetBags = area > 0 ? ceil(areaWithWaste / thinsetCov) : 0;
    return {
      area: area, wastePct: wastePct, areaWithWaste: areaWithWaste,
      tileCover: tileCover, tiles: tiles, boxes: boxes,
      groutLb: groutLb, thinsetBags: thinsetBags, thinsetCoverage: thinsetCov
    };
  }

  /* ---------- Mulch, soil, gravel, sand ---------- */
  var MATERIALS = {
    mulch:   { name: 'Mulch',   bagCuFt: 2,    tonsPerYd: 0 },
    topsoil: { name: 'Topsoil', bagCuFt: 0.75, tonsPerYd: 1.1 },
    gravel:  { name: 'Gravel',  bagCuFt: 0.5,  tonsPerYd: 1.4 },
    sand:    { name: 'Sand',    bagCuFt: 0.5,  tonsPerYd: 1.35 }
  };

  function bulk(i) {
    var m = MATERIALS[i.material] || MATERIALS.mulch;
    var bagCuFt = pos(i.bagCuFt) > 0 ? pos(i.bagCuFt) : m.bagCuFt;
    var area = pos(i.area);
    var cuFt = area * (pos(i.depthIn) / 12);
    var cuYd = cuFt / CU_FT_PER_CU_YD;
    return {
      material: m, area: area, cuFt: cuFt, cuYd: cuYd,
      bagCuFt: bagCuFt, bags: cuFt > 0 ? ceil(cuFt / bagCuFt) : 0,
      tons: cuYd * m.tonsPerYd,
      // Bulk is usually sold in 1/2 yard steps.
      bulkYd: cuYd > 0 ? ceil(cuYd * 2) / 2 : 0
    };
  }

  /* ---------- Flooring ---------- */
  var FLOOR_WASTE = { straight: 10, diagonal: 15, herringbone: 20 };

  function flooring(i) {
    var area = pos(i.area);
    var wastePct = i.wastePct !== undefined && i.wastePct !== '' ? pos(i.wastePct)
      : (FLOOR_WASTE[i.pattern] || 10);
    var areaWithWaste = area * (1 + wastePct / 100);
    var boxCover = pos(i.boxSqFt);
    var boxes = boxCover > 0 ? ceil(areaWithWaste / boxCover) : 0;
    var rollCover = pos(i.underlaymentSqFt);
    var rolls = i.underlayment && rollCover > 0 ? ceil(area * 1.05 / rollCover) : 0;
    var trimFt = pos(i.trimFt);
    var trimPieces = trimFt > 0 ? ceil(trimFt * 1.10 / 8) : 0;
    return {
      area: area, wastePct: wastePct, areaWithWaste: areaWithWaste,
      boxes: boxes, boughtSqFt: boxes * boxCover, rolls: rolls, trimPieces: trimPieces
    };
  }


  /* ---------- Square footage ---------- */
  function area(i) {
    var sqft = totalArea(i.shapes);
    var price = pos(i.pricePerSqFt);
    return {
      sqft: sqft, sqyd: sqft / 9, sqm: sqft * 0.09290304, acres: sqft / 43560,
      cost: sqft * price
    };
  }

  /* ---------- Cubic yards ---------- */
  function volume(i) {
    var a = totalArea(i.shapes);
    var depthFt = i.depthUnit === 'ft' ? pos(i.depth) : pos(i.depth) / 12;
    var waste = pos(i.wastePct) / 100;
    var cuFt = a * depthFt * (1 + waste);
    return { area: a, cuFt: cuFt, cuYd: cuFt / CU_FT_PER_CU_YD, cuM: cuFt * 0.0283168466 };
  }

  /* ---------- Drywall ---------- */
  var SHEET_SQFT = { '4x8': 32, '4x10': 40, '4x12': 48 };
  function drywall(i) {
    var L = pos(i.length), W = pos(i.width), H = pos(i.height);
    var doors = Math.max(0, Math.round(num(i.doors))), windows = Math.max(0, Math.round(num(i.windows)));
    var wall = Math.max(0, 2 * (L + W) * H - doors * DOOR_SQFT - windows * WINDOW_SQFT);
    var ceiling = i.ceiling ? L * W : 0;
    var a = wall + ceiling;
    var sheet = SHEET_SQFT[i.sheet] ? i.sheet : '4x8';
    var waste = num(i.wastePct, 10) / 100;
    var sheets = a > 0 ? ceil(a * (1 + waste) / SHEET_SQFT[sheet]) : 0;
    // Rules of thumb: ~1 screw per sq ft of board, ~9 gal of ready-mix
    // compound and ~380 ft of tape per 1,000 sq ft (three coats).
    var compoundGal = a * 0.009;
    return {
      wall: wall, ceiling: ceiling, area: a, sheet: sheet, sheetSqFt: SHEET_SQFT[sheet], sheets: sheets,
      screws: sheets * SHEET_SQFT[sheet],
      compoundGal: compoundGal, buckets: a > 0 ? ceil(compoundGal / 4.5) : 0,
      tapeFt: a * 0.38, tapeRolls: a > 0 ? ceil(a * 0.38 / 250) : 0,
      cornerBead: Math.max(0, Math.round(num(i.corners))) * ceil(H / 8)
    };
  }

  /* ---------- Wallpaper ---------- */
  function wallpaper(i) {
    var L = pos(i.length), W = pos(i.width), H = pos(i.height);
    var rollW = pos(i.rollWidthIn) || 20.5, rollL = pos(i.rollLengthFt) || 33;
    var repeat = pos(i.repeatIn);
    var doors = Math.max(0, Math.round(num(i.doors)));
    var perimeterIn = 2 * (L + W) * 12;
    // Full-height strips only: a door saves the strips it fully covers.
    var strips = Math.max(0, ceil(perimeterIn / rollW) - doors * Math.floor(36 / rollW));
    // Each strip needs the wall height + one pattern repeat + 4 in for trimming.
    var stripIn = H * 12 + repeat + 4;
    var perRoll = stripIn > 0 ? Math.floor(rollL * 12 / stripIn) : 0;
    var rolls = strips > 0 && perRoll > 0 ? ceil(strips / perRoll) : 0;
    return {
      perimeterFt: perimeterIn / 12, wallSqFt: 2 * (L + W) * H, strips: strips,
      stripIn: stripIn, perRoll: perRoll, rolls: rolls, tooTall: H > 0 && perRoll === 0
    };
  }

  /* ---------- Fence ---------- */
  function fence(i) {
    var len = pos(i.length), spacing = pos(i.postSpacing) || 8;
    var height = pos(i.height);
    var rails = Math.max(1, Math.round(num(i.rails, 2)));
    var pw = pos(i.picketWidthIn), gap = pos(i.gapIn);
    var posts = len > 0 ? ceil(len / spacing) + 1 : 0;
    var sections = Math.max(0, posts - 1);
    var pickets = len > 0 && pw > 0 ? ceil(len * 12 / (pw + gap)) : 0;
    var r = pos(i.holeDiameterIn) / 2 / 12, d = pos(i.holeDepthIn) / 12;
    var postSide = 3.5 / 12; // a 4x4 post is 3.5 in square
    var perPost = Math.max(0, Math.PI * r * r * d - postSide * postSide * d);
    var concreteCuFt = perPost * posts;
    var postLen = height + d;
    var stock = [8, 10, 12, 14, 16].filter(function (x) { return x >= postLen - 1e-9; })[0] || ceil(postLen);
    return {
      posts: posts, sections: sections, rails: sections * rails, pickets: pickets,
      fasteners: pickets * rails * 2,
      concreteCuFt: concreteCuFt, bags: concreteCuFt > 0 ? ceil(concreteCuFt * 1.1 / 0.6) : 0,
      postLength: stock
    };
  }

  /* ---------- Deck boards and joists ---------- */
  function evenLength(ft) { return [8, 10, 12, 14, 16, 18, 20].filter(function (x) { return x >= ft - 1e-9; })[0] || ceil(ft); }
  function deck(i) {
    var L = pos(i.length), W = pos(i.width);
    var bw = pos(i.boardWidthIn) || 5.5, gap = pos(i.gapIn), blen = pos(i.boardLengthFt) || 16;
    var spacing = pos(i.joistSpacingIn) || 16, waste = num(i.wastePct, 10) / 100;
    var rows = L > 0 && W > 0 ? ceil(W * 12 / (bw + gap)) : 0;
    var lf = rows * L;
    var boards = lf > 0 ? ceil(lf * (1 + waste) / blen) : 0;
    var joists = L > 0 ? Math.floor(L * 12 / spacing + 1e-9) + 1 : 0;
    return {
      area: L * W, rows: rows, linearFt: lf, boards: boards,
      joists: W > 0 ? joists : 0, joistLength: evenLength(W),
      screws: W > 0 ? rows * joists * 2 : 0
    };
  }

  /* ---------- Roofing ---------- */
  function roofing(i) {
    var L = pos(i.length), W = pos(i.width), o = pos(i.overhangIn) / 12;
    var pitch = pos(i.pitch);
    var factor = Math.sqrt(1 + Math.pow(pitch / 12, 2));
    var footprint = (L + 2 * o) * (W + 2 * o);
    var area = footprint * factor;
    var waste = i.roofType === 'hip' ? 0.15 : 0.10;
    if (i.wastePct !== undefined && i.wastePct !== '') waste = pos(i.wastePct) / 100;
    var squares = area / 100;
    var buySquares = squares * (1 + waste);
    var bundles = area > 0 ? ceil(buySquares * 3) : 0;
    var rollSqFt = pos(i.underlaymentSqFt) || 1000;
    return {
      factor: factor, footprint: footprint, area: area, squares: squares, waste: waste, buySquares: buySquares,
      bundles: bundles,
      nails: bundles > 0 ? ceil(bundles / 3) * 320 : 0,
      underlaymentRolls: area > 0 ? ceil(area * 1.1 / rollSqFt) : 0,
      dripEdgeFt: L > 0 && W > 0 ? 2 * (L + 2 * o + W + 2 * o) : 0,
      dripEdgePieces: L > 0 && W > 0 ? ceil(2 * (L + 2 * o + W + 2 * o) / 10) : 0,
      ridgeFt: i.roofType === 'hip' ? Math.max(0, L - W) : L + 2 * o
    };
  }

  /* ---------- Pavers ---------- */
  function pavers(i) {
    var a = totalArea(i.shapes);
    var pl = pos(i.paverL), pw = pos(i.paverW);
    var waste = num(i.wastePct, 10) / 100;
    var edge = pos(i.edgeFt), baseIn = pos(i.baseIn), sandIn = pos(i.sandIn);
    var paverSqFt = pl * pw / 144;
    var count = a > 0 && paverSqFt > 0 ? ceil(a * (1 + waste) / paverSqFt) : 0;
    // The base runs past the edges by about its own depth.
    var baseArea = a + edge * (baseIn / 12);
    var baseCuYd = baseArea * (baseIn / 12) / CU_FT_PER_CU_YD;
    var sandCuFt = a * (sandIn / 12);
    return {
      area: a, paverSqFt: paverSqFt, pavers: count,
      baseCuYd: baseCuYd, baseTons: baseCuYd * 1.4,
      sandCuFt: sandCuFt, sandCuYd: sandCuFt / CU_FT_PER_CU_YD, sandBags: sandCuFt > 0 ? ceil(sandCuFt / 0.5) : 0,
      edgePieces: edge > 0 ? ceil(edge * 1.05 / 8) : 0
    };
  }

  /* ---------- Stairs ---------- */
  function stairs(i) {
    var rise = pos(i.totalRiseIn), maxR = pos(i.maxRiserIn) || 7.75, tread = pos(i.treadIn);
    var widthIn = pos(i.widthIn), spacing = pos(i.stringerSpacingIn) || 16;
    var risers = rise > 0 ? ceil(rise / maxR) : 0;
    var riser = risers ? rise / risers : 0;
    var treads = Math.max(0, risers - 1);
    var run = treads * tread;
    var stringerIn = Math.sqrt(rise * rise + run * run);
    return {
      risers: risers, riser: riser, treads: treads, run: run,
      stringerFt: stringerIn / 12, stringerBoard: evenLength(stringerIn / 12),
      stringers: widthIn > 0 ? ceil(widthIn / spacing) + 1 : 0,
      angle: run > 0 ? Math.atan(rise / run) * 180 / Math.PI : 0,
      comfort: 2 * riser + tread,
      riserOk: riser <= 7.75 + 1e-9, treadOk: tread >= 10 - 1e-9
    };
  }

  /* ---------- Sod and grass seed ---------- */
  function lawn(i) {
    var a = totalArea(i.shapes);
    var piece = pos(i.pieceSqFt) || 2.6667, pallet = pos(i.palletSqFt) || 450;
    var withWaste = a * 1.05;
    var rate = pos(i.seedRate), bag = pos(i.bagLb) || 25;
    var seedLb = a / 1000 * rate;
    return {
      area: a, pieces: a > 0 ? ceil(withWaste / piece) : 0, pallets: a > 0 ? ceil(withWaste / pallet) : 0,
      palletsExact: withWaste / pallet,
      seedLb: seedLb, seedBags: seedLb > 0 ? ceil(seedLb / bag) : 0
    };
  }

  /* ---------- Insulation ---------- */
  // Blown-in attic coverage: R-value -> [minimum bags per 1,000 sq ft, minimum settled inches].
  // Fiberglass: Owens Corning AttiCat (28.5 lb bag). Cellulose: Greenfiber SANCTUARY (25 lb bag).
  var BLOWN_CHART = {
    fiberglass: [[13, 6.6, 4.5], [19, 9.4, 6.5], [22, 11.1, 7.5], [25, 13.3, 8.75], [30, 15.3, 10.25],
      [38, 19.5, 13], [44, 23.0, 14.75], [49, 25.8, 16.5], [60, 32.1, 20]],
    cellulose: [[13, 15.2, 3.6], [19, 22.6, 5.3], [22, 26.3, 6.1], [30, 38.6, 8.3], [38, 52.6, 10.4],
      [44, 63.5, 12], [49, 70.8, 13.3], [60, 86.0, 16.1]]
  };
  // Square feet per bag of Owens Corning EcoTouch batts, by R-value (label figures).
  var BATT_SQFT = { 13: 106.56, 19: 78.79, 21: 67.81, 30: 58.67, 38: 42.67 };
  var BATT_INCHES = { 13: 3.5, 19: 6.25, 21: 5.5, 30: 9.5, 38: 12 };
  // ENERGY STAR: R-value per inch of existing insulation, by type.
  var R_PER_INCH = { fiberglass: 2.5, rockwool: 2.8, cellulose: 3.7, batts: 3.2 };

  // Straight-line reading of a coverage chart, starting from zero at R-0 and
  // continuing the last step past the top row.
  function blownFor(material, r) {
    var rows = [[0, 0, 0]].concat(BLOWN_CHART[material] || BLOWN_CHART.fiberglass);
    if (r <= 0) return { bagsPer1000: 0, inches: 0 };
    for (var k = 1; k < rows.length; k++) {
      if (r <= rows[k][0] + 1e-9 || k === rows.length - 1) {
        var a = rows[k - 1], b = rows[k], t = (r - a[0]) / (b[0] - a[0]);
        return { bagsPer1000: a[1] + t * (b[1] - a[1]), inches: a[2] + t * (b[2] - a[2]) };
      }
    }
  }

  function insulation(i) {
    var walls = i.mode !== 'attic';
    var doors = Math.max(0, Math.round(num(i.doors))), windows = Math.max(0, Math.round(num(i.windows)));
    var area = walls ? Math.max(0, pos(i.wallLength) * pos(i.wallHeight) - doors * DOOR_SQFT - windows * WINDOW_SQFT)
      : pos(i.area);
    var material = walls ? 'batts' : (BLOWN_CHART[i.material] ? i.material : 'batts');
    var out = { mode: walls ? 'walls' : 'attic', material: material, area: area };
    if (material === 'batts') {
      var r = Math.round(num(walls ? i.wallR : i.battR, walls ? 13 : 30));
      if (!BATT_SQFT[r]) r = walls ? 13 : 30;
      var bagSqFt = pos(i.bagSqFt) > 0 ? pos(i.bagSqFt) : BATT_SQFT[r];
      var existingR = walls ? 0 : pos(i.existingIn) * (R_PER_INCH[i.existingType] || R_PER_INCH.fiberglass);
      out.rValue = r; out.bagSqFt = bagSqFt; out.inches = BATT_INCHES[r];
      out.bags = area > 0 ? ceil(area / bagSqFt) : 0;
      out.existingR = existingR; out.totalR = existingR + r;
      return out;
    }
    var target = pos(i.targetR) || 49;
    var existing = pos(i.existingIn) * (R_PER_INCH[i.existingType] || R_PER_INCH.fiberglass);
    var addR = Math.max(0, target - existing);
    var chart = blownFor(material, addR);
    var perK = pos(i.bagsPer1000) > 0 ? pos(i.bagsPer1000) : chart.bagsPer1000;
    out.targetR = target; out.existingR = existing; out.addR = addR;
    out.bagsPer1000 = perK; out.inches = chart.inches;
    out.bags = area > 0 && addR > 0 ? ceil(area * perK / 1000) : 0;
    return out;
  }

  /* ---------- Baseboard and trim ---------- */
  var CAULK_FT_PER_TUBE = 55;   // DAP: 10.1 oz tube, 3/16 in bead
  var CASING_PIECES = 3;        // two legs and a head from 7 ft pieces, per door side or window
  var DOOR_CASING_FT = 17, WINDOW_CASING_FT = 16;
  function baseboard(i) {
    var perimeter = i.mode === 'walls' ? pos(i.totalLength) : 2 * (pos(i.length) + pos(i.width));
    var openings = Math.max(0, Math.round(num(i.openings)));
    var openingFt = pos(i.openingIn) / 12;
    var lf = Math.max(0, perimeter - openings * openingFt);
    var waste = num(i.wastePct, 10) / 100;
    var pieceFt = pos(i.pieceFt) || 16;
    var pieces = lf > 0 ? ceil(lf * (1 + waste) / pieceFt) : 0;
    var shoe = i.shoe ? (lf > 0 ? ceil(lf * (1 + waste) / 8) : 0) : 0;
    var doorSides = i.casing ? Math.max(0, Math.round(num(i.doorSides))) : 0;
    var casedWindows = i.casing ? Math.max(0, Math.round(num(i.casedWindows))) : 0;
    var casingFt = doorSides * DOOR_CASING_FT + casedWindows * WINDOW_CASING_FT;
    var studSpots = function (ft) { return ft > 0 ? ceil(ft * 12 / 16) : 0; };
    var nails = 2 * studSpots(lf) + (i.shoe ? studSpots(lf) : 0) + 2 * studSpots(casingFt);
    var caulkFt = lf + casingFt;
    return {
      perimeter: perimeter, openingsFt: openings * openingFt, linearFt: lf, waste: waste,
      pieceFt: pieceFt, pieces: pieces, boughtFt: pieces * pieceFt, shoePieces: shoe,
      casingFt: casingFt, casingPieces: (doorSides + casedWindows) * CASING_PIECES,
      nails: nails, nailBoxes: nails > 0 ? ceil(nails / 1000) : 0,
      caulkFt: caulkFt, caulkTubes: caulkFt > 0 ? ceil(caulkFt / CAULK_FT_PER_TUBE) : 0
    };
  }

  /* ---------- Grout ---------- */
  // Weight per cubic inch of joint, matched to Custom Building Products' coverage charts:
  // Polyblend Plus sanded about 0.065 lb, non-sanded about 0.062 lb. SimpleGrout pre-mixed:
  // a gallon fills about 220 cubic inches of joint.
  var GROUT = {
    sanded:   { lbPerCuIn: 0.065, minJoint: 0.125, maxJoint: 0.5 },
    unsanded: { lbPerCuIn: 0.062, minJoint: 0, maxJoint: 0.125 },
    premixed: { cuInPerGal: 220, minJoint: 0.0625, maxJoint: 0.5 }
  };
  // Joint volume per square foot: each tile plus one joint is a repeating block.
  function groutCuInPerSqFt(tl, tw, joint, depth) {
    if (!(tl > 0 && tw > 0)) return 0;
    var block = (tl + joint) * (tw + joint);
    return 144 * (block - tl * tw) * depth / block;
  }
  function grout(i) {
    var area = pos(i.area), tl = pos(i.tileL), tw = pos(i.tileW);
    var joint = pos(i.jointIn), depth = pos(i.thicknessIn);
    var type = GROUT[i.type] ? i.type : 'sanded', g = GROUT[type];
    var extra = num(i.wastePct, 10) / 100;
    var perSqFt = groutCuInPerSqFt(tl, tw, joint, depth);
    var cuIn = area * perSqFt * (1 + extra);
    var out = { type: type, area: area, cuInPerSqFt: perSqFt, cuIn: cuIn, extra: extra,
      jointOk: joint >= g.minJoint - 1e-9 && joint <= g.maxJoint + 1e-9 };
    if (type === 'premixed') {
      var gal = cuIn / g.cuInPerGal;
      var whole = Math.floor(gal + 1e-9), rem = gal - whole, quarts = 0;
      if (rem > 1e-9) { if (rem <= 0.25 + 1e-9) quarts = 1; else if (rem <= 0.5 + 1e-9) quarts = 2; else whole += 1; }
      out.gallons = gal; out.buyGallons = whole; out.buyQuarts = quarts;
      out.sqFtPerGal = perSqFt > 0 ? g.cuInPerGal / perSqFt : 0;
      return out;
    }
    var lb = cuIn * g.lbPerCuIn;
    out.lb = lb;
    if (type === 'sanded') {
      // 25 lb bags, with a 7 lb bag for a small remainder.
      var big = Math.floor(lb / 25 + 1e-9), left = lb - big * 25, small = 0;
      if (left > 1e-9) { if (left <= 7 + 1e-9) small = 1; else big += 1; }
      out.bags25 = big; out.bags7 = small;
      out.sqFtPer25 = perSqFt > 0 ? 25 / (perSqFt * g.lbPerCuIn) : 0;
    } else {
      out.boxes10 = lb > 0 ? ceil(lb / 10) : 0;
      out.sqFtPer10 = perSqFt > 0 ? 10 / (perSqFt * g.lbPerCuIn) : 0;
    }
    return out;
  }

  /* ---------- Reading a pasted measurement ---------- */
  // Turns text like 4' 3", 4 ft 3 in, 51 in, 4.25 ft, 1.3 m or 130 cm
  // (as copied from Apple's Measure app or typed) into feet + inches.
  function parseLength(text) {
    if (text === undefined || text === null) return null;
    var t = String(text).toLowerCase().trim()
      .replace(/[′’´`]/g, "'").replace(/[″”]|''/g, '"')
      .replace(/(\d),(\d)/g, '$1.$2').replace(/½/g, '.5').replace(/¼/g, '.25').replace(/¾/g, '.75');
    var m, inches = null;
    // Feet and inches together: 4' 3", 4 ft 3 in, 4ft 3.5in, 4 feet 3 inches
    if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot)\s*(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)?\b/))) inches = parseFloat(m[1]) * 12 + parseFloat(m[2]);
    else if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot)/))) inches = parseFloat(m[1]) * 12;
    else if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:"|in\b|inch|inches)/))) inches = parseFloat(m[1]);
    else if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:cm|centimet)/))) inches = parseFloat(m[1]) / 2.54;
    else if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:mm|millimet)/))) inches = parseFloat(m[1]) / 25.4;
    else if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:m\b|meter|metre)/))) inches = parseFloat(m[1]) * 39.3701;
    else if ((m = t.match(/^(\d+(?:\.\d+)?)$/))) inches = parseFloat(m[1]) * 12; // a bare number means feet
    if (inches === null || !isFinite(inches) || inches <= 0) return null;
    return splitInches(inches);
  }
  // Whole feet + inches rounded to the nearest half inch.
  function splitInches(totalIn) {
    var half = Math.round(totalIn * 2) / 2;
    var ft = Math.floor(half / 12 + 1e-9);
    var inch = Math.round((half - ft * 12) * 2) / 2;
    return { ft: ft, inch: inch, totalIn: totalIn };
  }

  return {
    num: num, ceil: ceil, round: round, parseLength: parseLength, splitInches: splitInches,
    area: area, volume: volume, drywall: drywall, SHEET_SQFT: SHEET_SQFT, wallpaper: wallpaper, fence: fence,
    deck: deck, roofing: roofing, pavers: pavers, stairs: stairs, lawn: lawn, evenLength: evenLength,
    shapeArea: shapeArea, totalArea: totalArea,
    paint: paint, paintPurchase: paintPurchase,
    concrete: concrete, concreteVolume: concreteVolume, BAG_YIELD: BAG_YIELD,
    tile: tile, PATTERN_WASTE: PATTERN_WASTE, THINSET_COVERAGE: THINSET_COVERAGE,
    bulk: bulk, MATERIALS: MATERIALS,
    flooring: flooring, FLOOR_WASTE: FLOOR_WASTE,
    insulation: insulation, blownFor: blownFor, BLOWN_CHART: BLOWN_CHART, BATT_SQFT: BATT_SQFT, R_PER_INCH: R_PER_INCH,
    baseboard: baseboard, grout: grout, groutCuInPerSqFt: groutCuInPerSqFt, GROUT: GROUT,
    constants: { DOOR_SQFT: DOOR_SQFT, WINDOW_SQFT: WINDOW_SQFT, TAPE_ROLL_FT: TAPE_ROLL_FT, GROUT_LB_PER_CU_IN: GROUT_LB_PER_CU_IN }
  };
});
