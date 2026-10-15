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

  window.PMTools = T;
})();
