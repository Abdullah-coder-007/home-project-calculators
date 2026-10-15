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
  function money(n) { return '$' + fmt(n, 2); }

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
    sel.addEventListener('change', function () { drawDims(sel.value, {}); self.onChange(); });
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
  AreaBuilder.prototype.read = function () {
    return $all('.shape', this.list).map(function (r) {
      var s = { type: r.querySelector('[data-k=type]').value, subtract: r.querySelector('[data-k=subtract]').checked };
      SHAPES[s.type].dims.forEach(function (d) {
        var ft = F.num(r.querySelector('[data-k=' + d[0] + '_ft]').value);
        var inch = F.num(r.querySelector('[data-k=' + d[0] + '_in]').value);
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

  function splitFt(v) {
    if (v === undefined || v === null || v === '' || !isFinite(v)) return ['', ''];
    var ft = Math.floor(v + 1e-9);
    var inch = Math.round((v - ft) * 12 * 100) / 100;
    if (inch >= 12) { ft += 1; inch = 0; }
    return [ft, inch ? inch : ''];
  }

  /* ---------------- Form values ---------------- */
  function readForm(form) {
    var v = {};
    $all('input[name], select[name]', form).forEach(function (i) {
      if (i.type === 'checkbox') v[i.name] = i.checked;
      else if (i.type === 'radio') { if (i.checked) v[i.name] = i.value; }
      else v[i.name] = i.value;
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
    $('.result-sub', panel).textContent = h.sub || '';
    band.classList.toggle('is-empty', !out.ready);

    var list = $('.shop-list tbody', panel);
    list.innerHTML = '';
    var total = 0;
    var prices = store.get('prices:' + tool) || {};
    (out.items || []).forEach(function (it) {
      if (!it.qty) return;
      var price = prices[it.key] !== undefined ? prices[it.key] : it.price;
      var sub = it.qty * F.num(price);
      total += sub;
      var tr = el('tr');
      tr.innerHTML =
        '<th scope="row"><span class="item-name">' + esc(it.name) + '</span>' +
        (it.note ? '<span class="item-note">' + esc(it.note) + '</span>' : '') + '</th>' +
        '<td class="qty">' + esc(fmt(it.qty, it.dp || 0)) + ' <span class="item-unit">' + esc(it.unit) + '</span></td>' +
        '<td class="price"><label><span class="sr-only">Price per ' + esc(it.unitSingle || it.unit) + ' for ' + esc(it.name) + '</span>' +
        '$<input type="number" inputmode="decimal" min="0" step="0.01" value="' + esc(price) + '" data-key="' + esc(it.key) + '"></label></td>' +
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
      var v = readForm(form);
      if (builder) {
        v.shapes = builder.read();
        v.area = F.totalArea(v.shapes);
        builder.totalEl.textContent = 'Total area: ' + fmt(v.area, 1) + ' sq ft';
      }
      if (tool.prepare) tool.prepare(form, v);
      var out = tool.calc(v, F);
      renderResult(panel, toolName, out);
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
        else raw[i.name] = i.value;
      });
      if (builder) raw.shapes = builder.read();
      return raw;
    }

    if (builderRoot) {
      builder = new AreaBuilder(builderRoot, function () { recalc(); });
      builder.load(state && state.shapes ? state.shapes : (tool.defaultShapes || [{ type: 'rect' }]));
    }
    if (state) writeForm(form, state);

    form.addEventListener('input', function () { recalc(); });
    form.addEventListener('change', function () { recalc(); });
    form.addEventListener('submit', function (e) { e.preventDefault(); recalc(); });

    panel.addEventListener('input', function (e) {
      var k = e.target.getAttribute('data-key');
      if (!k) return;
      var prices = store.get('prices:' + toolName) || {};
      prices[k] = F.num(e.target.value);
      store.set('prices:' + toolName, prices);
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
