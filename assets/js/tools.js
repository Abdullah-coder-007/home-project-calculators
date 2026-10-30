/*
 * Calculator definitions. Each tool turns form values into:
 *   headline: { value, unit, sub }  -> the tape-measure band
 *   items:    shopping list rows { key, name, qty, unit, price, note, dp }
 *   notes:    short tips shown under the list
 * Prices are starting estimates only; visitors edit them for their store.
 */
(function () {
  'use strict';
  function fmt(n, dp) {
    return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: dp || 0, maximumFractionDigits: dp || 0 });
  }
  function plural(n, one, many) { return n === 1 ? one : many; }
  function gallonText(buy) {
    var parts = [];
    if (buy.gallons) parts.push(buy.gallons + ' ' + plural(buy.gallons, 'gallon', 'gallons'));
    if (buy.quarts) parts.push(buy.quarts + ' quart');
    return parts.join(' + ') || '0 gallons';
  }

  var T = {};

  /* ---------- Paint ---------- */

  /* ---------- Local pack sizes (outside the US and Canada) ----------
   * Paint is sold in litre tins, concrete in kg bags and board in metric sheets in most
   * countries. Prices here are typical local shelf prices in the local currency
   * (item.local = true, so they are not converted again). */
  function country() { return window.PMLocale ? window.PMLocale.country() : 'US'; }
  var PAINT_LOCAL = {
    IN: { tins: [20, 10, 4, 1], perL: { wall: 270, ceil: 220, primer: 180 } },
    GB: { tins: [10, 5, 2.5], perL: { wall: 7, ceil: 5, primer: 6 } },
    IE: { tins: [10, 5, 2.5, 1], perL: { wall: 8, ceil: 6, primer: 7 } },
    EU: { tins: [10, 5, 2.5, 1], perL: { wall: 8, ceil: 6, primer: 7 } },
    AU: { tins: [15, 10, 4, 1], perL: { wall: 22, ceil: 15, primer: 18 } },
    NZ: { tins: [10, 4, 1], perL: { wall: 24, ceil: 17, primer: 20 } }
  };
  function tinPremium(size) { return size <= 1 ? 1.3 : size <= 2.5 ? 1.1 : size <= 5 ? 1 : size <= 10 ? 0.92 : 0.88; }
  function tinPrice(size, perL) { var p = size * perL * tinPremium(size); return p >= 100 ? Math.round(p / 5) * 5 : Math.round(p); }
  // Cheapest mix of tin sizes that holds at least `litres` (half-litre steps).
  function bestTins(litres, sizes, perL) {
    if (!(litres > 0)) return [];
    var need = Math.ceil(litres * 2), top = need + Math.max.apply(null, sizes) * 2;
    var cost = [0], pick = [null];
    for (var u = 1; u <= top; u++) {
      cost[u] = Infinity; pick[u] = null;
      sizes.forEach(function (sz) {
        var k = Math.round(sz * 2);
        if (k <= u && cost[u - k] + tinPrice(sz, perL) < cost[u]) { cost[u] = cost[u - k] + tinPrice(sz, perL); pick[u] = sz; }
      });
    }
    var bestU = need;
    for (var w = need; w <= top; w++) if (cost[w] < cost[bestU]) bestU = w;
    var counts = {};
    for (var x = bestU; x > 0 && pick[x];) { counts[pick[x]] = (counts[pick[x]] || 0) + 1; x -= Math.round(pick[x] * 2); }
    return Object.keys(counts).map(Number).sort(function (a, b) { return b - a; }).map(function (sz) { return { size: sz, count: counts[sz] }; });
  }
  function litresOf(tins) { return tins.reduce(function (t, x) { return t + x.size * x.count; }, 0); }
  function tinsText(tins) { return tins.map(function (x) { return x.count + ' × ' + x.size + ' L'; }).join(' + '); }
  var CONCRETE_LOCAL = {
    GB: { kg: 25, cuFt: 0.39, price: 6.5 }, IE: { kg: 25, cuFt: 0.39, price: 7 }, EU: { kg: 25, cuFt: 0.39, price: 7 },
    AU: { kg: 20, cuFt: 0.34, price: 10 }, NZ: { kg: 20, cuFt: 0.34, price: 12 }
  };
  var BOARD_LOCAL = {
    GB: { label: '2400 × 1200 mm plasterboard', sqft: 31.0, price: 10, filler: 15 },
    IE: { label: '2400 × 1200 mm plasterboard', sqft: 31.0, price: 9, filler: 15 },
    EU: { label: '2400 × 1200 mm plasterboard', sqft: 31.0, price: 9, filler: 15 },
    AU: { label: '2400 × 1200 mm plasterboard', sqft: 31.0, price: 20, filler: 30 },
    NZ: { label: '2400 × 1200 mm plasterboard', sqft: 31.0, price: 24, filler: 35 },
    IN: { label: '1830 × 1220 mm (6 × 4 ft) gypsum board', sqft: 24.0, price: 480, filler: 650 }
  };

  T.paint = {
    calc: function (v, F) {
      var r = F.paint(v);
      var ready = r.wallArea > 0 || r.ceilingArea > 0;
      var loc = PAINT_LOCAL[country()];
      if (loc) return paintLocal(r, ready, loc);
      var items = [
        { key: 'wall-gal', name: 'Wall paint', qty: r.wallBuy.gallons, unit: plural(r.wallBuy.gallons, 'gallon', 'gallons'), unitSingle: 'gallon', price: 40 },
        { key: 'wall-qt', name: 'Wall paint, extra quart', qty: r.wallBuy.quarts, unit: 'quart', price: 16 },
        { key: 'ceil-gal', name: 'Ceiling paint (flat white)', qty: r.ceilingBuy.gallons, unit: plural(r.ceilingBuy.gallons, 'gallon', 'gallons'), unitSingle: 'gallon', price: 32 },
        { key: 'ceil-qt', name: 'Ceiling paint, extra quart', qty: r.ceilingBuy.quarts, unit: 'quart', price: 14 },
        { key: 'primer-gal', name: 'Primer', qty: r.primerBuy.gallons, unit: plural(r.primerBuy.gallons, 'gallon', 'gallons'), unitSingle: 'gallon', price: 28 },
        { key: 'primer-qt', name: 'Primer, extra quart', qty: r.primerBuy.quarts, unit: 'quart', price: 12 },
        { key: 'tape', name: "Painter's tape, 60 yd roll", qty: r.tapeRolls, unit: plural(r.tapeRolls, 'roll', 'rolls'), unitSingle: 'roll', price: 7 },
        { key: 'roller', name: 'Roller frame, 3/8 in nap covers, tray', qty: ready ? 1 : 0, unit: 'kit', price: 18 },
        { key: 'brush', name: '2.5 in angled brush for cutting in', qty: ready ? 1 : 0, unit: 'brush', price: 12 }
      ];
      var notes = [];
      if (ready) {
        notes.push(fmt(r.wallArea) + ' sq ft of wall to paint after removing ' + fmt(r.openings) + ' sq ft of doors and windows.');
        if (r.wallGallons + r.ceilingGallons > 4.5) notes.push('Over 4 gallons of one color: a 5-gallon bucket is usually cheaper than single gallons.');
        notes.push('Going from a dark color to a light one often needs primer or a third coat.');
      }
      return {
        ready: ready,
        headline: {
          value: !ready ? '0' : String(r.wallBuy.gallons || r.wallBuy.quarts),
          unit: !ready ? 'Enter your room size'
            : r.wallBuy.gallons === 0 ? 'quart of wall paint'
            : plural(r.wallBuy.gallons, 'gallon', 'gallons') + (r.wallBuy.quarts ? ' + 1 quart' : '') + ' of wall paint',
          sub: ready ? fmt(r.wallGallons, 2) + ' gallons needed for ' + r.coats + ' ' + plural(r.coats, 'coat', 'coats') +
            (r.ceilingArea ? ', plus ' + gallonText(r.ceilingBuy) + ' for the ceiling' : '') : ''
        },
        items: items, notes: notes
      };
    }
  };

  function paintLocal(r, ready, loc) {
    var G = 3.78541, items = [], wallL = r.wallGallons * G, ceilL = r.ceilingGallons * G, primerL = r.primerGallons * G;
    var wall = bestTins(wallL, loc.tins, loc.perL.wall), ceil = bestTins(ceilL, loc.tins, loc.perL.ceil), primer = bestTins(primerL, loc.tins, loc.perL.primer);
    function add(tins, key, label, perL) {
      tins.forEach(function (t) {
        items.push({ key: key + '-' + t.size + 'L', name: label + ', ' + t.size + ' L tin', qty: t.count, unit: plural(t.count, 'tin', 'tins'), unitSingle: 'tin', price: tinPrice(t.size, perL), local: true });
      });
    }
    add(wall, 'wall', 'Wall paint', loc.perL.wall);
    add(ceil, 'ceil', 'Ceiling paint (flat white)', loc.perL.ceil);
    add(primer, 'primer', 'Primer', loc.perL.primer);
    items.push({ key: 'tape', name: "Painter's tape, 50 m roll", qty: r.tapeRolls, unit: plural(r.tapeRolls, 'roll', 'rolls'), unitSingle: 'roll', price: 7 });
    items.push({ key: 'roller', name: 'Roller, covers and tray', qty: ready ? 1 : 0, unit: 'kit', price: 18 });
    items.push({ key: 'brush', name: '63 mm angled brush for cutting in', qty: ready ? 1 : 0, unit: 'brush', price: 12 });
    var notes = [];
    if (ready) {
      notes.push(fmt(r.wallArea * 0.092903, 1) + ' m\u00b2 of wall to paint after removing doors and windows, at about 8.6 m\u00b2 per litre per coat.');
      notes.push('Check the coverage on the tin you buy: it ranges from about 8 to 14 m\u00b2 per litre.');
      notes.push('Going from a dark color to a light one often needs primer or a third coat.');
    }
    var bought = litresOf(wall);
    return {
      ready: ready,
      headline: {
        value: ready ? fmt(bought, bought % 1 ? 1 : 0) : '0',
        unit: ready ? 'litres of wall paint' : 'Enter your room size',
        sub: ready ? fmt(wallL, 1) + ' L needed for ' + r.coats + ' ' + plural(r.coats, 'coat', 'coats') + ': ' + tinsText(wall) +
          (ceil.length ? ', plus ' + tinsText(ceil) + ' for the ceiling' : '') : ''
      },
      items: items, notes: notes
    };
  }

  /* ---------- Concrete ---------- */
  var BAG_PRICE = { 40: 4.25, 60: 5.25, 80: 6.5 };
  T.concrete = {
    prepare: function (form) {
      var mode = (form.querySelector('[name=mode]:checked') || {}).value || 'slab';
      Array.prototype.forEach.call(form.querySelectorAll('[data-mode]'), function (g) {
        g.hidden = g.getAttribute('data-mode') !== mode;
      });
    },
    calc: function (v, F) {
      // Footing length has its own fields so it doesn't clash with the slab's.
      if (v.mode === 'footing') v.length = v.flength;
      if (v.mode === 'round') v.depthIn = v.holeDepthIn;
      var r = F.concrete(v);
      var ready = r.cuFt > 0;
      if (country() === 'IN') return concreteIndia(r, ready);
      var cl = CONCRETE_LOCAL[country()];
      if (cl) {
        var bagsL = ready ? Math.ceil(r.cuFtTotal / cl.cuFt) : 0, m3 = r.cuFtTotal * 0.0283168;
        return {
          ready: ready,
          headline: { value: ready ? fmt(bagsL) : '0', unit: ready ? cl.kg + ' kg ' + plural(bagsL, 'bag', 'bags') + ' of concrete mix' : 'Enter your dimensions',
            sub: ready ? fmt(m3, 2) + ' m\u00b3 including waste' : '' },
          items: [{ key: 'bag-local', name: cl.kg + ' kg bags of concrete mix', qty: bagsL, unit: plural(bagsL, 'bag', 'bags'), unitSingle: 'bag', price: cl.price, local: true, note: 'Each makes about ' + fmt(cl.cuFt * 28.3168, 0) + ' litres' }],
          notes: ready ? ['Volume: ' + fmt(r.cuFt * 0.0283168, 2) + ' m\u00b3, plus ' + Math.round(r.waste * 100) + '% extra for spills and uneven ground.',
            m3 >= 0.75 ? 'At ' + fmt(m3, 2) + ' m\u00b3, a ready-mix or mix-on-site delivery is usually easier than mixing bags by hand.' : 'Rent a small drum mixer for jobs over about 20 bags.'] : []
        };
      }
      var items = [
        { key: 'bag-' + r.bagSize, name: r.bagSize + ' lb bags of concrete mix', qty: r.bags, unit: plural(r.bags, 'bag', 'bags'), unitSingle: 'bag', price: BAG_PRICE[r.bagSize], note: 'Each yields about ' + r.bagYield + ' cu ft' }
      ];
      var notes = [];
      if (ready) {
        notes.push('Volume: ' + fmt(r.cuFt, 2) + ' cu ft, plus ' + Math.round(r.waste * 100) + '% extra for spills and uneven ground.');
        if (r.suggestReadyMix) notes.push('At ' + fmt(r.cuYd, 2) + ' cubic yards, ready-mix delivery (about ' + r.readyMixYd + ' yd) is usually easier than mixing ' + r.bags + ' bags by hand. Ask suppliers about short-load fees.');
        if (r.bags > 20 && !r.suggestReadyMix) notes.push('Rent a small drum mixer for jobs over about 20 bags.');
        if (v.mode === 'steps') notes.push('This is for solid steps. Big steps are often built over compacted gravel fill, which can cut the concrete needed by a third or more.');
        if (v.mode === 'curb') notes.push('Curb and gutter usually needs forms or a slip-form machine; ask your supplier about a low-slump mix for curbs.');
        if (v.mode === 'square') notes.push('Tall columns need reinforcing steel and sturdy forms. Check your local code or an engineer for structural columns.');
        notes.push('One 80 lb bag weighs as much as a large dog. Plan how you will move them.');
      }
      return {
        ready: ready,
        headline: {
          value: ready ? fmt(r.bags) : '0',
          unit: ready ? r.bagSize + ' lb ' + plural(r.bags, 'bag', 'bags') : 'Enter your dimensions',
          sub: ready ? fmt(r.cuYd, 2) + ' cubic yards (' + fmt(r.cuFtTotal, 1) + ' cu ft) including waste' : ''
        },
        items: items, notes: notes
      };
    }
  };

  // India: concrete is usually mixed on site from cement, sand and aggregate.
  // M15 nominal mix (1:2:4) per cubic metre: about 6.34 bags of cement (50 kg),
  // 0.44 m3 of sand and 0.88 m3 of aggregate.
  function concreteIndia(r, ready) {
    var m3 = r.cuFtTotal * 0.0283168, CFT = 35.3147;
    var cement = ready ? Math.ceil(m3 * 6.34) : 0, sand = m3 * 0.44 * CFT, agg = m3 * 0.88 * CFT;
    return {
      ready: ready,
      headline: { value: ready ? fmt(cement) : '0', unit: ready ? plural(cement, 'bag', 'bags') + ' of cement (50 kg)' : 'Enter your dimensions',
        sub: ready ? fmt(m3, 2) + ' m\u00b3 of M15 concrete (1:2:4) including waste' : '' },
      items: [
        { key: 'cement', name: 'Cement, 50 kg bag (OPC or PPC)', qty: cement, unit: plural(cement, 'bag', 'bags'), unitSingle: 'bag', price: 375, local: true },
        { key: 'sand-in', name: 'Sand (river or M-sand)', qty: Math.ceil(sand), unit: 'cft', unitSingle: 'cft', price: 50, local: true },
        { key: 'agg-in', name: '20 mm aggregate (jelly)', qty: Math.ceil(agg), unit: 'cft', unitSingle: 'cft', price: 45, local: true }
      ],
      notes: ready ? ['Mix 1 part cement, 2 parts sand and 4 parts aggregate by volume, with clean water.',
        'For roof slabs and columns, engineers usually ask for M20 or stronger; check with yours.',
        m3 >= 3 ? 'At ' + fmt(m3, 1) + ' m\u00b3, ready-mix (RMC) delivery is worth a quote.' : 'Keep the concrete wet for at least 7 days (curing) so it reaches full strength.'] : []
    };
  }

  /* ---------- Tile ---------- */
  T.tile = {
    defaultShapes: [{ type: 'rect', l: 10, w: 10 }],
    calc: function (v, F) {
      var r = F.tile(v);
      var ready = r.area > 0 && r.tiles > 0;
      var groutBags = r.groutLb <= 0 ? 0 : (r.groutLb <= 10 ? 1 : Math.ceil(r.groutLb / 25));
      var groutSize = r.groutLb <= 10 ? '10 lb' : '25 lb';
      var items = [];
      if (r.boxes) items.push({ key: 'box', name: 'Tile', qty: r.boxes, unit: plural(r.boxes, 'box', 'boxes'), unitSingle: 'box', price: 45, note: fmt(r.tiles) + ' tiles' });
      else items.push({ key: 'tile', name: 'Tile', qty: r.tiles, unit: plural(r.tiles, 'tile', 'tiles'), unitSingle: 'tile', price: 3 });
      items.push({ key: 'thinset', name: 'Thinset mortar, 50 lb bag', qty: r.thinsetBags, unit: plural(r.thinsetBags, 'bag', 'bags'), unitSingle: 'bag', price: 22, note: 'About ' + r.thinsetCoverage + ' sq ft per bag with this trowel' });
      items.push({ key: 'grout-' + groutSize, name: 'Grout, ' + groutSize + ' bag', qty: groutBags, unit: plural(groutBags, 'bag', 'bags'), unitSingle: 'bag', price: groutSize === '10 lb' ? 16 : 26, note: 'About ' + fmt(r.groutLb, 1) + ' lb needed' });
      items.push({ key: 'spacers', name: 'Tile spacers', qty: ready ? 1 : 0, unit: 'pack', price: 6 });
      var notes = [];
      if (ready) {
        notes.push(fmt(r.area, 1) + ' sq ft plus ' + fmt(r.wastePct) + '% for cuts and breakage = ' + fmt(r.areaWithWaste, 1) + ' sq ft of tile.');
        notes.push('Buy all boxes from the same lot number so the color matches, and keep one spare box for future repairs.');
        notes.push('Grout and thinset amounts are estimates; check the coverage chart on the bag you buy.');
      }
      return {
        ready: ready,
        headline: {
          value: ready ? fmt(r.boxes || r.tiles) : '0',
          unit: ready ? (r.boxes ? plural(r.boxes, 'box of tile', 'boxes of tile') : plural(r.tiles, 'tile', 'tiles')) : 'Enter your area and tile size',
          sub: ready ? fmt(r.tiles) + ' tiles covering ' + fmt(r.areaWithWaste, 1) + ' sq ft with ' + fmt(r.wastePct) + '% extra' : ''
        },
        items: items, notes: notes
      };
    }
  };

  /* ---------- Mulch, soil, gravel ---------- */
  var BULK_PRICE = {
    mulch: { bag: 4.5, yd: 38, ton: 0 },
    topsoil: { bag: 3.5, yd: 35, ton: 0 },
    gravel: { bag: 5.5, yd: 0, ton: 55 },
    sand: { bag: 5, yd: 0, ton: 48 }
  };
  T.mulch = {
    prepare: function (form, v) {
      var m = window.PMF.MATERIALS[v.material] || window.PMF.MATERIALS.mulch;
      var bag = form.querySelector('[name=bagCuFt]');
      if (bag && !bag.hasAttribute('data-for')) {
        // First run: keep whatever the page or a shared link filled in.
        bag.setAttribute('data-for', v.material);
      } else if (bag && bag.getAttribute('data-for') !== v.material) {
        bag.value = m.bagCuFt;
        bag.setAttribute('data-for', v.material);
        v.bagCuFt = m.bagCuFt;
      }
    },
    defaultShapes: [{ type: 'rect', l: 20, w: 10 }],
    calc: function (v, F) {
      var r = F.bulk(v);
      var ready = r.cuFt > 0;
      var p = BULK_PRICE[v.material] || BULK_PRICE.mulch;
      var name = r.material.name;
      var heavy = r.material.tonsPerYd > 0;
      var items = [
        { key: 'bag', name: name + ', ' + r.bagCuFt + ' cu ft bags', qty: r.bags, unit: plural(r.bags, 'bag', 'bags'), unitSingle: 'bag', price: p.bag, note: 'If buying bagged' }
      ];
      if (heavy && p.ton) items.push({ key: 'ton', name: name + ', bulk delivery', qty: Math.ceil(r.tons * 2) / 2, unit: 'tons', unitSingle: 'ton', price: p.ton, dp: 1, note: 'If buying in bulk instead' });
      else items.push({ key: 'yd', name: name + ', bulk delivery', qty: r.bulkYd, unit: 'cu yd', unitSingle: 'cubic yard', price: p.yd, dp: 1, note: 'If buying in bulk instead' });
      var notes = [];
      if (ready) {
        notes.push('The list shows both ways to buy. Bagged and bulk are alternatives, so the total counts both; delete the price of the one you skip.');
        if (r.cuYd >= 2) notes.push('Above 2 cubic yards, bulk delivery is usually much cheaper per yard than bags.');
        if (v.material === 'mulch') notes.push('Keep mulch 2 to 3 inches from tree trunks and house siding.');
        if (heavy) notes.push('Roughly ' + fmt(r.tons, 2) + ' tons. Most pickup trucks can carry about half a ton to one ton safely; check your payload rating.');
      }
      return {
        ready: ready,
        headline: {
          value: ready ? fmt(r.cuYd, 2) : '0',
          unit: ready ? 'cubic yards of ' + name.toLowerCase() : 'Enter your area and depth',
          sub: ready ? fmt(r.cuFt, 1) + ' cu ft, or ' + fmt(r.bags) + ' bags of ' + r.bagCuFt + ' cu ft' + (heavy ? ', about ' + fmt(r.tons, 2) + ' tons' : '') : ''
        },
        items: items, notes: notes
      };
    }
  };

  /* ---------- Flooring ---------- */
  T.flooring = {
    defaultShapes: [{ type: 'rect', l: 15, w: 12 }],
    calc: function (v, F) {
      var r = F.flooring(v);
      var ready = r.area > 0 && r.boxes > 0;
      var boxPrice = Math.round(F.num(v.boxSqFt) * F.num(v.pricePerSqFt, 2.5) * 100) / 100;
      var items = [
        { key: 'box', name: 'Flooring', qty: r.boxes, unit: plural(r.boxes, 'box', 'boxes'), unitSingle: 'box', price: boxPrice, note: fmt(r.boughtSqFt) + ' sq ft total' },
        { key: 'underlay', name: 'Underlayment roll', qty: r.rolls, unit: plural(r.rolls, 'roll', 'rolls'), unitSingle: 'roll', price: 32 },
        { key: 'trim', name: 'Quarter-round or shoe molding, 8 ft', qty: r.trimPieces, unit: 'pieces', unitSingle: 'piece', price: 9 },
        { key: 'transition', name: 'Transition strip for doorways', qty: ready ? F.num(v.doorways) : 0, unit: 'strips', unitSingle: 'strip', price: 22 }
      ];
      var notes = [];
      if (ready) {
        notes.push(fmt(r.area, 1) + ' sq ft plus ' + fmt(r.wastePct) + '% for cuts = ' + fmt(r.areaWithWaste, 1) + ' sq ft.');
        notes.push('Let laminate and wood acclimate in the room for 48 hours before installing; check your product\'s instructions.');
        notes.push('Skip separate underlayment if your planks have a pad attached.');
      }
      return {
        ready: ready,
        headline: {
          value: ready ? fmt(r.boxes) : '0',
          unit: ready ? plural(r.boxes, 'box of flooring', 'boxes of flooring') : 'Enter your area and box size',
          sub: ready ? fmt(r.boughtSqFt) + ' sq ft for a ' + fmt(r.area, 1) + ' sq ft room with ' + fmt(r.wastePct) + '% extra' : ''
        },
        items: items, notes: notes
      };
    }
  };


  function ready0(n) { return n > 0; }

  /* ---------- Square footage ---------- */
  T.area = {
    defaultShapes: [{ type: 'rect', l: 15, w: 12 }],
    calc: function (v, F) {
      var r = F.area(v), ready = r.sqft > 0;
      var notes = ready ? [
        fmt(r.sqyd, 2) + ' square yards (carpet is often priced this way)',
        fmt(r.sqm, 2) + ' square meters',
        r.acres >= 0.01 ? fmt(r.acres, 3) + ' acres' : fmt(r.acres, 5) + ' acres'
      ] : [];
      return {
        ready: ready,
        headline: { value: ready ? fmt(r.sqft, 1) : '0', unit: ready ? 'square feet' : 'Enter your measurements',
          sub: ready ? fmt(r.sqyd, 2) + ' sq yd · ' + fmt(r.sqm, 2) + ' m²' : '' },
        items: [{ key: 'material', name: 'Material at your price per sq ft', qty: Math.round(r.sqft * 10) / 10, dp: 1, unit: 'sq ft', unitSingle: 'sq ft', price: F.num(v.pricePerSqFt, 0) || 0 }],
        notes: notes
      };
    }
  };

  /* ---------- Cubic yards ---------- */
  T.volume = {
    defaultShapes: [{ type: 'rect', l: 10, w: 10 }],
    calc: function (v, F) {
      var r = F.volume(v), ready = r.cuFt > 0;
      return {
        ready: ready,
        headline: { value: ready ? fmt(r.cuYd, 2) : '0', unit: ready ? 'cubic yards' : 'Enter area and depth',
          sub: ready ? fmt(r.cuFt, 1) + ' cu ft · ' + fmt(r.cuM, 2) + ' m³' : '' },
        items: [{ key: 'yd', name: 'Bulk material, by the yard', qty: Math.ceil(r.cuYd * 4) / 4, dp: 2, unit: 'cu yd', unitSingle: 'cubic yard', price: 40, note: 'Rounded up to the next 1/4 yard' }],
        notes: ready ? ['Suppliers usually sell in 1/4 or 1/2 yard steps and may charge a delivery fee.', 'For concrete, mulch or gravel use the dedicated calculators: they add bags, weight and waste.'] : []
      };
    }
  };

  /* ---------- Drywall ---------- */
  var SHEET_PRICE = { '4x8': 15, '4x10': 19, '4x12': 23 };
  T.drywall = {
    calc: function (v, F) {
      var r = F.drywall(v), ready = r.sheets > 0;
      var bl = BOARD_LOCAL[country()];
      if (bl) {
        var sheetsL = r.area > 0 ? Math.ceil(r.area * (1 + F.num(v.wastePct, 10) / 100) / bl.sqft) : 0, fillerL = r.compoundGal * 3.78541;
        var tubs = r.area > 0 ? Math.ceil(fillerL / 10) : 0;
        return {
          ready: ready,
          headline: { value: ready ? fmt(sheetsL) : '0', unit: ready ? plural(sheetsL, 'sheet', 'sheets') + ' of ' + bl.label : 'Enter your room size',
            sub: ready ? fmt(r.area * 0.092903, 1) + ' m\u00b2 of board' + (r.ceiling ? ' including the ceiling' : '') : '' },
          items: [
            { key: 'board-local', name: bl.label, qty: sheetsL, unit: plural(sheetsL, 'sheet', 'sheets'), unitSingle: 'sheet', price: bl.price, local: true },
            { key: 'filler-local', name: 'Ready-mixed joint filler, 10 L tub', qty: tubs, unit: plural(tubs, 'tub', 'tubs'), unitSingle: 'tub', price: bl.filler, local: true, note: 'About ' + fmt(fillerL, 0) + ' L for three coats' },
            { key: 'tape', name: 'Paper joint tape, 75 m roll', qty: r.tapeRolls, unit: plural(r.tapeRolls, 'roll', 'rolls'), unitSingle: 'roll', price: 6 },
            { key: 'screws', name: 'Drywall screws, 32 mm', qty: Math.round(r.area * 1.0), unit: 'screws', unitSingle: 'screw', price: 0.03 },
            { key: 'bead', name: 'Corner bead, 2.4 m', qty: r.cornerBead, unit: 'pieces', unitSingle: 'piece', price: 5 }
          ],
          notes: ready ? ['Standard 12.5 mm board suits most walls and ceilings; use moisture-resistant board in bathrooms.'] : []
        };
      }
      return {
        ready: ready,
        headline: { value: ready ? fmt(r.sheets) : '0', unit: ready ? plural(r.sheets, 'sheet', 'sheets') + ' of ' + r.sheet.replace('x', ' x ') + ' drywall' : 'Enter your room size',
          sub: ready ? fmt(r.area) + ' sq ft of board' + (r.ceiling ? ' including the ceiling' : '') : '' },
        items: [
          { key: 'sheet-' + r.sheet, name: 'Drywall sheets, ' + r.sheet.replace('x', ' x ') + ' ft', qty: r.sheets, unit: plural(r.sheets, 'sheet', 'sheets'), unitSingle: 'sheet', price: SHEET_PRICE[r.sheet] },
          { key: 'compound', name: 'Joint compound, 4.5 gal bucket', qty: r.buckets, unit: plural(r.buckets, 'bucket', 'buckets'), unitSingle: 'bucket', price: 21, note: 'About ' + fmt(r.compoundGal, 1) + ' gal for three coats' },
          { key: 'tape', name: 'Paper joint tape, 250 ft roll', qty: r.tapeRolls, unit: plural(r.tapeRolls, 'roll', 'rolls'), unitSingle: 'roll', price: 6 },
          { key: 'screws', name: 'Drywall screws, 1-1/4 in', qty: r.screws, unit: 'screws', unitSingle: 'screw', price: 0.03, note: 'About 1 per sq ft of board' },
          { key: 'bead', name: 'Corner bead, 8 ft', qty: r.cornerBead, unit: 'pieces', unitSingle: 'piece', price: 5 }
        ],
        notes: ready ? ['Use 1/2 in board for walls; ceilings often use 1/2 in sag-resistant or 5/8 in board.', 'Longer sheets mean fewer seams to tape, but they are heavier and harder to carry.'] : []
      };
    }
  };

  /* ---------- Wallpaper ---------- */
  T.wallpaper = {
    calc: function (v, F) {
      var r = F.wallpaper(v), ready = r.rolls > 0;
      return {
        ready: ready,
        headline: { value: ready ? fmt(r.rolls) : '0', unit: ready ? plural(r.rolls, 'roll of wallpaper', 'rolls of wallpaper') : (r.tooTall ? 'Walls are taller than one roll' : 'Enter your room size'),
          sub: ready ? fmt(r.strips) + ' strips, ' + r.perRoll + ' per roll' : '' },
        items: [
          { key: 'roll', name: 'Wallpaper rolls', qty: r.rolls, unit: plural(r.rolls, 'roll', 'rolls'), unitSingle: 'roll', price: 60, note: 'Each strip ' + fmt(r.stripIn) + ' in long' },
          { key: 'kit', name: 'Smoothing tool, knife and seam roller', qty: ready ? 1 : 0, unit: 'kit', price: 14 },
          { key: 'paste', name: 'Wallpaper paste (skip if prepasted)', qty: ready ? Math.ceil(r.rolls / 4) : 0, unit: 'tubs', unitSingle: 'tub', price: 16, note: 'Roughly 1 tub per 4 rolls' }
        ],
        notes: ready ? ['Buy one extra roll from the same batch (lot) number; a later batch may not match.', 'Strips that land over doors are not counted; windows still need full strips above and below.'] : []
      };
    }
  };

  /* ---------- Fence ---------- */
  T.fence = {
    calc: function (v, F) {
      var r = F.fence(v), ready = r.posts > 0;
      return {
        ready: ready,
        headline: { value: ready ? fmt(r.pickets) : '0', unit: ready ? 'pickets' : 'Enter your fence length',
          sub: ready ? fmt(r.posts) + ' posts, ' + fmt(r.rails) + ' rails, ' + fmt(r.bags) + ' bags of concrete' : '' },
        items: [
          { key: 'post', name: '4x4 posts, ' + r.postLength + ' ft', qty: r.posts, unit: 'posts', unitSingle: 'post', price: 16 },
          { key: 'rail', name: '2x4 rails, 8 ft', qty: r.rails, unit: 'rails', unitSingle: 'rail', price: 6 },
          { key: 'picket', name: 'Pickets', qty: r.pickets, unit: 'pickets', unitSingle: 'picket', price: 3.5 },
          { key: 'concrete', name: '80 lb bags of concrete mix', qty: r.bags, unit: 'bags', unitSingle: 'bag', price: 6.5, note: 'For setting posts' },
          { key: 'screws', name: 'Exterior screws for pickets', qty: r.fasteners, unit: 'screws', unitSingle: 'screw', price: 0.05, note: '2 per picket at each rail' }
        ],
        notes: ready ? ['Call 811 before digging so buried lines are marked.', 'Check your HOA and local rules on fence height and how far back from the property line it must sit.', 'Gates need their own posts; add one extra post per gate.'] : []
      };
    }
  };

  /* ---------- Deck ---------- */
  T.deck = {
    calc: function (v, F) {
      var r = F.deck(v), ready = r.boards > 0;
      return {
        ready: ready,
        headline: { value: ready ? fmt(r.boards) : '0', unit: ready ? 'deck boards, ' + F.num(v.boardLengthFt, 16) + ' ft' : 'Enter your deck size',
          sub: ready ? fmt(r.rows) + ' rows of boards over ' + fmt(r.joists) + ' joists' : '' },
        items: [
          { key: 'board', name: 'Deck boards, ' + F.num(v.boardLengthFt, 16) + ' ft', qty: r.boards, unit: 'boards', unitSingle: 'board', price: 18, note: fmt(r.linearFt) + ' linear ft plus waste' },
          { key: 'joist', name: 'Joists, 2x8, ' + r.joistLength + ' ft', qty: r.joists, unit: 'joists', unitSingle: 'joist', price: 16, note: 'Check span tables for your size' },
          { key: 'screw', name: 'Deck screws', qty: r.screws, unit: 'screws', unitSingle: 'screw', price: 0.06, note: '2 per board at each joist' }
        ],
        notes: ready ? ['This covers the decking surface and joists. Beams, posts, footings and ledger must follow your local code; most areas need a permit.', 'Composite boards often need hidden fasteners and specific gaps; follow the maker\'s guide.'] : []
      };
    }
  };

  /* ---------- Roofing ---------- */
  T.roofing = {
    calc: function (v, F) {
      var r = F.roofing(v), ready = r.bundles > 0;
      return {
        ready: ready,
        headline: { value: ready ? fmt(r.bundles) : '0', unit: ready ? 'bundles of shingles' : 'Enter your house size',
          sub: ready ? fmt(r.squares, 1) + ' squares of roof (' + fmt(r.area) + ' sq ft) plus ' + Math.round(r.waste * 100) + '% waste' : '' },
        items: [
          { key: 'bundle', name: 'Shingle bundles (3 per square)', qty: r.bundles, unit: 'bundles', unitSingle: 'bundle', price: 42 },
          { key: 'underlay', name: 'Synthetic underlayment roll', qty: r.underlaymentRolls, unit: 'rolls', unitSingle: 'roll', price: 95 },
          { key: 'nails', name: 'Coil roofing nails, box of 7,200', qty: Math.ceil(r.nails / 7200), unit: 'boxes', unitSingle: 'box', price: 55, note: fmt(r.nails) + ' nails at 320 per square' },
          { key: 'drip', name: 'Drip edge, 10 ft', qty: r.dripEdgePieces, unit: 'pieces', unitSingle: 'piece', price: 9 }
        ],
        notes: ready ? ['Roof area is the house footprint with overhang times the pitch factor ' + fmt(r.factor, 3) + '.', 'Ridge length is about ' + fmt(r.ridgeFt) + ' ft; buy ridge cap and starter strip by length from the product label.', 'Roof work is dangerous. Use fall protection or hire a licensed roofer.'] : []
      };
    }
  };

  /* ---------- Pavers ---------- */
  T.pavers = {
    defaultShapes: [{ type: 'rect', l: 12, w: 12 }],
    calc: function (v, F) {
      var r = F.pavers(v), ready = r.pavers > 0;
      return {
        ready: ready,
        headline: { value: ready ? fmt(r.pavers) : '0', unit: ready ? 'pavers' : 'Enter area and paver size',
          sub: ready ? fmt(r.baseTons, 1) + ' tons of base gravel and ' + fmt(r.sandBags) + ' bags of sand' : '' },
        items: [
          { key: 'paver', name: 'Pavers, ' + F.num(v.paverL) + ' x ' + F.num(v.paverW) + ' in', qty: r.pavers, unit: 'pavers', unitSingle: 'paver', price: 0.8 },
          { key: 'base', name: 'Crushed stone base, bulk', qty: Math.ceil(r.baseTons * 2) / 2, dp: 1, unit: 'tons', unitSingle: 'ton', price: 50, note: fmt(r.baseCuYd, 2) + ' cu yd' },
          { key: 'sand', name: 'Bedding sand, 0.5 cu ft bag', qty: r.sandBags, unit: 'bags', unitSingle: 'bag', price: 5.5 },
          { key: 'edge', name: 'Paver edge restraint, 8 ft', qty: r.edgePieces, unit: 'pieces', unitSingle: 'piece', price: 11 }
        ],
        notes: ready ? ['Walkways and patios usually need a 4 to 6 in compacted base; driveways need 8 to 12 in.', 'Spread polymeric sand in the joints after the pavers are set; follow the bag for coverage.'] : []
      };
    }
  };

  /* ---------- Stairs ---------- */
  T.stairs = {
    calc: function (v, F) {
      var r = F.stairs(v), ready = r.risers > 0;
      var notes = [];
      if (ready) {
        notes.push('Each riser is ' + fmt(r.riser, 2) + ' in and the stairs climb at ' + fmt(r.angle, 1) + '°.');
        notes.push(r.riserOk ? 'Riser height is within the 7 3/4 in limit in the US residential code (IRC R311.7.5.1).' : 'Riser is over 7 3/4 in: add a step.');
        notes.push(r.treadOk ? 'Tread depth meets the 10 in minimum (IRC R311.7.5.2).' : 'Tread is under the 10 in minimum (IRC R311.7.5.2).');
        notes.push('Comfort check (2 risers + 1 tread): ' + fmt(r.comfort, 1) + ' in. Many builders aim for 24 to 25 in.');
      }
      return {
        ready: ready,
        headline: { value: ready ? fmt(r.risers) : '0', unit: ready ? 'risers of ' + fmt(r.riser, 2) + ' in' : 'Enter the total rise',
          sub: ready ? fmt(r.treads) + ' treads, total run ' + fmt(r.run, 1) + ' in (' + fmt(r.run / 12, 2) + ' ft)' : '' },
        items: [
          { key: 'stringer', name: '2x12 stringers, ' + r.stringerBoard + ' ft', qty: r.stringers, unit: 'boards', unitSingle: 'board', price: 34, note: 'Each stringer is ' + fmt(r.stringerFt, 2) + ' ft long' },
          { key: 'tread', name: 'Tread boards', qty: r.treads * Math.ceil(F.num(v.treadIn) / 11.25 || 1), unit: 'boards', unitSingle: 'board', price: 22, note: 'Cut to the stair width' }
        ],
        notes: notes
      };
    }
  };

  /* ---------- Sod and grass seed ---------- */
  T.lawn = {
    defaultShapes: [{ type: 'rect', l: 40, w: 25 }],
    prepare: function (form) {
      var mode = (form.querySelector('[name=mode]:checked') || {}).value || 'sod';
      Array.prototype.forEach.call(form.querySelectorAll('[data-mode]'), function (g) { g.hidden = g.getAttribute('data-mode') !== mode; });
    },
    calc: function (v, F) {
      var r = F.lawn(v), seed = v.mode === 'seed', ready = r.area > 0;
      if (seed) return {
        ready: ready && r.seedLb > 0,
        headline: { value: fmt(r.seedLb, 1), unit: 'lb of grass seed', sub: fmt(r.area) + ' sq ft at ' + F.num(v.seedRate) + ' lb per 1,000 sq ft' },
        items: [{ key: 'seedbag', name: 'Grass seed, ' + F.num(v.bagLb, 25) + ' lb bag', qty: r.seedBags, unit: 'bags', unitSingle: 'bag', price: 65 }],
        notes: ['Use the rate on your seed bag; it varies a lot by grass type.', 'Keep new seed moist with light, frequent watering until it is established.']
      };
      return {
        ready: ready,
        headline: { value: fmt(r.pieces), unit: 'pieces of sod', sub: fmt(r.area) + ' sq ft plus 5% for cuts, about ' + fmt(r.palletsExact, 2) + ' pallets' },
        items: [
          { key: 'pallet', name: 'Sod pallets', qty: r.pallets, unit: 'pallets', unitSingle: 'pallet', price: 280, note: 'Ask if partial pallets are sold' },
          { key: 'starter', name: 'Starter fertilizer bag', qty: ready ? 1 : 0, unit: 'bag', price: 25 }
        ],
        notes: ready ? ['Lay sod within a day of delivery and water it well the same day.', 'Pallet sizes vary by farm from about 400 to 700 sq ft; enter your supplier\'s figure.'] : []
      };
    }
  };

  /* ---------- Insulation ---------- */
  var BATT_PRICE = { 13: 58, 19: 55, 21: 58, 30: 50, 38: 45 };
  var BLOWN = {
    fiberglass: { name: 'Blown-in fiberglass, 28.5 lb bag', price: 42 },
    cellulose: { name: 'Blown-in cellulose, 25 lb bag', price: 16 }
  };
  function showFor(form, attr, value) {
    Array.prototype.forEach.call(form.querySelectorAll('[' + attr + ']'), function (g) {
      g.hidden = g.getAttribute(attr).split(' ').indexOf(value) < 0;
    });
  }
  T.insulation = {
    defaultShapes: [{ type: 'rect', l: 40, w: 25 }],
    prepare: function (form, v) {
      var mode = v.mode === 'attic' ? 'attic' : 'walls';
      showFor(form, 'data-mode', mode);
      showFor(form, 'data-mat', mode === 'walls' ? 'batts' : (v.material === 'batts' ? 'batts' : 'blown'));
    },
    calc: function (v, F) {
      var r = F.insulation(v), ready = r.area > 0;
      var items = [], notes = [], headline;
      if (r.material === 'batts') {
        var label = 'R-' + r.rValue + ' fiberglass batts, ' + fmt(r.bagSqFt, 2) + ' sq ft bag';
        items.push({ key: 'batt-' + r.rValue, name: label, qty: r.bags, unit: plural(r.bags, 'bag', 'bags'), unitSingle: 'bag',
          price: BATT_PRICE[r.rValue] || 55, note: r.inches + ' in thick' });
        if (r.mode === 'walls') items.push({ key: 'staples', name: 'Staples for kraft facing, box', qty: ready ? 1 : 0, unit: 'box', price: 7 });
        items.push({ key: 'ppe', name: 'Respirator, goggles and gloves', qty: ready ? 1 : 0, unit: 'kit', price: 30 });
        headline = { value: ready ? fmt(r.bags) : '0', unit: ready ? plural(r.bags, 'bag', 'bags') + ' of R-' + r.rValue + ' batts' : (r.mode === 'walls' ? 'Enter your wall size' : 'Enter your attic area'),
          sub: ready ? fmt(r.area) + ' sq ft at ' + fmt(r.bagSqFt, 2) + ' sq ft per bag' : '' };
        if (ready) {
          if (r.mode === 'walls') {
            notes.push('Wall area: ' + fmt(r.area) + ' sq ft after taking off ' + Math.round(F.num(v.doors)) + ' doors (21 sq ft each) and ' + Math.round(F.num(v.windows)) + ' windows (15 sq ft each).');
            notes.push('Use 15 in wide batts for studs 16 in apart and 23 in wide for 24 in. Cut batts to fit around wires and boxes; squashing them lowers the R-value.');
            if (r.rValue === 19) notes.push('R-19 batts are 6 1/4 in thick and squeeze slightly into a 5 1/2 in 2x6 wall. R-21 high-density batts are made for that depth.');
          } else {
            notes.push('Lay batts across the joists over the old insulation, unfaced, so no vapor barrier is trapped in the middle. That gives about R-' + fmt(r.totalR, 0) + ' in total.');
          }
          notes.push('Package sizes vary. If yours lists a different square footage, enter it under bag coverage.');
        }
      } else {
        var b = BLOWN[r.material];
        items.push({ key: 'blown-' + r.material, name: b.name, qty: r.bags, unit: plural(r.bags, 'bag', 'bags'), unitSingle: 'bag', price: b.price,
          note: fmt(r.bagsPer1000, 1) + ' bags per 1,000 sq ft' });
        items.push({ key: 'rulers', name: 'Attic depth rulers, pack', qty: r.bags ? 1 : 0, unit: 'pack', price: 12, note: 'Staple to joists to check depth' });
        items.push({ key: 'ppe', name: 'Respirator, goggles and gloves', qty: r.bags ? 1 : 0, unit: 'kit', price: 30 });
        var none = ready && r.addR <= 0;
        headline = {
          value: ready ? fmt(r.bags) : '0',
          unit: !ready ? 'Enter your attic area' : (none ? 'bags: you already have about R-' + fmt(r.existingR, 0) : plural(r.bags, 'bag', 'bags') + ' of blown-in ' + r.material),
          sub: ready && !none ? 'Adds about R-' + fmt(r.addR, 0) + ' at ' + fmt(r.inches, 1) + ' in deep over ' + fmt(r.area) + ' sq ft' : ''
        };
        if (ready && !none) {
          if (r.existingR > 0) notes.push('Your ' + fmt(F.num(v.existingIn), 1) + ' in of old insulation is worth about R-' + fmt(r.existingR, 1) + ', so the new layer only needs R-' + fmt(r.addR, 1) + ' to reach R-' + r.targetR + '.');
          notes.push('Blow it at least ' + fmt(r.inches, 1) + ' in deep everywhere' + (r.existingR > 0 ? ' (about ' + fmt(r.inches + F.num(v.existingIn), 1) + ' in in total)' : '') + '. The bag count and the depth both matter; check the chart on your bag.');
          notes.push('Seal gaps around lights, pipes and the attic hatch first, and fit baffles at the eaves so the soffit vents stay open.');
          notes.push('Many stores lend the blowing machine when you buy enough bags; ask when you order.');
        }
        if (none) notes.push('Your current insulation already reaches R-' + r.targetR + '. Check the depth in several spots: thin areas near the eaves are common.');
      }
      return { ready: ready && r.bags > 0, headline: headline, items: items, notes: notes };
    }
  };

  /* ---------- Baseboard and trim ---------- */
  var BASE_PRICE = { 8: 9, 12: 13, 16: 17 };
  T.baseboard = {
    prepare: function (form, v) {
      showFor(form, 'data-mode', v.mode === 'walls' ? 'walls' : 'room');
      showFor(form, 'data-casing', v.casing ? 'on' : 'off');
    },
    calc: function (v, F) {
      var r = F.baseboard(v), ready = r.pieces > 0;
      var items = [
        { key: 'base-' + r.pieceFt, name: 'Baseboard, ' + r.pieceFt + ' ft pieces', qty: r.pieces, unit: plural(r.pieces, 'piece', 'pieces'), unitSingle: 'piece',
          price: BASE_PRICE[r.pieceFt] || r.pieceFt * 1.1, note: fmt(r.linearFt, 1) + ' ft plus ' + Math.round(r.waste * 100) + '% extra' }
      ];
      if (r.shoePieces) items.push({ key: 'shoe', name: 'Shoe molding or quarter round, 8 ft', qty: r.shoePieces, unit: plural(r.shoePieces, 'piece', 'pieces'), unitSingle: 'piece', price: 5 });
      if (r.casingPieces) items.push({ key: 'casing', name: 'Door and window casing, 7 ft pieces', qty: r.casingPieces, unit: plural(r.casingPieces, 'piece', 'pieces'), unitSingle: 'piece', price: 8, note: '3 per door side or window' });
      items.push({ key: 'nails', name: 'Finish nails, 2 in, box of 1,000', qty: r.nailBoxes, unit: plural(r.nailBoxes, 'box', 'boxes'), unitSingle: 'box', price: 10, note: fmt(r.nails) + ' nails, 2 at each stud' });
      items.push({ key: 'caulk', name: 'Paintable trim caulk, 10.1 oz tube', qty: r.caulkTubes, unit: plural(r.caulkTubes, 'tube', 'tubes'), unitSingle: 'tube', price: 4.5, note: 'About 55 ft per tube' });
      var notes = [];
      if (ready) {
        notes.push((v.mode === 'walls' ? 'Walls: ' : 'Room perimeter: ') + fmt(r.perimeter, 1) + ' ft, minus ' + fmt(r.openingsFt, 1) + ' ft of door openings = ' + fmt(r.linearFt, 1) + ' ft of baseboard.');
        notes.push('Pick pieces at least as long as your longest wall if you can, so that wall has no seam. Where you must join two pieces, use a 45° scarf joint over a stud.');
        notes.push('Buy one or two extra pieces if you are new to coping inside corners; practice cuts use up trim fast.');
      }
      return {
        ready: ready,
        headline: { value: ready ? fmt(r.pieces) : '0', unit: ready ? plural(r.pieces, 'piece', 'pieces') + ' of ' + r.pieceFt + ' ft baseboard' : 'Enter your room size',
          sub: ready ? fmt(r.linearFt, 1) + ' ft of wall to cover; ' + fmt(r.boughtFt) + ' ft bought' : '' },
        items: items, notes: notes
      };
    }
  };

  /* ---------- Grout ---------- */
  T.grout = {
    defaultShapes: [{ type: 'rect', l: 10, w: 10 }],
    calc: function (v, F) {
      var r = F.grout(v), ready = r.cuIn > 0;
      var items = [], headline, cover;
      if (r.type === 'premixed') {
        var parts = [];
        if (r.buyGallons) parts.push(r.buyGallons + ' ' + plural(r.buyGallons, 'gallon', 'gallons'));
        if (r.buyQuarts) parts.push(r.buyQuarts + ' ' + plural(r.buyQuarts, 'quart', 'quarts'));
        items.push({ key: 'pre-gal', name: 'Pre-mixed grout, 1 gallon pail', qty: r.buyGallons, unit: plural(r.buyGallons, 'pail', 'pails'), unitSingle: 'pail', price: 60 });
        items.push({ key: 'pre-qt', name: 'Pre-mixed grout, 1 quart pail', qty: r.buyQuarts, unit: plural(r.buyQuarts, 'pail', 'pails'), unitSingle: 'pail', price: 24 });
        cover = fmt(r.sqFtPerGal) + ' sq ft per gallon';
        headline = { value: ready ? fmt(r.gallons, 2) : '0', unit: ready ? 'gallons of pre-mixed grout' : 'Enter your area and tile size',
          sub: ready ? 'Buy ' + parts.join(' + ') + ', including ' + Math.round(r.extra * 100) + '% extra' : '' };
      } else if (r.type === 'sanded') {
        items.push({ key: 'sand-25', name: 'Sanded grout, 25 lb bag', qty: r.bags25, unit: plural(r.bags25, 'bag', 'bags'), unitSingle: 'bag', price: 25 });
        items.push({ key: 'sand-7', name: 'Sanded grout, 7 lb bag', qty: r.bags7, unit: plural(r.bags7, 'bag', 'bags'), unitSingle: 'bag', price: 14 });
        var bag = [];
        if (r.bags25) bag.push(r.bags25 + ' ' + plural(r.bags25, 'bag', 'bags') + ' of 25 lb');
        if (r.bags7) bag.push(r.bags7 + ' ' + plural(r.bags7, 'bag', 'bags') + ' of 7 lb');
        cover = fmt(r.sqFtPer25) + ' sq ft per 25 lb bag';
        headline = { value: ready ? fmt(r.lb, 1) : '0', unit: ready ? 'lb of sanded grout' : 'Enter your area and tile size',
          sub: ready ? 'Buy ' + bag.join(' + ') + ', including ' + Math.round(r.extra * 100) + '% extra' : '' };
      } else {
        items.push({ key: 'unsand-10', name: 'Non-sanded grout, 10 lb box', qty: r.boxes10, unit: plural(r.boxes10, 'box', 'boxes'), unitSingle: 'box', price: 16 });
        cover = fmt(r.sqFtPer10) + ' sq ft per 10 lb box';
        headline = { value: ready ? fmt(r.lb, 1) : '0', unit: ready ? 'lb of non-sanded grout' : 'Enter your area and tile size',
          sub: ready ? 'Buy ' + r.boxes10 + ' ' + plural(r.boxes10, 'box', 'boxes') + ' of 10 lb, including ' + Math.round(r.extra * 100) + '% extra' : '' };
      }
      items.push({ key: 'float', name: 'Grout float, sponge and bucket', qty: ready ? 1 : 0, unit: 'kit', price: 18 });
      items.push({ key: 'sealer', name: 'Grout sealer (skip for epoxy or urethane grout)', qty: ready && r.type !== 'premixed' ? 1 : 0, unit: 'bottle', price: 15 });
      var notes = [];
      if (ready) {
        notes.push('Joint volume: ' + fmt(r.cuInPerSqFt, 2) + ' cubic inches per sq ft, so this grout covers about ' + cover + ' with your tile and joint.');
        if (!r.jointOk) notes.push(r.type === 'unsanded' ? 'Non-sanded grout is for joints up to 1/8 in. Wider joints can crack and shrink; use sanded or pre-mixed grout.'
          : r.type === 'sanded' ? 'Sanded grout is for joints 1/8 in and wider. Sand can scratch polished stone and will not pack into a 1/16 in joint; use non-sanded grout.'
          : 'Check the pail: this pre-mixed grout is rated for joints from 1/16 to 1/2 in.');
        notes.push('Mix only what you can use in about 30 minutes, and buy all bags in one color batch.');
      }
      return { ready: ready, headline: headline, items: items, notes: notes };
    }
  };

  /* ---------- Gravel driveway ---------- */
  var DRIVE_STONE = {
    base: { name: 'Base stone, #3 (1 1/2 to 2 1/2 in), bulk', price: 45 },
    middle: { name: 'Middle stone, #57 (3/4 to 1 in), bulk', price: 48 },
    top: { name: 'Surface stone with fines (#411 or crusher run), bulk', price: 40 }
  };
  T.driveway = {
    defaultShapes: [{ type: 'rect', l: 60, w: 12 }],
    calc: function (v, F) {
      var r = F.driveway(v), ready = r.area > 0 && r.buyTons > 0;
      var items = r.layers.map(function (L) {
        var s = DRIVE_STONE[L.key];
        return { key: 'stone-' + L.key, name: s.name, qty: L.buyTons, dp: 1, unit: 'tons', unitSingle: 'ton', price: s.price,
          note: L.inches ? fmt(L.inches, L.inches % 1 ? 1 : 0) + ' in deep, ' + fmt(L.cuYd, 1) + ' cu yd' : 'Layer skipped' };
      });
      items.push({ key: 'fabric', name: 'Woven geotextile driveway fabric', qty: v.fabric === false ? 0 : r.fabricSqFt, unit: 'sq ft', unitSingle: 'sq ft', price: 0.2,
        note: 'Area plus 10% for overlaps' });
      var notes = [];
      if (ready) {
        notes.push('Order each layer separately and spread and compact it before the next one arrives. Ask the yard to dump the base stone first, at the far end.');
        notes.push('Surface stone with fines packs hard, so it is ordered by finished depth: Penn State\'s gravel road center estimates 0.04 tons per sq ft for a 6 in compacted layer. Clean #3 and #57 stone barely compacts; the ' + Math.round(r.extra * 100) + '% extra covers spreading and soft spots.');
        notes.push('Shape the surface with a crown or a cross slope of about 1/2 in per foot so water runs off instead of making potholes.');
        notes.push('That is ' + fmt(r.buyTons, r.buyTons % 1 ? 1 : 0) + ' tons in all. Tandem dump trucks often carry around 13 to 15 tons, so plan on roughly ' + r.truckloads + ' ' + plural(r.truckloads, 'load', 'loads') + '; ask your supplier about delivery fees per load.');
        if (r.depthIn < 6) notes.push('Less than 6 in of stone in total is fine for refreshing an old driveway, but a new one on soil usually needs 8 to 12 in.');
      }
      return {
        ready: ready,
        headline: { value: ready ? fmt(r.buyTons, r.buyTons % 1 ? 1 : 0) : '0', unit: ready ? 'tons of gravel' : 'Enter your driveway size and layer depths',
          sub: ready ? fmt(r.area) + ' sq ft, ' + fmt(r.depthIn, r.depthIn % 1 ? 1 : 0) + ' in of stone in ' + r.layers.filter(function (L) { return L.inches > 0; }).length + ' layers' : '' },
        items: items, notes: notes
      };
    }
  };

  /* ---------- Retaining wall ---------- */
  T.retaining = {
    prepare: function (form, v) {
      showFor(form, 'data-caps', v.caps ? 'on' : 'off');
    },
    calc: function (v, F) {
      var r = F.retainingWall(v), ready = r.blocks > 0;
      var size = fmt(F.num(v.blockL), 2) + ' x ' + fmt(F.num(v.blockH), 2) + ' x ' + fmt(F.num(v.blockD), 2) + ' in';
      var items = [
        { key: 'block', name: 'Retaining wall block, ' + size.replace(/\.00/g, ''), qty: r.blocks, unit: plural(r.blocks, 'block', 'blocks'), unitSingle: 'block',
          price: F.num(v.blockH) >= 6 ? 7 : 3.5, note: r.courses + ' courses of ' + r.perCourse + ', plus ' + Math.round(r.waste * 100) + '%' }
      ];
      if (r.caps) items.push({ key: 'cap', name: 'Wall cap, ' + fmt(F.num(v.capL) || 12, 2).replace(/\.00$/, '') + ' in', qty: r.caps, unit: plural(r.caps, 'cap', 'caps'), unitSingle: 'cap', price: 5 });
      if (r.adhesiveTubes) items.push({ key: 'adhesive', name: 'Landscape block adhesive, 10 oz tube', qty: r.adhesiveTubes, unit: plural(r.adhesiveTubes, 'tube', 'tubes'), unitSingle: 'tube', price: 7, note: 'Two 3/8 in beads under the caps' });
      items.push({ key: 'base', name: 'Base gravel, 3/4 in minus with fines, bulk', qty: Math.ceil(r.baseTons * 2) / 2, dp: 1, unit: 'tons', unitSingle: 'ton', price: 40,
        note: fmt(r.trenchIn) + ' in wide x 6 in deep, compacted' });
      items.push({ key: 'drain', name: 'Drainage stone, clean 3/4 in, bulk', qty: Math.ceil(r.drainTons * 2) / 2, dp: 1, unit: 'tons', unitSingle: 'ton', price: 48,
        note: '12 in behind the wall, full height' });
      if (r.pipePieces) items.push({ key: 'pipe', name: '4 in perforated drain pipe, 10 ft', qty: r.pipePieces, unit: plural(r.pipePieces, 'piece', 'pieces'), unitSingle: 'piece', price: 12, note: 'Add enough to reach daylight' });
      var notes = [];
      if (ready) {
        notes.push(r.exposedCourses + ' courses show above ground and ' + r.buriedCourses + ' ' + plural(r.buriedCourses, 'is', 'are') + ' buried, so the first course sits below grade. Dig the trench ' + fmt(r.trenchIn) + ' in wide and about ' + fmt(r.trenchDepthIn) + ' in deep.');
        notes.push('Compact the base in two passes with a plate compactor, and level the first course carefully; every error there shows at the top.');
        notes.push('Backfill the 12 in behind the block with clean stone as you go, compacting every course or two. Native soil goes only behind the stone.');
        if (r.needsEngineer) notes.push('Walls holding back more than 4 ft of soil must be designed by an engineer under the International Residential Code, and most towns need a permit. Shorter walls with a slope, a driveway or a building above them may need one too.');
        else if (r.overSmallBlockLimit) notes.push('Over 3 ft tall: many small DIY blocks are rated only to about 3 ft without geogrid. Check the maximum height for your block on the maker\'s chart.');
        notes.push('Call 811 before digging so buried lines are marked.');
      }
      return {
        ready: ready,
        headline: { value: ready ? fmt(r.blocks) : '0', unit: ready ? plural(r.blocks, 'block', 'blocks') : 'Enter your wall length and height',
          sub: ready ? r.courses + ' courses, ' + fmt(r.baseTons + r.drainTons, 1) + ' tons of gravel' + (r.caps ? ', ' + r.caps + ' caps' : '') : '' },
        items: items, notes: notes
      };
    }
  };

  /* ---------- Brick ---------- */
  var BRICK_NAME = {
    modular: 'Modular brick, 3 5/8 x 2 1/4 x 7 5/8 in', queen: 'Queen brick, 2 3/4 x 2 3/4 x 7 5/8 in',
    king: 'King brick, 2 3/4 x 2 5/8 x 9 5/8 in', norman: 'Norman brick, 3 5/8 x 2 1/4 x 11 5/8 in',
    utility: 'Utility brick, 3 5/8 x 3 5/8 x 11 5/8 in'
  };
  var BRICK_PRICE = { modular: 0.75, queen: 0.85, king: 1, norman: 1.2, utility: 1.8 };
  T.brick = {
    calc: function (v, F) {
      var r = F.brick(v), ready = r.bricks > 0;
      var items = [
        { key: 'brick-' + r.size, name: BRICK_NAME[r.size], qty: r.bricks, unit: plural(r.bricks, 'brick', 'bricks'), unitSingle: 'brick', price: BRICK_PRICE[r.size],
          note: fmt(r.perSqFt, 2) + ' per sq ft plus ' + Math.round(r.waste * 100) + '%' },
        { key: 'mortar', name: 'Type N mortar mix, 80 lb bag', qty: r.mortarBags, unit: plural(r.mortarBags, 'bag', 'bags'), unitSingle: 'bag', price: 10,
          note: 'About 37 modular bricks per bag' }
      ];
      if (r.ties) items.push({ key: 'ties', name: 'Corrugated brick ties, box of 100', qty: r.tieBoxes, unit: plural(r.tieBoxes, 'box', 'boxes'), unitSingle: 'box', price: 25, note: fmt(r.ties) + ' ties' });
      items.push({ key: 'kit', name: 'Trowel, jointer and mortar board', qty: ready ? 1 : 0, unit: 'kit', price: 35 });
      var notes = [];
      if (ready) {
        notes.push('Wall area: ' + fmt(r.area) + ' sq ft after taking off ' + Math.round(F.num(v.doors)) + ' doors (21 sq ft each) and ' + Math.round(F.num(v.windows)) + ' windows (15 sq ft each). Counts are for one wythe (a single layer of brick) in running bond with 3/8 in joints.');
        notes.push('Mortar: about ' + fmt(r.mortarCuFt, 1) + ' cu ft of joints. QUIKRETE rates an 80 lb bag of mortar mix at up to 37 standard bricks, which allows for more than the joints alone.');
        if (r.ties) notes.push('Ties: one per 2.67 sq ft of wall (one at each stud every 24 in up, with studs 16 in apart), plus ties within 12 in of each door and window. Windy and seismic areas need more; check your local code.');
        notes.push('Buy all the brick at once, from one production run if you can, and mix bricks from several cubes as you lay so color varies evenly.');
        notes.push('A freestanding wall two bricks thick needs twice the brick and mortar, and a footing below the frost line.');
      }
      return {
        ready: ready,
        headline: { value: ready ? fmt(r.bricks) : '0', unit: ready ? plural(r.bricks, 'brick', 'bricks') : 'Enter your wall size',
          sub: ready ? fmt(r.area) + ' sq ft of wall, ' + fmt(r.mortarBags) + ' ' + plural(r.mortarBags, 'bag', 'bags') + ' of mortar mix' : '' },
        items: items, notes: notes
      };
    }
  };

  window.PMTools = T;
})();
