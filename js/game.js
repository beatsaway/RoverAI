/* =========================================================================
   game.js — Drive: a real-time 3D lunar scene wrapped around a turn-based
   driving game. The player sees a camera feed, four status bars and three
   possible headings. The hazard map stays hidden unless scanned.
   ========================================================================= */
(function (global) {
  'use strict';

  var Core = global.Core;
  var THREE = global.THREE;

  var CELL = 12;
  var MAP_W = 74, MAP_H = 50;
  var MOVE_M = 36;
  var CORRIDOR = [[5, 26], [14, 28], [23, 21], [33, 24], [42, 19], [52, 25], [61, 21], [69, 25]];
  var START = { x: 5, y: 26 };
  var CHECKPOINTS = [
    { x: 23, y: 21, name: 'Alpha', upgrade: 'camera', blurb: 'Camera array' },
    { x: 42, y: 19, name: 'Bravo', upgrade: 'thermal', blurb: 'Thermal blanket' },
    { x: 61, y: 21, name: 'Charlie', upgrade: 'auto', blurb: 'Auto-nav' }
  ];
  var GOAL = { x: 69, y: 25, name: 'Echo' };
  var TOTAL_M = 0;
  (function () {
    var L = 0;
    for (var i = 1; i < CORRIDOR.length; i++) {
      L += Math.hypot(CORRIDOR[i][0] - CORRIDOR[i - 1][0], CORRIDOR[i][1] - CORRIDOR[i - 1][1]);
    }
    TOTAL_M = Math.round(L * CELL);
  })();

  var st = {};
  var map = null;
  var opts = [];
  var els = {};
  var seq = null;
  var raf = null;
  var lastHud = 0;
  var active = false;
  var bus = null;

  /* --------------------------------------------------------------- 3D view */
  var G = {
    ready: false,
    failed: false,
    renderer: null,
    scene: null,
    camera: null,
    clock: null,
    rover: null,
    wheels: [],
    steerWheels: [],
    wheelSpin: 0,
    pitch: 0,
    roll: 0,
    camLook: null,
    terrain: null,
    rockMeshes: [],
    stations: [],
    lander: null,
    stars: null,
    earth: null,
    earthGlow: null,
    sunSprite: null,
    sunCore: null,
    sun: null,
    fill: null,
    dust: [],
    dustSprites: [],
    tracks: [],
    trackData: [],
    trackCount: 0,
    trackLast: null,
    scanRing: null,
    scanT: -1,
    dustAccum: 0,
    reduced: false
  };

  var SUN_AZ = 112, SUN_EL = 10;
  var sunDir = null;
  var earthDir = null;

  /* ------------------------------------------------------------------ map */
  function buildMap(seedOffset) {
    var spec = {
      seed: 3311 + seedOffset * 97,
      w: MAP_W, h: MAP_H, cell: CELL,
      baseAmp: 9.5, baseFreq: 0.055, rough: 1.35, boulders: 80,
      sun: { az: SUN_AZ, el: SUN_EL },
      craters: [
        { x: 12, y: 19, r: 4, depth: 7 },
        { x: 17, y: 9, r: 7, depth: 16 },
        { x: 27, y: 33, r: 5, depth: 10 },
        { x: 30, y: 36, r: 6, depth: 13 },
        { x: 36, y: 39, r: 9, depth: 19 },
        { x: 45, y: 31, r: 6, depth: 12 },
        { x: 49, y: 9, r: 6, depth: 12 },
        { x: 56, y: 38, r: 8, depth: 16 },
        { x: 65, y: 36, r: 7, depth: 14 }
      ]
    };
    var t = Core.buildTerrain(spec);
    Core.carveCorridor(t, CORRIDOR, 3.1, 4, 0.78);

    // line the graded corridor with loose rock — visible, avoidable, punishing
    var rnd = Core.rng(spec.seed + 811);
    for (var k = 0; k < 48; k++) {
      var seg = Math.floor(rnd() * (CORRIDOR.length - 1));
      var a = CORRIDOR[seg], b = CORRIDOR[seg + 1];
      var u = rnd();
      var px = a[0] + (b[0] - a[0]) * u;
      var py = a[1] + (b[1] - a[1]) * u;
      var nx = -(b[1] - a[1]), ny = (b[0] - a[0]);
      var len = Math.hypot(nx, ny) || 1;
      var side = rnd() < 0.5 ? -1 : 1;
      var off = 3.4 + rnd() * 3.4;
      var cx = Math.round(px + (nx / len) * off * side);
      var cy = Math.round(py + (ny / len) * off * side);
      if (cx < 1 || cy < 1 || cx >= MAP_W - 1 || cy >= MAP_H - 1) continue;
      var idx = cy * MAP_W + cx;
      if (t.rock[idx]) continue;
      t.rock[idx] = rnd() < 0.28 ? 2 : 1;
      t.height[idx] += 0.8 + rnd() * 1.2;
    }
    Core.recomputeSlope(t);
    t.seed = spec.seed;
    return t;
  }

  /* --------------------------------------------------------------- state */
  function freshState() {
    var timed = Core.store.get('runs', 0);
    st = {
      x: START.x, y: START.y,
      hdg: 0,
      power: 100, heat: 30, tyre: 100,
      turn: 1, odometer: 0, checkpoints: 0,
      discovered: new Uint8Array(MAP_W * MAP_H),
      trail: [[START.x, START.y]],
      log: [],
      clock: 0,
      sensor: 0.94,
      upgrades: { camera: false, thermal: false, auto: false },
      started: false, running: false, ended: false, success: false,
      reveal: false,
      runIndex: timed,
      maxTurn: 26,
      startH: 0
    };
    st.totalM = TOTAL_M;
  }

  /* ------------------------------------------------------------- helpers */
  function bearingOf(hdg) { return (Core.deg(hdg) + 90 + 360) % 360; }
  function angDiff(a, b) {
    var d = (a - b + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    return d;
  }
  function lerpAngle(a, b, t) { return a + angDiff(b, a) * t; }
  function ease(t) { t = Core.clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function cell(x, y) { return Core.cellAt(map, x, y); }
  function nextTarget() {
    return st.checkpoints < CHECKPOINTS.length ? CHECKPOINTS[st.checkpoints] : GOAL;
  }
  function distTo(target) { return Math.hypot(target.x - st.x, target.y - st.y) * CELL; }
  function goalBearing() {
    var t = nextTarget();
    return Math.atan2(t.y - st.y, t.x - st.x);
  }
  function pad3(n) { return (n < 100 ? (n < 10 ? '00' : '0') : '') + n; }

  function revealAround(r) {
    var cx = Math.round(st.x), cy = Math.round(st.y);
    for (var y = cy - r; y <= cy + r; y++) {
      for (var x = cx - r; x <= cx + r; x++) {
        if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
        if (Math.hypot(x - cx, y - cy) <= r) st.discovered[y * MAP_W + x] = 1;
      }
    }
  }

  /* --------------------------------------------------------- run sampling */
  function simulateRun(x, y, hdg, metres) {
    var ca = Math.cos(hdg), sa = Math.sin(hdg);
    var maxSlope = 0, dust = 0, shadow = 0, steps = 0, distance = 0;
    var boulderAt = -1, blockAt = -1, smallRocks = 0;
    for (var d = 3; d <= metres + 0.01; d += 3) {
      var px = x + (ca * d) / CELL;
      var py = y + (sa * d) / CELL;
      if (px < 0.5 || py < 0.5 || px >= MAP_W - 0.5 || py >= MAP_H - 0.5) { blockAt = distance; break; }
      var i = cell(px, py);
      var sl = map.slope[i];
      if (sl > maxSlope) maxSlope = sl;
      if (map.dust[i]) dust++;
      if (map.shadow[i]) shadow++;
      steps++;
      if (map.rock[i] === 2) { boulderAt = Math.max(0, d - 2.5); break; }
      if (map.rock[i] === 1) smallRocks++;
      if (sl > 32) { blockAt = Math.max(0, d - 3); break; }
      distance = d;
    }
    var endD = boulderAt >= 0 ? boulderAt : (blockAt >= 0 ? blockAt : metres);
    distance = Math.max(0, endD);
    return {
      hdg: hdg,
      distance: distance,
      endX: x + (ca * distance) / CELL,
      endY: y + (sa * distance) / CELL,
      maxSlope: maxSlope,
      dust: dust, shadow: shadow, steps: Math.max(1, steps),
      boulderHit: boulderAt >= 0,
      blocked: blockAt >= 0 && boulderAt < 0,
      smallRocks: smallRocks,
      cost: 1.7 + (distance / MOVE_M) * 1.9 + maxSlope * 0.055 + dust * 0.5
    };
  }

  /* --------------------------------------------------------------- options */
  function fuzzBucket(v, max, conf) {
    if (Math.random() > conf) v += Math.random() < 0.5 ? -1 : 1;
    return Core.clamp(v, 0, max);
  }
  function slopeWord(b) { return ['gentle', 'gentle', 'steep', 'very steep'][b]; }
  function slopeClass(b) { return ['good', '', 'warn', 'bad'][b]; }

  function buildOptions() {
    var base = goalBearing();
    var conf = st.sensor;
    var out = [];
    var labels = ['Bear left', 'Straight on', 'Bear right'];
    [-38, 0, 38].forEach(function (offsetDeg, n) {
      var hdg = base + Core.rad(offsetDeg);
      var run = simulateRun(st.x, st.y, hdg, MOVE_M);
      var sb = Math.min(3, Math.floor(run.maxSlope / 8));
      sb = fuzzBucket(sb, 3, conf);
      var rockBucket = run.boulderHit ? 2 : Math.min(2, Math.round(run.smallRocks / 3));
      rockBucket = fuzzBucket(rockBucket, 2, conf);
      if (run.boulderHit && Math.random() < conf * 0.92) rockBucket = 2;

      var tags = [];
      tags.push({ t: slopeWord(sb) + ' ' + ['0–8°', '8–16°', '16–24°', '24°+'][sb], cls: slopeClass(sb) });
      tags.push({ t: ['clear', 'loose rock', 'boulder'][rockBucket], cls: ['good', 'warn', 'bad'][rockBucket] });
      if (run.shadow > run.steps * 0.5) tags.push({ t: 'shadow', cls: 'warn' });
      if (run.dust > run.steps * 0.5) tags.push({ t: 'soft dust', cls: 'warn' });

      var cost = run.cost;
      if (Math.random() > conf) cost += (Math.random() - 0.5) * 1.4;
      tags.push({ t: '−' + Math.max(1, Math.round(cost)) + '% power', cls: '' });

      out.push({
        label: labels[n],
        heading: hdg,
        bearing: Math.round(bearingOf(hdg)),
        run: run,
        tags: tags,
        risk: run.boulderHit ? 100 : run.maxSlope * 1.1 + run.smallRocks * 6 + run.dust * 1.2 - run.shadow * 1.6,
        cmd: 'drive ' + labels[n].toLowerCase() + ' (' + pad3(Math.round(bearingOf(hdg))) + '°, ' + MOVE_M + ' m)'
      });
    });
    return out;
  }

  /* --------------------------------------------------------------- HUD */
  function renderOptions() {
    if (!els.opts) return;
    els.opts.innerHTML = opts.map(function (o, i) {
      return '<button class="gopt" data-i="' + i + '" type="button">' +
        '<span class="gopt-top">' +
          '<span class="gopt-icon" aria-hidden="true">' + (i === 0 ? '←' : i === 1 ? '↑' : '→') + '</span>' +
          '<span class="gopt-dir">' + o.label + '</span>' +
          '<span class="gopt-bearing">' + pad3(o.bearing) + '°</span>' +
        '</span>' +
        '<span class="gopt-tags">' + o.tags.map(function (tg) {
          return '<span class="gtag ' + tg.cls + '">' + tg.t + '</span>';
        }).join('') + '</span>' +
      '</button>';
    }).join('');
    Array.prototype.forEach.call(els.opts.children, function (b) {
      b.addEventListener('click', function () { choose(parseInt(b.dataset.i, 10)); });
    });
  }

  function renderIdleOptions(msg) {
    if (!els.opts) return;
    els.opts.innerHTML = '<button class="gopt idle" data-start="1" type="button">' +
      '<span class="gopt-top"><span class="gopt-icon" aria-hidden="true">→</span>' +
      '<span class="gopt-dir">Start driving</span></span>' +
      '<span class="gopt-tags"><span class="gtag">' + msg + '</span></span>' +
      '</button>';
    var start = els.opts.querySelector('[data-start]');
    if (start) start.addEventListener('click', function () { startRun(); });
  }

  function log(text, kind) {
    st.log.push({ text: text, kind: kind || '', t: st.clock });
    if (st.log.length > 40) st.log.shift();
    renderLog();
  }

  function renderLog() {
    if (!els.log) return;
    els.log.innerHTML = st.log.map(function (e) {
      return '<li class="' + e.kind + '"><time>' + clockStr(e.t) + '</time><span>' + e.text + '</span></li>';
    }).join('');
    els.log.scrollTop = els.log.scrollHeight;
  }

  function clockStr(sec) {
    var s = Math.floor(sec) % 60, m = Math.floor(sec / 60) % 60, h = Math.floor(sec / 3600);
    return 'T+' + (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function setBar(name, value, max, label) {
    var fill = els['fill' + name];
    var val = els['val' + name];
    var wrap = els['bar' + name];
    if (!fill || !val) return;
    var pct = Core.clamp(value / max, 0, 1);
    fill.style.width = (pct * 100) + '%';
    val.textContent = label;
    if (wrap) {
      wrap.classList.toggle('warn', pct < 0.45 && pct >= 0.2);
      wrap.classList.toggle('danger', pct < 0.2);
    }
  }

  function updateHUD() {
    if (!els.valPower) return;
    var p = Math.max(0, Math.round(st.power));
    var h = Math.max(0, Math.round(st.heat));
    var w = Math.max(0, Math.round(st.tyre));
    var s = Math.round(st.sensor * 100);
    var t = nextTarget();
    var isGoal = st.checkpoints >= CHECKPOINTS.length;

    setBar('Power', p, 100, p + '%');
    setBar('Heat', h, 120, h + ' °C');
    setBar('Wheels', w, 100, w + '%');
    setBar('Signal', s, 100, s + '%');

    if (els.hudStage) {
      els.hudStage.textContent = isGoal ? 'STATION ECHO · FINAL' : 'CHECKPOINT ' + (st.checkpoints + 1) + ' OF 3 · ' + t.name.toUpperCase();
    }
    if (els.hudDist) els.hudDist.textContent = Math.round(distTo(t)) + ' m';
    if (els.hudTurn) els.hudTurn.textContent = 'TURN ' + (st.turn < 10 ? '0' : '') + st.turn;
    if (els.btnAuto) els.btnAuto.hidden = !st.upgrades.auto;

    // heat and power use severity colour rather than the raw fraction
    if (els.barHeat) {
      els.barHeat.classList.toggle('warn', h > 85 && h <= 105);
      els.barHeat.classList.toggle('danger', h > 105);
    }
    if (els.barPower) {
      els.barPower.classList.toggle('warn', p < 30 && p >= 15);
      els.barPower.classList.toggle('danger', p < 15);
    }
    if (els.barWheels) {
      els.barWheels.classList.toggle('warn', w < 45 && w >= 25);
      els.barWheels.classList.toggle('danger', w < 25);
    }
  }

  /* --------------------------------------------------------------- minimap */
  function drawMinimap() {
    if (!els.minimap || !map) return;
    var c = els.minimap;
    var ctx = c.getContext('2d');
    var sx = c.width / MAP_W, sy = c.height / MAP_H;
    ctx.fillStyle = '#0b1317';
    ctx.fillRect(0, 0, c.width, c.height);

    var showAll = st.reveal || st.ended;
    for (var y = 0; y < MAP_H; y++) {
      for (var x = 0; x < MAP_W; x++) {
        var i = y * MAP_W + x;
        var known = st.discovered[i] || showAll;
        if (!known) continue;
        var hN = (map.height[i] - map.minH) / (map.maxH - map.minH || 1);
        var v = 38 + hN * 58;
        if (map.shadow[i]) v *= 0.62;
        if (map.dust[i]) v += 6;
        ctx.fillStyle = 'rgb(' + Math.round(v * 0.94) + ',' + Math.round(v) + ',' + Math.round(v * 1.05) + ')';
        ctx.fillRect(x * sx, y * sy, sx + 0.6, sy + 0.6);
        if (map.rock[i] === 2) {
          ctx.fillStyle = 'rgba(255,116,96,.9)';
          ctx.fillRect(x * sx + sx * 0.2, y * sy + sy * 0.2, Math.max(1.5, sx * 0.6), Math.max(1.5, sy * 0.6));
        }
      }
    }

    ctx.strokeStyle = 'rgba(111,228,242,.38)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    st.trail.forEach(function (p, i) {
      var px = p[0] * sx, py = p[1] * sy;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();

    CHECKPOINTS.forEach(function (cp, i) {
      var done = i < st.checkpoints;
      ctx.strokeStyle = done ? 'rgba(121,226,163,.9)' : 'rgba(255,180,84,.7)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(cp.x * sx, cp.y * sy, 4, 0, Math.PI * 2);
      ctx.stroke();
      if (done) {
        ctx.fillStyle = 'rgba(121,226,163,.22)';
        ctx.fill();
      }
    });

    ctx.strokeStyle = 'rgba(255,180,84,.95)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(GOAL.x * sx, GOAL.y * sy, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffb454';
    ctx.beginPath();
    ctx.arc(GOAL.x * sx, GOAL.y * sy, 2.4, 0, Math.PI * 2);
    ctx.fill();

    var rx = st.x * sx, ry = st.y * sy;
    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(st.hdg);
    ctx.fillStyle = '#6fe4f2';
    ctx.shadowColor = '#6fe4f2';
    ctx.shadowBlur = 7;
    ctx.beginPath();
    ctx.moveTo(7, 0); ctx.lineTo(-5, 4.5); ctx.lineTo(-2.5, 0); ctx.lineTo(-5, -4.5);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    ctx.fillStyle = 'rgba(190,205,215,.75)';
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillRect(10, c.height - 13, (100 / CELL) * sx, 2);
    ctx.fillText('100 m', 10, c.height - 18);
  }

  /* ================================================================ 3D ==== */
  function heightWorld(x, z) {
    return Core.heightAt(map, x / CELL, z / CELL);
  }
  function worldOf(cx, cy) {
    return { x: cx * CELL, z: cy * CELL };
  }

  function makeTexture(canvas, srgb) {
    var t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.encoding = THREE.sRGBEncoding;
    return t;
  }

  function regolithTexture() {
    var N = 256;
    var c = document.createElement('canvas');
    c.width = c.height = N;
    var g = c.getContext('2d');
    var rnd = Core.rng(771);
    g.fillStyle = '#8a8a8a';
    g.fillRect(0, 0, N, N);
    for (var i = 0; i < 3600; i++) {
      var x = rnd() * N, y = rnd() * N, r = 0.4 + rnd() * 1.8;
      var v = Math.floor(80 + rnd() * 70);
      g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + (0.14 + rnd() * 0.3) + ')';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    for (var j = 0; j < 90; j++) {
      var x2 = rnd() * N, y2 = rnd() * N, rr = 3 + rnd() * 10;
      g.strokeStyle = 'rgba(74,70,64,' + (0.08 + rnd() * 0.1) + ')';
      g.lineWidth = 1;
      g.beginPath(); g.arc(x2, y2, rr, 0, Math.PI * 2); g.stroke();
    }
    return makeTexture(c, true);
  }

  function regolithNormal() {
    var N = 128;
    var c = document.createElement('canvas');
    c.width = c.height = N;
    var g = c.getContext('2d');
    var img = g.createImageData(N, N);
    var rnd = Core.rng(1174);
    var h = new Float32Array(N * N);
    for (var i = 0; i < h.length; i++) h[i] = rnd() * 0.6 + rnd() * 0.4;
    function at(x, y) { return h[((y + N) % N) * N + ((x + N) % N)]; }
    for (var y = 0; y < N; y++) {
      for (var x = 0; x < N; x++) {
        var dx = at(x + 1, y) - at(x - 1, y);
        var dy = at(x, y + 1) - at(x, y - 1);
        var nx = -dx * 1.8, ny = -dy * 1.8, nz = 1;
        var len = Math.hypot(nx, ny, nz) || 1;
        var o = (y * N + x) * 4;
        img.data[o] = (nx / len * 0.5 + 0.5) * 255;
        img.data[o + 1] = (ny / len * 0.5 + 0.5) * 255;
        img.data[o + 2] = (nz / len * 0.5 + 0.5) * 255;
        img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return makeTexture(c, false);
  }

  function earthTexture() {
    var c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    var g = c.getContext('2d');
    var rnd = Core.rng(418);
    var ocean = g.createLinearGradient(0, 0, 0, 256);
    ocean.addColorStop(0, '#0b2c4d');
    ocean.addColorStop(0.5, '#155a84');
    ocean.addColorStop(1, '#0a2744');
    g.fillStyle = ocean;
    g.fillRect(0, 0, 512, 256);
    for (var i = 0; i < 26; i++) {
      var x = rnd() * 512, y = 44 + rnd() * 168;
      var rx = 12 + rnd() * 50, ry = 8 + rnd() * 34;
      g.fillStyle = 'rgba(' + Math.floor(70 + rnd() * 40) + ',' + Math.floor(100 + rnd() * 40) + ',' + Math.floor(54 + rnd() * 30) + ',' + (0.55 + rnd() * 0.35) + ')';
      g.beginPath(); g.ellipse(x, y, rx, ry, rnd() * 3, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 0.55;
    g.strokeStyle = '#f4f8fb';
    g.lineWidth = 2;
    for (var k = 0; k < 22; k++) {
      var cx = rnd() * 512, cy = 30 + rnd() * 196;
      g.beginPath();
      g.ellipse(cx, cy, 16 + rnd() * 34, 3 + rnd() * 7, -0.3 + rnd() * 0.6, 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
    return makeTexture(c, true);
  }

  function spriteTexture() {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(64, 64, 1, 64, 64, 62);
    grd.addColorStop(0, 'rgba(255,252,242,1)');
    grd.addColorStop(0.12, 'rgba(255,244,218,0.85)');
    grd.addColorStop(0.36, 'rgba(255,214,162,0.18)');
    grd.addColorStop(1, 'rgba(255,214,162,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    var t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  function labelSprite(text, color, scale) {
    var c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    var g = c.getContext('2d');
    g.clearRect(0, 0, 512, 128);
    g.font = '700 54px "Segoe UI", system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(4,8,12,0.55)';
    var w = g.measureText(text).width + 40;
    g.fillRect(256 - w / 2, 26, w, 76);
    g.fillStyle = color;
    g.fillText(text, 256, 66);
    var t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    var mat = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false, fog: false });
    var s = new THREE.Sprite(mat);
    s.scale.set(scale * 4, scale, 1);
    s.renderOrder = 20;
    return s;
  }

  function buildSky() {
    var starCount = 1500;
    var pos = new Float32Array(starCount * 3);
    var rnd = Core.rng(99);
    for (var i = 0; i < starCount; i++) {
      var u = rnd() * Math.PI * 2;
      var v = Math.acos(rnd() * 1.1 - 0.08);
      var rad = 1600;
      pos[i * 3] = Math.sin(v) * Math.cos(u) * rad;
      pos[i * 3 + 1] = Math.abs(Math.cos(v)) * rad;
      pos[i * 3 + 2] = Math.sin(v) * Math.sin(u) * rad;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    G.stars = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffffff, size: 1.5, sizeAttenuation: false,
      transparent: true, opacity: 0.85, depthWrite: false, fog: false
    }));
    G.stars.frustumCulled = false;
    G.scene.add(G.stars);

    var earthMat = new THREE.MeshBasicMaterial({ map: earthTexture(), fog: false });
    G.earth = new THREE.Mesh(new THREE.SphereGeometry(32, 40, 28), earthMat);
    G.earth.frustumCulled = false;
    G.scene.add(G.earth);

    var glowTex = spriteTexture();
    G.earthGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0x7fc4ff, transparent: true, opacity: 0.5,
      depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false
    }));
    G.earthGlow.scale.setScalar(112);
    G.scene.add(G.earthGlow);

    G.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: spriteTexture(), color: 0xfff2d8, transparent: true, opacity: 0.7,
      depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false
    }));
    G.sunSprite.scale.setScalar(34);
    G.scene.add(G.sunSprite);

    G.sunCore = new THREE.Sprite(new THREE.SpriteMaterial({
      map: spriteTexture(), color: 0xffffff, transparent: true, opacity: 1,
      depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false
    }));
    G.sunCore.scale.setScalar(10);
    G.scene.add(G.sunCore);
  }

  /* A dark ring of distant hills so the map edge never cuts a hard line
     across the sky. Unlit, un-fogged: it only ever reads as a silhouette. */
  function buildHorizon() {
    var SEG = 160, R = 980;
    var pos = new Float32Array((SEG + 1) * 2 * 3);
    var indices = [];
    var rnd = Core.rng(2255);
    var tops = [];

    for (var i = 0; i <= SEG; i++) {
      var a = (i / SEG) * Math.PI * 2;
      var n = 0.5
        + 0.28 * Math.sin(a * 5.0 + 0.6)
        + 0.16 * Math.sin(a * 11.0 + 2.1)
        + rnd() * 0.14;
      tops.push(16 + Core.clamp(n, 0, 1) * 52);
    }

    for (var j = 0; j <= SEG; j++) {
      var ang = (j / SEG) * Math.PI * 2;
      var x = Math.cos(ang) * R;
      var z = Math.sin(ang) * R;
      var o = j * 6;
      pos[o] = x; pos[o + 1] = -60; pos[o + 2] = z;
      pos[o + 3] = x; pos[o + 4] = tops[j]; pos[o + 5] = z;
    }
    for (var k = 0; k < SEG; k++) {
      var a0 = k * 2, b0 = a0 + 1, c0 = a0 + 2, d0 = a0 + 3;
      indices.push(a0, c0, b0, b0, c0, d0);
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(indices);
    var mat = new THREE.MeshBasicMaterial({
      color: 0x06080b, side: THREE.DoubleSide, fog: false
    });
    var ring = new THREE.Mesh(geo, mat);
    ring.position.set((MAP_W - 1) * CELL / 2, 0, (MAP_H - 1) * CELL / 2);
    ring.frustumCulled = false;
    ring.renderOrder = -1;
    G.scene.add(ring);
    G.horizon = ring;
  }

  function buildTerrainMesh() {
    var SEG_X = (MAP_W - 1) * 3;
    var SEG_Z = (MAP_H - 1) * 3;
    var count = (SEG_X + 1) * (SEG_Z + 1);
    var positions = new Float32Array(count * 3);
    var colors = new Float32Array(count * 3);
    var uvs = new Float32Array(count * 2);
    var indices = [];
    var k = 0;
    var c = new THREE.Color();
    var col = new THREE.Color();

    for (var gz = 0; gz <= SEG_Z; gz++) {
      for (var gx = 0; gx <= SEG_X; gx++, k++) {
        var cx = (gx / SEG_X) * (MAP_W - 1);
        var cy = (gz / SEG_Z) * (MAP_H - 1);
        var h = Core.heightAt(map, cx, cy);
        var x = cx * CELL, z = cy * CELL;
        positions[k * 3] = x;
        positions[k * 3 + 1] = h;
        positions[k * 3 + 2] = z;
        uvs[k * 2] = cx / (MAP_W - 1);
        uvs[k * 2 + 1] = cy / (MAP_H - 1);

        var idx = cell(cx, cy);
        var sl = map.slope[idx];
        var sh = map.shadow[idx];
        var grain = Core.hash2(gx, gz, 17);
        var v = 0.32 + grain * 0.15;
        if (sh) {
          c.setRGB(0.09, 0.1, 0.13);
        } else if (sl > 31) {
          c.setRGB(0.25, 0.23, 0.2);
        } else if (sl > 20) {
          c.setRGB(v * 0.98, v * 0.92, v * 0.84);
        } else {
          c.setRGB(v, v * 0.99, v * 0.97);
        }
        if (map.dust[idx] && !sh) c.multiplyScalar(1.05);
        colors[k * 3] = c.r;
        colors[k * 3 + 1] = c.g;
        colors[k * 3 + 2] = c.b;
      }
    }

    for (var y = 0; y < SEG_Z; y++) {
      for (var x = 0; x < SEG_X; x++) {
        var a = y * (SEG_X + 1) + x;
        var b = a + 1;
        var cIdx = a + SEG_X + 1;
        var d = cIdx + 1;
        indices.push(a, cIdx, b, b, cIdx, d);
      }
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    var tex = regolithTexture();
    tex.repeat.set(130, 90);
    var norm = regolithNormal();
    norm.repeat.set(130, 90);

    var mat = new THREE.MeshStandardMaterial({
      map: tex,
      normalMap: norm,
      normalScale: new THREE.Vector2(0.22, 0.22),
      vertexColors: true,
      color: 0x9a9a9a,
      roughness: 1,
      metalness: 0.0
    });

    G.terrain = new THREE.Mesh(geo, mat);
    G.terrain.receiveShadow = true;
    G.terrain.frustumCulled = false;
    G.scene.add(G.terrain);
  }

  function rockGeometry(seed) {
    var geo = new THREE.IcosahedronGeometry(1, 1);
    var pos = geo.attributes.position;
    var v = new THREE.Vector3();
    for (var i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      var n = Core.hash2(Math.round(v.x * 3) + seed, Math.round(v.z * 3) + Math.round(v.y * 3), seed);
      var r = 0.82 + n * 0.3;
      pos.setXYZ(i, v.x * r, v.y * r * 0.72, v.z * r);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }

  function buildRocks() {
    var rnd = Core.rng((map.seed || 3311) + 21);
    var groups = [[], [], []];
    var dummy = new THREE.Object3D();

    for (var y = 0; y < MAP_H; y++) {
      for (var x = 0; x < MAP_W; x++) {
        var i = y * MAP_W + x;
        var kind = map.rock[i];
        if (!kind) continue;
        var n = kind === 2 ? 2 : 1;
        for (var j = 0; j < n; j++) {
          var px = x * CELL + (rnd() - 0.5) * CELL * 0.52;
          var pz = y * CELL + (rnd() - 0.5) * CELL * 0.52;
          var size = kind === 2 ? 1.7 + rnd() * 2.3 : 0.42 + rnd() * 0.65;
          var gy = heightWorld(px, pz);
          dummy.position.set(px, gy + size * 0.28, pz);
          dummy.rotation.set(rnd() * 0.8, rnd() * Math.PI * 2, rnd() * 0.8);
          dummy.scale.set(size * (0.8 + rnd() * 0.5), size * (0.55 + rnd() * 0.45), size * (0.8 + rnd() * 0.5));
          dummy.updateMatrix();
          groups[Math.floor(rnd() * 3)].push(dummy.matrix.clone());
        }
      }
    }

    // A scatter of tiny pebbles for scale, well away from the drive line.
    var pebbles = 220;
    var pebbleMats = [];
    for (var p = 0; p < pebbles; p++) {
      var cx = 3 + Math.floor(rnd() * (MAP_W - 6));
      var cy = 3 + Math.floor(rnd() * (MAP_H - 6));
      var idx = cy * MAP_W + cx;
      if (map.shadow[idx] || map.rock[idx] === 2) continue;
      var wx = cx * CELL + (rnd() - 0.5) * CELL * 0.8;
      var wz = cy * CELL + (rnd() - 0.5) * CELL * 0.8;
      var sz = 0.12 + rnd() * 0.3;
      dummy.position.set(wx, heightWorld(wx, wz) + sz * 0.2, wz);
      dummy.rotation.set(rnd() * 2, rnd() * 6, rnd() * 2);
      dummy.scale.setScalar(sz);
      dummy.updateMatrix();
      pebbleMats.push(dummy.matrix.clone());
    }
    groups[0] = groups[0].concat(pebbleMats);

    var mat = new THREE.MeshStandardMaterial({
      color: 0x4a463f, roughness: 0.98, metalness: 0.02, flatShading: true
    });

    groups.forEach(function (mats, gi) {
      if (!mats.length) return;
      var mesh = new THREE.InstancedMesh(rockGeometry(gi * 13 + 5), mat, mats.length);
      for (var i = 0; i < mats.length; i++) mesh.setMatrixAt(i, mats[i]);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      G.scene.add(mesh);
      G.rockMeshes.push(mesh);
    });
  }

  function addBox(parent, w, h, d, mat, x, y, z) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  function buildRover() {
    var g = new THREE.Group();
    var white = new THREE.MeshStandardMaterial({ color: 0x9e9a90, roughness: 0.6, metalness: 0.2 });
    var pale = new THREE.MeshStandardMaterial({ color: 0x8a857c, roughness: 0.72, metalness: 0.1 });
    var metal = new THREE.MeshStandardMaterial({ color: 0x70767a, roughness: 0.38, metalness: 0.72 });
    var dark = new THREE.MeshStandardMaterial({ color: 0x1e2226, roughness: 0.7, metalness: 0.3 });
    var gold = new THREE.MeshStandardMaterial({ color: 0x93723a, roughness: 0.38, metalness: 0.6 });
    var solar = new THREE.MeshStandardMaterial({
      color: 0x05080e, roughness: 0.34, metalness: 0.5,
      emissive: new THREE.Color(0x010306), emissiveIntensity: 0.5
    });
    var lens = new THREE.MeshStandardMaterial({
      color: 0x0a141b, roughness: 0.15, metalness: 0.7,
      emissive: new THREE.Color(0x7fe6ff), emissiveIntensity: 0.9
    });
    var accent = new THREE.MeshStandardMaterial({ color: 0xc07a4a, roughness: 0.55, metalness: 0.15 });

    addBox(g, 2.9, 0.55, 1.65, white, 0, 1.05, 0);
    addBox(g, 2.55, 0.08, 1.5, pale, 0, 1.36, 0);
    addBox(g, 1.9, 0.045, 1.24, solar, -0.28, 1.45, 0);
    addBox(g, 0.03, 0.12, 1.24, pale, -1.24, 1.5, 0);
    addBox(g, 0.68, 0.06, 1.5, accent, 0.98, 1.4, 0);
    addBox(g, 1.15, 0.26, 0.03, gold, -0.62, 1.05, 0.84);
    addBox(g, 1.15, 0.26, 0.03, gold, -0.62, 1.05, -0.84);

    // seats and backrests
    addBox(g, 0.5, 0.09, 0.44, accent, -0.42, 1.55, 0.42);
    addBox(g, 0.5, 0.09, 0.44, accent, -0.42, 1.55, -0.42);
    addBox(g, 0.08, 0.42, 0.44, pale, -0.72, 1.74, 0.42);
    addBox(g, 0.08, 0.42, 0.44, pale, -0.72, 1.74, -0.42);

    // fenders over all six wheels
    [-1.08, 0, 1.08].forEach(function (fx) {
      [-1.06, 1.06].forEach(function (fz) {
        addBox(g, 0.72, 0.04, 0.34, pale, fx, 1.18, fz);
      });
    });

    var mast = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.25, 8), metal);
    mast.position.set(1.05, 1.95, -0.12);
    mast.castShadow = true;
    g.add(mast);
    addBox(g, 0.4, 0.24, 0.3, white, 1.05, 2.62, -0.12);
    var lensMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.09, 12), lens);
    lensMesh.rotation.z = Math.PI / 2;
    lensMesh.position.set(1.27, 2.62, -0.12);
    g.add(lensMesh);

    var antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.35, 6), metal);
    antenna.position.set(-0.85, 1.98, 0.5);
    g.add(antenna);
    var dish = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), gold);
    dish.rotation.x = -0.9;
    dish.position.set(-0.85, 2.72, 0.5);
    dish.castShadow = true;
    g.add(dish);

    var tyreMat = new THREE.MeshStandardMaterial({
      color: 0x181b1e, roughness: 0.85, metalness: 0.3
    });
    var wheels = [];
    var steer = [];
    [-1.08, 0, 1.08].forEach(function (x) {
      [-1.06, 1.06].forEach(function (z) {
        var pivot = new THREE.Group();
        pivot.position.set(x, 0.56, z);
        [-0.13, 0.13].forEach(function (side) {
          var tread = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.055, 8, 26), tyreMat);
          tread.position.z = side;
          tread.castShadow = true;
          pivot.add(tread);
          var rim = new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.022, 8, 28), metal);
          rim.position.z = side * 1.28;
          pivot.add(rim);
        });
        var hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.4, 12), metal);
        hub.rotation.x = Math.PI / 2;
        pivot.add(hub);
        for (var t = 0; t < 12; t++) {
          var a = (t / 12) * Math.PI * 2;
          var spoke = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.94, 0.026), metal);
          spoke.position.set(0, 0, 0);
          spoke.rotation.z = a;
          pivot.add(spoke);
        }
        var strut = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 6), metal);
        strut.position.set(-Math.sign(x) * 0.18, 0.24, -Math.sign(z) * 0.14);
        strut.rotation.z = 0.5;
        pivot.add(strut);
        g.add(pivot);
        wheels.push(pivot);
        if (x > 0) steer.push(pivot);
      });
    });

    g.traverse(function (o) {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });

    // headlights, useful when facing away from the Sun
    var lampMat = new THREE.MeshStandardMaterial({
      color: 0xfff4d6, emissive: new THREE.Color(0xfff0c6), emissiveIntensity: 0.9, roughness: 0.3
    });
    addBox(g, 0.16, 0.1, 0.22, lampMat, 1.5, 1.18, -0.45);
    addBox(g, 0.16, 0.1, 0.22, lampMat, 1.5, 1.18, 0.45);

    G.rover = g;
    G.wheels = wheels;
    G.steerWheels = steer;
    G.scene.add(g);
  }

  function buildLander(x, z) {
    var g = new THREE.Group();
    var y = heightWorld(x, z);
    g.position.set(x, y, z);
    var white = new THREE.MeshStandardMaterial({ color: 0xe9e3d5, roughness: 0.58, metalness: 0.08 });
    var grey = new THREE.MeshStandardMaterial({ color: 0xb9b2a5, roughness: 0.7, metalness: 0.15 });
    var metal = new THREE.MeshStandardMaterial({ color: 0x8b8780, roughness: 0.44, metalness: 0.55 });
    var gold = new THREE.MeshStandardMaterial({ color: 0xc7a05a, roughness: 0.36, metalness: 0.55 });
    var glass = new THREE.MeshStandardMaterial({ color: 0x8fd0e6, roughness: 0.18, metalness: 0.2, emissive: 0x153444, emissiveIntensity: 0.5 });

    var body = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.95, 3.1, 10), white);
    body.position.y = 2.7;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    var cap = new THREE.Mesh(new THREE.SphereGeometry(1.55, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), gold);
    cap.scale.y = 0.62;
    cap.position.y = 4.25;
    cap.castShadow = true;
    g.add(cap);
    var ring = new THREE.Mesh(new THREE.CylinderGeometry(1.83, 1.83, 0.16, 20), grey);
    ring.position.y = 1.15;
    g.add(ring);
    var hatch = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.4, 0.16), grey);
    hatch.position.set(0, 2.55, 1.92);
    g.add(hatch);
    var windowMesh = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.34, 0.05), glass);
    windowMesh.position.set(0.28, 2.9, 2.02);
    g.add(windowMesh);

    for (var i = 0; i < 4; i++) {
      var a = (i / 4) * Math.PI * 2 + 0.42;
      var hip = new THREE.Vector3(Math.cos(a) * 1.6, 1.55, Math.sin(a) * 1.6);
      var foot = new THREE.Vector3(Math.cos(a) * 2.9, 0.1, Math.sin(a) * 2.9);
      var dir = foot.clone().sub(hip);
      var len = dir.length();
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, len, 6), metal);
      leg.position.copy(hip).lerp(foot, 0.5);
      leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      leg.castShadow = true;
      g.add(leg);
      var pad = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.12, 12), metal);
      pad.position.set(foot.x, 0.08, foot.z);
      g.add(pad);
    }

    var dish = new THREE.Mesh(new THREE.SphereGeometry(0.52, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), white);
    dish.rotation.x = -0.7;
    dish.position.set(-1.2, 4.8, -0.4);
    g.add(dish);

    G.lander = g;
    G.scene.add(g);
  }

  function beacon(cx, cy, label, isGoal) {
    var g = new THREE.Group();
    var p = worldOf(cx, cy);
    var y = heightWorld(p.x, p.z);
    g.position.set(p.x, y, p.z);
    var color = isGoal ? 0xffb454 : 0x6fe4f2;

    var ring = new THREE.Mesh(
      new THREE.RingGeometry(3.0, 3.8, 48),
      new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.14;
    g.add(ring);

    var beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 11, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
    );
    beam.position.y = 5.6;
    g.add(beam);

    var orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 14, 10),
      new THREE.MeshBasicMaterial({ color: color })
    );
    orb.position.y = 10.8;
    g.add(orb);

    var sprite = labelSprite(label, isGoal ? '#ffcf8f' : '#bff4fb', isGoal ? 1.5 : 1.15);
    sprite.position.y = 13.0;
    g.add(sprite);

    if (isGoal) {
      var base = new THREE.Mesh(
        new THREE.CylinderGeometry(2.6, 2.9, 0.5, 16),
        new THREE.MeshStandardMaterial({ color: 0xb9b2a5, roughness: 0.75, metalness: 0.2 })
      );
      base.position.y = 0.25;
      base.castShadow = true;
      base.receiveShadow = true;
      g.add(base);
      var hab = new THREE.Mesh(
        new THREE.CylinderGeometry(2.2, 2.2, 5.4, 16),
        new THREE.MeshStandardMaterial({ color: 0xe4ded1, roughness: 0.6, metalness: 0.15 })
      );
      hab.rotation.z = Math.PI / 2;
      hab.position.y = 2.3;
      hab.castShadow = true;
      hab.receiveShadow = true;
      g.add(hab);
      var cap2 = new THREE.Mesh(
        new THREE.SphereGeometry(2.0, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
        new THREE.MeshStandardMaterial({ color: 0xc9a45e, roughness: 0.42, metalness: 0.4 })
      );
      cap2.position.set(0, 3.7, 0);
      cap2.scale.y = 0.55;
      g.add(cap2);
      var light = new THREE.PointLight(0xffd9a0, 1.6, 34, 2);
      light.position.set(0, 4.4, 0);
      g.add(light);
      [[-4.3, 0], [4.3, 0]].forEach(function (off) {
        var panel = new THREE.Mesh(
          new THREE.BoxGeometry(2.8, 0.07, 1.6),
          new THREE.MeshStandardMaterial({ color: 0x17253d, roughness: 0.32, metalness: 0.55, emissive: 0x08152b, emissiveIntensity: 0.4 })
        );
        panel.position.set(off[0], 0.9, off[1]);
        panel.rotation.z = off[0] > 0 ? -0.22 : 0.22;
        panel.castShadow = true;
        g.add(panel);
      });
    } else {
      var post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.08, 1.7, 6),
        new THREE.MeshStandardMaterial({ color: 0x9aa1a6, roughness: 0.4, metalness: 0.6 })
      );
      post.position.y = 0.85;
      g.add(post);
      var box = new THREE.Mesh(
        new THREE.BoxGeometry(0.52, 0.38, 0.4),
        new THREE.MeshStandardMaterial({ color: 0xded9cc, roughness: 0.5, metalness: 0.2 })
      );
      box.position.y = 1.8;
      g.add(box);
    }

    G.scene.add(g);
    return { group: g, ring: ring, beam: beam, orb: orb, label: sprite, done: false, isGoal: !!isGoal };
  }

  function buildStations() {
    G.stations = [];
    CHECKPOINTS.forEach(function (cp, i) {
      var b = beacon(cp.x, cp.y, cp.name.toUpperCase(), false);
      b.index = i;
      G.stations.push(b);
    });
    G.stations.push(beacon(GOAL.x, GOAL.y, 'ECHO', true));
  }

  function markStation(index) {
    var b = G.stations[index];
    if (!b || b.done) return;
    b.done = true;
    var green = 0x79e2a3;
    b.ring.material.color.setHex(green);
    b.beam.material.color.setHex(green);
    b.orb.material.color.setHex(green);
    b.ring.material.opacity = 0.5;
  }

  function buildDust() {
    var tex = spriteTexture();
    G.dust = [];
    G.dustSprites = [];
    for (var i = 0; i < 56; i++) {
      var mat = new THREE.SpriteMaterial({
        map: tex, color: 0xc6bdb0, transparent: true, opacity: 0,
        depthWrite: false, blending: THREE.NormalBlending
      });
      var s = new THREE.Sprite(mat);
      s.visible = false;
      s.scale.setScalar(0.6);
      G.scene.add(s);
      G.dustSprites.push(s);
      G.dust.push({ life: 0, max: 1, x: 0, y: -50, z: 0, vx: 0, vy: 0, vz: 0 });
    }
  }

  function buildTracks() {
    var mat = new THREE.LineBasicMaterial({ color: 0x2b2824, transparent: true, opacity: 0.55 });
    G.tracks = [];
    G.trackData = [];
    G.trackCount = 0;
    G.trackLast = null;
    for (var i = 0; i < 2; i++) {
      var geo = new THREE.BufferGeometry();
      var arr = new Float32Array(700 * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      geo.setDrawRange(0, 0);
      var line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      G.scene.add(line);
      G.tracks.push(line);
      G.trackData.push(arr);
    }
  }

  function buildScanRing() {
    var ring = new THREE.Mesh(
      new THREE.RingGeometry(0.96, 1.0, 64),
      new THREE.MeshBasicMaterial({ color: 0x6fe4f2, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    G.scene.add(ring);
    G.scanRing = ring;
  }

  function initThree() {
    if (!THREE) { G.failed = true; return false; }
    try {
      G.renderer = new THREE.WebGLRenderer({
        canvas: els.cam, antialias: true, alpha: false,
        powerPreference: 'high-performance'
      });
    } catch (e) {
      G.failed = true;
      return false;
    }
    G.renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 1.75));
    G.renderer.setClearColor(0x020306, 1);
    G.renderer.shadowMap.enabled = true;
    G.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if ('outputEncoding' in G.renderer) G.renderer.outputEncoding = THREE.sRGBEncoding;
    G.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    G.renderer.toneMappingExposure = 1.0;

    G.scene = new THREE.Scene();
    G.scene.background = new THREE.Color(0x020306);
    G.scene.fog = new THREE.Fog(0x02040a, 200, 760);
    G.camera = new THREE.PerspectiveCamera(55, 1.6, 0.25, 3000);
    G.camLook = new THREE.Vector3();
    G.clock = new THREE.Clock();

    var az = Core.rad(SUN_AZ), el = Core.rad(SUN_EL);
    sunDir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    earthDir = new THREE.Vector3(0.16, 0.30, -0.94).normalize();

    var hemi = new THREE.HemisphereLight(0x18243a, 0x2e2a22, 0.22);
    G.scene.add(hemi);
    G.sun = new THREE.DirectionalLight(0xfff3e0, 2.0);
    G.sun.castShadow = true;
    G.sun.shadow.mapSize.set(2048, 2048);
    G.sun.shadow.camera.near = 1;
    G.sun.shadow.camera.far = 320;
    G.sun.shadow.camera.left = -70;
    G.sun.shadow.camera.right = 70;
    G.sun.shadow.camera.top = 70;
    G.sun.shadow.camera.bottom = -70;
    G.sun.shadow.bias = -0.0004;
    G.sun.shadow.normalBias = 0.06;
    G.scene.add(G.sun);
    G.scene.add(G.sun.target);
    G.fill = new THREE.DirectionalLight(0x9fb6d8, 0.4);
    G.scene.add(G.fill);
    G.scene.add(G.fill.target);

    buildSky();
    buildHorizon();
    buildTerrainMesh();
    buildRocks();
    buildRover();
    var lp = worldOf(START.x - 2.2, START.y + 1.7);
    buildLander(lp.x, lp.z);
    buildStations();
    buildTracks();
    buildDust();
    buildScanRing();

    placeRover(0, true);
    resize();
    G.ready = true;
    return true;
  }

  function disposeWorld() {
    if (G.terrain) {
      G.scene.remove(G.terrain);
      G.terrain.geometry.dispose();
      if (G.terrain.material.map) G.terrain.material.map.dispose();
      if (G.terrain.material.normalMap) G.terrain.material.normalMap.dispose();
      G.terrain.material.dispose();
      G.terrain = null;
    }
    G.rockMeshes.forEach(function (m) {
      G.scene.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    });
    G.rockMeshes = [];
    G.stations.forEach(function (s) {
      s.group.traverse(function (o) {
        if (o.isMesh) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            if (o.material.map) o.material.map.dispose();
            o.material.dispose();
          }
        }
      });
      G.scene.remove(s.group);
    });
    G.stations = [];
    if (G.lander) {
      G.lander.traverse(function (o) {
        if (o.isMesh) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) o.material.dispose();
        }
      });
      G.scene.remove(G.lander);
      G.lander = null;
    }
  }

  function rebuildWorld() {
    if (!G.ready) return;
    disposeWorld();
    buildTerrainMesh();
    buildRocks();
    var lp = worldOf(START.x - 2.2, START.y + 1.7);
    buildLander(lp.x, lp.z);
    buildStations();
    clearTracks();
    placeRover(0, true);
  }

  function clearTracks() {
    G.trackCount = 0;
    G.trackLast = null;
    G.tracks.forEach(function (line) {
      line.geometry.setDrawRange(0, 0);
    });
    G.trackData.forEach(function (arr) { arr.fill(0); });
  }

  /* -------------------------------------------------------------- rover */
  function placeRover(dt, snap) {
    if (!G.rover) return;
    var x = st.x * CELL, z = st.y * CELL;
    var y = heightWorld(x, z);
    var cos = Math.cos(st.hdg), sin = Math.sin(st.hdg);
    var ahead = heightWorld(x + cos * 1.5, z + sin * 1.5);
    var behind = heightWorld(x - cos * 1.5, z - sin * 1.5);
    var rightH = heightWorld(x - sin * 0.95, z + cos * 0.95);
    var leftH = heightWorld(x + sin * 0.95, z - cos * 0.95);
    var targetPitch = Math.atan2(ahead - behind, 3.0);
    var targetRoll = Math.atan2(rightH - leftH, 1.9);
    var k = snap ? 1 : Math.min(1, dt * 7);
    G.pitch += (targetPitch - G.pitch) * k;
    G.roll += (targetRoll - G.roll) * k;

    var qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -st.hdg);
    var qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), G.pitch);
    var qRoll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), G.roll);
    G.rover.quaternion.copy(qYaw).multiply(qPitch).multiply(qRoll);
    G.rover.position.set(x, y, z);

    var fwd = new THREE.Vector3(cos, 0, sin);
    var right = new THREE.Vector3(-sin, 0, cos);
    var idle = Math.sin(performance.now() * 0.00022) * 0.35;
    var desired = new THREE.Vector3(
      x - fwd.x * 9.0 + right.x * (1.25 + idle),
      y + 2.2,
      z - fwd.z * 9.0 + right.z * (1.25 + idle)
    );
    var floor = heightWorld(desired.x, desired.z) + 1.45;
    if (desired.y < floor) desired.y = floor;
    var look = new THREE.Vector3(x + fwd.x * 17, y + 0.6, z + fwd.z * 17);
    if (snap || !G.camera.position.length()) {
      G.camera.position.copy(desired);
      G.camLook.copy(look);
    } else {
      G.camera.position.lerp(desired, 1 - Math.exp(-dt * 3.4));
      G.camLook.lerp(look, 1 - Math.exp(-dt * 5.0));
    }
    G.camera.lookAt(G.camLook);
  }

  function spinWheels(amount) {
    G.wheelSpin += amount / 0.56;
    G.wheels.forEach(function (w) { w.rotation.z = -G.wheelSpin; });
  }

  function steerWheels(angle) {
    G.steerWheels.forEach(function (w) {
      w.rotation.y += (angle - w.rotation.y) * 0.14;
    });
  }

  /* --------------------------------------------------------------- dust */
  function kickDust(n) {
    if (!G.ready) return;
    var cos = Math.cos(st.hdg), sin = Math.sin(st.hdg);
    var right = new THREE.Vector3(-sin, 0, cos);
    var back = new THREE.Vector3(-cos, 0, -sin);
    var made = 0;
    for (var i = 0; i < G.dust.length && made < n; i++) {
      var p = G.dust[i];
      if (p.life > 0) continue;
      var side = (i % 2 ? 1 : -1) * 1.06;
      var x = st.x * CELL + back.x * 1.2 + right.x * side;
      var z = st.y * CELL + back.z * 1.2 + right.z * side;
      p.x = x + (Math.random() - 0.5) * 0.4;
      p.z = z + (Math.random() - 0.5) * 0.4;
      p.y = heightWorld(p.x, p.z) + 0.12;
      p.vx = back.x * (0.6 + Math.random() * 0.9) + (Math.random() - 0.5) * 0.7;
      p.vz = back.z * (0.6 + Math.random() * 0.9) + (Math.random() - 0.5) * 0.7;
      p.vy = 0.5 + Math.random() * 0.9;
      p.life = p.max = 1.0 + Math.random() * 0.6;
      made++;
    }
  }

  function updateDust(dt) {
    for (var i = 0; i < G.dust.length; i++) {
      var p = G.dust[i];
      var s = G.dustSprites[i];
      if (p.life > 0) {
        p.life -= dt;
        p.vy -= 1.6 * dt;
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        p.y += p.vy * dt;
        var floor = heightWorld(p.x, p.z) + 0.03;
        if (p.y <= floor) {
          p.y = floor;
          p.vy = 0;
          p.vx *= 0.16;
          p.vz *= 0.16;
          p.life -= dt * 2;
        }
        if (p.life <= 0) p.life = 0;
        s.visible = p.life > 0;
        if (s.visible) {
          s.position.set(p.x, p.y, p.z);
          var fade = Math.min(1, p.life / p.max);
          s.material.opacity = 0.18 + fade * 0.34;
          var grow = 0.45 + (1 - fade) * 0.9;
          s.scale.setScalar(grow);
        }
      } else if (s.visible) {
        s.visible = false;
      }
    }
  }

  function pushTrackPoint() {
    if (!G.ready) return;
    var x = st.x * CELL, z = st.y * CELL;
    if (G.trackLast && Math.hypot(x - G.trackLast.x, z - G.trackLast.z) < 1.25) return;
    var cos = Math.cos(st.hdg), sin = Math.sin(st.hdg);
    var right = { x: -sin, z: cos };
    for (var side = 0; side < 2; side++) {
      var sign = side === 0 ? -1 : 1;
      var px = x + right.x * 1.02 * sign;
      var pz = z + right.z * 1.02 * sign;
      if (G.trackCount >= 700) return;
      var idx = G.trackCount * 3;
      var arr = G.trackData[side];
      arr[idx] = px;
      arr[idx + 1] = heightWorld(px, pz) + 0.06;
      arr[idx + 2] = pz;
    }
    G.trackCount++;
    G.tracks.forEach(function (line) {
      line.geometry.attributes.position.needsUpdate = true;
      line.geometry.setDrawRange(0, G.trackCount);
    });
    G.trackLast = { x: x, z: z };
  }

  function updateScan(dt) {
    if (G.scanT < 0) {
      if (G.scanRing) G.scanRing.visible = false;
      return;
    }
    G.scanT += dt;
    var u = Core.clamp(G.scanT / 1.25, 0, 1);
    G.scanRing.visible = true;
    G.scanRing.position.set(st.x * CELL, heightWorld(st.x * CELL, st.y * CELL) + 0.25, st.y * CELL);
    var r = 2 + u * 95;
    G.scanRing.scale.set(r, r, r);
    G.scanRing.material.opacity = (1 - u) * 0.9;
    if (u >= 1) G.scanT = -1;
  }

  /* ------------------------------------------------------------- sequence */
  function choose(i) {
    if (seq || st.ended || !st.running || !opts[i]) return;
    var opt = opts[i];
    Array.prototype.forEach.call(els.opts.children, function (b) { b.disabled = true; });
    els.opts.classList.add('pending');
    if (els.cmdQ) els.cmdQ.textContent = 'Sending command…';
    log('TX · ' + opt.cmd, 'sys');
    st.clock += 4;
    seq = {
      phase: 'delay',
      t: 0,
      dur: 0.85,
      opt: opt,
      fromH: st.hdg,
      toH: opt.heading,
      fromX: st.x,
      fromY: st.y,
      toX: opt.run.endX,
      toY: opt.run.endY,
      dist: Math.hypot(opt.run.endX - st.x, opt.run.endY - st.y) * CELL,
      travelled: 0,
      lastE: 0
    };
    updateHUD();
  }

  function stepSequence(dt) {
    if (!seq) return;
    seq.t += dt;

    if (seq.phase === 'delay') {
      if (seq.t < seq.dur) return;
      seq.phase = 'turn';
      seq.t = 0;
      seq.dur = 0.62;
      return;
    }

    if (seq.phase === 'turn') {
      var u = ease(seq.t / seq.dur);
      st.hdg = lerpAngle(seq.fromH, seq.toH, u);
      steerWheels(0.35 * Math.sin(u * Math.PI));
      placeRover(dt, false);
      spinWheels(seq.dist * 0.02 * dt);
      if (seq.t >= seq.dur) {
        st.hdg = seq.toH;
        steerWheels(0);
        seq.phase = 'drive';
        seq.t = 0;
        seq.dur = Core.clamp(seq.dist / 16, 0.9, 2.8);
        seq.lastE = 0;
      }
      return;
    }

    if (seq.phase === 'drive') {
      var u2 = ease(seq.t / seq.dur);
      st.x = Core.lerp(seq.fromX, seq.toX, u2);
      st.y = Core.lerp(seq.fromY, seq.toY, u2);
      var step = (u2 - seq.lastE) * seq.dist;
      seq.lastE = u2;
      spinWheels(step);
      placeRover(dt, false);
      pushTrackPoint();
      G.dustAccum += step;
      if (G.dustAccum > 0.7) {
        G.dustAccum = 0;
        kickDust(2);
      }
      if (seq.t >= seq.dur) {
        st.x = seq.toX;
        st.y = seq.toY;
        applyRun(seq.opt);
        if (!st.ended) {
          seq.phase = 'wait';
          seq.t = 0;
          seq.dur = 0.55;
        }
      }
      return;
    }

    if (seq.phase === 'wait') {
      placeRover(dt, false);
      if (seq.t >= seq.dur) {
        seq = null;
        beginTurn();
      }
    }
  }

  /* --------------------------------------------------------------- turns */
  function startRun() {
    if (!map) return;
    st.started = true;
    st.running = true;
    st.ended = false;
    st.success = false;
    st.startH = heightWorld(st.x * CELL, st.y * CELL);
    seq = null;
    hideOverlay();
    els.log.innerHTML = '';
    log('Mission 04-A · traverse to Station Echo', 'sys');
    log('Graded route ' + TOTAL_M + ' m · 3 checkpoints · no recharge', 'sys');
    st.clock = 0;
    revealAround(5);
    beginTurn();
    placeRover(0, true);
    G.dustAccum = 0;
  }

  function beginTurn() {
    if (st.ended) return;
    var target = nextTarget();
    st.sensor = Core.clamp(0.95 - 0.4 * (st.odometer / Math.max(1, TOTAL_M)), 0.56, 0.95);
    opts = buildOptions();
    renderOptions();
    els.opts.classList.remove('pending');
    if (els.cmdQ) els.cmdQ.textContent = 'Where should the rover go?';
    updateHUD();
    drawMinimap();
    revealAround(4);
    if (st.turn === 1) log('Camera online. Forward view only.', '');
    if (st.turn > st.maxTurn) endRun('time');
  }

  function applyRun(opt) {
    var run = opt.run;
    st.odometer += run.distance;
    st.power -= run.cost;
    var heatGain = (run.shadow > run.steps * 0.5 ? -1.5 : 2.35) + run.maxSlope * 0.045;
    if (st.upgrades.thermal) heatGain *= 0.62;
    st.heat += heatGain;
    st.clock += 70 + run.distance * 0.6;

    var dmg = 0;
    if (run.boulderHit) {
      dmg = 22 + Math.random() * 16;
      log('IMPACT · boulder at ' + Math.round(run.distance) + ' m', 'bad');
      kickDust(14);
    } else if (run.smallRocks > 0 && Math.random() < 0.45 + run.smallRocks * 0.1) {
      dmg = 5 + Math.random() * 9;
      log('Rock strike · small stones in the mesh', 'warn');
    }
    if (run.blocked) log('Slope too steep at ' + Math.round(run.distance) + ' m', 'warn');

    var dustDmg = run.dust > run.steps * 0.6 ? 1.5 : 0;
    st.tyre -= dmg + dustDmg;
    st.heat = Math.min(125, st.heat);
    st.power = Math.max(0, st.power);
    st.tyre = Math.max(0, st.tyre);
    st.trail.push([st.x, st.y]);
    revealAround(5);
    st.turn++;

    log('Moved ' + Math.round(run.distance) + ' m · power −' + run.cost.toFixed(1) + '%', '');
    if (dmg > 0) log('Wheels −' + Math.round(dmg + dustDmg) + '%', 'bad');

    updateHUD();
    drawMinimap();

    var cp = CHECKPOINTS[st.checkpoints];
    if (cp && Math.hypot(cp.x - st.x, cp.y - st.y) * CELL < 34) {
      st.checkpoints++;
      awardCheckpoint(cp, st.checkpoints - 1);
    }

    if (st.power <= 0) { endRun('power'); return; }
    if (st.heat >= 120) { endRun('heat'); return; }
    if (st.tyre <= 0) { endRun('tyre'); return; }
    if (Math.hypot(GOAL.x - st.x, GOAL.y - st.y) * CELL < 34) { endRun('success'); return; }
    if (st.turn > st.maxTurn) { endRun('time'); return; }
  }

  function awardCheckpoint(cp, index) {
    markStation(index);
    if (cp.upgrade === 'camera') {
      st.upgrades.camera = true;
      log('CHECKPOINT ' + cp.name + ' · camera array online', 'good');
    } else if (cp.upgrade === 'thermal') {
      st.upgrades.thermal = true;
      log('CHECKPOINT ' + cp.name + ' · thermal blanket fitted', 'good');
    } else {
      st.upgrades.auto = true;
      log('CHECKPOINT ' + cp.name + ' · auto-nav unlocked', 'good');
    }
    st.clock += 240;
    toast('Checkpoint ' + cp.name + ' · ' + cp.blurb);
    drawMinimap();
  }

  function scan() {
    if (seq || st.ended || !st.running) return;
    if (st.power < 4) { toast('Not enough power to scan.'); return; }
    st.power -= 3;
    st.clock += 90;
    revealAround(st.upgrades.camera ? 8 : 6);
    G.scanT = 0;
    log('Survey scan · hazards tagged', 'sys');
    updateHUD();
    drawMinimap();
    toast('Scan complete · 3% power used');
  }

  function reverse() {
    if (seq || st.ended || !st.running) return;
    if (st.power < 3) { toast('Not enough power to reverse.'); return; }
    st.power -= 2;
    st.clock += 60;
    var nx = Core.clamp(st.x - Math.cos(st.hdg) * 2, 1, MAP_W - 2);
    var ny = Core.clamp(st.y - Math.sin(st.hdg) * 2, 1, MAP_H - 2);
    if (map.slope[cell(nx, ny)] < 28) { st.x = nx; st.y = ny; }
    st.odometer += 24;
    st.turn++;
    st.trail.push([st.x, st.y]);
    spinWheels(24);
    placeRover(0, true);
    log('Reverse 24 m · backing out', 'warn');
    updateHUD();
    drawMinimap();
    beginTurn();
  }

  function autoNav() {
    if (seq || st.ended || !st.running || !st.upgrades.auto) return;
    var best = 0, bestRisk = Infinity;
    opts.forEach(function (o, i) {
      if (o.risk < bestRisk) { bestRisk = o.risk; best = i; }
    });
    if (Math.random() < 0.18) best = (best + 1) % opts.length;
    log('AUTO-NAV evaluating ' + opts.length + ' candidate lines…', 'sys');
    choose(best);
  }

  /* --------------------------------------------------------------- ending */
  function endRun(reason) {
    st.ended = true;
    st.running = false;
    st.success = reason === 'success';
    seq = null;
    Array.prototype.forEach.call(els.opts.children, function (b) { b.disabled = true; });
    els.opts.classList.add('pending');
    updateHUD();
    drawMinimap();

    var best = Core.store.get('best', 0);
    if (st.odometer > best) {
      best = st.odometer;
      Core.store.set('best', Math.round(best));
    }
    Core.store.set('runs', st.runIndex + 1);

    var title, kicker, msg;
    if (reason === 'success') {
      kicker = 'Traverse complete';
      title = 'Station Echo reached';
      msg = 'You covered ' + Math.round(st.odometer) + ' m with ' + Math.round(st.power) + '% power left.';
    } else if (reason === 'power') {
      kicker = 'Mission ended · power';
      title = 'Batteries flat at ' + Math.round(st.odometer) + ' m';
      msg = 'No recharge and no rescue. Every detour was a withdrawal you could not repay.';
    } else if (reason === 'heat') {
      kicker = 'Mission ended · heat';
      title = 'Electronics shut down at ' + Math.round(st.odometer) + ' m';
      msg = 'The rover cooked in sunlight. Real rovers park in shadow and wait.';
    } else if (reason === 'tyre') {
      kicker = 'Mission ended · wheels';
      title = 'Wheels destroyed at ' + Math.round(st.odometer) + ' m';
      msg = 'Wire mesh survives heat and vacuum, but not boulders. Believe the camera, not the tags.';
    } else {
      kicker = 'Mission ended · time';
      title = 'Out of time at ' + Math.round(st.odometer) + ' m';
      msg = 'The traverse window closed. On the Moon, daylight and battery are both clocks.';
    }

    window.dispatchEvent(new CustomEvent('ops:done', {
      detail: { distance: Math.round(st.odometer), checkpoints: st.checkpoints, success: st.success, reason: reason }
    }));

    st.reveal = true;
    drawMinimap();
    showOverlay(
      '<div class="ov-kicker">' + kicker + '</div>' +
      '<h2>' + title + '</h2>' +
      '<p>' + msg + '</p>' +
      '<div class="ov-stats">' +
        '<div><span>Distance</span><b>' + Math.round(st.odometer) + ' m</b></div>' +
        '<div><span>Checkpoints</span><b>' + st.checkpoints + '/3</b></div>' +
        '<div><span>Power left</span><b>' + Math.round(st.power) + '%</b></div>' +
      '</div>' +
      '<p class="ov-note">The map now shows every rock and shadow. Compare your trail with the graded corridor.</p>' +
      '<div class="ov-actions">' +
        '<button class="btn primary" data-act="again">Drive again</button>' +
        '<button class="btn ghost" data-act="recon">Next: plan a route</button>' +
        '<button class="btn ghost" data-act="close">Stay on the map</button>' +
      '</div>',
      st.success ? 'win' : 'fail'
    );
  }

  /* -------------------------------------------------------------- overlay */
  function showOverlay(html, kind) {
    if (!els.overlay) return;
    els.overlay.hidden = false;
    els.overlayCard.className = 'overlay-card' + (kind ? ' ' + kind : '');
    els.overlayCard.innerHTML = html;
    Array.prototype.forEach.call(els.overlayCard.querySelectorAll('[data-act]'), function (b) {
      b.addEventListener('click', function () {
        var act = b.dataset.act;
        if (act === 'again') resetRun();
        else if (act === 'recon') { if (global.App) global.App.go('recon'); }
        else if (act === 'close') hideOverlay();
        else if (act === 'start') startRun();
      });
    });
  }
  function hideOverlay() { if (els.overlay) els.overlay.hidden = true; }

  function showIntro() {
    showOverlay(
      '<div class="ov-kicker">Mission 04-A · Station Echo</div>' +
      '<h2>Drive to Station Echo</h2>' +
      '<p>Pick a direction. The rover moves 36 m. You cannot see the whole map.</p>' +
      '<div class="ov-chips"><span>Power</span><span>Heat</span><span>Wheels</span><span>Signal</span></div>' +
      '<div class="ov-actions">' +
        '<button class="btn primary" data-act="start">Start driving</button>' +
        '<button class="btn ghost" data-act="close">Look around first</button>' +
      '</div>'
    );
    if (els.cmdQ) els.cmdQ.textContent = 'Press Start to begin.';
    renderIdleOptions('Press Start to begin the traverse.');
  }

  /* ---------------------------------------------------------------- misc */
  function toast(msg) {
    if (global.App && global.App.toast) { global.App.toast(msg); return; }
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  function resize() {
    if (!G.ready) return;
    var host = els.stage;
    var w = host ? host.clientWidth : 0;
    var h = host ? host.clientHeight : 0;
    if (!w || !h) return;
    G.renderer.setSize(w, h, false);
    G.camera.aspect = w / h;
    G.camera.updateProjectionMatrix();
  }

  function frame() {
    raf = requestAnimationFrame(frame);
    if (!G.ready) return;
    var dt = Math.min(0.05, G.clock.getDelta());
    var t = G.clock.elapsedTime;

    if (st.started && !st.ended) stepSequence(dt);
    else placeRover(dt, false);

    // rover idle animation
    if (G.rover) {
      var speed = seq && seq.phase === 'drive' ? 1 : 0;
      if (!speed) steerWheels(0);
      var bob = speed ? Math.sin(t * 18) * 0.012 : Math.sin(t * 1.4) * 0.004;
      G.rover.position.y += bob;
      if (G.steerWheels[0]) G.steerWheels[0].rotation.y *= 0.9;
    }

    // sun, sky and fill light
    var rx = st.x * CELL, rz = st.y * CELL, ry = heightWorld(rx, rz);
    G.sun.position.set(rx + sunDir.x * 110, ry + sunDir.y * 110, rz + sunDir.z * 110);
    G.sun.target.position.set(rx, ry, rz);
    G.fill.position.copy(G.camera.position);
    G.fill.target.position.set(rx, ry, rz);

    G.stars.position.copy(G.camera.position);
    G.earth.position.copy(G.camera.position).addScaledVector(earthDir, 1500);
    G.earthGlow.position.copy(G.earth.position);
    G.sunSprite.position.copy(G.camera.position).addScaledVector(sunDir, 1200);
    G.sunCore.position.copy(G.sunSprite.position);
    G.earth.rotation.y += dt * 0.002;

    // stations breathe a little
    G.stations.forEach(function (b, i) {
      if (!b) return;
      b.orb.position.y = 10.8 + Math.sin(t * 1.2 + i) * 0.25;
      b.ring.rotation.z += dt * (b.done ? 0.18 : 0.06);
    });

    updateDust(dt);
    updateScan(dt);
    G.renderer.render(G.scene, G.camera);

    if (t - lastHud > 0.12) {
      lastHud = t;
      updateHUD();
    }
  }

  function startLoop() {
    if (raf || !G.ready) return;
    G.clock.getDelta();
    raf = requestAnimationFrame(frame);
  }
  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  /* ----------------------------------------------------------------- init */
  function cache() {
    els.cam = document.getElementById('cam');
    els.stage = document.getElementById('ops-stage');
    els.opts = document.getElementById('opts');
    els.cmdQ = document.getElementById('cmd-q');
    els.log = document.getElementById('log');
    els.minimap = document.getElementById('minimap');
    els.mapPanel = document.getElementById('map-panel');
    els.overlay = document.getElementById('ops-overlay');
    els.overlayCard = document.getElementById('overlay-card');
    els.btnMap = document.getElementById('btn-map');
    els.btnReveal = document.getElementById('btn-reveal');
    els.btnAuto = document.getElementById('btn-autonav');
    els.hudStage = document.getElementById('hud-stage');
    els.hudDist = document.getElementById('hud-dist');
    els.hudTurn = document.getElementById('hud-turn');
    els.barPower = document.querySelector('[data-bar="power"]');
    els.barHeat = document.querySelector('[data-bar="heat"]');
    els.barWheels = document.querySelector('[data-bar="wheels"]');
    els.barSignal = document.querySelector('[data-bar="signal"]');
    ['power', 'heat', 'wheels', 'signal'].forEach(function (name) {
      var cap = name.charAt(0).toUpperCase() + name.slice(1);
      els['fill' + cap] = document.getElementById('fill-' + name);
      els['val' + cap] = document.getElementById('val-' + name);
    });
    // setBar uses lowercase keys for the wrappers already cached above
    els.fillpower = els.fillPower;
    els.fillheat = els.fillHeat;
    els.fillwheels = els.fillWheels;
    els.fillsignal = els.fillSignal;
    els.valpower = els.valPower;
    els.valheat = els.valHeat;
    els.valwheels = els.valWheels;
    els.valsignal = els.valSignal;
  }

  function setBarLower(name, value, max, label) {
    // case-insensitive bridge to the cached elements
    var cap = name.charAt(0).toUpperCase() + name.slice(1);
    var fill = els['fill' + cap] || document.getElementById('fill-' + name);
    var val = els['val' + cap] || document.getElementById('val-' + name);
    var wrap = document.querySelector('[data-bar="' + name + '"]');
    if (!fill || !val) return;
    var pct = Core.clamp(value / max, 0, 1);
    fill.style.width = (pct * 100) + '%';
    val.textContent = label;
    if (wrap) {
      wrap.classList.toggle('warn', pct < 0.45 && pct >= 0.2);
      wrap.classList.toggle('danger', pct < 0.2);
    }
  }

  // replace the temporary setBar with the lower-case bridge
  setBar = setBarLower;

  function init() {
    cache();
    freshState();
    map = buildMap(st.runIndex + 1);
    st.startH = heightWorld(st.x * CELL, st.y * CELL);
    if (!initThree()) {
      if (els.stage) {
        els.stage.classList.add('no-webgl');
        var msg = document.createElement('div');
        msg.className = 'webgl-fallback';
        msg.innerHTML = '<h2>3D view unavailable</h2><p>This browser could not start WebGL. You can still choose headings and play the mission.</p>';
        els.stage.appendChild(msg);
      }
    }
    renderLog();
    updateHUD();
    drawMinimap();
    renderIdleOptions('Press Start to begin.');

    if (els.btnMap) {
      els.btnMap.addEventListener('click', function () {
        var open = els.mapPanel.hidden;
        els.mapPanel.hidden = !open;
        els.btnMap.setAttribute('aria-pressed', open ? 'true' : 'false');
        if (open) drawMinimap();
      });
    }
    if (els.btnReveal) {
      els.btnReveal.addEventListener('click', function () {
        st.reveal = !st.reveal;
        els.btnReveal.setAttribute('aria-pressed', st.reveal ? 'true' : 'false');
        drawMinimap();
      });
    }
    document.getElementById('btn-scan').addEventListener('click', scan);
    document.getElementById('btn-reverse').addEventListener('click', reverse);
    document.getElementById('btn-restart').addEventListener('click', function () { resetRun(); });
    if (els.btnAuto) els.btnAuto.addEventListener('click', autoNav);

    document.addEventListener('keydown', function (e) {
      var view = document.getElementById('view-drive');
      if (!view || !view.classList.contains('active')) return;
      if (e.target && /input|textarea/i.test(e.target.tagName)) return;
      if (els.overlay && !els.overlay.hidden) return;
      if (/^[1-3]$/.test(e.key) && !seq) choose(parseInt(e.key, 10) - 1);
      if (e.key.toLowerCase() === 's') scan();
      if (e.key.toLowerCase() === 'r') reverse();
      if (e.key.toLowerCase() === 'm' && els.btnMap) els.btnMap.click();
    });

    global.addEventListener('resize', function () {
      var view = document.getElementById('view-drive');
      if (view && view.classList.contains('active')) resize();
    });
  }

  function resetRun() {
    var runs = Core.store.get('runs', 0);
    freshState();
    st.runIndex = runs;
    map = buildMap(st.runIndex + 1);
    st.startH = heightWorld(st.x * CELL, st.y * CELL);
    st.reveal = document.body.classList.contains('teacher');
    st.started = true;
    st.running = true;
    hideOverlay();
    els.log.innerHTML = '';
    log('Mission 04-A · traverse to Station Echo', 'sys');
    log('New hazard field · same ' + TOTAL_M + ' m graded route', 'sys');
    revealAround(5);
    rebuildWorld();
    placeRover(0, true);
    beginTurn();
    drawMinimap();
  }

  global.Ops = {
    init: init,
    onEnter: function () {
      active = true;
      resize();
      startLoop();
      if (!st.started) {
        if (els.overlay && els.overlay.hidden) showIntro();
      } else if (!st.ended) {
        updateHUD();
        drawMinimap();
      }
    },
    onLeave: function () {
      active = false;
      stopLoop();
    },
    reset: function () {
      Core.store.set('runs', 0);
      freshState();
      map = buildMap(st.runIndex + 1);
      st.startH = heightWorld(st.x * CELL, st.y * CELL);
      hideOverlay();
      els.log.innerHTML = '';
      renderLog();
      updateHUD();
      drawMinimap();
      renderIdleOptions('Press Start to begin.');
      if (G.ready) {
        rebuildWorld();
        placeRover(0, true);
        resize();
      }
      showIntro();
    },
    isStarted: function () { return st.started; },
    setReveal: function (on) {
      st.reveal = !!on;
      if (els.btnReveal) els.btnReveal.setAttribute('aria-pressed', st.reveal ? 'true' : 'false');
      if (els.mapPanel && on) {
        els.mapPanel.hidden = false;
        if (els.btnMap) els.btnMap.setAttribute('aria-pressed', 'true');
      }
      updateHUD();
      drawMinimap();
    },
    getStats: function () {
      return { distance: Math.round(st.odometer), checkpoints: st.checkpoints, success: st.success, started: st.started };
    }
  };
})(window);
