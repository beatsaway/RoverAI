/* =========================================================================
   core.js — shared maths, seeded noise, lunar terrain synthesis, pathfinding
   Used by the starter quiz, the rover game and the satellite route planner.
   No dependencies. Runs in the browser and in Node (for build-time checks).
   ========================================================================= */
(function (global) {
  'use strict';

  var clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var smoothstep = function (t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  var rad = function (d) { return d * Math.PI / 180; };
  var deg = function (r) { return r * 180 / Math.PI; };
  var TAU = Math.PI * 2;

  /* ---- deterministic pseudo random -------------------------------------- */
  function rng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash2(x, y, seed) {
    var h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function noise2(x, y, seed) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
    var c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
    return lerp(lerp(a, b, u), lerp(c, d, u), v) * 2 - 1;
  }

  function fbm(x, y, seed, oct, lac, gain) {
    oct = oct || 5; lac = lac || 2.0; gain = gain || 0.5;
    var sum = 0, amp = 0.5, norm = 0, f = 1;
    for (var i = 0; i < oct; i++) {
      sum += noise2(x * f, y * f, seed + i * 101) * amp;
      norm += amp; amp *= gain; f *= lac;
    }
    return sum / norm;
  }

  /* ---- geometry --------------------------------------------------------- */
  function closestOnSegment(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var len2 = dx * dx + dy * dy;
    var t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    t = clamp(t, 0, 1);
    var x = ax + dx * t, y = ay + dy * t;
    return { d: Math.hypot(px - x, py - y), x: x, y: y, t: t };
  }

  // nearest point on a polyline; also returns signed side (-1 / +1)
  function nearestOnPath(px, py, pts) {
    var best = { d: Infinity, x: 0, y: 0, i: 0, sign: 1 };
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      var n = closestOnSegment(px, py, a[0], a[1], b[0], b[1]);
      if (n.d < best.d) {
        best.d = n.d; best.x = n.x; best.y = n.y; best.i = i;
        var cross = (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]);
        best.sign = cross >= 0 ? 1 : -1;
      }
    }
    return best;
  }

  function pathLength(pts) {
    var L = 0;
    for (var i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return L;
  }

  /* ---- terrain ---------------------------------------------------------- */
  /* spec: { seed, w, h, cell, baseAmp, baseFreq, rough, craters[], rille,
             scarp, sun:{az,el}, boulders, dust } */
  function buildTerrain(spec) {
    var w = spec.w, h = spec.h, cell = spec.cell || 10;
    var height = new Float32Array(w * h);
    var baseFreq = spec.baseFreq || 0.035;
    var amp = spec.baseAmp == null ? 14 : spec.baseAmp;
    var rough = spec.rough == null ? 1.6 : spec.rough;
    var x, y, i;

    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = y * w + x;
        var v = fbm(x * baseFreq, y * baseFreq, spec.seed, 5, 2.0, 0.5) * amp;
        v += fbm(x * baseFreq * 4.3 + 17, y * baseFreq * 4.3 + 5, spec.seed + 91, 3, 2.1, 0.5) * rough;
        height[i] = v;
      }
    }

    // impact craters: bowl + raised rim
    (spec.craters || []).forEach(function (c) {
      var span = Math.ceil(c.r * 1.8);
      var x0 = Math.max(0, Math.floor(c.x - span)), x1 = Math.min(w - 1, Math.ceil(c.x + span));
      var y0 = Math.max(0, Math.floor(c.y - span)), y1 = Math.min(h - 1, Math.ceil(c.y + span));
      for (var yy = y0; yy <= y1; yy++) {
        for (var xx = x0; xx <= x1; xx++) {
          var d = Math.hypot(xx - c.x, yy - c.y);
          var t = d / c.r;
          var dh = 0;
          if (t < 1) dh -= c.depth * Math.pow(1 - t * t, 0.72);
          var rim = (c.rim == null ? 0.22 : c.rim) * c.depth;
          dh += rim * Math.exp(-Math.pow((d - c.r) / (c.r * 0.16 + 0.4), 2));
          height[yy * w + xx] += dh;
        }
      }
    });

    // sinuous rille / canyon
    if (spec.rille && spec.rille.path && spec.rille.path.length > 1) {
      var R = spec.rille;
      for (y = 0; y < h; y++) {
        for (x = 0; x < w; x++) {
          var n = nearestOnPath(x, y, R.path);
          var t2 = n.d / R.width;
          if (t2 < 2.4) {
            var dh2 = 0;
            if (t2 < 1) dh2 -= R.depth * Math.pow(1 - t2 * t2, 0.55);
            dh2 += R.depth * 0.14 * Math.exp(-Math.pow((n.d - R.width) / (R.width * 0.3), 2));
            height[y * w + x] += dh2;
          }
        }
      }
    }

    // long ridge — must be driven around, not over
    if (spec.ridge && spec.ridge.path && spec.ridge.path.length > 1) {
      var Rg = spec.ridge;
      for (y = 0; y < h; y++) {
        for (x = 0; x < w; x++) {
          var nr = nearestOnPath(x, y, Rg.path);
          if (nr.d < Rg.width * 3.2) {
            height[y * w + x] += Rg.height * Math.exp(-Math.pow(nr.d / Rg.width, 2));
          }
        }
      }
    }

    // scarp / fault step
    if (spec.scarp && spec.scarp.path && spec.scarp.path.length > 1) {
      var S = spec.scarp;
      for (y = 0; y < h; y++) {
        for (x = 0; x < w; x++) {
          var ns = nearestOnPath(x, y, S.path);
          var side = ns.sign * (S.dir || 1);
          var step = smoothstep(0.5 + side * (0.5 + ns.d / S.width)) * 2 - 1;
          var env = Math.exp(-Math.pow(ns.d / (S.width * 2.2), 2));
          height[y * w + x] += S.height * step * env;
        }
      }
    }

    var terrain = {
      w: w, h: h, cell: cell,
      height: height,
      slope: new Float32Array(w * h),
      shadow: new Uint8Array(w * h),
      rock: new Uint8Array(w * h),      // 0 none, 1 small, 2 boulder
      dust: new Uint8Array(w * h),
      sun: spec.sun || { az: 120, el: 14 }
    };

    // boulders — placed on walkable ground, never on very steep walls
    var rockCount = spec.boulders == null ? 70 : spec.boulders;
    var rand = rng(spec.seed + 4242);
    var placed = 0, guard = 0;
    while (placed < rockCount && guard < rockCount * 60) {
      guard++;
      var bx = 2 + Math.floor(rand() * (w - 4));
      var by = 2 + Math.floor(rand() * (h - 4));
      // small clusters
      var cluster = rand() < 0.45 ? 1 : 0;
      for (var k = 0; k < (cluster ? 5 : 1); k++) {
        var cx = clamp(bx + Math.round((rand() - 0.5) * 7), 1, w - 2);
        var cy = clamp(by + Math.round((rand() - 0.5) * 7), 1, h - 2);
        var idx = cy * w + cx;
        if (terrain.rock[idx]) continue;
        // rough first-pass slope test using neighbours
        var gx = height[cy * w + cx + 1] - height[cy * w + cx - 1];
        var gy = height[(cy + 1) * w + cx] - height[(cy - 1) * w + cx];
        if (Math.hypot(gx, gy) / (2 * cell) > 0.32) continue;
        terrain.rock[idx] = rand() < 0.35 ? 2 : 1;
        height[idx] += (terrain.rock[idx] === 2 ? 1.8 : 0.5) + rand() * 1.4;
        placed++;
      }
    }

    // ejecta boulders ringing crater rims
    (spec.craters || []).forEach(function (c) {
      var rand2 = rng(spec.seed + Math.round(c.x * 97 + c.y * 13));
      var count = Math.min(26, Math.round(c.r * 1.4));
      for (var k = 0; k < count; k++) {
        var ang = rand2() * TAU;
        var rr = c.r * (1.02 + rand2() * 0.55);
        var px = Math.round(c.x + Math.cos(ang) * rr);
        var py = Math.round(c.y + Math.sin(ang) * rr);
        if (px < 1 || py < 1 || px >= w - 1 || py >= h - 1) continue;
        var ii = py * w + px;
        if (terrain.rock[ii]) continue;
        terrain.rock[ii] = rand2() < 0.3 ? 2 : 1;
        height[ii] += 0.4 + rand2() * 1.2;
      }
    });

    // dust: fine regolith ponds in low, flat ground
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = y * w + x;
        var n2 = fbm(x * 0.055 + 30, y * 0.055 + 12, spec.seed + 7, 3, 2, 0.5);
        if (n2 > 0.22) terrain.dust[i] = 1;
      }
    }

    recomputeSlope(terrain);

    // fine dust only on flat ground
    for (i = 0; i < w * h; i++) if (terrain.slope[i] > 9) terrain.dust[i] = 0;

    computeShadow(terrain, terrain.sun.az, terrain.sun.el);

    terrain.minH = Infinity; terrain.maxH = -Infinity;
    for (i = 0; i < w * h; i++) {
      if (height[i] < terrain.minH) terrain.minH = height[i];
      if (height[i] > terrain.maxH) terrain.maxH = height[i];
    }
    return terrain;
  }

  function recomputeSlope(t) {
    var w = t.w, h = t.h, cell = t.cell, H = t.height, S = t.slope;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var xl = x > 0 ? x - 1 : x, xr = x < w - 1 ? x + 1 : x;
        var yl = y > 0 ? y - 1 : y, yr = y < h - 1 ? y + 1 : y;
        var gx = (H[y * w + xr] - H[y * w + xl]) / ((xr - xl) * cell);
        var gy = (H[yr * w + x] - H[yl * w + x]) / ((yr - yl) * cell);
        S[y * w + x] = deg(Math.atan(Math.hypot(gx, gy)));
      }
    }
  }

  function computeShadow(t, sunAz, sunEl) {
    var w = t.w, h = t.h, H = t.height, cell = t.cell;
    var az = rad(sunAz), el = rad(sunEl);
    var sx = Math.sin(az), sy = -Math.cos(az);
    var tanEl = Math.tan(el);
    var maxSteps = 110;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var i = y * w + x, blocked = 0, base = H[i];
        for (var s = 3; s <= maxSteps; s += 3) {
          var px = Math.round(x + sx * s), py = Math.round(y + sy * s);
          if (px < 0 || py < 0 || px >= w || py >= h) break;
          var rise = H[py * w + px] - base;
          if (rise > 0 && rise / (s * cell) > tanEl) { blocked = 1; break; }
        }
        t.shadow[i] = blocked;
      }
    }
  }

  /* height at fractional cell coords (bilinear) */
  function heightAt(t, x, y) {
    var w = t.w, h = t.h;
    x = clamp(x, 0, w - 1.001); y = clamp(y, 0, h - 1.001);
    var x0 = Math.floor(x), y0 = Math.floor(y);
    var x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
    var fx = x - x0, fy = y - y0;
    var a = t.height[y0 * w + x0], b = t.height[y0 * w + x1];
    var c = t.height[y1 * w + x0], d = t.height[y1 * w + x1];
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
  }

  function cellAt(t, x, y) {
    var cx = clamp(Math.round(x), 0, t.w - 1), cy = clamp(Math.round(y), 0, t.h - 1);
    return cy * t.w + cx;
  }

  /* carve a graded corridor (used by the driving game to guarantee progress) */
  function carveCorridor(t, path, radius, softness, blend) {
    var w = t.w, h = t.h;
    blend = blend == null ? 0.92 : blend;
    var target = new Float32Array(w * h);
    var weight = new Float32Array(w * h);
    var x, y, i;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        var n = nearestOnPath(x, y, path);
        i = y * w + x;
        target[i] = heightAt(t, n.x, n.y);
        weight[i] = 1 - smoothstep((n.d - radius) / (softness || 6));
        if (n.d > radius + (softness || 6)) weight[i] = 0;
      }
    }
    // smooth the target heights along the corridor so it grades gently
    for (var pass = 0; pass < 2; pass++) {
      var copy = new Float32Array(target);
      for (y = 1; y < h - 1; y++) {
        for (x = 1; x < w - 1; x++) {
          i = y * w + x;
          if (weight[i] <= 0) continue;
          target[i] = (copy[i] * 4 + copy[i - 1] + copy[i + 1] + copy[i - w] + copy[i + w]) / 8;
        }
      }
    }
    for (i = 0; i < w * h; i++) {
      if (weight[i] > 0) {
        t.height[i] = lerp(t.height[i], target[i], weight[i] * blend);
        t.rock[i] = 0;
        if (weight[i] > 0.55) t.dust[i] = 0;
      }
    }
    // clear boulders that sit on the corridor
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        if (weight[y * w + x] > 0.35) t.rock[y * w + x] = 0;
      }
    }
    recomputeSlope(t);
    return t;
  }

  /* ---- A* over the terrain ---------------------------------------------- */
  function Heap() { this.a = []; }
  Heap.prototype.push = function (node) {
    var a = this.a; a.push(node);
    var i = a.length - 1;
    while (i > 0) {
      var p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      var tmp = a[p]; a[p] = a[i]; a[i] = tmp; i = p;
    }
  };
  Heap.prototype.pop = function () {
    var a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      var i = 0;
      for (;;) {
        var l = i * 2 + 1, r = l + 1, m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        var tmp = a[m]; a[m] = a[i]; a[i] = tmp; i = m;
      }
    }
    return top;
  };

  function astar(t, start, goal, opt) {
    opt = opt || {};
    var limit = opt.limit == null ? 28 : opt.limit;
    var slopeW = opt.slopeWeight == null ? 7 : opt.slopeWeight;
    var avoidRock = opt.avoidRock !== false;
    var psrCost = opt.psrCost == null ? 14 : opt.psrCost;
    var w = t.w, h = t.h;
    var n = w * h;
    var g = new Float32Array(n).fill(Infinity);
    var came = new Int32Array(n).fill(-1);
    var seen = new Uint8Array(n);
    var sx = clamp(Math.round(start[0]), 0, w - 1), sy = clamp(Math.round(start[1]), 0, h - 1);
    var gx = clamp(Math.round(goal[0]), 0, w - 1), gy = clamp(Math.round(goal[1]), 0, h - 1);
    var sIdx = sy * w + sx;
    var heap = new Heap();
    g[sIdx] = 0;
    heap.push({ i: sIdx, f: 0 });
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    var guard = 0;
    while (heap.a.length && guard++ < 200000) {
      var cur = heap.pop();
      if (seen[cur.i]) continue;
      seen[cur.i] = 1;
      if (cur.i === gy * w + gx) break;
      var cx = cur.i % w, cy = (cur.i - cx) / w;
      for (var d = 0; d < 8; d++) {
        var nx = cx + dirs[d][0], ny = cy + dirs[d][1];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        var ni = ny * w + nx;
        if (seen[ni]) continue;
        var sl = t.slope[ni];
        if (sl > limit) continue;
        if (avoidRock && t.rock[ni] === 2) continue;
        // Do not let a diagonal move cut a corner that the rover could not
        // physically drive through. Without this, routes can squeeze between
        // two steep cells and look safe while crossing the rim between them.
        if (d >= 4) {
          if (t.slope[cy * w + nx] > limit || t.slope[ny * w + cx] > limit) continue;
        }
        var stepLen = (d < 4) ? 1 : Math.SQRT2;
        var c = stepLen * (1 + slopeW * Math.pow(sl / 15, 2));
        if (t.rock[ni] === 1) c += 2.5;
        if (t.shadow[ni]) c += psrCost;
        if (t.dust[ni]) c += 0.7;
        var ng = g[cur.i] + c;
        if (ng < g[ni]) {
          g[ni] = ng; came[ni] = cur.i;
          var hx = Math.abs(nx - gx), hy = Math.abs(ny - gy);
          heap.push({ i: ni, f: ng + (hx + hy - 0.41 * Math.min(hx, hy)) * 1.05 });
        }
      }
    }
    if (came[gy * w + gx] === -1 && (gy * w + gx) !== sIdx) return null;
    var path = [];
    var ci = gy * w + gx;
    while (ci !== -1) {
      path.push([ci % w, Math.floor(ci / w)]);
      if (ci === sIdx) break;
      ci = came[ci];
    }
    path.reverse();
    return path;
  }

  /* chaikin smoothing for display */
  function smoothPath(pts, iterations) {
    var out = pts.slice();
    for (var k = 0; k < (iterations || 2); k++) {
      if (out.length < 3) break;
      var next = [out[0]];
      for (var i = 0; i < out.length - 1; i++) {
        var a = out[i], b = out[i + 1];
        next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
        next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      next.push(out[out.length - 1]);
      out = next;
    }
    return out;
  }

  function fmt(n, dp) {
    dp = dp == null ? 0 : dp;
    return (Math.round(n * Math.pow(10, dp)) / Math.pow(10, dp)).toFixed(dp);
  }

  /* localStorage wrapper — progress survives a page reload */
  var store = {
    get: function (key, fallback) {
      try {
        var raw = global.localStorage && global.localStorage.getItem('dtm.' + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try {
        global.localStorage && global.localStorage.setItem('dtm.' + key, JSON.stringify(value));
      } catch (e) { /* private mode — lesson still works */ }
    },
    clear: function () {
      try {
        if (!global.localStorage) return;
        Object.keys(global.localStorage)
          .filter(function (k) { return k.indexOf('dtm.') === 0; })
          .forEach(function (k) { global.localStorage.removeItem(k); });
      } catch (e) {}
    }
  };

  var Core = {
    TAU: TAU,
    clamp: clamp, lerp: lerp, smoothstep: smoothstep, rad: rad, deg: deg,
    rng: rng, hash2: hash2, noise2: noise2, fbm: fbm,
    nearestOnPath: nearestOnPath, pathLength: pathLength,
    buildTerrain: buildTerrain, recomputeSlope: recomputeSlope,
    computeShadow: computeShadow, heightAt: heightAt, cellAt: cellAt,
    carveCorridor: carveCorridor, astar: astar, smoothPath: smoothPath, fmt: fmt,
    store: store
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  global.Core = Core;
})(typeof window !== 'undefined' ? window : globalThis);
