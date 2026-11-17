/* =========================================================================
   recon.js — satellite recon: pick a site, inspect it in 3D, then draw a
   traverse from the landing point to the checkpoint and have it assessed.
   Also accepts real GeoTIFF height / slope / shadow layers.
   ========================================================================= */
(function (global) {
  'use strict';
  var Core = global.Core;
  var Sites = global.Sites;

  var st = {
    site: null,
    built: null,
    viewer: null,
    mode: '3d',
    layer: 'slope',
    waypoints: [],
    checked: null,
    safePath: null,
    showSafe: false,
    hover: null,
    base: null,
    custom: false,
    animDot: null
  };
  var el = {};

  var LEGENDS = {
    slope: '<span><i class="sw sw-green"></i>&lt; 10°</span><span><i class="sw sw-amber"></i>10–15°</span><span><i class="sw sw-red"></i>&gt; 15°</span><span><i class="sw sw-psr"></i>No Sun</span>',
    photo: '<span>Hillshade from height only</span>',
    shadow: '<span><i class="sw sw-psr"></i>Bright = never sees the Sun</span>'
  };

  /* -------------------------------------------------------------- setup */
  function init() {
    el.cards = document.getElementById('site-cards');
    el.meta = document.getElementById('viewer-meta');
    el.tv = document.getElementById('tv');
    el.plan = document.getElementById('plan');
    el.hint = document.getElementById('viewer-hint');
    el.legend = document.getElementById('viewer-legend');
    el.badge = document.getElementById('viewer-badge');
    el.info = document.getElementById('site-info');
    el.planCount = document.getElementById('plan-count');
    el.rLength = document.getElementById('r-length');
    el.rSlope = document.getElementById('r-slope');
    el.rRisky = document.getElementById('r-risky');
    el.rEnergy = document.getElementById('r-energy');
    el.coach = document.getElementById('route-coach');
    el.btnCheck = document.getElementById('btn-check');
    el.btnSafe = document.getElementById('btn-safe');
    el.btnUndo = document.getElementById('btn-undo');
    el.btnClear = document.getElementById('btn-clear');
    el.btnDemo = document.getElementById('btn-demo');
    el.verdict = document.getElementById('verdict');
    el.shadow = document.getElementById('shadow');

    st.viewer = new global.TerrainView(el.tv);

    el.cards.innerHTML = Sites.list.map(function (s) {
      return '<button class="site-card" data-site="' + s.id + '" role="tab" aria-selected="false">' +
        '<img src="' + s.image + '" alt="' + s.imageAlt + '">' +
        '<span class="sc-body">' +
          '<span class="sc-code">' + s.code + '</span>' +
          '<span class="sc-name">' + s.name + '</span>' +
          '<span class="sc-ch">' + s.challenge + '</span>' +
        '</span>' +
      '</button>';
    }).join('');

    Array.prototype.forEach.call(el.cards.querySelectorAll('.site-card'), function (b) {
      b.addEventListener('click', function () { selectSite(b.dataset.site); });
    });

    // tabs
    Array.prototype.forEach.call(document.querySelectorAll('.vtab'), function (tab) {
      tab.addEventListener('click', function () { setMode(tab.dataset.mode); });
    });

    // layers
    Array.prototype.forEach.call(document.querySelectorAll('#layer-buttons .chip'), function (b) {
      b.addEventListener('click', function () {
        st.layer = b.dataset.layer;
        Array.prototype.forEach.call(document.querySelectorAll('#layer-buttons .chip'), function (x) {
          x.classList.toggle('active', x === b);
        });
        el.legend.innerHTML = LEGENDS[st.layer] || '';
        if (st.viewer) st.viewer.applyLayer(st.layer);
      });
    });

    // presets
    Array.prototype.forEach.call(document.querySelectorAll('#preset-buttons .chip'), function (b) {
      b.addEventListener('click', function () {
        st.viewer.setPreset(b.dataset.preset);
        Array.prototype.forEach.call(document.querySelectorAll('#preset-buttons .chip'), function (x) {
          x.classList.toggle('active', x === b);
        });
      });
    });

    // plan interactions
    el.plan.addEventListener('click', function (e) {
      if (st.mode !== 'plan') return;
      var p = toCell(e);
      if (!p) return;
      addWaypoint(p);
    });
    el.plan.addEventListener('contextmenu', function (e) {
      if (st.mode !== 'plan') return;
      e.preventDefault();
      undo();
    });
    el.plan.addEventListener('pointermove', function (e) {
      if (st.mode !== 'plan') return;
      st.hover = toCell(e);
      if (st.hover) {
        var t = st.built.terrain;
        var i = Core.cellAt(t, st.hover[0], st.hover[1]);
        el.coach.textContent = 'Slope ' + t.slope[i].toFixed(0) + '° · ' +
          (t.rock[i] === 2 ? 'boulder' : t.shadow[i] ? 'no Sun' : t.dust[i] ? 'soft dust' : 'clear ground') +
          ' · ' + Math.round(Math.hypot(st.hover[0] - st.built.landing[0], st.hover[1] - st.built.landing[1]) * t.cell) + ' m from landing';
      }
    });
    el.plan.addEventListener('pointerleave', function () { st.hover = null; });

    el.btnUndo.addEventListener('click', undo);
    el.btnClear.addEventListener('click', clearRoute);
    el.btnCheck.addEventListener('click', checkRoute);
    el.btnSafe.addEventListener('click', function () {
      st.showSafe = !st.showSafe;
      el.btnSafe.classList.toggle('active', st.showSafe);
      el.btnSafe.textContent = st.showSafe ? 'Hide surveyor’s route' : 'Show surveyor’s route';
      drawPlan();
    });
    el.btnDemo.addEventListener('click', demoRoute);

    // geotiff
    document.getElementById('btn-build-tif').addEventListener('click', loadGeoTIFF);

    selectSite('craters');
    setMode('3d');
  }

  /* --------------------------------------------------------- site build */
  function selectSite(id) {
    if (!Sites) return;
    var built = Sites.build(id);
    st.site = built;
    st.built = built;
    st.custom = false;
    st.waypoints = [];
    st.checked = null;
    st.safePath = null;
    st.showSafe = false;
    st.hover = null;
    st.base = buildBase(built.terrain);

    Array.prototype.forEach.call(el.cards.querySelectorAll('.site-card'), function (b) {
      var on = b.dataset.site === id;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    el.badge.textContent = built.code + ' · 3D RECONSTRUCTION';
    el.btnSafe.hidden = true;
    el.btnSafe.classList.remove('active');
    el.btnSafe.textContent = 'Show surveyor’s route';
    el.btnCheck.disabled = true;
    el.verdict.hidden = true;

    st.viewer.setTerrain(built.terrain, built.landing, built.target);
    st.viewer.applyLayer(st.layer);
    st.viewer.setRoute(null);
    st.viewer.setPreset('approach');
    paintShadow(built.terrain);
    renderInfo(built);
    updateStats();
    drawPlan();
    document.querySelector('.vtab[data-mode="plan"]').disabled = false;
  }

  function renderInfo(built) {
    var t = built.terrain;
    var maxSlope = 0, shadowCells = 0, rocks = 0;
    for (var i = 0; i < t.w * t.h; i++) {
      if (t.slope[i] > maxSlope) maxSlope = t.slope[i];
      if (t.shadow[i]) shadowCells++;
      if (t.rock[i] === 2) rocks++;
    }
    var dist = Math.round(Math.hypot(built.target[0] - built.landing[0], built.target[1] - built.landing[1]) * t.cell / 10) * 10;
    el.info.innerHTML =
      '<span class="si-tag">' + built.code + ' · ' + built.challenge + '</span>' +
      '<h3>' + built.name + '</h3>' +
      '<p>' + built.brief + '</p>' +
      '<div class="si-facts">' +
        '<div><span>Line of sight</span><b>' + dist + ' m</b></div>' +
        '<div><span>Steepest ground</span><b>' + Math.round(maxSlope) + '°</b></div>' +
        '<div><span>Never sees Sun</span><b>' + Math.round((shadowCells / (t.w * t.h)) * 100) + '%</b></div>' +
        '<div><span>Large boulders</span><b>' + rocks + '</b></div>' +
      '</div>' +
      '<div class="si-danger">' + built.danger + '</div>';
  }

  /* ----------------------------------------------------------- shadow map */
  function paintShadow(t) {
    var c = el.shadow;
    c.width = t.w; c.height = t.h;
    var ctx = c.getContext('2d');
    var img = ctx.createImageData(t.w, t.h);
    for (var i = 0; i < t.w * t.h; i++) {
      var v = t.shadow[i] ? 232 : 22;
      img.data[i * 4] = t.shadow[i] ? 214 : 22;
      img.data[i * 4 + 1] = t.shadow[i] ? 205 : 24;
      img.data[i * 4 + 2] = t.shadow[i] ? 255 : 32;
      img.data[i * 4 + 3] = 255;
      if (!t.shadow[i]) { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; }
    }
    ctx.putImageData(img, 0, 0);
  }

  /* --------------------------------------------------------- plan image */
  function buildBase(t) {
    var c = document.createElement('canvas');
    c.width = t.w; c.height = t.h;
    var ctx = c.getContext('2d');
    var img = ctx.createImageData(t.w, t.h);
    var az = Core.rad(t.sun.az), elv = Core.rad(t.sun.el);
    var sx = Math.sin(az) * Math.cos(elv), sy = Math.sin(elv), sz = -Math.cos(az) * Math.cos(elv);
    var palette = [[64, 160, 96], [212, 158, 60], [196, 78, 70]];

    for (var y = 0; y < t.h; y++) {
      for (var x = 0; x < t.w; x++) {
        var i = y * t.w + x;
        var xl = x > 0 ? x - 1 : x, xr = x < t.w - 1 ? x + 1 : x;
        var yl = y > 0 ? y - 1 : y, yr = y < t.h - 1 ? y + 1 : y;
        var dhx = (t.height[y * t.w + xr] - t.height[y * t.w + xl]) / ((xr - xl) * t.cell);
        var dhy = (t.height[yr * t.w + x] - t.height[yl * t.w + x]) / ((yr - yl) * t.cell);
        var nx = -dhx, ny = 1, nz = -dhy;
        var nl = Math.hypot(nx, ny, nz) || 1;
        var lit = Math.max(0, (nx / nl) * sx + (ny / nl) * sy + (nz / nl) * sz);
        var shade = 0.42 + 0.75 * lit;

        var sl = t.slope[i];
        var col = sl < 10 ? palette[0] : sl < 15 ? palette[1] : palette[2];
        var r = col[0] * shade, g = col[1] * shade, b = col[2] * shade;
        if (t.shadow[i]) {
          r = r * 0.35 + 108 * 0.65;
          g = g * 0.35 + 96 * 0.65;
          b = b * 0.35 + 178 * 0.65;
        }
        if (t.rock[i] === 2) { r = 246; g = 104; b = 96; }
        var grain = (Core.hash2(x, y, 7) - 0.5) * 10;
        var o = i * 4;
        img.data[o] = Core.clamp(r + grain, 0, 255);
        img.data[o + 1] = Core.clamp(g + grain, 0, 255);
        img.data[o + 2] = Core.clamp(b + grain, 0, 255);
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  function viewRect() {
    var c = el.plan;
    var r = c.getBoundingClientRect();
    var w = r.width || 800, h = r.height || 420;
    var S = Math.min(w, h) * 0.94;
    return { w: w, h: h, S: S, x: (w - S) / 2, y: (h - S) / 2 };
  }

  function toCell(e) {
    if (!st.built) return null;
    var r = el.plan.getBoundingClientRect();
    var v = viewRect();
    var x = (e.clientX - r.left - v.x) / v.S;
    var y = (e.clientY - r.top - v.y) / v.S;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    var t = st.built.terrain;
    return [x * (t.w - 1), y * (t.h - 1)];
  }

  /* ----------------------------------------------------------- plan draw */
  function drawPlan() {
    if (!st.built) return;
    var c = el.plan;
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var v = viewRect();
    var W = Math.round(v.w), H = Math.round(v.h);
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    var ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#05080d';
    ctx.fillRect(0, 0, W, H);

    if (!st.base) return;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(st.base, v.x, v.y, v.S, v.S);

    var t = st.built.terrain;
    var sx = v.S / (t.w - 1), sy = v.S / (t.h - 1);
    function px(p) { return { x: v.x + p[0] * sx, y: v.y + p[1] * sy }; }

    // boulders
    for (var y = 0; y < t.h; y++) {
      for (var x = 0; x < t.w; x++) {
        if (t.rock[y * t.w + x] !== 2) continue;
        var q = px([x, y]);
        ctx.fillStyle = 'rgba(255,84,72,.9)';
        ctx.beginPath();
        ctx.arc(q.x, q.y, Math.max(1.1, v.S / 150), 0, Core.TAU);
        ctx.fill();
      }
    }

    // surveyor's route
    if (st.showSafe && st.safePath) {
      ctx.strokeStyle = 'rgba(255,255,255,.55)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      st.safePath.forEach(function (p, i) {
        var q = px(p);
        if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // route
    var pts = [st.built.landing].concat(st.waypoints);
    if (pts.length > 1) {
      ctx.strokeStyle = 'rgba(4,10,16,.85)';
      ctx.lineWidth = 7;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach(function (p, i) {
        var q = px(p);
        if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
      });
      ctx.stroke();

      ctx.strokeStyle = '#7ff0ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      pts.forEach(function (p, i) {
        var q = px(p);
        if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
      });
      ctx.stroke();

      // waypoint handles
      st.waypoints.forEach(function (p) {
        var q = px(p);
        ctx.fillStyle = '#0a1119';
        ctx.strokeStyle = '#7ff0ff';
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(q.x, q.y, 4, 0, Core.TAU); ctx.fill(); ctx.stroke();
      });
    }

    // landing + target
    var lp = px(st.built.landing);
    ctx.strokeStyle = '#6fe4f2';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(lp.x, lp.y, 9, 0, Core.TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(111,228,242,.18)';
    ctx.fill();
    ctx.fillStyle = '#6fe4f2';
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillText('LANDING', lp.x + 13, lp.y + 3);

    var tp = px(st.built.target);
    ctx.strokeStyle = '#ffb454';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(tp.x, tp.y, 11, 0, Core.TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(255,180,84,.14)';
    ctx.fill();
    ctx.fillStyle = '#ffb454';
    ctx.fillText('CHECKPOINT', tp.x + 15, tp.y + 3);

    // hover
    if (st.hover) {
      var hp = px(st.hover);
      ctx.strokeStyle = 'rgba(255,255,255,.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hp.x - 6, hp.y); ctx.lineTo(hp.x + 6, hp.y);
      ctx.moveTo(hp.x, hp.y - 6); ctx.lineTo(hp.x, hp.y + 6);
      ctx.stroke();
    }

    // north arrow + scale bar
    ctx.fillStyle = 'rgba(210,228,244,.7)';
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillText('N', v.x + 12, v.y + 20);
    ctx.beginPath();
    ctx.moveTo(v.x + 14, v.y + 26);
    ctx.lineTo(v.x + 14, v.y + 44);
    ctx.strokeStyle = 'rgba(210,228,244,.55)';
    ctx.stroke();

    var scaleM = 100;
    var scalePx = (scaleM / t.cell) * sx;
    ctx.fillStyle = 'rgba(5,8,13,.6)';
    ctx.fillRect(v.x + v.S - scalePx - 26, v.y + v.S - 22, scalePx + 16, 16);
    ctx.strokeStyle = 'rgba(210,228,244,.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(v.x + v.S - scalePx - 12, v.y + v.S - 10);
    ctx.lineTo(v.x + v.S - 12, v.y + v.S - 10);
    ctx.stroke();
    ctx.fillStyle = 'rgba(210,228,244,.8)';
    ctx.fillText(scaleM + ' m', v.x + v.S - scalePx - 12, v.y + v.S - 15);
  }

  /* --------------------------------------------------------------- route */
  function addWaypoint(p) {
    if (!st.built || st.custom) return;
    var t = st.built.terrain;
    var last = st.waypoints.length ? st.waypoints[st.waypoints.length - 1] : st.built.landing;
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) * t.cell < 18) return;
    st.waypoints.push(p);
    st.checked = null;
    el.verdict.hidden = true;
    updateStats();
    st.viewer.setRoute([st.built.landing].concat(st.waypoints));
    drawPlan();
  }

  function undo() {
    if (!st.waypoints.length) return;
    st.waypoints.pop();
    st.checked = null;
    el.verdict.hidden = true;
    updateStats();
    st.viewer.setRoute(st.waypoints.length ? [st.built.landing].concat(st.waypoints) : null);
    drawPlan();
  }

  function clearRoute() {
    st.waypoints = [];
    st.checked = null;
    st.safePath = null;
    st.showSafe = false;
    el.btnSafe.hidden = true;
    el.verdict.hidden = true;
    updateStats();
    st.viewer.setRoute(null);
    drawPlan();
  }

  function sampleRoute(pts) {
    var t = st.built.terrain;
    var out = [];
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      var lenCells = Math.hypot(b[0] - a[0], b[1] - a[1]);
      var steps = Math.max(2, Math.ceil((lenCells * t.cell) / 4));
      for (var s = 0; s < steps; s++) {
        var u = s / steps;
        var x = Core.lerp(a[0], b[0], u);
        var y = Core.lerp(a[1], b[1], u);
        var c = Core.cellAt(t, x, y);
        out.push({ x: x, y: y, slope: t.slope[c], rock: t.rock[c], shadow: t.shadow[c], dust: t.dust[c], c: c });
      }
    }
    var last = pts[pts.length - 1];
    var lc = Core.cellAt(t, last[0], last[1]);
    out.push({ x: last[0], y: last[1], slope: t.slope[lc], rock: t.rock[lc], shadow: t.shadow[lc], dust: t.dust[lc], c: lc });
    return out;
  }

  function analyse(pts) {
    var t = st.built.terrain;
    var samples = sampleRoute(pts);
    var maxSlope = 0, over15 = 0, rocks = 0, shadow = 0, lengthM = 0;
    var rockCells = {};
    for (var i = 0; i < samples.length; i++) {
      var s = samples[i];
      if (s.slope > maxSlope) maxSlope = s.slope;
      if (s.slope > 15) over15++;
      if (s.shadow) shadow++;
      if (s.rock === 2 && !rockCells[s.c]) { rockCells[s.c] = 1; rocks++; }
    }
    for (var j = 0; j < pts.length - 1; j++) {
      lengthM += Math.hypot(pts[j + 1][0] - pts[j][0], pts[j + 1][1] - pts[j][1]) * t.cell;
    }
    var straight = Math.hypot(st.built.target[0] - st.built.landing[0], st.built.target[1] - st.built.landing[1]) * t.cell;
    var lastP = pts[pts.length - 1];
    var endDist = Math.hypot(st.built.target[0] - lastP[0], st.built.target[1] - lastP[1]) * t.cell;
    var n = Math.max(1, samples.length);
    return {
      samples: samples,
      lengthM: lengthM,
      maxSlope: maxSlope,
      over15: over15 / n,
      psr: shadow / n,
      rocks: rocks,
      straight: straight,
      endDist: endDist,
      blocked: maxSlope > 30,
      energy: Math.round(Math.min(96, 3 + (lengthM / 1000) * 19 + (over15 / n) * 26))
    };
  }

  function updateStats() {
    if (!st.built) return;
    var pts = [st.built.landing].concat(st.waypoints);
    el.planCount.textContent = st.waypoints.length + (st.waypoints.length === 1 ? ' waypoint' : ' waypoints');

    if (st.custom) {
      el.rLength.textContent = '—';
      el.rSlope.textContent = '—';
      el.rRisky.textContent = '—';
      el.rEnergy.textContent = '—';
      el.btnCheck.disabled = true;
      el.coach.textContent = 'Imported survey data is view-only. Pick one of the three sites to plan a traverse.';
      return;
    }
    if (st.waypoints.length === 0) {
      el.rLength.textContent = '—';
      el.rSlope.textContent = '—';
      el.rRisky.textContent = '—';
      el.rEnergy.textContent = '—';
      el.btnCheck.disabled = true;
      el.coach.textContent = 'Click on the plan map to drop waypoints. Start at the cyan ring, finish inside the amber ring.';
      return;
    }
    var a = analyse(pts);
    el.rLength.textContent = Math.round(a.lengthM) + ' m';
    el.rSlope.textContent = Math.round(a.maxSlope) + '°';
    el.rRisky.textContent = Math.round(a.over15 * 100) + '%';
    el.rEnergy.textContent = a.energy + '%';
    el.btnCheck.disabled = false;

    if (a.blocked) el.coach.textContent = 'That line crosses ground steeper than 30° — a rover will not climb it.';
    else if (a.endDist > 60) el.coach.textContent = 'You are still ' + Math.round(a.endDist) + ' m from the checkpoint ring. Keep going.';
    else el.coach.textContent = 'Route closes on the checkpoint. Check it to see how a rover would rate it.';
    drawPlan();
  }

  function checkRoute() {
    if (!st.waypoints.length) return;
    var pts = [st.built.landing].concat(st.waypoints);
    var a = analyse(pts);
    var score = 100;
    score -= a.over15 * 100 * 1.15;
    score -= Math.min(26, a.rocks * 8);
    score -= a.psr * 100 * 0.7;
    var ratio = a.lengthM / Math.max(1, a.straight);
    if (ratio > 1.45) score -= Math.min(18, (ratio - 1.45) * 34);
    if (a.endDist > 60) score -= 30;
    if (a.blocked) score = Math.min(score, 26);
    score = Math.round(Core.clamp(score, 0, 100));

    var tier, cls, title;
    if (a.endDist > 60) { tier = 1; cls = 'mid'; title = 'Not there yet'; }
    else if (a.blocked) { tier = 1; cls = 'bad'; title = 'Blocked by terrain'; }
    else if (score >= 85) { tier = 3; cls = 'good'; title = 'Safe traverse'; }
    else if (score >= 65) { tier = 2; cls = 'mid'; title = 'Workable, but risky'; }
    else { tier = 1; cls = 'bad'; title = 'Not survivable'; }

    var bullets = [];
    if (a.blocked) bullets.push('Steepest sample is ' + Math.round(a.maxSlope) + '° — above the 30° climb limit.');
    if (a.rocks) bullets.push('Passes over ' + a.rocks + ' boulder' + (a.rocks > 1 ? 's' : '') + ' that the rover would have to climb.');
    if (a.psr > 0.02) bullets.push('Crosses ' + Math.round(a.psr * 100) + '% of the route in permanent shadow — no solar power, −170 °C.');
    if (a.over15 > 0.12) bullets.push(Math.round(a.over15 * 100) + '% of the route is steeper than 15°.');
    if (ratio > 1.6) bullets.push('The line is ' + ratio.toFixed(1) + '× the straight-line distance; power cost rises with every metre.');
    if (a.endDist > 60) bullets.push('Ends ' + Math.round(a.endDist) + ' m short of the checkpoint.');
    if (!bullets.length) bullets.push('Stays on gentle ground, avoids boulders, and reaches the ring.');
    if (score >= 85 && !a.blocked) bullets.push('Energy estimate: ' + a.energy + '% of the battery for ' + Math.round(a.lengthM) + ' m.');

    el.verdict.className = 'verdict ' + cls;
    el.verdict.hidden = false;
    el.verdict.innerHTML =
      '<h4>' + title + '</h4>' +
      '<div class="stars">' + '★'.repeat(tier) + '<span style="color:#3a4a5e">' + '★'.repeat(3 - tier) + '</span></div>' +
      '<p>Route score ' + score + '/100 · ' + Math.round(a.lengthM) + ' m · ' + Math.round(a.maxSlope) + '° max</p>' +
      '<ul>' + bullets.map(function (b) { return '<li>' + b + '</li>'; }).join('') + '</ul>';

    st.checked = { score: score, metrics: a, tier: tier };
    if (!st.safePath) {
      var path = Core.astar(st.built.terrain, st.built.landing, st.built.target, { limit: 25, slopeWeight: 9, psrCost: 20 });
      if (path) st.safePath = Core.smoothPath(path, 3);
    }
    el.btnSafe.hidden = false;

    global.dispatchEvent(new CustomEvent('recon:done', {
      detail: { site: st.built.name, score: score, length: Math.round(a.lengthM), tier: tier }
    }));

    drawPlan();
  }

  function pathMaxSlope(pts) {
    var t = st.built.terrain, m = 0;
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      var len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      var steps = Math.max(2, Math.ceil((len * t.cell) / 4));
      for (var s = 0; s < steps; s++) {
        var u = s / steps;
        var c = Core.cellAt(t, Core.lerp(a[0], b[0], u), Core.lerp(a[1], b[1], u));
        if (t.slope[c] > m) m = t.slope[c];
      }
    }
    return m;
  }

  function demoRoute() {
    if (!st.built || st.custom) return;
    var raw = Core.astar(st.built.terrain, st.built.landing, st.built.target, { limit: 25, slopeWeight: 9, psrCost: 20 });
    if (!raw) { el.coach.textContent = 'No continuous route exists for this site at the 30° limit.'; return; }
    var path = Core.smoothPath(raw, 3);
    st.safePath = path;

    // Smoothing inserts 8 points per grid cell. Walk that curve in steps and
    // keep the sparsest version whose straight chords stay on gentle ground;
    // decimating too hard cuts the corner of a rille and looks 'blocked'.
    var perCell = 8;
    var waypoints = null;
    [4, 3, 2, 1].some(function (k) {
      var step = Math.max(1, k * perCell);
      var wps = [];
      for (var i = step; i < path.length - 1; i += step) wps.push([path[i][0], path[i][1]]);
      wps.push([st.built.target[0], st.built.target[1]]);
      if (pathMaxSlope([st.built.landing].concat(wps)) <= 20) { waypoints = wps; return true; }
      return false;
    });
    if (!waypoints) waypoints = [[st.built.target[0], st.built.target[1]]];

    st.waypoints = waypoints;
    st.checked = null;
    el.verdict.hidden = true;
    updateStats();
    st.viewer.setRoute([st.built.landing].concat(st.waypoints));
    drawPlan();
    setMode('plan');
    el.coach.textContent = 'Surveyor’s route loaded as a demo. Clear it and try your own line.';
  }

  /* --------------------------------------------------------------- modes */
  function setMode(mode) {
    st.mode = mode;
    document.body.dataset.mode = mode;
    Array.prototype.forEach.call(document.querySelectorAll('.vtab'), function (tab) {
      tab.setAttribute('aria-selected', tab.dataset.mode === mode ? 'true' : 'false');
    });
    el.tv.classList.toggle('is-hidden', mode !== '3d');
    el.plan.classList.toggle('is-hidden', mode !== 'plan');
    el.hint.textContent = mode === '3d'
      ? 'Drag to orbit · scroll to zoom'
      : 'Click the map to add a waypoint · right-click to undo';
    if (mode === 'plan') {
      drawPlan();
    } else {
      requestAnimationFrame(function () { st.viewer.resize(); st.viewer.applyLayer(st.layer); });
    }
  }

  /* ------------------------------------------------------------ geotiff */
  async function readRaster(file) {
    var tiff = await global.GeoTIFF.fromArrayBuffer(await file.arrayBuffer());
    var img = await tiff.getImage();
    var w = img.getWidth(), h = img.getHeight();
    var step = Math.max(1, Math.ceil(Math.max(w, h) / 190));
    var rasters = await img.readRasters({ samples: [0] });
    var data = rasters[0];
    var sw = Math.ceil(w / step), sh = Math.ceil(h / step);
    var out = new Float32Array(sw * sh);
    var min = Infinity, max = -Infinity;
    for (var y = 0; y < sh; y++) {
      for (var x = 0; x < sw; x++) {
        var v = Number(data[Math.min(h - 1, y * step) * w + Math.min(w - 1, x * step)]);
        if (!isFinite(v) || v < -1000) v = 0;
        out[y * sw + x] = v;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    return { data: out, w: sw, h: sh, step: step, srcW: w, srcH: h, min: min, max: max };
  }

  function resample(src, dw, dh) {
    var out = new Float32Array(dw * dh);
    for (var y = 0; y < dh; y++) {
      for (var x = 0; x < dw; x++) {
        var sx = Math.min(src.w - 1, Math.round((x / dw) * src.w));
        var sy = Math.min(src.h - 1, Math.round((y / dh) * src.h));
        out[y * dw + x] = src.data[sy * src.w + sx];
      }
    }
    return out;
  }

  function loadGeoTIFF() {
    var surfFile = document.getElementById('f-surf').files[0];
    var slpFile = document.getElementById('f-slp').files[0];
    var shdFile = document.getElementById('f-shd').files[0];
    var status = document.getElementById('tif-status');
    if (!surfFile) { status.textContent = 'Choose the height file first — it alone makes a grey shape.'; return; }
    if (!global.GeoTIFF) { status.textContent = 'GeoTIFF library did not load.'; return; }

    status.textContent = 'Reading ' + surfFile.name + '…';
    (async function () {
      var surf = await readRaster(surfFile);
      var t = {
        w: surf.w, h: surf.h, cell: 5 * surf.step,
        height: surf.data,
        slope: new Float32Array(surf.w * surf.h),
        shadow: new Uint8Array(surf.w * surf.h),
        rock: new Uint8Array(surf.w * surf.h),
        dust: new Uint8Array(surf.w * surf.h),
        sun: { az: 110, el: 14 },
        minH: surf.min, maxH: surf.max
      };

      if (slpFile) {
        status.textContent = 'Reading ' + slpFile.name + '…';
        var slp = await readRaster(slpFile);
        var vals = resample(slp, surf.w, surf.h);
        for (var i = 0; i < vals.length; i++) t.slope[i] = Math.max(0, vals[i]);
      } else {
        Core.recomputeSlope(t);
      }

      if (shdFile) {
        status.textContent = 'Reading ' + shdFile.name + '…';
        var shd = await readRaster(shdFile);
        var sv = resample(shd, surf.w, surf.h);
        for (var j = 0; j < sv.length; j++) t.shadow[j] = sv[j] > 0 ? 1 : 0;
      } else {
        Core.computeShadow(t, t.sun.az, t.sun.el);
      }

      st.custom = true;
      st.built = { terrain: t, landing: null, target: null, custom: true, name: 'Imported site', code: 'IMPORTED' };
      st.waypoints = [];
      st.checked = null;
      st.base = buildBase(t);
      st.viewer.setTerrain(t, null, null);
      st.viewer.applyLayer(st.layer);
      st.viewer.setRoute(null);
      st.viewer.setPreset('approach');
      paintShadow(t);
      el.badge.textContent = 'IMPORTED · ' + surfFile.name;
      el.info.innerHTML =
        '<span class="si-tag">IMPORTED SURVEY</span>' +
        '<h3>' + surfFile.name + '</h3>' +
        '<p>' + surf.srcW + ' × ' + surf.srcH + ' px source, sampled every ' + surf.step + ' px. ' +
        'Cell size ' + (5 * surf.step) + ' m. Height ' + Math.round(surf.min) + ' m to ' + Math.round(surf.max) + ' m.</p>' +
        '<div class="si-danger">' + (slpFile ? 'Slope layer loaded.' : 'No slope layer — slope was derived from height.') + ' ' +
        (shdFile ? 'Shadow layer loaded.' : 'No shadow layer — computed from height and a 14° Sun.') + '</div>';
      el.btnCheck.disabled = true;
      el.verdict.hidden = true;
      document.querySelector('.vtab[data-mode="plan"]').disabled = true;
      setMode('3d');
      updateStats();
      status.textContent = 'Built: ' + t.w + ' × ' + t.h + ' cells at ' + t.cell + ' m.';
    })().catch(function (err) {
      status.textContent = err && err.message ? err.message : String(err);
    });
  }

  /* ----------------------------------------------------------------- api */
  function onEnter() {
    if (st.viewer) {
      st.viewer.resume();
      requestAnimationFrame(function () {
        st.viewer.resize();
        st.viewer.applyLayer(st.layer);
        drawPlan();
      });
    }
  }

  function onLeave() {
    if (st.viewer) st.viewer.pause();
  }

  global.Recon = {
    init: init,
    onEnter: onEnter,
    onLeave: onLeave,
    getStats: function () {
      return st.checked ? { score: st.checked.score, site: st.built.name } : null;
    },
    reset: function () {
      el.btnSafe.hidden = true;
      selectSite('craters');
      setMode('3d');
      document.getElementById('tif-status').textContent = 'Waiting for a height file.';
    }
  };
})(window);
