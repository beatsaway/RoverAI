/* =========================================================================
   sites.js — the three survey sites used in the satellite recon section
   Each site is a synthetic but physically-shaped lunar landscape built from
   the same height/slope/shadow layers real missions use (LOLA, LROC, SLDEM).
   ========================================================================= */
(function (global) {
  'use strict';
  var Core = global.Core || (typeof require === 'function' ? require('./core.js') : null);

  var SITES = [
    {
      id: 'craters',
      code: 'SITE 04',
      name: 'Crater field',
      tagline: 'Every crater is a bowl with a boulder ring.',
      image: 'assets/img/site-ridge.jpg',
      imageAlt: 'Orbital image of a cratered lunar surface',
      brief: 'A flat-looking plain with a chain of impact craters. The checkpoint sits beyond the big crater at the centre.',
      danger: 'Crater rims reach 30°+. Boulders thrown out by impacts cluster around every rim.',
      challenge: 'Slope + boulders',
      landing: [16, 108],
      target: [110, 24],
      spec: {
        seed: 20481, w: 128, h: 128, cell: 10,
        baseAmp: 15, baseFreq: 0.028, rough: 1.9, boulders: 130,
        sun: { az: 108, el: 15 },
        craters: [
          { x: 44, y: 44, r: 14, depth: 26 },
          { x: 68, y: 82, r: 21, depth: 44 },
          { x: 92, y: 54, r: 11, depth: 18 },
          { x: 32, y: 96, r: 9, depth: 14 },
          { x: 80, y: 20, r: 8, depth: 12 },
          { x: 108, y: 100, r: 13, depth: 22 },
          { x: 54, y: 66, r: 6, depth: 8 },
          { x: 24, y: 58, r: 5, depth: 6 }
        ]
      }
    },
    {
      id: 'rille',
      code: 'SITE 07',
      name: 'Sinuous rille',
      tagline: 'A canyon with no bridge — except where it pinches out.',
      image: 'assets/img/site-rille.jpg',
      imageAlt: 'Orbital image of a sinuous rille on the Moon',
      brief: 'A collapsed lava channel cuts the site in two. The checkpoint is on the far side, north-east.',
      danger: 'Walls are 45°+ and collapse without warning. Only the saddle at the south is crossable.',
      challenge: 'Cliff + detour',
      landing: [16, 62],
      target: [116, 28],
      spec: {
        seed: 8807, w: 128, h: 128, cell: 10,
        baseAmp: 12, baseFreq: 0.03, rough: 1.5, boulders: 85,
        sun: { az: 95, el: 13 },
        rille: {
          width: 5.5, depth: 52,
          path: [[98, 0], [104, 20], [96, 40], [100, 52]],
          second: [[99, 66], [90, 90], [95, 127]]
        },
        craters: [
          { x: 40, y: 22, r: 10, depth: 16 },
          { x: 52, y: 96, r: 12, depth: 20 },
          { x: 112, y: 88, r: 9, depth: 14 },
          { x: 30, y: 76, r: 7, depth: 9 }
        ]
      }
    },
    {
      id: 'ridge',
      code: 'SITE 11',
      name: 'Fault ridge',
      tagline: 'The shortest line goes straight over a 40 m wall.',
      image: 'assets/img/site-tycho.jpg',
      imageAlt: 'Oblique orbital image of a lunar mountain ridge',
      brief: 'A long fault ridge blocks the direct line east. The checkpoint is behind it, on the far side.',
      danger: 'The ridge face is far too steep to climb. You must find the low pass at its southern end.',
      challenge: 'Obstacle + long shadow',
      landing: [20, 26],
      target: [112, 36],
      spec: {
        seed: 4471, w: 128, h: 128, cell: 10,
        baseAmp: 13, baseFreq: 0.031, rough: 1.6, boulders: 95,
        sun: { az: 250, el: 12 },
        ridge: { path: [[62, 0], [66, 30], [60, 60], [67, 88]], width: 5, height: 42 },
        craters: [
          { x: 34, y: 88, r: 9, depth: 13 },
          { x: 92, y: 18, r: 7, depth: 10 },
          { x: 100, y: 96, r: 11, depth: 16 },
          { x: 24, y: 56, r: 6, depth: 8 }
        ]
      }
    }
  ];

  function snapToSafe(t, pt) {
    var best = null, bestScore = Infinity;
    for (var dy = -6; dy <= 6; dy++) {
      for (var dx = -6; dx <= 6; dx++) {
        var x = Math.round(pt[0]) + dx, y = Math.round(pt[1]) + dy;
        if (x < 2 || y < 2 || x >= t.w - 2 || y >= t.h - 2) continue;
        var i = y * t.w + x;
        var score = t.slope[i] * 2 + (t.rock[i] ? 40 : 0) + (t.shadow[i] ? 18 : 0) + Math.hypot(dx, dy) * 1.5;
        if (score < bestScore) { bestScore = score; best = [x, y]; }
      }
    }
    return best || pt;
  }

  function build(id) {
    var site = SITES.filter(function (s) { return s.id === id; })[0] || SITES[0];
    var spec = JSON.parse(JSON.stringify(site.spec));
    var t = Core.buildTerrain(spec);
    if (spec.rille && spec.rille.second) {
      // build the second rille segment into the same height field
      var second = { rille: { path: spec.rille.second, width: spec.rille.width, depth: spec.rille.depth } };
      var t2 = Core.buildTerrain({
        seed: spec.seed + 13, w: t.w, h: t.h, cell: t.cell,
        baseAmp: 0, baseFreq: 0.03, rough: 0, boulders: 0, sun: t.sun, rille: second.rille
      });
      for (var i = 0; i < t.height.length; i++) {
        // only add the negative part of the second channel
        var dh = t2.height[i];
        if (dh < 0) t.height[i] += dh;
      }
      Core.recomputeSlope(t);
      Core.computeShadow(t, t.sun.az, t.sun.el);
    }
    var landing = snapToSafe(t, site.landing);
    var target = snapToSafe(t, site.target);
    var built = {
      id: site.id, code: site.code, name: site.name, tagline: site.tagline,
      image: site.image, imageAlt: site.imageAlt, brief: site.brief,
      danger: site.danger, challenge: site.challenge,
      terrain: t, landing: landing, target: target
    };
    return built;
  }

  var Sites = { list: SITES, build: build, snapToSafe: snapToSafe };
  if (typeof module !== 'undefined' && module.exports) module.exports = Sites;
  global.Sites = Sites;
})(typeof window !== 'undefined' ? window : globalThis);
