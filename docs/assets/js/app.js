/*
 * Country, currency and typical local prices.
 * The country comes from Cloudflare (/api/geo), with a guess from the browser's language
 * and time zone as a fallback. Shopping-list prices are written in US dollars in tools.js;
 * here each category is scaled to a typical local shelf price in the local currency.
 * Factors = local price / US price for the same kind of product (see FACTOR_NOTES).
 */
(function () {
  'use strict';
  var COUNTRIES = {
    US: { cur: 'USD', loc: 'en-US', units: 'imperial', name: 'United States' },
    CA: { cur: 'CAD', loc: 'en-CA', units: 'imperial', name: 'Canada' },
    GB: { cur: 'GBP', loc: 'en-GB', units: 'metric', name: 'United Kingdom' },
    IE: { cur: 'EUR', loc: 'en-IE', units: 'metric', name: 'Ireland' },
    AU: { cur: 'AUD', loc: 'en-AU', units: 'metric', name: 'Australia' },
    NZ: { cur: 'NZD', loc: 'en-NZ', units: 'metric', name: 'New Zealand' },
    IN: { cur: 'INR', loc: 'en-IN', units: 'imperial', name: 'India' },
    EU: { cur: 'EUR', loc: 'de-DE', units: 'metric', name: 'Europe' }
  };
  var EUROZONE = 'AT BE CY DE EE ES FI FR GR HR IT LT LU LV MT NL PT SI SK'.split(' ');
  // Local price per US dollar of the same product. Sources and notes in FACTOR_NOTES.
  var FACTORS = {
    USD: {},
    CAD: { base: 1.35, paint: 1.5, drywall: 0.87, lumber: 1.1 },
    GBP: { base: 0.85, paint: 0.66, drywall: 0.72, lumber: 0.75, concrete: 1.3, tile: 0.9, bulk: 1.0 },
    EUR: { base: 0.95, paint: 0.75, drywall: 0.8, lumber: 0.9, concrete: 1.3 },
    AUD: { base: 1.6, paint: 2.1, drywall: 1.25, lumber: 1.9, concrete: 2.8 },
    NZD: { base: 1.75, paint: 2.2, drywall: 1.35, lumber: 1.9, concrete: 2.8 },
    INR: { base: 45, paint: 25, drywall: 35, tile: 23, concrete: 14, bulk: 12, lumber: 45, lawn: 20 }
  };
  var TOOL_CAT = { paint: 'paint', drywall: 'drywall', wallpaper: 'wallpaper', flooring: 'flooring', tile: 'tile',
    concrete: 'concrete', mulch: 'bulk', volume: 'bulk', pavers: 'paver', lawn: 'lawn', fence: 'lumber',
    deck: 'lumber', roofing: 'roofing', stairs: 'lumber', area: 'none' };
  var KEY_CAT = { roller: 'tools', brush: 'tools', tape: 'tools', spacers: 'tools', kit: 'tools', screws: 'tools',
    screw: 'tools', nails: 'tools', edge: 'tools', concrete: 'concrete', base: 'bulk', sand: 'bulk', material: 'none' };

  function guess() {
    var lang = (navigator.languages && navigator.languages[0]) || navigator.language || '';
    var m = lang.match(/-([A-Z]{2})$/i), c = m ? m[1].toUpperCase() : '';
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* old browser */ }
    if (/^Asia\/(Kolkata|Calcutta)$/.test(tz)) return 'IN';
    if (/^Australia\//.test(tz)) return 'AU';
    if (/^Pacific\/Auckland$/.test(tz)) return 'NZ';
    if (tz === 'Europe/London') return 'GB';
    if (tz === 'Europe/Dublin') return 'IE';
    if (/^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax|St_Johns|Regina)$/.test(tz)) return 'CA';
    if (c) return c;
    return 'US';
  }
  function norm(code) {
    code = (code || '').toUpperCase();
    if (COUNTRIES[code]) return code;
    if (EUROZONE.indexOf(code) >= 0) return 'EU';
    return 'US';
  }
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage off */ } }

  var chosen = get('pm:country');               // picked by the visitor in the price menu
  var detected = get('pm:geo');                 // from Cloudflare on an earlier visit
  var country = norm(chosen || detected || guess());
  var listeners = [];

  function info() { return COUNTRIES[country]; }
  function factor(tool, key) {
    var f = FACTORS[info().cur] || {};
    var cat = KEY_CAT[key] || (/^(bag|grout|sheet)-/.test(key) ? null : null) || TOOL_CAT[tool] || 'base';
    if (/^bag-/.test(key)) cat = 'concrete';
    if (/^sheet-/.test(key)) cat = 'drywall';
    if (/^grout-/.test(key)) cat = 'tile';
    if (cat === 'none') return 1;
    return f[cat] || f.base || 1;
  }
  function round(x) {
    if (info().cur === 'INR') return x >= 100 ? Math.round(x / 5) * 5 : Math.round(x);
    return x >= 20 ? Math.round(x) : Math.round(x * 100) / 100;
  }
  function price(tool, key, usd) { return round(usd * factor(tool, key)); }
  var fmtCache = {};
  function money(n) {
    var i = info(), k = i.cur;
    if (!fmtCache[k]) {
      try { fmtCache[k] = new Intl.NumberFormat(i.loc, { style: 'currency', currency: k, minimumFractionDigits: k === 'INR' ? 0 : 2, maximumFractionDigits: k === 'INR' ? 0 : 2 }); }
      catch (e) { fmtCache[k] = { format: function (x) { return k + ' ' + x.toFixed(2); } }; }
    }
    return fmtCache[k].format(n || 0);
  }
  function symbol() {
    try { return money(0).replace(/[\d.,\s ]/g, '') || info().cur; } catch (e) { return '$'; }
  }
  function set(code, byVisitor) {
    var next = norm(code);
    if (byVisitor) { chosen = next; put('pm:country', next); }
    if (next === country) return;
    country = next;
    listeners.forEach(function (fn) { fn(); });
  }
  // Ask Cloudflare once per visitor (cached), unless the visitor picked a country.
  if (!chosen && !detected && window.fetch) {
    var ctrl = window.AbortController ? new AbortController() : null;
    if (ctrl) setTimeout(function () { ctrl.abort(); }, 2500);
    fetch('/api/geo', ctrl ? { signal: ctrl.signal } : {}).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (d && d.country) { put('pm:geo', d.country); if (!chosen) set(d.country); }
    }).catch(function () { /* staging or offline: keep the guess */ });
  }
  window.PMLocale = {
    country: function () { return country; }, info: info, countries: COUNTRIES, price: price, factor: factor,
    money: money, symbol: symbol, set: set, onChange: function (fn) { listeners.push(fn); },
    defaultUnits: function () { return info().units; }
  };
})();

/*
 * Units: visitors can type in feet + inches (default) or metres + centimetres.
 * The calculators always work in US units; metric inputs are converted on read.
 * Each convertible input is tagged by its unit label: ft -> m, in -> cm, sq ft -> m2.
 */
(function () {
  'use strict';
  var FT_M = 0.3048, IN_CM = 2.54, SQFT_M2 = 0.09290304;
  var MET = { ft: 'm', 'in': 'cm', 'sq ft': 'm²' };
  var mode = 'imperial', unitsChosen = false;
  try {
    var savedUnits = localStorage.getItem('pm:units');
    if (savedUnits) { unitsChosen = true; mode = savedUnits === 'metric' ? 'metric' : 'imperial'; }
    else if (window.PMLocale) mode = window.PMLocale.defaultUnits();
  } catch (e) { /* storage off */ }

  function n(v) { var x = parseFloat(v); return isFinite(x) ? x : 0; }
  function r(x, dp) { var p = Math.pow(10, dp); return Math.round(x * p) / p; }
  function unitSpan(input) { return input.parentNode ? input.parentNode.querySelector('.unit') : null; }
  function kind(input) {
    var u = unitSpan(input);
    if (!u) return null;
    if (!u.hasAttribute('data-imp')) {
      var t = u.textContent.trim();
      if (!MET[t]) return null;
      u.setAttribute('data-imp', t);
    }
    return u.getAttribute('data-imp');
  }
  // Imperial value of an input as a string, whatever is on screen.
  function value(input, useExample) {
    if (input.value === '' && useExample && input.hasAttribute('data-ph')) return input.getAttribute('data-ph');
    if (input.getAttribute('data-shown') !== 'metric' || input.value === '') return input.value;
    var k = kind(input), x = n(input.value);
    if (k === 'ft') return String(x / FT_M);
    if (k === 'in') return String(x / IN_CM);
    if (k === 'sq ft') return String(x / SQFT_M2);
    return input.value;
  }
  function label(input, m) {
    var u = unitSpan(input);
    if (u) u.textContent = m ? MET[kind(input)] : kind(input);
    input.setAttribute('data-shown', m ? 'metric' : 'imperial');
  }
  // Show a feet + inches pair as metres + centimetres (or back).
  function convertPair(pair, toMetric) {
    var ins = pair.querySelectorAll('input');
    if (ins.length < 2) return;
    var wasMetric = ins[0].getAttribute('data-shown') === 'metric';
    if (wasMetric === toMetric) { label(ins[0], toMetric); label(ins[1], toMetric); return; }
    var empty = ins[0].value === '' && ins[1].value === '';
    var feet = n(value(ins[0])) + n(value(ins[1])) / 12;
    label(ins[0], toMetric); label(ins[1], toMetric);
    if (empty) return;
    setFeet(ins, feet);
  }
  function setFeet(ins, feet) {
    if (ins[0].getAttribute('data-shown') === 'metric') {
      var cmTotal = r(feet * FT_M * 100, 2), m = Math.floor(cmTotal / 100 + 1e-9), cm = r(cmTotal - m * 100, 2);
      ins[0].value = m; ins[1].value = cm ? cm : '';
    } else {
      var inTotal = r(feet * 12, 2), ft = Math.floor(inTotal / 12 + 1e-9), inch = r(inTotal - ft * 12, 2);
      ins[0].value = ft; ins[1].value = inch ? inch : '';
    }
  }
  function convertSingle(input, toMetric) {
    var k = kind(input);
    if (!k) return;
    var wasMetric = input.getAttribute('data-shown') === 'metric';
    if (wasMetric === toMetric) { label(input, toMetric); return; }
    var imp = value(input);
    label(input, toMetric);
    if (input.value === '') return;
    var x = n(imp);
    if (!toMetric) { input.value = r(x, 2); return; }
    input.value = k === 'ft' ? r(x * FT_M, 2) : k === 'in' ? r(x * IN_CM, 2) : r(x * SQFT_M2, 2);
  }
  function apply(root, toMetric) {
    Array.prototype.forEach.call(root.querySelectorAll('.ftin-pair'), function (p) { convertPair(p, toMetric); });
    Array.prototype.forEach.call(root.querySelectorAll('input[type=number]'), function (i) {
      if (!i.closest('.ftin-pair')) convertSingle(i, toMetric);
    });
    placeholders(root);
  }
  // Grey example text ("e.g. 12") shown in empty boxes, in the units on screen.
  // The example values themselves are kept in US units in data-ph.
  function placeholders(root) {
    var metric = mode === 'metric';
    Array.prototype.forEach.call(root.querySelectorAll('.ftin-pair'), function (pair) {
      var ins = pair.querySelectorAll('input');
      if (ins.length < 2 || !ins[0].hasAttribute('data-ph')) return;
      var feet = n(ins[0].getAttribute('data-ph')) + n(ins[1].getAttribute('data-ph')) / 12;
      var a, b;
      if (metric) {
        var cmTotal = r(feet * FT_M * 100, 0); a = Math.floor(cmTotal / 100 + 1e-9); b = r(cmTotal - a * 100, 0);
      } else {
        var inTotal = r(feet * 12, 1); a = Math.floor(inTotal / 12 + 1e-9); b = r(inTotal - a * 12, 1);
      }
      ins[0].placeholder = 'e.g. ' + a; ins[1].placeholder = b ? String(b) : '0';
    });
    Array.prototype.forEach.call(root.querySelectorAll('input[data-ph]'), function (i) {
      if (i.closest('.ftin-pair')) return;
      var x = n(i.getAttribute('data-ph')), k = kind(i);
      if (metric && k) x = k === 'ft' ? r(x * FT_M, 2) : k === 'in' ? r(x * IN_CM, 1) : r(x * SQFT_M2, 1);
      i.placeholder = 'e.g. ' + x;
    });
  }
  function describeFeet(feet) {
    if (mode === 'metric') {
      var cmTotal = r(feet * FT_M * 100, 1), m = Math.floor(cmTotal / 100 + 1e-9), cm = r(cmTotal - m * 100, 1);
      return m + ' m' + (cm ? ' ' + cm + ' cm' : '');
    }
    var inTotal = r(feet * 12, 1), ft = Math.floor(inTotal / 12 + 1e-9), inch = r(inTotal - ft * 12, 1);
    return ft + ' ft' + (inch ? ' ' + inch + ' in' : '');
  }
  // Adds metric equivalents to a result line in metric mode, e.g. "1,677 sq ft" -> "1,677 sq ft (155.8 m²)".
  function annotate(text) {
    if (mode !== 'metric' || !text) return text;
    return text
      .replace(/([\d,]+(?:\.\d+)?) sq ft\b(?! \/)/g, function (all, x) { return all + ' / ' + r(n(x.replace(/,/g, '')) * SQFT_M2, 1).toLocaleString('en-US') + ' m²'; })
      .replace(/([\d,]+(?:\.\d+)?) (cubic yards?|cu yd)\b(?! \/)/g, function (all, x) { return all + ' / ' + r(n(x.replace(/,/g, '')) * 0.764555, 2).toLocaleString('en-US') + ' m³'; })
      .replace(/([\d,]+(?:\.\d+)?) gallons?\b(?! \/)/g, function (all, x) { return all + ' / ' + r(n(x.replace(/,/g, '')) * 3.78541, 1).toLocaleString('en-US') + ' L'; });
  }
  window.PMUnits = {
    metric: function () { return mode === 'metric'; },
    chosen: function () { return unitsChosen; },
    follow: function (m) { if (!unitsChosen) mode = m === 'metric' ? 'metric' : 'imperial'; },
    value: value, apply: apply, placeholders: placeholders, setFeet: setFeet, describeFeet: describeFeet, annotate: annotate,
    set: function (m) {
      mode = m === 'metric' ? 'metric' : 'imperial';
      unitsChosen = true;
      try { localStorage.setItem('pm:units', mode); } catch (e) { /* storage off */ }
    }
  };
})();

/*
 * Calcupine page engine.
 * Wires a calculator form to a tool definition in tools.js:
 *   - reads inputs (feet + inches pairs are combined into feet)
 *   - runs the "area builder" (rooms made of rectangles, triangles, circles)
 *   - renders the result band, the shopping list with editable prices, notes
 *   - keeps a shareable link in the address bar
 */
(function () {
  'use strict';
  var F = window.PMF;
  var TOOLS = window.PMTools || {};
  var U = window.PMUnits;

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]);
    });
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem('pm:' + k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem('pm:' + k, JSON.stringify(v)); } catch (e) { /* storage off */ } }
  };

  function fmt(n, dp) {
    if (!isFinite(n)) return '0';
    return n.toLocaleString('en-US', { minimumFractionDigits: dp || 0, maximumFractionDigits: dp || 0 });
  }
  var L = window.PMLocale;
  function money(n) { return L ? L.money(n) : '$' + fmt(n, 2); }

  /* ---------------- Area builder ---------------- */
  var SHAPES = {
    rect: { label: 'Rectangle', dims: [['l', 'Length'], ['w', 'Width']] },
    tri: { label: 'Triangle', dims: [['b', 'Base'], ['h', 'Height']] },
    circle: { label: 'Circle', dims: [['d', 'Diameter']] }
  };

  function AreaBuilder(root, onChange) {
    this.root = root;
    this.onChange = onChange;
    this.list = el('div', { class: 'shapes' });
    var add = el('button', { type: 'button', class: 'btn btn-quiet' }, 'Add a section');
    var self = this;
    add.addEventListener('click', function () { self.addRow({ type: 'rect' }); self.onChange(); });
    root.appendChild(this.list);
    root.appendChild(add);
    this.totalEl = el('p', { class: 'shape-total', 'aria-live': 'polite' });
    root.appendChild(this.totalEl);
  }
  AreaBuilder.prototype.addRow = function (s) {
    var self = this;
    var idx = this.list.children.length + 1;
    var row = el('fieldset', { class: 'shape' });
    var legend = el('legend', null, 'Section ' + idx);
    row.appendChild(legend);

    var typeWrap = el('label', { class: 'field field-type' }, '<span>Shape</span>');
    var sel = el('select', { 'data-k': 'type' });
    Object.keys(SHAPES).forEach(function (k) {
      var o = el('option', { value: k }, SHAPES[k].label);
      if (k === s.type) o.selected = true;
      sel.appendChild(o);
    });
    typeWrap.appendChild(sel);
    row.appendChild(typeWrap);

    var dimsWrap = el('div', { class: 'dims' });
    row.appendChild(dimsWrap);

    var sub = el('label', { class: 'check' }, '<input type="checkbox" data-k="subtract"> <span>Cut-out (subtract this area)</span>');
    if (s.subtract) sub.querySelector('input').checked = true;
    row.appendChild(sub);

    var rm = el('button', { type: 'button', class: 'btn-link remove' }, 'Remove section');
    rm.addEventListener('click', function () {
      if (self.list.children.length > 1) { row.remove(); self.renumber(); self.onChange(); }
    });
    row.appendChild(rm);

    function drawDims(type, vals) {
      dimsWrap.innerHTML = '';
      SHAPES[type].dims.forEach(function (d) {
        var ftIn = splitFt(vals && vals[d[0]]);
        var f = el('div', { class: 'field ftin' },
          '<span>' + d[1] + '</span>' +
          '<div class="ftin-pair">' +
          '<label><input type="number" inputmode="decimal" min="0" step="any" data-k="' + d[0] + '_ft" value="' + ftIn[0] + '"><span class="unit">ft</span></label>' +
          '<label><input type="number" inputmode="decimal" min="0" step="any" data-k="' + d[0] + '_in" value="' + ftIn[1] + '"><span class="unit">in</span></label>' +
          '</div>');
        dimsWrap.appendChild(f);
      });
    }
    drawDims(s.type, s);
    if (markExamples) toExamples(dimsWrap);
    if (U.metric()) U.apply(dimsWrap, true);
    sel.addEventListener('change', function () { drawDims(sel.value, {}); if (U.metric()) U.apply(dimsWrap, true); self.onChange(); });
    row.addEventListener('input', function () { self.onChange(); });
    this.list.appendChild(row);
    this.renumber();
  };
  AreaBuilder.prototype.renumber = function () {
    $all('.shape', this.list).forEach(function (r, i) {
      r.querySelector('legend').textContent = 'Section ' + (i + 1);
      r.querySelector('.remove').hidden = i === 0 && r.parentNode.children.length === 1;
    });
  };
  AreaBuilder.prototype.read = function (ex) {
    return $all('.shape', this.list).map(function (r) {
      var s = { type: r.querySelector('[data-k=type]').value, subtract: r.querySelector('[data-k=subtract]').checked };
      SHAPES[s.type].dims.forEach(function (d) {
        var ft = F.num(U.value(r.querySelector('[data-k=' + d[0] + '_ft]'), ex));
        var inch = F.num(U.value(r.querySelector('[data-k=' + d[0] + '_in]'), ex));
        s[d[0]] = ft + inch / 12;
      });
      return s;
    });
  };
  AreaBuilder.prototype.load = function (shapes) {
    var self = this;
    this.list.innerHTML = '';
    (shapes && shapes.length ? shapes : [{ type: 'rect' }]).forEach(function (s) { self.addRow(s); });
  };

  // Turn the starting numbers in measurement boxes into grey examples, so visitors start
  // with empty boxes. Settings such as waste % or coverage keep their real defaults.
  var markExamples = false;
  function toExamples(root) {
    $all('.ftin-pair', root).forEach(function (pair) {
      var ins = pair.querySelectorAll('input');
      if (ins.length < 2 || (ins[0].value === '' && ins[1].value === '')) return;
      ins[0].setAttribute('data-ph', ins[0].value); ins[1].setAttribute('data-ph', ins[1].value);
      ins[0].value = ''; ins[1].value = '';
    });
    $all('input[type=number]', root).forEach(function (i) {
      if (i.closest('.ftin-pair') || i.value === '') return;
      var u = i.parentNode && i.parentNode.querySelector('.unit');
      var t = u ? (u.getAttribute('data-imp') || u.textContent.trim()) : '';
      if (t !== 'ft' && !i.hasAttribute('data-example')) return;
      i.setAttribute('data-ph', i.value); i.value = '';
    });
    U.placeholders(root);
  }

  function splitFt(v) {
    if (v === undefined || v === null || v === '' || !isFinite(v)) return ['', ''];
    var ft = Math.floor(v + 1e-9);
    var inch = Math.round((v - ft) * 12 * 100) / 100;
    if (inch >= 12) { ft += 1; inch = 0; }
    return [ft, inch ? inch : ''];
  }

  /* ---------------- Form values ---------------- */
  function readForm(form, ex) {
    var v = {};
    $all('input[name], select[name]', form).forEach(function (i) {
      if (i.type === 'checkbox') v[i.name] = i.checked;
      else if (i.type === 'radio') { if (i.checked) v[i.name] = i.value; }
      else v[i.name] = U.value(i, ex);
    });
    // Combine name_ft + name_in into name (feet).
    Object.keys(v).forEach(function (k) {
      var m = k.match(/^(.*)_ft$/);
      if (m && (m[1] + '_in') in v) {
        v[m[1]] = F.num(v[k]) + F.num(v[m[1] + '_in']) / 12;
      }
    });
    return v;
  }
  function writeForm(form, v) {
    Object.keys(v).forEach(function (k) {
      $all('[name="' + k + '"]', form).forEach(function (i) {
        if (i.type === 'checkbox') i.checked = !!v[k];
        else if (i.type === 'radio') i.checked = i.value === v[k];
        else i.value = v[k];
      });
    });
  }

  /* ---------------- Shareable link ---------------- */
  function encodeState(obj) {
    try { return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/=+$/, ''); } catch (e) { return ''; }
  }
  function decodeState(s) {
    try { return JSON.parse(decodeURIComponent(escape(atob(s)))); } catch (e) { return null; }
  }

  /* ---------------- Results ---------------- */
  function renderResult(panel, tool, out) {
    var band = $('.result-figure', panel);
    var h = out.headline || { value: 0, unit: '' };
    $('.result-value', band).textContent = h.value;
    $('.result-unit', band).textContent = h.unit;
    $('.result-sub', panel).textContent = U.annotate(h.sub || '');
    band.classList.toggle('is-empty', !out.ready);

    var list = $('.shop-list tbody', panel);
    list.innerHTML = '';
    var total = 0;
    var cur = L ? L.info().cur : 'USD';
    var prices = store.get('prices:' + tool + (cur === 'USD' ? '' : ':' + cur)) || {};
    (out.items || []).forEach(function (it) {
      if (!it.qty) return;
      var price = prices[it.key] !== undefined ? prices[it.key] : (L ? L.price(tool, it.key, it.price) : it.price);
      var sub = it.qty * F.num(price);
      total += sub;
      var tr = el('tr');
      tr.innerHTML =
        '<th scope="row"><span class="item-name">' + esc(it.name) + '</span>' +
        (it.note ? '<span class="item-note">' + esc(it.note) + '</span>' : '') + '</th>' +
        '<td class="qty">' + esc(fmt(it.qty, it.dp || 0)) + ' <span class="item-unit">' + esc(it.unit) + '</span></td>' +
        '<td class="price"><label><span class="sr-only">Price per ' + esc(it.unitSingle || it.unit) + ' for ' + esc(it.name) + '</span>' +
        '<span class="cur">' + esc(L ? L.symbol() : '$') + '</span><input type="number" inputmode="decimal" min="0" step="0.01" value="' + esc(price) + '" data-key="' + esc(it.key) + '"></label></td>' +
        '<td class="sub">' + money(sub) + '</td>';
      list.appendChild(tr);
    });
    $('.shop-total', panel).textContent = money(total);
    $('.shop', panel).hidden = !out.ready;

    var notes = $('.result-notes', panel);
    notes.innerHTML = '';
    (out.notes || []).forEach(function (n) { notes.appendChild(el('li', null, n)); });
    notes.hidden = !(out.notes && out.notes.length);

    panel._last = { out: out, total: total };

    var peek = document.querySelector('.result-peek');
    if (peek) {
      peek.querySelector('.peek-value').textContent = h.value;
      peek.querySelector('.peek-unit').textContent = h.unit;
      peek.classList.toggle('is-empty', !out.ready);
    }
  }

  // On phones the result sits below the form; a bar pinned to the bottom
  // shows the answer until the full result scrolls into view.
  function bootPeek(panel) {
    var peek = document.querySelector('.result-peek');
    if (!peek) return;
    peek.hidden = false;
    if (!('IntersectionObserver' in window)) return;
    // Show the bar only after the visitor scrolls into the form, and hide it
    // again once the full result is on screen.
    var resultVisible = false;
    function update() {
      peek.classList.toggle('is-away', resultVisible || window.scrollY < 260);
    }
    window.addEventListener('scroll', update, { passive: true });
    new IntersectionObserver(function (entries) {
      resultVisible = entries[0].isIntersecting;
      update();
    }, { threshold: 0.15 }).observe(panel);
    update();
  }

  function listAsText(panel, title) {
    var out = panel._last && panel._last.out;
    if (!out) return '';
    var prices = {};
    $all('.shop-list input[data-key]', panel).forEach(function (i) { prices[i.getAttribute('data-key')] = F.num(i.value); });
    var lines = [title, ''];
    (out.items || []).forEach(function (it) {
      if (!it.qty) return;
      lines.push('- ' + it.name + ': ' + fmt(it.qty, it.dp || 0) + ' ' + it.unit +
        (prices[it.key] ? ' (~' + money(it.qty * prices[it.key]) + ')' : ''));
    });
    lines.push('', 'Estimated total: ' + $('.shop-total', panel).textContent);
    lines.push('Calculated at ' + location.href);
    return lines.join('\n');
  }

  /* ---------------- Boot ---------------- */
  function boot() {
    var form = $('#calc');
    if (!form) return;
    var toolName = form.getAttribute('data-tool');
    var tool = TOOLS[toolName];
    var panel = $('#result');
    if (!tool || !panel) return;

    var builderRoot = $('[data-area-builder]', form);
    var builder = null;

    var params = new URLSearchParams(location.search);
    // A shared link wins; otherwise bring back this visitor's last inputs.
    var state = params.get('s') ? decodeState(params.get('s')) : store.get('last:' + toolName);

    function recalc(skipUrl) {
      // Until the visitor types a measurement, show the grey examples' answer, marked "Example".
      var hasExamples = !!form.querySelector('[data-ph]');
      var ex = hasExamples && !$all('[data-ph]', form).some(function (i) { return i.value !== ''; });
      var v = readForm(form, ex);
      if (builder) {
        v.shapes = builder.read(ex);
        v.area = F.totalArea(v.shapes);
        builder.totalEl.textContent = U.annotate((ex ? 'Example area: ' : 'Total area: ') + fmt(v.area, 1) + ' sq ft');
      }
      if (tool.prepare) tool.prepare(form, v);
      var out = tool.calc(v, F);
      renderResult(panel, toolName, out);
      panel.classList.toggle('is-example', ex);
      var lab = $('.result-label', panel);
      if (lab) lab.textContent = ex ? 'Example result' : 'You need';
      var hint = $('.example-hint', panel);
      if (!hint) { hint = el('p', { class: 'example-hint' }, 'These are example numbers. Type your own measurements to get your answer.'); $('.result-figure', panel).appendChild(hint); }
      hint.hidden = !ex;
      if (ex) return;
      if (!skipUrl && out.ready) {
        var raw = readRaw();
        store.set('last:' + toolName, raw);
        var url = new URL(location.href);
        url.searchParams.set('s', encodeState(raw));
        try { history.replaceState(null, '', url); } catch (e) { /* file:// */ }
      }
    }
    function readRaw() {
      var raw = {};
      $all('input[name], select[name]', form).forEach(function (i) {
        if (i.type === 'checkbox') raw[i.name] = i.checked;
        else if (i.type === 'radio') { if (i.checked) raw[i.name] = i.value; }
        else raw[i.name] = U.value(i);
      });
      // Store feet + inches pairs tidily (whole feet, inches to 2 dp), whatever units are on screen.
      Object.keys(raw).forEach(function (k) {
        var m = k.match(/^(.*)_ft$/);
        if (!m || !((m[1] + '_in') in raw)) return;
        if (raw[k] === '' && raw[m[1] + '_in'] === '') return;
        var inTotal = Math.round((F.num(raw[k]) * 12 + F.num(raw[m[1] + '_in'])) * 100) / 100;
        var ft = Math.floor(inTotal / 12 + 1e-9), inch = Math.round((inTotal - ft * 12) * 100) / 100;
        raw[k] = String(ft); raw[m[1] + '_in'] = inch ? String(inch) : '';
      });
      // Single unit fields: keep 2 dp in storage.
      Object.keys(raw).forEach(function (k) {
        var i = form.querySelector('[name="' + k + '"]');
        if (i && i.getAttribute('data-shown') === 'metric' && raw[k] !== '' && !/_(ft|in)$/.test(k)) raw[k] = String(Math.round(F.num(raw[k]) * 100) / 100);
      });
      if (builder) raw.shapes = builder.read();
      return raw;
    }

    markExamples = !state;
    if (!state) toExamples(form);
    if (builderRoot) {
      builder = new AreaBuilder(builderRoot, function () { recalc(); });
      builder.load(state && state.shapes ? state.shapes : (tool.defaultShapes || [{ type: 'rect' }]));
    }
    markExamples = false;
    if (state) writeForm(form, state);
    var repaintUnits = bootUnits(form, builderRoot, function () { recalc(true); });
    bootCountry(panel, form, !state);
    if (L) L.onChange(function () {
      if (!U.chosen() && U.metric() !== (L.defaultUnits() === 'metric')) {
        U.follow(L.defaultUnits()); U.apply(form, U.metric()); if (repaintUnits) repaintUnits();
      }
      localMoneyInputs(form);
      syncCountry(panel);
      recalc(true);
    });

    form.addEventListener('input', function () { recalc(); });
    form.addEventListener('change', function () { recalc(); });
    form.addEventListener('submit', function (e) { e.preventDefault(); recalc(); });

    panel.addEventListener('input', function (e) {
      var k = e.target.getAttribute('data-key');
      if (!k) return;
      var pkey = 'prices:' + toolName + (L && L.info().cur !== 'USD' ? ':' + L.info().cur : '');
      var prices = store.get(pkey) || {};
      prices[k] = F.num(e.target.value);
      store.set(pkey, prices);
      // Update subtotals without redrawing inputs (keeps focus).
      var total = 0;
      $all('.shop-list tbody tr', panel).forEach(function (tr) {
        var inp = $('input[data-key]', tr);
        var qtyItem = (panel._last.out.items || []).filter(function (it) { return it.key === inp.getAttribute('data-key'); })[0];
        var sub = qtyItem ? qtyItem.qty * F.num(inp.value) : 0;
        total += sub;
        $('.sub', tr).textContent = money(sub);
      });
      $('.shop-total', panel).textContent = money(total);
    });

    var printBtn = $('[data-action=print]', panel);
    if (printBtn) printBtn.addEventListener('click', function () { window.print(); });
    var copyBtn = $('[data-action=copy]', panel);
    if (copyBtn) copyBtn.addEventListener('click', function () {
      var text = listAsText(panel, document.querySelector('h1').textContent + ' shopping list');
      var done = function () { copyBtn.textContent = 'Copied'; setTimeout(function () { copyBtn.textContent = 'Copy list'; }, 1800); };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
      else { fallbackCopy(text); done(); }
    });
    var shareBtn = $('[data-action=share]', panel);
    if (shareBtn) shareBtn.addEventListener('click', function () {
      var url = location.href.replace(/([?&])embed=1&?/, '$1');
      if (navigator.share) { navigator.share({ title: document.title, url: url }).catch(function () {}); return; }
      fallbackCopy(url);
      shareBtn.textContent = 'Link copied';
      setTimeout(function () { shareBtn.textContent = 'Share this result'; }, 1800);
    });

    bootPeek(panel);
    recalc(true);
  }

  // "ft & in | m & cm" switch above the inputs, shown on calculators that take lengths.
  function bootUnits(form, builderRoot, done) {
    if (!form.querySelector('.ftin-pair, .unit')) return;
    var any = Array.prototype.some.call(form.querySelectorAll('.unit'), function (u) { return u.hasAttribute('data-imp') || /^(ft|in|sq ft)$/.test(u.textContent.trim()); });
    if (!any) return;
    var box = form.querySelector('.units-toggle');
    if (!box) {
      box = el('div', { class: 'units-toggle', role: 'group', 'aria-label': 'Units' },
        '<span class="units-label">Units</span>' +
        '<button type="button" data-units="imperial">ft &amp; in</button>' +
        '<button type="button" data-units="metric">m &amp; cm</button>');
      form.insertBefore(box, form.firstChild);
    }
    function paint() {
      $all('button', box).forEach(function (b) { b.setAttribute('aria-pressed', String((b.getAttribute('data-units') === 'metric') === U.metric())); });
    }
    if (U.metric()) U.apply(form, true);
    paint();
    setTimeout(function () { box.removeAttribute('data-wait'); }, 0);
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var toMetric = b.getAttribute('data-units') === 'metric';
      if (toMetric === U.metric()) return;
      U.set(toMetric ? 'metric' : 'imperial');
      U.apply(form, toMetric);
      paint();
      done();
    });
    return paint;
  }

  // "Prices for: United Kingdom (GBP)" menu above the shopping list.
  function bootCountry(panel, form, fresh) {
    if (!L) return;
    var shop = $('.shop', panel);
    if (!shop || $('.shop-country', panel)) return;
    var opts = Object.keys(L.countries).map(function (c) {
      return '<option value="' + c + '">' + esc(L.countries[c].name) + ' (' + L.countries[c].cur + ')</option>';
    }).join('');
    var row = el('p', { class: 'shop-country' }, '<label><span>Prices for</span> <select data-country>' + opts + '</select></label>' +
      '<span class="shop-country-note">Typical local prices. Type your store\'s price to update the total.</span>');
    shop.insertBefore(row, shop.firstChild);
    $('select', row).addEventListener('change', function (e) { L.set(e.target.value, true); });
    syncCountry(panel);
    if (fresh) localMoneyInputs(form);
  }
  function syncCountry(panel) {
    var sel = $('[data-country]', panel);
    if (sel && L) sel.value = L.country();
  }
  // Price boxes inside a form (e.g. flooring price per sq ft): local symbol, and the
  // starting example converted to the local currency.
  function localMoneyInputs(form) {
    if (!L) return;
    $all('.with-unit', form).forEach(function (w) {
      var u = $('.unit', w), i = $('input', w);
      if (!u || !i || (u.textContent !== '$' && !u.hasAttribute('data-money'))) return;
      u.setAttribute('data-money', '');
      u.textContent = L.symbol();
      if (!i.hasAttribute('data-usd')) { if (i.value === '') return; i.setAttribute('data-usd', i.value); }
      if (i.getAttribute('data-touched')) return;
      var tool = form.getAttribute('data-tool');
      i.value = L.price(tool, 'box', parseFloat(i.getAttribute('data-usd')));
      i.addEventListener('input', function () { i.setAttribute('data-touched', '1'); }, { once: true });
    });
  }

  function fallbackCopy(text) {
    var ta = el('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    ta.remove();
  }

  /* Embed code box: copy button */
  function bootEmbed() {
    var b = $('[data-action=copy-embed]');
    if (!b) return;
    b.addEventListener('click', function () {
      var code = $('#embed-code').value;
      if (navigator.clipboard) navigator.clipboard.writeText(code).catch(function () { fallbackCopy(code); });
      else fallbackCopy(code);
      b.textContent = 'Copied';
      setTimeout(function () { b.textContent = 'Copy embed code'; }, 1800);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { boot(); bootEmbed(); });
  else { boot(); bootEmbed(); }
})();

/* Homepage cards tilt toward the mouse (desktop only, off for reduced motion). */
(function () {
  'use strict';
  if (!window.matchMedia || !matchMedia('(pointer: fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  function init() {
    Array.prototype.forEach.call(document.querySelectorAll('.tool-card a, .related-list a'), function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = 'perspective(800px) rotateX(' + (-y * 8).toFixed(2) + 'deg) rotateY(' + (x * 10).toFixed(2) + 'deg) translateY(-6px)';
      });
      card.addEventListener('pointerleave', function () { card.style.transform = ''; });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

/* Phone menu */
(function () {
  'use strict';
  function init() {
    var btn = document.querySelector('.menu-btn'), nav = document.getElementById('site-menu');
    if (!btn || !nav) return;
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('is-open', open);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) { btn.click(); btn.focus(); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

/* Cookie choices. Visitors in Europe (judged by time zone) are asked once; anyone can
   change their mind from the "Cookie choices" link in the footer. Google applies the
   matching consent defaults by location, so nothing is stored before a choice there. */
(function () {
  'use strict';
  var KEY = 'pm:consent';
  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function inEurope() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      return /^Europe\//.test(tz) || /^Atlantic\/(Reykjavik|Canary|Madeira|Azores|Faroe)$/.test(tz);
    } catch (e) { return false; }
  }
  function apply(choice) {
    try { localStorage.setItem(KEY, choice); } catch (e) {}
    if (typeof window.gtag === 'function') {
      var v = choice === 'granted' ? 'granted' : 'denied';
      window.gtag('consent', 'update', { ad_storage: v, ad_user_data: v, ad_personalization: v, analytics_storage: v });
    }
  }
  function show() {
    if (document.querySelector('.cookie-bar')) return;
    var pl = document.querySelector('.site-foot a[href$="privacy-policy/"]');
    var prefix = pl ? pl.getAttribute('href') : '/privacy-policy/';
    var bar = document.createElement('div');
    bar.className = 'cookie-bar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Cookie choices');
    bar.innerHTML = '<p>We use cookies from Google Analytics to see which calculators people use, and later for ads that keep the site free. <a href="' + prefix + '">Privacy policy</a></p>' +
      '<div class="cookie-actions"><button type="button" class="btn" data-choice="denied">Reject</button>' +
      '<button type="button" class="btn" data-choice="granted">Accept</button></div>';
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('[data-choice]');
      if (!b) return;
      apply(b.getAttribute('data-choice'));
      bar.remove();
    });
    document.body.appendChild(bar);
  }
  function init() {
    if (document.documentElement.classList.contains('embed') || typeof window.gtag !== 'function') return;
    var link = document.querySelector('[data-cookie-settings]');
    if (link) link.addEventListener('click', show);
    if (!stored() && inEurope()) show();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
