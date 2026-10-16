/*
 * Paint color visualizer (paint calculator page).
 *
 * Sample rooms: drawn living room, bedroom and kitchen whose walls are exact shapes, so a
 * tap paints exactly that wall (main, left, right, ceiling, or all). Light and shade are
 * drawn over the paint, so a color looks like it would on a real lit wall.
 *
 * Your photo (beta): the visitor adds a photo, taps a wall, and the wall is selected by
 * growing out from the tap over pixels of similar color (with a brush and eraser to fix the
 * edges). The color is applied keeping each pixel's own light and shade. Everything runs in
 * the browser; the photo never leaves the device.
 *
 * Palette names are our own; codes are plain sRGB colors any store can match.
 */
(function () {
  'use strict';
  var root = document.getElementById('visualizer');
  if (!root) return;
  function $(s) { return root.querySelector(s); }
  function $all(s) { return Array.prototype.slice.call(root.querySelectorAll(s)); }

  var TREND = [
    ['Spring Shoot', '#c9d7a6'], ['Mossy Olive', '#6b6b3f'], ['Powder Sky', '#9fb3c8'],
    ['Sunbaked Clay', '#b8664a'], ['Dusty Rose Plaster', '#d4a59a'], ['Soft Sage', '#b7c4ad'],
    ['Warm Linen', '#e9e0d0'], ['Deep Teal', '#2f5d62'], ['Honey Oat', '#d9b98b'],
    ['Charcoal Slate', '#4a4f55'], ['Cloud White', '#f2f0ea'], ['Lavender Haze', '#b9b0cf']
  ];
  // Families: [label, hue, saturation, names light -> deep]
  var FAMILY_DEF = [
    ['Whites', 45, 0.30, ['Fresh Milk', 'Morning Mist', 'Rice Paper', 'Soft Chalk', 'Eggshell Lace', 'Vanilla Cloud', 'Pearl Drift', 'Old Ivory'], [0.96, 0.94, 0.92, 0.90, 0.88, 0.86, 0.84, 0.81]],
    ['Neutrals', 35, 0.22, ['Sand Dollar', 'Oat Milk', 'Driftwood Beige', 'Desert Taupe', 'Camel Hide', 'Walnut Shell', 'Cocoa Bark', 'Espresso Bean']],
    ['Greys', 210, 0.06, ['Silver Fog', 'Pebble Path', 'Harbor Grey', 'Stone Step', 'Rainy Slate', 'Iron Gate', 'Graphite Line', 'Midnight Coal']],
    ['Greens', 95, 0.26, ['Mint Whisper', 'Pistachio Cream', 'Garden Sage', 'Olive Grove', 'Fern Leaf', 'Forest Walk', 'Pine Shadow', 'Deep Moss']],
    ['Blues', 210, 0.38, ['Ice Breeze', 'Baby Sky', 'Coastal Blue', 'Denim Wash', 'Lake Water', 'Ocean Deep', 'Royal Ink', 'Night Harbor']],
    ['Teals', 180, 0.32, ['Sea Glass', 'Aqua Splash', 'Lagoon Calm', 'Peacock Light', 'Teal Bay', 'Jade Pool', 'Deep Lagoon', 'Teal Night']],
    ['Yellows', 45, 0.70, ['Butter Light', 'Lemon Chiffon', 'Sunbeam', 'Mustard Seed', 'Golden Hour', 'Turmeric', 'Amber Glow', 'Old Brass']],
    ['Oranges', 22, 0.60, ['Peach Blush', 'Apricot Cream', 'Clay Pot', 'Terracotta Tile', 'Rust Leaf', 'Burnt Sienna', 'Copper Kettle', 'Brick Kiln']],
    ['Pinks & reds', 352, 0.48, ['Petal Pink', 'Rose Quartz', 'Blush Rose', 'Coral Reef', 'Berry Crush', 'Ruby Red', 'Wine Cellar', 'Maroon Velvet']],
    ['Purples', 268, 0.25, ['Lilac Mist', 'Lavender Field', 'Heather Bloom', 'Orchid Dusk', 'Mauve Twilight', 'Plum Jam', 'Aubergine', 'Deep Violet']]
  ];
  var LIGHTS = [0.90, 0.82, 0.72, 0.62, 0.52, 0.42, 0.32, 0.23];
  var COMBOS = [
    ['Calm and fresh', 'Garden Sage', 'Fresh Milk'],
    ['Warm and cozy', 'Terracotta Tile', 'Oat Milk'],
    ['Coastal', 'Coastal Blue', 'Rice Paper'],
    ['Modern contrast', 'Graphite Line', 'Silver Fog'],
    ['Sunny', 'Mustard Seed', 'Butter Light'],
    ['Soft romance', 'Blush Rose', 'Morning Mist'],
    ['Rich and moody', 'Teal Night', 'Sea Glass'],
    ['Earthy', 'Olive Grove', 'Sand Dollar']
  ];
  var MAX = 1280;                       // longest side we work at for photos (keeps phones fast)
  /* ---------- palette ---------- */
  var FAMILIES = [['Trending', TREND]].concat(FAMILY_DEF.map(function (f) {
    var ls = f[4] || LIGHTS;
    return [f[0], f[3].map(function (n, i) {
      // deeper shades carry a touch more color so they don't turn muddy
      var sat = f[2] * (f[4] ? 1 : 0.75 + i * 0.06);
      return [n, hslToHex(f[1] + (f[4] ? 0 : i * 1.5), Math.min(0.9, sat), ls[i])];
    })];
  }));
  var ALL = [];
  FAMILIES.forEach(function (f) { f[1].forEach(function (c) { ALL.push(c); }); });
  function byName(n) { for (var i = 0; i < ALL.length; i++) if (ALL[i][0] === n) return ALL[i][1]; return '#ffffff'; }
  function nameOf(hex) {
    for (var i = 0; i < ALL.length; i++) if (ALL[i][1].toLowerCase() === hex.toLowerCase()) return ALL[i][0];
    return 'Your color';
  }

  /* ---------- sample rooms ---------- */
  var SHELL = {
    ceiling: 'M0 0H960L780 95H180Z',
    left: 'M0 0L180 95V430L0 560Z',
    right: 'M960 0L780 95V430L960 560Z',
    back: 'M180 95H780V430H180Z'
  };
  var WALL_NAMES = { back: 'Main wall', left: 'Left wall', right: 'Right wall', ceiling: 'Ceiling', all: 'All walls' };
  var ROOM_NAMES = { living: 'Living room', bedroom: 'Bedroom', kitchen: 'Kitchen', photo: 'Your photo' };
  var DEFS = '<defs>' +
    '<linearGradient id="vzL" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".26"/><stop offset="1" stop-color="#000" stop-opacity=".1"/></linearGradient>' +
    '<linearGradient id="vzR" x1="1" x2="0"><stop offset="0" stop-color="#000" stop-opacity=".16"/><stop offset="1" stop-color="#000" stop-opacity=".04"/></linearGradient>' +
    '<linearGradient id="vzC" y1="0" y2="1" x1="0" x2="0"><stop offset="0" stop-color="#000" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".02"/></linearGradient>' +
    '<radialGradient id="vzB" cx=".55" cy=".35" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></radialGradient>' +
    '<linearGradient id="vzSky" y1="0" y2="1" x1="0" x2="0"><stop offset="0" stop-color="#a9cbe3"/><stop offset="1" stop-color="#e6f0f5"/></linearGradient>' +
    '<linearGradient id="vzFloorShade" y1="0" y2="1" x1="0" x2="0"><stop offset="0" stop-color="#000" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>' +
    '<clipPath id="vzF"><path d="M0 560L180 430H780L960 560V600H0Z"/></clipPath></defs>';
  var TRIM = '<g fill="#f6f3ec"><path d="M180 418H780V430H180Z"/><path d="M0 545L180 418V430L0 560Z"/><path d="M960 545L780 418V430L960 560Z"/></g>' +
    '<g stroke="#000" stroke-opacity=".12" stroke-width="2" fill="none"><path d="M180 95V430M780 95V430M180 95H780"/></g>';
  var FLOOR = 'M0 560L180 430H780L960 560V600H0Z';
  function planks(color, gap) {
    var s = '<path d="' + FLOOR + '" fill="' + color + '"/>';
    s += '<g clip-path="url(#vzF)" stroke="#000" stroke-opacity=".1" stroke-width="2">';
    for (var i = 0; i <= 12; i++) { var xt = 180 + i * 50, xb = (xt - 480) * (960 / 600) + 480; s += '<line x1="' + xt + '" y1="430" x2="' + xb + '" y2="600"/>'; }
    if (gap) for (var y = 460; y < 600; y += gap) s += '<line x1="0" y1="' + y + '" x2="960" y2="' + y + '"/>';
    return s + '</g><path d="' + FLOOR + '" fill="url(#vzFloorShade)"/>';
  }
  var ROOMS = {
    living: {
      floor: planks('#b8895a', 0),
      items:
        // window
        '<rect x="540" y="125" width="190" height="205" rx="4" fill="#f7f5f0"/><rect x="552" y="137" width="166" height="181" fill="url(#vzSky)"/>' +
        '<path d="M635 137V318M552 228H718" stroke="#f7f5f0" stroke-width="8"/>' +
        // art
        '<rect x="250" y="150" width="150" height="104" rx="3" fill="#f7f5f0" stroke="#6d5a4a" stroke-width="5"/><circle cx="300" cy="200" r="26" fill="#d98f5c"/><path d="M262 245L320 200L360 230L390 210V245Z" fill="#5f7d6e"/>' +
        // rug, coffee table
        '<ellipse cx="380" cy="520" rx="250" ry="48" fill="#ece3d3"/><ellipse cx="380" cy="520" rx="220" ry="38" fill="none" stroke="#c9b79c" stroke-width="3"/>' +
        '<rect x="300" y="470" width="170" height="14" rx="3" fill="#7d5233"/><path d="M312 484V512M458 484V512" stroke="#5b3a22" stroke-width="6"/>' +
        // sofa
        '<rect x="230" y="292" width="280" height="68" rx="20" fill="#66767e"/><rect x="215" y="340" width="310" height="80" rx="14" fill="#5a6a72"/>' +
        '<rect x="200" y="315" width="42" height="112" rx="16" fill="#536269"/><rect x="498" y="315" width="42" height="112" rx="16" fill="#536269"/>' +
        '<rect x="258" y="312" width="72" height="48" rx="10" fill="#e0b04f"/><rect x="412" y="312" width="72" height="48" rx="10" fill="#d78a5f"/>' +
        '<path d="M232 427V446M508 427V446" stroke="#3a3027" stroke-width="7"/>' +
        // lamp and plant
        '<path d="M600 300V470" stroke="#3a3a3a" stroke-width="5"/><path d="M572 300H628L614 262H586Z" fill="#efe2c4"/><ellipse cx="600" cy="472" rx="22" ry="6" fill="#3a3a3a"/>' +
        '<path d="M716 470H776L768 410H724Z" fill="#c46f4a"/><g fill="#4f7a55"><ellipse cx="730" cy="380" rx="16" ry="38" transform="rotate(-25 730 380)"/><ellipse cx="760" cy="372" rx="15" ry="40" transform="rotate(20 760 372)"/><ellipse cx="746" cy="360" rx="13" ry="44"/></g>'
    },
    bedroom: {
      floor: '<path d="' + FLOOR + '" fill="#cdbfa9"/><path d="' + FLOOR + '" fill="url(#vzFloorShade)"/>',
      items:
        // window on the left wall
        '<path d="M48 140L140 182V338L48 362Z" fill="#f7f5f0"/><path d="M58 154L130 188V330L58 349Z" fill="url(#vzSky)"/><path d="M94 171V340" stroke="#f7f5f0" stroke-width="6"/>' +
        // art above bed
        '<rect x="395" y="140" width="170" height="74" rx="3" fill="#f7f5f0" stroke="#8b7764" stroke-width="5"/><path d="M405 204Q440 160 480 190T555 170V204Z" fill="#8fa7a0"/>' +
        // nightstands and lamps
        '<rect x="248" y="352" width="72" height="70" rx="6" fill="#a47c5b"/><rect x="640" y="352" width="72" height="70" rx="6" fill="#a47c5b"/>' +
        '<path d="M284 352V318M676 352V318" stroke="#555" stroke-width="4"/><path d="M262 318H306L298 290H270Z M654 318H698L690 290H662Z" fill="#f2e6cc"/>' +
        // bed
        '<rect x="330" y="248" width="300" height="160" rx="18" fill="#8c6f5a"/>' +
        '<path d="M312 372H648L700 528H260Z" fill="#f4f0e8"/><path d="M296 430H664L700 528H260Z" fill="#7d96a6"/><path d="M300 430H660" stroke="#6a8291" stroke-width="5"/>' +
        '<ellipse cx="420" cy="368" rx="64" ry="22" fill="#fbf9f4"/><ellipse cx="540" cy="368" rx="64" ry="22" fill="#fbf9f4"/>' +
        '<path d="M268 528V548M692 528V548" stroke="#5c4433" stroke-width="8"/>'
    },
    kitchen: {
      floor: (function () {
        var s = '<path d="' + FLOOR + '" fill="#dcd6cc"/><g clip-path="url(#vzF)" stroke="#000" stroke-opacity=".09" stroke-width="2">';
        for (var i = 0; i <= 8; i++) { var xt = 180 + i * 75, xb = (xt - 480) * 1.6 + 480; s += '<line x1="' + xt + '" y1="430" x2="' + xb + '" y2="600"/>'; }
        [452, 482, 520, 568].forEach(function (y) { s += '<line x1="0" y1="' + y + '" x2="960" y2="' + y + '"/>'; });
        return s + '</g><path d="' + FLOOR + '" fill="url(#vzFloorShade)"/>';
      })(),
      items:
        // backsplash tiles
        '<rect x="180" y="250" width="600" height="72" fill="#eeebe4"/><g stroke="#000" stroke-opacity=".08" stroke-width="1.5">' +
        [268, 286, 304].map(function (y) { return '<line x1="180" y1="' + y + '" x2="780" y2="' + y + '"/>'; }).join('') + '</g>' +
        // window over the sink
        '<rect x="420" y="120" width="130" height="118" rx="3" fill="#f7f5f0"/><rect x="430" y="130" width="110" height="98" fill="url(#vzSky)"/><path d="M485 130V228" stroke="#f7f5f0" stroke-width="6"/>' +
        // upper cabinets
        '<rect x="196" y="105" width="196" height="118" rx="4" fill="#f3f0e9"/><rect x="578" y="105" width="186" height="118" rx="4" fill="#f3f0e9"/>' +
        '<path d="M294 111V217M671 111V217" stroke="#d6d0c4" stroke-width="3"/><path d="M286 190V206M302 190V206M663 190V206M679 190V206" stroke="#8a8a8a" stroke-width="4"/>' +
        // counter and lower cabinets
        '<rect x="174" y="318" width="612" height="16" rx="3" fill="#3f3f42"/><rect x="180" y="334" width="600" height="86" fill="#f3f0e9"/>' +
        '<g stroke="#d6d0c4" stroke-width="3">' + [255, 330, 405, 480, 555, 630, 705].map(function (x) { return '<line x1="' + x + '" y1="340" x2="' + x + '" y2="414"/>'; }).join('') + '</g>' +
        '<g stroke="#8a8a8a" stroke-width="4">' + [240, 345, 465, 495, 615, 720].map(function (x) { return '<line x1="' + x + '" y1="350" x2="' + x + '" y2="366"/>'; }).join('') + '</g>' +
        '<path d="M470 318V298Q470 284 486 284H500" stroke="#9a9a9a" stroke-width="5" fill="none"/>' +
        // pendant lights and stools
        '<path d="M330 95V170M630 95V170" stroke="#333" stroke-width="2"/><path d="M308 190H352L340 170H320Z M608 190H652L640 170H620Z" fill="#2f4f4f"/>' +
        '<g fill="#7d5233"><rect x="300" y="470" width="70" height="12" rx="6"/><rect x="560" y="470" width="70" height="12" rx="6"/></g>' +
        '<path d="M310 482L300 560M360 482L370 560M570 482L560 560M620 482L630 560" stroke="#3a3a3a" stroke-width="5"/>'
    }
  };
  var looks = {}, wall = 'back', mode = 'living';
  Object.keys(ROOMS).forEach(function (r) {
    looks[r] = { back: byName('Warm Linen'), left: byName('Warm Linen'), right: byName('Warm Linen'), ceiling: byName('Fresh Milk') };
  });

  function roomSvg(r, withOutline) {
    var L = looks[r], R = ROOMS[r];
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600" role="img" aria-label="' + ROOM_NAMES[r] + ' with painted walls">' + DEFS;
    ['ceiling', 'left', 'right', 'back'].forEach(function (k) { s += '<path class="viz-wall" data-wall="' + k + '" d="' + SHELL[k] + '" fill="' + L[k] + '"/>'; });
    s += '<g pointer-events="none"><path d="' + SHELL.left + '" fill="url(#vzL)"/><path d="' + SHELL.right + '" fill="url(#vzR)"/><path d="' + SHELL.ceiling + '" fill="url(#vzC)"/><path d="' + SHELL.back + '" fill="url(#vzB)"/>' +
      R.floor + TRIM + R.items + '</g>';
    if (withOutline) {
      var parts = wall === 'all' ? ['back', 'left', 'right'] : [wall];
      s += '<g class="viz-outline" pointer-events="none">' + parts.map(function (k) { return '<path d="' + SHELL[k] + '"/>'; }).join('') + '</g>';
    }
    return s + '</svg>';
  }
  var stage = $('[data-viz=roomstage]');
  function drawRoom() { if (mode !== 'photo') stage.innerHTML = roomSvg(mode, true); }

  /* ---------- photo state (used by the engine below) ---------- */
  var canvas = $('[data-viz=canvas]'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  var W = 0, H = 0, src = null, lab = null, edge = null, mask = null, history = [];
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
    // Edge strength (Sobel on smoothed lightness): selection stops at door frames,
    // furniture outlines and wall corners instead of flowing across them.
    var Ls = new Float32Array(W * H);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var s2 = 0, c2 = 0;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H) { s2 += lab[(yy * W + xx) * 3]; c2++; }
      }
      Ls[y * W + x] = s2 / c2;
    }
    edge = new Float32Array(W * H);
    for (var y2 = 1; y2 < H - 1; y2++) for (var x2 = 1; x2 < W - 1; x2++) {
      var i2 = y2 * W + x2;
      var gx = Ls[i2 - W + 1] + 2 * Ls[i2 + 1] + Ls[i2 + W + 1] - Ls[i2 - W - 1] - 2 * Ls[i2 - 1] - Ls[i2 + W - 1];
      var gy = Ls[i2 + W - 1] + 2 * Ls[i2 + W] + Ls[i2 + W + 1] - Ls[i2 - W - 1] - 2 * Ls[i2 - W] - Ls[i2 - W + 1];
      edge[i2] = Math.sqrt(gx * gx + gy * gy);
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
  // Grow the selection from the tapped point over similar colors, stopping at strong edges.
  // If it still swallows most of the photo, tighten automatically and try again.
  function region(start, tol) {
    var L0 = lab[start * 3], a0 = lab[start * 3 + 1], b0 = lab[start * 3 + 2];
    var edgeStop = 6 + tol * 0.9;
    var out = new Uint8Array(W * H), seen = new Uint8Array(W * H), stack = [start], n = 0;
    while (stack.length) {
      var i = stack.pop();
      if (seen[i]) continue; seen[i] = 1;
      var dL = (lab[i * 3] - L0) * 0.6, da = lab[i * 3 + 1] - a0, db = lab[i * 3 + 2] - b0;
      if (dL * dL + da * da + db * db > tol * tol) continue;
      out[i] = 1; n++;
      if (edge[i] > edgeStop && i !== start) continue;          // on an edge: include it, don't cross it
      var px = i % W, py = (i - px) / W;
      if (px > 0) stack.push(i - 1); if (px < W - 1) stack.push(i + 1);
      if (py > 0) stack.push(i - W); if (py < H - 1) stack.push(i + W);
    }
    return { mask: out, n: n };
  }
  function grow(x, y) {
    var tol = +$('[data-viz=tolerance]').value, start = y * W + x, r = region(start, tol);
    while (r.n > W * H * 0.6 && tol > 4) { tol = Math.max(4, Math.round(tol * 0.7)); r = region(start, tol); }
    saveUndo();
    for (var i = 0; i < W * H; i++) if (r.mask[i]) mask[i] = 1;
    var msg = $('[data-viz=msg]');
    if (msg) msg.textContent = r.n > W * H * 0.6 ? 'That picked up a lot of the photo. Use the Eraser on anything that isn\'t wall, or lower the edge sensitivity and tap again.' : '';
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
  }
  function snapshot(hex) {
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var out = new ImageData(new Uint8ClampedArray(src.data), W, H);
    paintInto(out, hex, 1);
    c.getContext('2d').putImageData(out, 0, 0);
    return c.toDataURL('image/jpeg', 0.85);
  }

  /* ---------- colors ---------- */
  var family = 0;
  function current() {
    if (mode === 'photo') return color;
    return looks[mode][wall === 'all' ? 'back' : wall];
  }
  function swatches(el, list) {
    el.innerHTML = '';
    var now = current().toLowerCase();
    list.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'viz-swatch'; b.setAttribute('role', 'listitem');
      b.style.setProperty('--sw', c[1]);
      b.setAttribute('aria-label', c[0] + ' ' + c[1]);
      b.setAttribute('aria-pressed', String(c[1].toLowerCase() === now));
      b.innerHTML = '<span class="viz-chip"></span><span class="viz-name">' + c[0] + '</span><span class="viz-hex">' + c[1].toUpperCase() + '</span>';
      b.addEventListener('click', function () { choose(c[1]); });
      el.appendChild(b);
    });
  }
  function drawFamilies() {
    var f = $('[data-viz=families]');
    f.innerHTML = '';
    FAMILIES.forEach(function (fam, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'viz-family'; b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(i === family));
      b.innerHTML = '<span class="viz-dot" style="--sw:' + fam[1][Math.min(4, fam[1].length - 1)][1] + '"></span>' + fam[0];
      b.addEventListener('click', function () { family = i; $('[data-viz=search]').value = ''; drawFamilies(); drawList(); });
      f.appendChild(b);
    });
  }
  function drawList() {
    var q = $('[data-viz=search]').value.trim().toLowerCase().replace(/^#/, '');
    var list = q ? ALL.filter(function (c) { return c[0].toLowerCase().indexOf(q) > -1 || c[1].slice(1).indexOf(q) === 0; }).slice(0, 24) : FAMILIES[family][1];
    swatches($('[data-viz=trend]'), list);
    if (q && !list.length) $('[data-viz=trend]').innerHTML = '<p class="viz-note">No color by that name. Try a family above, or pick any color below.</p>';
  }
  function drawCombos() {
    var el = $('[data-viz=combos]');
    el.innerHTML = '';
    COMBOS.forEach(function (c) {
      var a = byName(c[1]), b2 = byName(c[2]);
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'viz-combo';
      b.innerHTML = '<span class="viz-pair"><span style="background:' + a + '"></span><span style="background:' + b2 + '"></span></span><span><strong>' + c[0] + '</strong><br><span class="viz-hex">' + c[1] + ' + ' + c[2] + '</span></span>';
      b.addEventListener('click', function () { combo(a, b2); });
      el.appendChild(b);
    });
  }
  function combo(main, side) {
    if (mode === 'photo') { choose(main); return; }
    var L = looks[mode];
    L.back = main; L.left = side; L.right = side;
    wall = 'back'; syncWalls(); refresh();
  }
  function choose(hex) {
    if (mode === 'photo') { color = hex; render(); }
    else {
      var L = looks[mode];
      if (wall === 'all') { L.back = L.left = L.right = hex; }
      else L[wall] = hex;
    }
    refresh();
  }
  function refresh() {
    var hex = current();
    $('[data-viz=custom]').value = hex;
    $('[data-viz=nowchip]').style.setProperty('--sw', hex);
    $('[data-viz=nowname]').textContent = nameOf(hex);
    $('[data-viz=nowhex]').textContent = hex.toUpperCase();
    $('[data-viz=nowwhere]').textContent = mode === 'photo' ? 'On the wall you tap in your photo' : 'On the ' + WALL_NAMES[wall].toLowerCase() + ' · tap a wall in the picture to switch';
    drawList();
    swatches($('[data-viz=matches]'), matches(hex));
    drawRoom();
  }
  function surprise() {
    var fams = FAMILIES.slice(2);                          // skip Trending and Whites
    var f = fams[Math.floor(Math.random() * fams.length)][1];
    var main = f[2 + Math.floor(Math.random() * 4)][1];
    var side = Math.random() < 0.5 ? f[0][1] : FAMILIES[1][1][Math.floor(Math.random() * 4)][1];
    combo(main, side);
  }
  function syncWalls() { $all('[data-wall]').forEach(function (b) { if (b.tagName === 'BUTTON') b.setAttribute('aria-pressed', String(b.getAttribute('data-wall') === wall)); }); }
  function setRoom(r) {
    mode = r;
    $all('.viz-room').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-room') === r)); });
    $('[data-viz=scene]').hidden = r === 'photo';
    $('[data-viz=photo]').hidden = r !== 'photo';
    refresh();
  }
  function snapshotLook() {
    if (mode === 'photo') {
      if (!src || !mask.some(function (v) { return v; })) return null;
      return { img: snapshot(color), title: 'Your photo', colors: [color], room: 'photo' };
    }
    var L = looks[mode];
    return {
      img: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(roomSvg(mode, false)),
      title: ROOM_NAMES[mode], colors: L.left === L.back ? [L.back] : [L.back, L.left], room: mode,
      look: { back: L.back, left: L.left, right: L.right, ceiling: L.ceiling }
    };
  }
  function drawGrid() {
    var g = $('[data-viz=grid]');
    g.innerHTML = '';
    kept.forEach(function (k, i) {
      var f = document.createElement('figure');
      var names = k.colors.map(function (h) { return '<span class="viz-chip" style="--sw:' + h + '"></span>' + nameOf(h) + ' ' + h.toUpperCase(); }).join(' + ');
      f.innerHTML = '<img alt="' + k.title + ' in ' + k.colors.map(nameOf).join(' and ') + '" src="' + k.img + '"><figcaption>' + names +
        ' <button type="button" class="btn-link" aria-label="Remove this look">Remove</button></figcaption>';
      f.querySelector('button').addEventListener('click', function () { kept.splice(i, 1); drawGrid(); });
      f.querySelector('img').addEventListener('click', function () {
        if (k.look) { looks[k.room] = Object.assign({}, k.look); setRoom(k.room); }
        else { setRoom('photo'); choose(k.colors[0]); }
      });
      g.appendChild(f);
    });
  }

  /* ---------- wiring ---------- */
  $all('.viz-room').forEach(function (b) { b.addEventListener('click', function () { setRoom(b.getAttribute('data-room')); }); });
  $all('button[data-wall]').forEach(function (b) { b.addEventListener('click', function () { wall = b.getAttribute('data-wall'); syncWalls(); refresh(); }); });
  stage.addEventListener('click', function (e) {
    var w = e.target.closest && e.target.closest('.viz-wall');
    if (!w) return;
    wall = w.getAttribute('data-wall'); syncWalls(); refresh();
  });
  $('[data-viz=search]').addEventListener('input', drawList);
  $('[data-viz=surprise]').addEventListener('click', surprise);
  $('[data-viz=copy]').addEventListener('click', function (e) {
    var t = nameOf(current()) + ' ' + current().toUpperCase(), b = e.currentTarget;
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy code'; }, 1500); }, function () {});
  });
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
    var k = snapshotLook();
    if (!k) return;
    if (kept.some(function (o) { return o.img === k.img; })) return;
    if (kept.length >= 4) kept.shift();
    kept.push(k);
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

  drawFamilies(); drawCombos(); setRoom('living');
  window.PMViz = {
    sample: function () { setRoom('photo'); sampleRoom(); }, tapAt: function (x, y) { grow(x, y); },
    kept: function () { return kept.length; }, room: setRoom,
    wall: function (w) { wall = w; syncWalls(); refresh(); }, pick: choose, looks: function () { return looks; }, colors: function () { return ALL.length; }
  };
})();
