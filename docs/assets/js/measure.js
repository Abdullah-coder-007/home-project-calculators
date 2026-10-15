/*
 * "Measure" buttons beside every feet + inches field.
 *
 *  - Android phones with Chrome and Google Play Services for AR: opens the
 *    camera in augmented reality. Point at one end, tap "Set start", point at
 *    the other end, tap "Set end", then "Use" fills the field.
 *  - iPhone and iPad: Safari can't measure with the camera, so we send people
 *    to Apple's built-in Measure app (via its App Store page, which shows an
 *    Open button) and offer "Paste measurement" for the copied result.
 *  - Anything else: paste or type, with tape-measure tips.
 *
 * Nothing from the camera is recorded or sent anywhere; the browser handles it.
 */
(function () {
  'use strict';
  var F = window.PMF;
  var MEASURE_APP = 'https://apps.apple.com/app/id1383426740';
  var IS_ANDROID = /Android/i.test(navigator.userAgent);
  var IS_SAMSUNG = /SAMSUNG|SM-[A-Z]\d/i.test(navigator.userAgent);
  // Google retired its own Measure app in 2021. Samsung phones ship with Quick
  // Measure (free); on other Android phones AR Ruler is a widely used choice.
  var ANDROID_APP = IS_SAMSUNG
    ? { name: 'Quick Measure', by: 'Samsung', url: 'https://play.google.com/store/apps/details?id=com.samsung.android.ruler' }
    : { name: 'AR Ruler', by: 'Grymala', url: 'https://play.google.com/store/apps/details?id=com.grymala.aruler' };
  var IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var arSupported = null; // null = not checked yet

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  var CAMERA_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18"><path fill="currentColor" d="M9 4.5 7.6 6.3H5A2.5 2.5 0 0 0 2.5 8.8v8.7A2.5 2.5 0 0 0 5 20h14a2.5 2.5 0 0 0 2.5-2.5V8.8A2.5 2.5 0 0 0 19 6.3h-2.6L15 4.5H9Zm3 4.3a4.4 4.4 0 1 1 0 8.8 4.4 4.4 0 0 1 0-8.8Zm0 2a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8Z"/></svg>';

  function checkAR() {
    if (arSupported !== null) return Promise.resolve(arSupported);
    if (!navigator.xr || !navigator.xr.isSessionSupported) { arSupported = false; return Promise.resolve(false); }
    return navigator.xr.isSessionSupported('immersive-ar')
      .then(function (ok) { arSupported = !!ok; return arSupported; })
      .catch(function () { arSupported = false; return false; });
  }

  /* ---------- Filling a feet + inches field ---------- */
  function fieldLabel(field) {
    var s = field.querySelector('.ftin-head > span:first-child') || field.querySelector(':scope > span');
    return s ? s.textContent.trim() : 'this measurement';
  }
  function fill(field, ft, inch) {
    var inputs = field.querySelectorAll('input[type=number]');
    if (inputs.length < 2) return;
    inputs[0].value = ft;
    inputs[1].value = inch ? inch : '';
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    toast('Filled ' + fieldLabel(field).toLowerCase() + ': ' + ft + ' ft' + (inch ? ' ' + inch + ' in' : ''));
  }
  function describe(r) { return r.ft + ' ft' + (r.inch ? ' ' + r.inch + ' in' : ''); }

  function toast(msg) {
    var t = el('div', 'pm-toast', '');
    t.setAttribute('role', 'status');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('out'); }, 2200);
    setTimeout(function () { t.remove(); }, 2700);
  }

  /* ---------- Bottom sheet (iPhone guide and fallback) ---------- */
  function sheet(field) {
    var label = fieldLabel(field);
    var wrap = el('div', 'pm-sheet-wrap');
    var box = el('div', 'pm-sheet');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Measure ' + label);
    var body;
    if (IS_IOS) {
      body = '<h2>Measure ' + label.toLowerCase() + ' with your iPhone</h2>' +
        '<ol class="pm-steps">' +
        '<li>Open Apple’s <strong>Measure</strong> app (built into iPhone). The button below opens its App Store page; tap <strong>Open</strong>.</li>' +
        '<li>Point at one end, tap <strong>+</strong>, move to the other end, tap <strong>+</strong> again.</li>' +
        '<li>Tap the number, then <strong>Copy</strong>.</li>' +
        '<li>Come back here and tap <strong>Paste measurement</strong>.</li>' +
        '</ol>' +
        '<div class="pm-sheet-actions"><a class="btn" href="' + MEASURE_APP + '" target="_blank" rel="noopener">Open Measure app</a>' +
        '<button type="button" class="btn btn-quiet" data-pm="paste">Paste measurement</button></div>' +
        '<p class="pm-note">Tip: you can also ask Siri to “open Measure”. Your other inputs stay as they are while you’re away.</p>';
    } else if (IS_ANDROID) {
      body = '<h2>Measure ' + label.toLowerCase() + ' with an app</h2>' +
        (arSupported ? '' : '<p>Your phone or browser can’t measure inside this page, so use a free measuring app.</p>') +
        '<ol class="pm-steps">' +
        '<li>Open <strong>' + ANDROID_APP.name + '</strong> by ' + ANDROID_APP.by + '. The button below opens it in Google Play; tap <strong>Install</strong> or <strong>Open</strong>.</li>' +
        '<li>Point at one end, add a point, move to the other end, add a second point.</li>' +
        '<li>Come back here and type the number into the boxes, or copy it and tap <strong>Paste measurement</strong>.</li>' +
        '</ol>' +
        '<div class="pm-sheet-actions"><a class="btn" href="' + ANDROID_APP.url + '" target="_blank" rel="noopener">Open ' + ANDROID_APP.name + '</a>' +
        '<button type="button" class="btn btn-quiet" data-pm="paste">Paste measurement</button></div>' +
        '<p class="pm-note">We don’t make or get paid for this app. Free versions may show ads.</p>';
    } else {
      body = '<h2>Measure ' + label.toLowerCase() + '</h2>' +
        '<p>Camera measuring needs an Android phone with Chrome and Google Play Services for AR, or an iPhone with Apple’s Measure app.</p>' +
        '<p>Measured with another app or tool? Copy the result and paste it here.</p>' +
        '<div class="pm-sheet-actions"><button type="button" class="btn" data-pm="paste">Paste measurement</button></div>' +
        '<p class="pm-note">Tape measure tip: hook the end on one wall, read where it meets the other wall, and round up to the next inch.</p>';
    }
    box.innerHTML = body + '<button type="button" class="pm-close" data-pm="close" aria-label="Close">×</button>' +
      '<p class="pm-paste-msg" aria-live="polite"></p>';
    wrap.appendChild(box);
    document.body.appendChild(wrap);
    var last = document.activeElement;
    var first = box.querySelector('.btn, button');
    if (first) first.focus();

    function close() { wrap.remove(); if (last && last.focus) last.focus(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', function (e) {
      var a = e.target.closest('[data-pm]');
      if (e.target === wrap || (a && a.getAttribute('data-pm') === 'close')) return close();
      if (a && a.getAttribute('data-pm') === 'paste') {
        var msg = box.querySelector('.pm-paste-msg');
        if (!navigator.clipboard || !navigator.clipboard.readText) {
          msg.textContent = 'This browser can’t read the clipboard. Type the numbers into the boxes instead.';
          return;
        }
        navigator.clipboard.readText().then(function (text) {
          var r = F.parseLength(text);
          if (!r) { msg.textContent = 'Couldn’t read a measurement from “' + String(text).slice(0, 40) + '”. Copy the number from the Measure app and try again.'; return; }
          fill(field, r.ft, r.inch);
          close();
        }, function () { msg.textContent = 'Paste was blocked. Allow it when asked, or type the numbers instead.'; });
      }
    });
  }

  /* ---------- Augmented reality measuring (Android Chrome) ---------- */
  function mul(m, v) { // column-major 4x4 times vec4
    return [0, 1, 2, 3].map(function (i) { return m[i] * v[0] + m[4 + i] * v[1] + m[8 + i] * v[2] + m[12 + i] * v[3]; });
  }
  function dist(a, b) { var x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2]; return Math.sqrt(x * x + y * y + z * z); }

  function startAR(field) {
    var label = fieldLabel(field).toLowerCase();
    var ui = el('div', 'pm-ar');
    ui.innerHTML =
      '<svg class="pm-ar-line" width="100%" height="100%"><line x1="0" y1="0" x2="0" y2="0"/><circle r="7"/></svg>' +
      '<div class="pm-ar-cross" aria-hidden="true"></div>' +
      '<div class="pm-ar-top"><p class="pm-ar-help">Move your phone slowly until the target turns yellow on the floor or wall.</p>' +
      '<p class="pm-ar-reading" aria-live="polite"></p></div>' +
      '<div class="pm-ar-bottom"><button type="button" class="btn" data-ar="mark" disabled>Set start</button>' +
      '<button type="button" class="btn btn-quiet" data-ar="close">Cancel</button>' +
      '<button type="button" class="pm-ar-app" data-ar="app">Use an app instead</button></div>';
    document.body.appendChild(ui);
    var cross = ui.querySelector('.pm-ar-cross'), help = ui.querySelector('.pm-ar-help'), reading = ui.querySelector('.pm-ar-reading');
    var mark = ui.querySelector('[data-ar=mark]'), line = ui.querySelector('line'), dot = ui.querySelector('circle');
    var session, refSpace, hitSource, gl, current = null, start = null, end = null, view = null;

    function finish() {
      if (session) session.end().catch(function () {});
      else cleanup();
    }
    function cleanup() { ui.remove(); }
    function show(m) { var r = F.splitInches(m * 39.3701); return describe(r); }

    ui.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ar]');
      if (!b) return;
      var a = b.getAttribute('data-ar');
      if (a === 'close') return finish();
      if (a === 'app') { finish(); return sheet(field); }
      if (a === 'mark') {
        if (!start && current) { start = current.slice(); mark.textContent = 'Set end'; help.textContent = 'Now point at the other end of the ' + label + ' and tap Set end.'; return; }
        if (start && !end && current) {
          end = current.slice();
          var r = F.splitInches(dist(start, end) * 39.3701);
          reading.textContent = describe(r);
          help.textContent = 'Happy with it? Use it, or measure again.';
          mark.textContent = 'Use ' + describe(r);
          mark.setAttribute('data-ar', 'use');
          var again = el('button', 'btn btn-quiet', 'Measure again');
          again.type = 'button'; again.setAttribute('data-ar', 'again');
          mark.after(again);
          return;
        }
      }
      if (a === 'use' && start && end) { var u = F.splitInches(dist(start, end) * 39.3701); fill(field, u.ft, u.inch); return finish(); }
      if (a === 'again') {
        start = end = null; reading.textContent = '';
        mark.textContent = 'Set start'; mark.setAttribute('data-ar', 'mark'); b.remove();
        help.textContent = 'Point at one end and tap Set start.';
      }
    });

    var canvas = document.createElement('canvas');
    gl = canvas.getContext('webgl', { xrCompatible: true, alpha: true });

    navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay', 'local'], domOverlay: { root: ui }
    }).then(function (s) {
      session = s;
      session.addEventListener('end', cleanup);
      session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) });
      return session.requestReferenceSpace('viewer').then(function (viewer) {
        return session.requestHitTestSource({ space: viewer });
      }).then(function (src) {
        hitSource = src;
        return session.requestReferenceSpace('local');
      }).then(function (local) {
        refSpace = local;
        session.requestAnimationFrame(onFrame);
      });
    }).catch(function () {
      cleanup();
      arSupported = false;
      sheet(field);
    });

    function project(p) {
      if (!view) return null;
      var clip = mul(view.projectionMatrix, mul(view.transform.inverse.matrix, [p[0], p[1], p[2], 1]));
      if (clip[3] <= 0) return null;
      return [(clip[0] / clip[3] + 1) / 2 * ui.clientWidth, (1 - clip[1] / clip[3]) / 2 * ui.clientHeight];
    }

    function onFrame(t, frame) {
      session.requestAnimationFrame(onFrame);
      var layer = session.renderState.baseLayer;
      gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      var pose = frame.getViewerPose(refSpace);
      view = pose && pose.views[0];
      var hits = hitSource ? frame.getHitTestResults(hitSource) : [];
      if (hits.length) {
        var p = hits[0].getPose(refSpace).transform.position;
        current = [p.x, p.y, p.z];
        cross.classList.add('on');
        if (!end) mark.disabled = false;
      } else {
        current = null;
        cross.classList.remove('on');
        if (!end) mark.disabled = true;
      }
      // Live distance and a line from the start point to the target
      if (start && !end && current) reading.textContent = show(dist(start, current));
      var a = start && project(start);
      var b = end ? project(end) : [ui.clientWidth / 2, ui.clientHeight / 2];
      if (a && b) {
        line.setAttribute('x1', a[0]); line.setAttribute('y1', a[1]);
        line.setAttribute('x2', b[0]); line.setAttribute('y2', b[1]);
        dot.setAttribute('cx', a[0]); dot.setAttribute('cy', a[1]);
        ui.classList.add('has-line');
      } else ui.classList.remove('has-line');
    }
  }

  /* ---------- Buttons ---------- */
  function attach(field) {
    if (field.querySelector('.measure-btn')) return;
    var label = field.querySelector(':scope > span');
    var btn = el('button', 'measure-btn', CAMERA_SVG + '<span>Measure</span>');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Measure ' + (label ? label.textContent : '') + ' with your camera');
    btn.addEventListener('click', function () {
      checkAR().then(function (ok) { if (ok) startAR(field); else sheet(field); });
    });
    var head = el('span', 'ftin-head');
    if (label) { field.insertBefore(head, label); head.appendChild(label); }
    else field.insertBefore(head, field.firstChild);
    head.appendChild(btn);
  }

  function init() {
    // Only on touch phones and tablets, where there is a camera to point.
    if (!window.matchMedia || !matchMedia('(pointer: coarse)').matches) return;
    var form = document.getElementById('calc');
    if (!form) return;
    document.documentElement.classList.add('can-measure');
    Array.prototype.forEach.call(form.querySelectorAll('.ftin'), attach);
    // Room sections added later get buttons too
    new MutationObserver(function () {
      Array.prototype.forEach.call(form.querySelectorAll('.ftin'), attach);
    }).observe(form, { childList: true, subtree: true });
    checkAR();
  }
  window.PMMeasure = { attach: attach, _sheet: sheet };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
