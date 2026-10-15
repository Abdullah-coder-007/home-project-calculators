/*
 * Paint color visualizer (paint calculator page).
 *
 * The visitor adds a photo, taps a wall, and the wall is selected by growing out from the
 * tap over pixels of similar color (with a brush and eraser to fix the edges). The chosen
 * color is then applied keeping each pixel's own light and shade, so shadows, sunlight and
 * texture stay real. Everything runs in the browser; the photo never leaves the device.
 */
(function () {
  'use strict';
  var root = document.getElementById('visualizer');
  if (!root) return;
  function $(s) { return root.querySelector(s); }
  function $all(s) { return Array.prototype.slice.call(root.querySelectorAll(s)); }

  // Our own palette: names are ours, codes are exact sRGB colors any store can match.
  var TREND = [
    ['Spring Shoot', '#c9d7a6'], ['Mossy Olive', '#6b6b3f'], ['Powder Sky', '#9fb3c8'],
    ['Sunbaked Clay', '#b8664a'], ['Dusty Rose Plaster', '#d4a59a'], ['Soft Sage', '#b7c4ad'],
    ['Warm Linen', '#e9e0d0'], ['Deep Teal', '#2f5d62'], ['Honey Oat', '#d9b98b'],
    ['Charcoal Slate', '#4a4f55'], ['Cloud White', '#f2f0ea'], ['Lavender Haze', '#b9b0cf']
  ];
  var MAX = 1280;                       // longest side we work at (keeps phones fast)

  var canvas = $('[data-viz=canvas]'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  var W = 0, H = 0, src = null, lab = null, mask = null, history = [];
  var tool = 'pick', color = TREND[0][1], kept = [], drawing = false;

  /* ---------- color math ---------- */
  function hexToRgb(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function rgbToHex(r, g, b) { return '#' + [r, g, b].map(function (v) { return ('0' + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2); }).join(''); }
  function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function delin(c) { c = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return c * 255; }
  function rgbToLab(r, g, b) {
    r = lin(r); g = lin(g); b = lin(b);
    var x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047, y = r * 0.2126 + g * 0.7152 + b * 0.0722, z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
    function f(t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; }
    var fx = f(x), fy = f(y), fz = f(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  function labToRgb(L, a, b) {
    var fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
    function fi(t) { return t * t * t > 0.008856 ? t * t * t : (t - 16 / 116) / 7.787; }
    var x = fi(fx) * 0.95047, y = fi(fy), z = fi(fz) * 1.08883;
    return [delin(x * 3.2406 - y * 1.5372 - z * 0.4986), delin(-x * 0.9689 + y * 1.8758 + z * 0.0415), delin(x * 0.0557 - y * 0.2040 + z * 1.0570)];
  }
  function hexToHsl(h) {
    var c = hexToRgb(h).map(function (v) { return v / 255; }), mx = Math.max.apply(null, c), mn = Math.min.apply(null, c), l = (mx + mn) / 2, s = 0, hue = 0, d = mx - mn;
    if (d) { s = d / (1 - Math.abs(2 * l - 1)); hue = mx === c[0] ? ((c[1] - c[2]) / d) % 6 : mx === c[1] ? (c[2] - c[0]) / d + 2 : (c[0] - c[1]) / d + 4; hue *= 60; if (hue < 0) hue += 360; }
    return [hue, s, l];
  }
  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
    var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2, r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
  }
  // Colors that go with the pick: a lighter and deeper tone of it, two neighbours on the
  // color wheel, its opposite (as a soft accent) and a warm or cool neutral.
  function matches(hex) {
    var hsl = hexToHsl(hex), h = hsl[0], s = hsl[1], l = hsl[2];
    return [
      ['Lighter tone', hslToHex(h, s * 0.8, Math.min(0.92, l + 0.18))],
      ['Deeper tone', hslToHex(h, Math.min(1, s * 1.1), Math.max(0.18, l - 0.22))],
      ['Neighbour', hslToHex(h + 30, s, l)],
      ['Neighbour', hslToHex(h - 30, s, l)],
      ['Soft contrast', hslToHex(h + 180, Math.min(s, 0.35), Math.min(0.85, Math.max(0.45, l)))],
      ['Neutral', hslToHex(h, 0.08, 0.86)]
    ];
  }

  /* ---------- photo ---------- */
  function loadImage(img) {
    var scale = Math.min(1, MAX / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    W = Math.round((img.naturalWidth || img.width) * scale); H = Math.round((img.naturalHeight || img.height) * scale);
    canvas.width = W; canvas.height = H;
    ctx.drawImage(img, 0, 0, W, H);
    src = ctx.getImageData(0, 0, W, H);
    lab = new Float32Array(W * H * 3);
    for (var i = 0, p = 0; i < W * H; i++, p += 4) {
      var c = rgbToLab(src.data[p], src.data[p + 1], src.data[p + 2]);
      lab[i * 3] = c[0]; lab[i * 3 + 1] = c[1]; lab[i * 3 + 2] = c[2];
    }
    mask = new Uint8Array(W * H); history = [];
    $('.viz-work').hidden = false;
    $('[data-viz=hint]').hidden = false;
    render();
  }
  function fromFile(file) {
    if (!file || !/^image\//.test(file.type)) return;
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () { loadImage(img); URL.revokeObjectURL(url); };
    img.src = url;
  }
  // A drawn sample room, so people can try it without a photo.
  function sampleRoom() {
    var c = document.createElement('canvas'); c.width = 960; c.height = 640;
    var g = c.getContext('2d');
    var wall = g.createLinearGradient(0, 0, 960, 0); wall.addColorStop(0, '#d8d3c8'); wall.addColorStop(0.6, '#ece8df'); wall.addColorStop(1, '#cfc9bd');
    g.fillStyle = wall; g.fillRect(0, 0, 960, 470);
    g.fillStyle = '#b48a5a'; g.fillRect(0, 470, 960, 170);                           // floor
    g.fillStyle = '#f7f5f0'; g.fillRect(0, 455, 960, 18);                            // baseboard
    g.fillStyle = '#f7f5f0'; g.fillRect(610, 90, 230, 250); g.fillStyle = '#a9c7dd'; g.fillRect(625, 105, 200, 220); // window
    g.fillStyle = '#5c6b73'; g.fillRect(90, 330, 380, 120); g.fillRect(70, 300, 60, 150); g.fillRect(430, 300, 60, 150); // sofa
    g.fillStyle = '#e0b04f'; g.fillRect(150, 300, 70, 50); g.fillRect(340, 300, 70, 50);
    var shade = g.createRadialGradient(780, 200, 50, 780, 200, 700); shade.addColorStop(0, 'rgba(255,255,255,0.15)'); shade.addColorStop(1, 'rgba(0,0,0,0.18)');
    g.fillStyle = shade; g.fillRect(0, 0, 960, 470);
    var img = new Image(); img.onload = function () { loadImage(img); }; img.src = c.toDataURL();
  }

  /* ---------- selecting the wall ---------- */
  function saveUndo() { history.push(mask.slice()); if (history.length > 20) history.shift(); }
  function grow(x, y) {
    var tol = +$('[data-viz=tolerance]').value, start = y * W + x;
    var L0 = lab[start * 3], a0 = lab[start * 3 + 1], b0 = lab[start * 3 + 2];
    var seen = new Uint8Array(W * H), stack = [start];
    saveUndo();
    while (stack.length) {
      var i = stack.pop();
      if (seen[i]) continue; seen[i] = 1;
      var dL = (lab[i * 3] - L0) * 0.5, da = lab[i * 3 + 1] - a0, db = lab[i * 3 + 2] - b0; // lightness counts less: shadows stay in
      if (dL * dL + da * da + db * db > tol * tol) continue;
      mask[i] = 1;
      var px = i % W, py = (i - px) / W;
      if (px > 0) stack.push(i - 1); if (px < W - 1) stack.push(i + 1);
      if (py > 0) stack.push(i - W); if (py < H - 1) stack.push(i + W);
    }
    render();
  }
  function brush(x, y, on) {
    var r = Math.max(6, Math.round(Math.min(W, H) / 40));
    for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      var px = x + dx, py = y + dy;
      if (px >= 0 && py >= 0 && px < W && py < H) mask[py * W + px] = on ? 1 : 0;
    }
  }
  function point(e) {
    var r = canvas.getBoundingClientRect(), t = e.touches ? e.touches[0] : e;
    return [Math.floor((t.clientX - r.left) / r.width * W), Math.floor((t.clientY - r.top) / r.height * H)];
  }

  /* ---------- painting ---------- */
  // Keep each pixel's light and shade: shift its lightness by the same amount the chosen
  // color differs from the wall's average, and replace the color itself.
  function paintInto(out, hex, mix) {
    var t = hexToRgb(hex), tl = rgbToLab(t[0], t[1], t[2]);
    var sum = 0, n = 0;
    for (var i = 0; i < W * H; i++) if (mask[i]) { sum += lab[i * 3]; n++; }
    var avg = n ? sum / n : 50;
    var d = out.data;
    for (var j = 0, p = 0; j < W * H; j++, p += 4) {
      if (!mask[j]) continue;
      var L = tl[0] + (lab[j * 3] - avg) * 0.85;
      var c = labToRgb(Math.max(0, Math.min(100, L)), tl[1], tl[2]);
      d[p] = src.data[p] + (c[0] - src.data[p]) * mix;
      d[p + 1] = src.data[p + 1] + (c[1] - src.data[p + 1]) * mix;
      d[p + 2] = src.data[p + 2] + (c[2] - src.data[p + 2]) * mix;
    }
    return n;
  }
  function render() {
    if (!src) return;
    var out = new ImageData(new Uint8ClampedArray(src.data), W, H);
    var n = paintInto(out, color, +$('[data-viz=mix]').value / 100);
    ctx.putImageData(out, 0, 0);
    $('[data-viz=hint]').hidden = n > 0;
    $('[data-viz=code]').textContent = nameOf(color) + ' · ' + color.toUpperCase();
  }
  function snapshot(hex) {
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var out = new ImageData(new Uint8ClampedArray(src.data), W, H);
    paintInto(out, hex, 1);
    c.getContext('2d').putImageData(out, 0, 0);
    return c.toDataURL('image/jpeg', 0.85);
  }

  /* ---------- colors ---------- */
  function nameOf(hex) {
    for (var i = 0; i < TREND.length; i++) if (TREND[i][1].toLowerCase() === hex.toLowerCase()) return TREND[i][0];
    return 'Custom';
  }
  function swatches(el, list) {
    el.innerHTML = '';
    list.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'viz-swatch'; b.setAttribute('role', 'listitem');
      b.style.setProperty('--sw', c[1]);
      b.setAttribute('aria-label', c[0] + ' ' + c[1]);
      b.setAttribute('aria-pressed', String(c[1].toLowerCase() === color.toLowerCase()));
      b.innerHTML = '<span class="viz-chip"></span><span class="viz-name">' + c[0] + '</span><span class="viz-hex">' + c[1].toUpperCase() + '</span>';
      b.addEventListener('click', function () { choose(c[1]); });
      el.appendChild(b);
    });
  }
  function choose(hex) {
    color = hex;
    $('[data-viz=custom]').value = hex;
    swatches($('[data-viz=trend]'), TREND);
    swatches($('[data-viz=matches]'), matches(hex));
    render();
  }
  function drawGrid() {
    var g = $('[data-viz=grid]');
    g.innerHTML = '';
    kept.forEach(function (k, i) {
      var f = document.createElement('figure');
      f.innerHTML = '<img alt="Your room in ' + k.name + '" src="' + k.img + '"><figcaption><span class="viz-chip" style="--sw:' + k.hex + '"></span>' +
        k.name + ' · ' + k.hex.toUpperCase() + ' <button type="button" class="btn-link" aria-label="Remove ' + k.name + '">Remove</button></figcaption>';
      f.querySelector('button').addEventListener('click', function () { kept.splice(i, 1); drawGrid(); });
      f.querySelector('img').addEventListener('click', function () { choose(k.hex); });
      g.appendChild(f);
    });
  }

  /* ---------- wiring ---------- */
  $('[data-viz=file]').addEventListener('change', function (e) { fromFile(e.target.files[0]); });
  $('[data-viz=sample]').addEventListener('click', sampleRoom);
  $all('.viz-tool[data-tool]').forEach(function (b) {
    b.addEventListener('click', function () {
      tool = b.getAttribute('data-tool');
      $all('.viz-tool[data-tool]').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
    });
  });
  $('[data-viz=undo]').addEventListener('click', function () { if (history.length) { mask = history.pop(); render(); } });
  $('[data-viz=clear]').addEventListener('click', function () { if (mask) { saveUndo(); mask.fill(0); render(); } });
  $('[data-viz=mix]').addEventListener('input', render);
  $('[data-viz=custom]').addEventListener('input', function (e) { choose(e.target.value); });
  $('[data-viz=keep]').addEventListener('click', function () {
    if (!src || !mask.some(function (v) { return v; })) return;
    if (kept.some(function (k) { return k.hex === color; })) return;
    if (kept.length >= 4) kept.shift();
    kept.push({ hex: color, name: nameOf(color), img: snapshot(color) });
    drawGrid();
  });
  function down(e) {
    if (!src) return;
    var p = point(e);
    if (tool === 'pick') { grow(p[0], p[1]); return; }
    e.preventDefault();
    saveUndo(); drawing = true; brush(p[0], p[1], tool === 'add'); render();
  }
  function move(e) {
    if (!drawing) return;
    e.preventDefault();
    var p = point(e); brush(p[0], p[1], tool === 'add'); render();
  }
  function up() { drawing = false; }
  canvas.addEventListener('mousedown', down); canvas.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  canvas.addEventListener('touchstart', down, { passive: false }); canvas.addEventListener('touchmove', move, { passive: false }); window.addEventListener('touchend', up);
  choose(color);
  window.PMViz = { sample: sampleRoom, tapAt: function (x, y) { grow(x, y); }, kept: function () { return kept.length; } };
})();
