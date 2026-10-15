/*
 * ProjectMath formulas.
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
  var THINSET_COVERAGE = { '1/4x1/4': 95, '1/4x3/8': 70, '1/2x1/2': 45 };
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

  return {
    num: num, ceil: ceil, round: round,
    shapeArea: shapeArea, totalArea: totalArea,
    paint: paint, paintPurchase: paintPurchase,
    concrete: concrete, BAG_YIELD: BAG_YIELD,
    tile: tile, PATTERN_WASTE: PATTERN_WASTE, THINSET_COVERAGE: THINSET_COVERAGE,
    bulk: bulk, MATERIALS: MATERIALS,
    flooring: flooring, FLOOR_WASTE: FLOOR_WASTE,
    constants: { DOOR_SQFT: DOOR_SQFT, WINDOW_SQFT: WINDOW_SQFT, TAPE_ROLL_FT: TAPE_ROLL_FT, GROUT_LB_PER_CU_IN: GROUT_LB_PER_CU_IN }
  };
});
