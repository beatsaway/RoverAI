/* =========================================================================
   terrainview.js — lightweight 3D terrain viewer built on three.js
   Height field in, shaded mesh out. Orbit / zoom, three colour layers,
   landing + target markers, and a route ribbon that follows the surface.
   ========================================================================= */
(function (global) {
  'use strict';

  var COL = {
    green: [0.12, 0.34, 0.23],
    amber: [0.52, 0.34, 0.10],
    red: [0.50, 0.17, 0.13],
    psr: [0.27, 0.23, 0.42]
  };

  function TerrainView(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x05080d, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x05080d, 0.00022);

    this.camera = new THREE.PerspectiveCamera(45, 1.6, 1, 200000);
    this.camera.up.set(0, 1, 0);

    this.hemi = new THREE.HemisphereLight(0xe4eefc, 0x141c28, 0.75);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff4e2, 1.15);
    this.sun.position.set(1, 0.5, 1);
    this.scene.add(this.sun);

    this.fill = new THREE.DirectionalLight(0x9fc3e8, 0.22);
    this.fill.position.set(-1, 0.35, -0.7);
    this.scene.add(this.fill);

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.markers = new THREE.Group();
    this.scene.add(this.markers);

    this.route = null;
    this.roverMark = null;
    this.terrain = null;
    this.layer = 'slope';
    this.mesh = null;
    this.span = 1200;
    this.vertical = 1.45;
    this.autoOrbit = true;
    this.cam = { theta: 0.75, phi: 1.02, radius: 1600 };
    this.lookAtPt = new THREE.Vector3(0, 40, 0);
    this._dragging = false;
    this._moved = 0;
    this._last = { x: 0, y: 0 };
    this._pinch = 0;
    this.onPick = null;

    this._bind();
    this.resize();
    this._running = false;
    this.start();
  }

  TerrainView.prototype.start = function () {
    if (this._running) return;
    this._running = true;
    var self = this;
    (function loop() {
      if (!self._running) return;
      self._raf = requestAnimationFrame(loop);
      self._frame();
    })();
  };

  TerrainView.prototype.pause = function () {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  };

  TerrainView.prototype.resume = function () {
    if (!this.terrain) return;
    this.resize();
    this._frame();
    this.start();
  };

  TerrainView.prototype._bind = function () {
    var self = this;
    var c = this.canvas;

    c.addEventListener('pointerdown', function (e) {
      self._dragging = true;
      self._moved = 0;
      self._last.x = e.clientX;
      self._last.y = e.clientY;
      self.autoOrbit = false;
      c.setPointerCapture && c.setPointerCapture(e.pointerId);
    });

    c.addEventListener('pointermove', function (e) {
      if (!self._dragging) return;
      var dx = e.clientX - self._last.x;
      var dy = e.clientY - self._last.y;
      self._moved += Math.abs(dx) + Math.abs(dy);
      self._last.x = e.clientX;
      self._last.y = e.clientY;
      self.cam.theta -= dx * 0.006;
      self.cam.phi = Math.max(0.09, Math.min(1.45, self.cam.phi + dy * 0.005));
    });

    function up(e) {
      if (!self._dragging) return;
      self._dragging = false;
      if (self._moved < 6 && self.onPick) self._pick(e);
    }
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', function () { self._dragging = false; });

    c.addEventListener('wheel', function (e) {
      e.preventDefault();
      self.autoOrbit = false;
      var k = Math.exp(e.deltaY * 0.0012);
      self.cam.radius = Math.max(self.span * 0.12, Math.min(self.span * 4, self.cam.radius * k));
    }, { passive: false });

    c.addEventListener('touchmove', function (e) {
      if (e.touches.length === 2) {
        var d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        if (self._pinch) {
          self.cam.radius = Math.max(self.span * 0.12, Math.min(self.span * 4, self.cam.radius * (self._pinch / d)));
        }
        self._pinch = d;
      }
    }, { passive: true });
    c.addEventListener('touchend', function () { self._pinch = 0; });
  };

  TerrainView.prototype._pick = function (e) {
    if (!this.mesh || !this.terrain) return;
    var r = this.canvas.getBoundingClientRect();
    var nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    var ny = -((e.clientY - r.top) / r.height) * 2 + 1;
    var ray = new THREE.Raycaster();
    ray.setFromCamera({ x: nx, y: ny }, this.camera);
    var hits = ray.intersectObject(this.mesh);
    if (!hits.length) return;
    var p = hits[0].point;
    var t = this.terrain;
    var halfW = ((t.w - 1) * t.cell) / 2;
    var halfH = ((t.h - 1) * t.cell) / 2;
    var cx = (p.x + halfW) / t.cell;
    var cy = (p.z + halfH) / t.cell;
    cx = Math.max(0, Math.min(t.w - 1, cx));
    cy = Math.max(0, Math.min(t.h - 1, cy));
    this.onPick([cx, cy]);
  };

  TerrainView.prototype.resize = function () {
    var r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.renderer.setSize(r.width, r.height, false);
    this.camera.aspect = r.width / r.height;
    this.camera.updateProjectionMatrix();
  };

  TerrainView.prototype.setTerrain = function (terrain, landing, target) {
    this.terrain = terrain;
    this.landing = landing;
    this.targetPt = target;
    if (this.route) { this.scene.remove(this.route); this.route = null; }
    if (this.roverMark) { this.roverMark.visible = false; }
    var t = terrain;
    var cell = t.cell;
    var W = (t.w - 1) * cell, H = (t.h - 1) * cell;
    this.span = Math.max(W, H);
    this.vscale = Math.max(1.0, Math.min(2.4, this.span / 900));

    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.mesh = null;
    }

    var n = t.w * t.h;
    var pos = new Float32Array(n * 3);
    var i, x, y, k = 0;
    for (y = 0; y < t.h; y++) {
      for (x = 0; x < t.w; x++) {
        i = y * t.w + x;
        pos[k++] = x * cell - W / 2;
        pos[k++] = (t.height[i] - t.minH) * this.vscale;
        pos[k++] = y * cell - H / 2;
      }
    }
    var idx = new Uint32Array((t.w - 1) * (t.h - 1) * 6);
    k = 0;
    for (y = 0; y < t.h - 1; y++) {
      for (x = 0; x < t.w - 1; x++) {
        var a = y * t.w + x, b = a + 1, c = a + t.w, d = c + 1;
        idx[k++] = a; idx[k++] = c; idx[k++] = b;
        idx[k++] = b; idx[k++] = c; idx[k++] = d;
      }
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();

    // make sure normals point up (winding depends on the height field's sign)
    var normals = geo.attributes.normal.array;
    var sumY = 0;
    for (i = 0; i < normals.length; i += 3) sumY += normals[i + 1];
    if (sumY < 0) {
      var flipped = new Uint32Array(idx.length);
      for (i = 0; i < idx.length; i += 3) {
        flipped[i] = idx[i];
        flipped[i + 1] = idx[i + 2];
        flipped[i + 2] = idx[i + 1];
      }
      geo.setIndex(new THREE.BufferAttribute(flipped, 1));
      geo.computeVertexNormals();
    }

    var colors = new Float32Array(n * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    var mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.97, metalness: 0.0, side: THREE.FrontSide
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.group.add(this.mesh);

    this.colors = colors;
    this.applyLayer(this.layer);

    this.sun.position.set(
      Math.sin(Core.rad(t.sun.az)) * 1000,
      Math.sin(Core.rad(t.sun.el)) * 1000 + 300,
      -Math.cos(Core.rad(t.sun.az)) * 1000
    );

    this.setMarkers(landing, target);
    this.frameAll();
    this.resize();
    return this;
  };

  TerrainView.prototype.setMarkers = function (landing, target) {
    while (this.markers.children.length) {
      var c = this.markers.children.pop();
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    }
    if (!landing || !target) return;
    var t = this.terrain;
    var cell = t.cell;
    var W = (t.w - 1) * cell, H = (t.h - 1) * cell;

    var self = this;
    function marker(pt, color, label) {
      var g = new THREE.Group();
      var h = Core.heightAt(t, pt[0], pt[1]);
      var y = (h - t.minH) * self.vscale;
      var ring = new THREE.Mesh(
        new THREE.RingGeometry(14, 22, 40),
        new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide, transparent: true, opacity: 0.95 })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(pt[0] * cell - W / 2, y + 4, pt[1] * cell - H / 2);
      g.add(ring);

      var pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 0.9, 46, 6),
        new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.55 })
      );
      pole.position.set(pt[0] * cell - W / 2, y + 25, pt[1] * cell - H / 2);
      g.add(pole);

      var cap = new THREE.Mesh(
        new THREE.SphereGeometry(4, 12, 10),
        new THREE.MeshBasicMaterial({ color: color })
      );
      cap.position.set(pt[0] * cell - W / 2, y + 48, pt[1] * cell - H / 2);
      g.add(cap);
      return g;
    }

    this.markers.add(marker(landing, 0x6fe4f2));
    this.markers.add(marker(target, 0xffb454));
  };

  TerrainView.prototype.frameAll = function () {
    var t = this.terrain;
    if (!t) return;
    var span = this.span;
    this.lookAtPt.set(0, span * 0.06, 0);
    this.cam.radius = span * 1.05;
  };

  TerrainView.prototype.applyLayer = function (layer) {
    this.layer = layer;
    if (!this.mesh || !this.terrain || !this.colors) return;
    var t = this.terrain;
    var c = this.colors;
    var sunAz = Core.rad(t.sun.az), sunEl = Core.rad(t.sun.el);
    var sx = Math.sin(sunAz) * Math.cos(sunEl);
    var sy = Math.sin(sunEl);
    var sz = -Math.cos(sunAz) * Math.cos(sunEl);

    for (var y = 0; y < t.h; y++) {
      for (var x = 0; x < t.w; x++) {
        var i = y * t.w + x;
        // hillshade from the height gradient
        var xl = x > 0 ? x - 1 : x, xr = x < t.w - 1 ? x + 1 : x;
        var yl = y > 0 ? y - 1 : y, yr = y < t.h - 1 ? y + 1 : y;
        var dhx = (t.height[y * t.w + xr] - t.height[y * t.w + xl]) / ((xr - xl) * t.cell);
        var dhy = (t.height[yr * t.w + x] - t.height[yl * t.w + x]) / ((yr - yl) * t.cell);
        var nx = -dhx, ny = 1, nz = -dhy;
        var nl = Math.hypot(nx, ny, nz) || 1;
        var lit = (nx / nl) * sx + (ny / nl) * sy + (nz / nl) * sz;
        lit = Math.max(0, lit);
        var shade = 0.32 + 0.68 * lit;

        var r, g, b;
        if (layer === 'shadow') {
          if (t.shadow[i]) {
            r = 0.78; g = 0.70; b = 1.0;
          } else {
            var q = 0.13 + shade * 0.22;
            r = q; g = q * 1.02; b = q * 1.12;
          }
        } else if (layer === 'photo') {
          var v = 0.22 + shade * 0.75;
          r = v; g = v * 1.0; b = v * 0.97;
        } else {
          var sl = t.slope[i];
          var base;
          if (sl < 10) base = COL.green;
          else if (sl < 15) base = COL.amber;
          else base = COL.red;
          if (t.shadow[i]) base = COL.psr;
          var s2 = t.shadow[i] ? 0.55 + shade * 0.35 : shade;
          r = base[0] * s2; g = base[1] * s2; b = base[2] * s2;
          // boulders read as dark specks in the slope layer
          if (t.rock[i] === 2) { r *= 0.6; g *= 0.55; b *= 0.55; }
        }
        c[i * 3] = r; c[i * 3 + 1] = g; c[i * 3 + 2] = b;
      }
    }
    this.mesh.geometry.attributes.color.needsUpdate = true;
  };

  TerrainView.prototype.worldPoint = function (pt, lift) {
    var t = this.terrain;
    var cell = t.cell;
    var W = (t.w - 1) * cell, H = (t.h - 1) * cell;
    var h = Core.heightAt(t, pt[0], pt[1]);
    return new THREE.Vector3(
      pt[0] * cell - W / 2,
      (h - t.minH) * this.vscale + (lift || 0),
      pt[1] * cell - H / 2
    );
  };

  TerrainView.prototype.setRoute = function (points) {
    if (this.route) {
      this.scene.remove(this.route);
      this.route.geometry.dispose();
      this.route.material.dispose();
      this.route = null;
    }
    if (!points || points.length < 2 || !this.terrain) return;

    var t = this.terrain;
    var pts = [];
    // resample so the ribbon hugs the surface
    for (var i = 0; i < points.length - 1; i++) {
      var a = points[i], b = points[i + 1];
      var segs = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
      for (var s = 0; s < segs; s++) {
        var u = s / segs;
        var x = Core.lerp(a[0], b[0], u), y = Core.lerp(a[1], b[1], u);
        pts.push(this.worldPoint([x, y], 3));
      }
    }
    pts.push(this.worldPoint(points[points.length - 1], 3));
    var curve = new THREE.CatmullRomCurve3(pts);
    var geo = new THREE.TubeGeometry(curve, Math.min(420, pts.length * 3), Math.max(1.4, t.cell * 0.16), 6, false);
    var mat = new THREE.MeshBasicMaterial({ color: 0x7ff0ff, transparent: true, opacity: 0.95 });
    this.route = new THREE.Mesh(geo, mat);
    this.scene.add(this.route);

    if (!this.roverMark) {
      this.roverMark = new THREE.Mesh(
        new THREE.SphereGeometry(6, 14, 12),
        new THREE.MeshBasicMaterial({ color: 0xffe0a0 })
      );
      this.scene.add(this.roverMark);
    }
    this.roverMark.position.copy(pts[0]);
    this.roverMark.visible = true;
  };

  TerrainView.prototype.setPreset = function (name) {
    if (name === 'top') {
      this.cam.phi = 0.06;
      this.cam.radius = this.span * 0.95;
      this.autoOrbit = false;
    } else if (name === 'approach') {
      this.cam.phi = 1.12;
      this.cam.radius = this.span * 0.72;
      this.autoOrbit = false;
    } else if (name === 'orbit') {
      this.autoOrbit = true;
      this.cam.phi = 1.0;
      this.cam.radius = this.span * 1.0;
    }
  };

  TerrainView.prototype._frame = function () {
    if (!this.terrain) return;
    if (this.autoOrbit) this.cam.theta += 0.0016;
    this.resize();

    var p = this.cam.phi;
    var r = this.cam.radius;
    this.camera.position.set(
      this.lookAtPt.x + r * Math.sin(p) * Math.sin(this.cam.theta),
      this.lookAtPt.y + r * Math.cos(p),
      this.lookAtPt.z + r * Math.sin(p) * Math.cos(this.cam.theta)
    );
    this.camera.lookAt(this.lookAtPt);
    this.camera.far = this.span * 12;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  };

  TerrainView.prototype.setSunAzimuth = function () { /* kept for API symmetry */ };

  global.TerrainView = TerrainView;
})(window);
