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
  T.paint = {
    calc: function (v, F) {
      var r = F.paint(v);
      var ready = r.wallArea > 0 || r.ceilingArea > 0;
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
      var items = [
        { key: 'bag-' + r.bagSize, name: r.bagSize + ' lb bags of concrete mix', qty: r.bags, unit: plural(r.bags, 'bag', 'bags'), unitSingle: 'bag', price: BAG_PRICE[r.bagSize], note: 'Each yields about ' + r.bagYield + ' cu ft' }
      ];
      var notes = [];
      if (ready) {
        notes.push('Volume: ' + fmt(r.cuFt, 2) + ' cu ft, plus ' + Math.round(r.waste * 100) + '% extra for spills and uneven ground.');
        if (r.suggestReadyMix) notes.push('At ' + fmt(r.cuYd, 2) + ' cubic yards, ready-mix delivery (about ' + r.readyMixYd + ' yd) is usually easier than mixing ' + r.bags + ' bags by hand. Ask suppliers about short-load fees.');
        if (r.bags > 20 && !r.suggestReadyMix) notes.push('Rent a small drum mixer for jobs over about 20 bags.');
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

  window.PMTools = T;
})();
