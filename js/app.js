/* =========================================================================
   app.js — the lesson shell: view router, progress rail, debrief summary,
   teacher view, reset and image credits. Every other module is a specialist;
   this file is the bit that knows they exist and in what order they run.
   ========================================================================= */
(function (global) {
  'use strict';

  var Core = global.Core;

  var VIEWS = [
    { id: 'brief',   label: 'Start',      name: 'Start' },
    { id: 'starter', label: 'Challenges', name: 'Challenges' },
    { id: 'drive',   label: 'Drive',      name: 'Drive' },
    { id: 'recon',   label: 'Plan',       name: 'Plan' },
    { id: 'debrief', label: 'Debrief',    name: 'Debrief' }
  ];

  /* Real photography, mostly NASA via Wikimedia Commons. Public domain. */
  var CREDITS = [
    { file: 'hero.jpg', title: 'Apollo 17 Moon Panorama', by: 'NASA / Apollo 17 crew' },
    { file: 'rover-slope.jpg', title: 'Lunar Roving Vehicle parked on the slope of Stone Mountain (AS16-107-17473)', by: 'NASA / Apollo 16 crew' },
    { file: 'rover-wheel.jpg', title: 'Makeshift repair of the Lunar Roving Vehicle fender', by: 'NASA / Apollo 17 crew' },
    { file: 'rover-parked.jpg', title: 'Apollo 15 Lunar Rover final resting place', by: 'NASA / Apollo 15 crew' },
    { file: 'no-map.jpg', title: 'An Astronaut’s Snapshot of the Moon (Taurus–Littrow)', by: 'NASA / Apollo 17 crew' },
    { file: 'crater-wall.jpg', title: 'Apollo 15: Hadley Rille edge from Station 9a', by: 'NASA / Apollo 15 crew' },
    { file: 'boulder.jpg', title: 'Apollo 17: Schmitt beside a boulder at Station 6', by: 'NASA / Apollo 17 crew' },
    { file: 'earth.jpg', title: 'Earthrise as seen from the lunar surface', by: 'NASA / Apollo 8 crew' },
    { file: 'shadow-crater.jpg', title: 'Earthrise over Compton crater', by: 'NASA / LRO (LROC)' },
    { file: 'site-ridge.jpg', title: 'Ridge and crater on a fractured lunar floor', by: 'NASA / LRO (LROC)' },
    { file: 'site-rille.jpg', title: 'Sinuous rille in the south of Mons Rümker', by: 'NASA / LRO (LROC)' },
    { file: 'site-tycho.jpg', title: 'Tycho central peak', by: 'NASA / LRO (LROC)' }
  ];

  var el = {};
  var current = null;
  var visited = {};
  var results = {
    quiz: Core.store.get('quiz', null),
    ops: Core.store.get('ops', null),
    recon: Core.store.get('recon', null)
  };
  var teacher = false;
  var reconReady = false;

  function $(id) { return document.getElementById(id); }

  /* ------------------------------------------------------------- chrome */
  function toast(msg) {
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.toast.classList.remove('show'); }, 2400);
  }

  function indexOf(name) {
    for (var i = 0; i < VIEWS.length; i++) if (VIEWS[i].id === name) return i;
    return -1;
  }

  function cleanHash(hash) {
    var h = String(hash || '').replace(/^#/, '');
    if (h.indexOf('view-') === 0) h = h.slice(5);
    return h;
  }

  /* --------------------------------------------------------------- router */
  function go(name, opts) {
    opts = opts || {};
    var idx = indexOf(name);
    if (idx < 0) return;
    if (name === current && !opts.force) return;

    // Leaving a view: let the specialist tidy up first.
    if (current === 'drive' && global.Ops && global.Ops.onLeave) global.Ops.onLeave();
    if (current === 'recon' && global.Recon && global.Recon.onLeave) global.Recon.onLeave();

    var prevIdx = current == null ? -1 : indexOf(current);

    current = name;
    document.body.dataset.view = name;
    visited[name] = true;
    Core.store.set('visited', Object.keys(visited).filter(function (k) { return visited[k]; }));

    Array.prototype.forEach.call(document.querySelectorAll('.view'), function (v) {
      v.classList.toggle('active', v.dataset.view === name);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.step'), function (s) {
      var on = s.dataset.go === name;
      s.classList.toggle('active', on);
      s.setAttribute('aria-current', on ? 'step' : 'false');
      s.classList.toggle('done', !!visited[s.dataset.go] && !on);
    });

    renderRail();
    renderBottom();

    // Deep link without polluting history or jumping the page.
    try {
      if (cleanHash(global.location.hash) !== name) {
        global.history.replaceState(null, '', '#' + name);
      }
    } catch (e) { /* file:// in some browsers refuses replaceState */ }

    if (opts.scroll !== false) {
      try { global.scrollTo({ top: 0, left: 0, behavior: 'auto' }); }
      catch (e) { global.scrollTo(0, 0); }
    }

    enter(name, prevIdx < idx);

    if (name === 'debrief') renderResults();
  }

  function enter(name, forward) {
    if (name === 'drive' && global.Ops && global.Ops.onEnter) {
      global.Ops.onEnter();
      if (teacher && global.Ops.setReveal) global.Ops.setReveal(true);
    }

    if (name === 'recon') {
      if (!reconReady) {
        reconReady = true;
        if (global.Recon) global.Recon.init();
      }
      if (global.Recon && global.Recon.onEnter) global.Recon.onEnter();
    }

    if (name === 'debrief') renderResults();
    if (name === 'starter' && global.Quiz && global.Quiz.getState().finished) {
      // Returning to a finished quiz: leave it readable, no forced reset.
    }
  }

  /* ----------------------------------------------------------- rail/nav */
  function renderRail() {
    if (!el.railLabels) return;
    if (!el.railLabels.children.length) {
      el.railLabels.innerHTML = VIEWS.map(function (v) {
        return '<span data-rail="' + v.id + '">' + v.label + '</span>';
      }).join('');
    }
    var idx = Math.max(0, indexOf(current));
    Array.prototype.forEach.call(el.railLabels.children, function (s, i) {
      s.classList.toggle('on', i === idx);
    });
    if (el.railFill) el.railFill.style.width = (idx / (VIEWS.length - 1) * 100) + '%';
  }

  function renderBottom() {
    var idx = indexOf(current);
    if (el.prev) el.prev.disabled = idx <= 0;
    if (!el.next) return;
    if (idx >= VIEWS.length - 1) {
      el.next.hidden = true;
    } else {
      el.next.hidden = false;
      el.next.innerHTML = 'Next: ' + VIEWS[idx + 1].label + ' <span aria-hidden="true">→</span>';
    }
  }

  function step(dir) {
    var idx = indexOf(current) + dir;
    if (idx >= 0 && idx < VIEWS.length) go(VIEWS[idx].id);
  }

  /* --------------------------------------------------------------- debrief */
  function renderResults() {
    if (!el.results) return;
    var cards = [];

    var q = results.quiz;
    var qPct = q ? Math.round(q.score / Math.max(1, q.total) * 100) : 0;
    cards.push({
      label: 'Starter · challenges',
      value: q ? q.score + '/' + q.total : 'Not yet',
      empty: !q,
      note: q ? 'Seven hazards met, ' + q.score + ' called correctly on the first try.' : 'Seven multiple-choice challenges, with a picture for each.',
      pct: qPct,
      amber: !!q && qPct < 50
    });

    var o = results.ops;
    var oPct = o ? Math.min(100, Math.round(o.distance / 900 * 100)) : 0;
    cards.push({
      label: 'Drive · traverse 04-A',
      value: o ? o.distance + ' m' : 'Not yet',
      empty: !o,
      note: o ? (o.success ? 'Station Echo reached' : 'Traverse incomplete') + ' · ' + o.checkpoints + ' of 3 checkpoints.' : 'About 800 m of driving with one camera and a hidden map.',
      pct: oPct,
      amber: !!o && !o.success
    });

    var r = results.recon;
    cards.push({
      label: 'Plan · route check',
      value: r ? r.score + '/100' : 'Not yet',
      empty: !r,
      note: r ? r.site + ' · ' + r.length + ' m route · ' + '★'.repeat(r.tier || 0) + '☆'.repeat(3 - (r.tier || 0)) : 'Choose a site, inspect the ground, then draw a route.',
      pct: r ? r.score : 0,
      amber: !!r && (r.tier || 0) < 2
    });

    el.results.innerHTML = cards.map(function (c) {
      return '<article class="result-card' + (c.amber ? ' amber' : '') + '">' +
        '<span class="rc-label">' + c.label + '</span>' +
        '<div class="rc-value' + (c.empty ? ' empty' : '') + '">' + c.value + '</div>' +
        '<p class="rc-note">' + c.note + '</p>' +
        '<div class="rc-bar"><i style="width:' + (c.empty ? 0 : Math.max(2, Math.min(100, c.pct))) + '%"></i></div>' +
      '</article>';
    }).join('');
  }

  /* --------------------------------------------------------------- credits */
  function renderCredits() {
    if (!el.credits) return;
    el.credits.innerHTML = CREDITS.map(function (c) {
      var link = 'https://commons.wikimedia.org/wiki/Special:Search?search=' + encodeURIComponent(c.title);
      return '<li><b>' + c.title + '</b> — ' + c.by + '. Public domain. ' +
        '<a href="' + link + '" target="_blank" rel="noopener">Wikimedia Commons</a></li>';
    }).join('');
  }

  /* ----------------------------------------------------------- teacher view */
  function setTeacher(on) {
    teacher = !!on;
    document.body.classList.toggle('teacher', teacher);
    if (el.btnTeacher) {
      el.btnTeacher.setAttribute('aria-pressed', teacher ? 'true' : 'false');
      el.btnTeacher.textContent = teacher ? 'Teacher view: on' : 'Teacher view';
    }
    if (global.Ops && global.Ops.setReveal) global.Ops.setReveal(teacher);
    toast(teacher ? 'Teacher view: answers and the hidden hazard map are visible.' : 'Teacher view off.');
  }

  /* ----------------------------------------------------------------- reset */
  function resetAll() {
    var ok = global.confirm('Clear all saved progress and start the lesson again?');
    if (!ok) return;

    Core.store.clear();
    results = { quiz: null, ops: null, recon: null };
    visited = {};

    if (global.Quiz && global.Quiz.reset) global.Quiz.reset();
    if (global.Ops && global.Ops.reset) global.Ops.reset();
    if (reconReady && global.Recon && global.Recon.reset) global.Recon.reset();

    setTeacher(false);
    current = null;
    go('brief', { force: true });
    renderResults();
    toast('Progress cleared. New lesson.');
  }

  /* ------------------------------------------------------------------ init */
  function init() {
    el.toast = $('toast');
    el.prev = $('btn-prev');
    el.next = $('btn-next');
    el.railFill = $('rail-fill');
    el.railLabels = $('rail-labels');
    el.results = $('result-cards');
    el.credits = $('credits-list');
    el.btnTeacher = $('btn-teacher');
    el.btnReset = $('btn-reset');
    el.btnPrint = $('btn-print');

    var savedVisits = Core.store.get('visited', []);
    visited = {};
    if (Array.isArray(savedVisits)) {
      savedVisits.forEach(function (k) { if (typeof k === 'string') visited[k] = true; });
    } else if (savedVisits && typeof savedVisits === 'object') {
      Object.keys(savedVisits).forEach(function (k) { if (savedVisits[k]) visited[k] = true; });
    }

    if (global.Quiz && global.Quiz.init) global.Quiz.init();
    if (global.Ops && global.Ops.init) global.Ops.init();

    // Recon is the expensive module (terrain + WebGL). Build it on first use.
    if (cleanHash(global.location.hash) === 'recon') {
      reconReady = true;
      if (global.Recon && global.Recon.init) global.Recon.init();
    }

    renderCredits();
    renderResults();
    renderBottom();

    // Navigation: every element with data-go is a router button.
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-go]') : null;
      if (!t) return;
      var name = t.dataset.go;
      if (name) go(name);
    });

    if (el.prev) el.prev.addEventListener('click', function () { step(-1); });
    if (el.next) el.next.addEventListener('click', function () { step(1); });
    if (el.btnTeacher) el.btnTeacher.addEventListener('click', function () { setTeacher(!teacher); });
    if (el.btnReset) el.btnReset.addEventListener('click', resetAll);
    if (el.btnPrint) el.btnPrint.addEventListener('click', function () { global.print(); });

    // Keyboard: arrows step through views when nothing focused is interactive.
    document.addEventListener('keydown', function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      var tag = e.target && e.target.tagName;
      if (/INPUT|TEXTAREA|SELECT|BUTTON|A/.test(tag || '')) return;
      var view = document.querySelector('.view.active');
      if (view && /starter|drive/.test(view.dataset.view)) return; // their own shortcuts
      if (e.key === 'ArrowRight') { step(1); }
      else if (e.key === 'ArrowLeft') { step(-1); }
    });

    global.addEventListener('hashchange', function () {
      var name = cleanHash(global.location.hash);
      if (indexOf(name) >= 0 && name !== current) go(name);
    });

    // Module results → storage + debrief.
    global.addEventListener('quiz:done', function (e) {
      var d = e.detail || {};
      results.quiz = { score: d.score || 0, total: d.total || 0, ids: d.ids || [], at: Date.now() };
      Core.store.set('quiz', results.quiz);
      renderResults();
      toast('Starter complete: ' + results.quiz.score + ' of ' + results.quiz.total + '.');
    });

    global.addEventListener('ops:done', function (e) {
      var d = e.detail || {};
      results.ops = {
        distance: d.distance || 0,
        checkpoints: d.checkpoints || 0,
        success: !!d.success,
        reason: d.reason || '',
        at: Date.now()
      };
      Core.store.set('ops', results.ops);
      renderResults();
      toast(d.success ? 'Station Echo reached.' : 'Run ended · ' + (d.reason || 'incomplete') + '.');
    });

    global.addEventListener('recon:done', function (e) {
      var d = e.detail || {};
      results.recon = {
        site: d.site || '',
        score: d.score || 0,
        length: d.length || 0,
        tier: d.tier || 0,
        at: Date.now()
      };
      Core.store.set('recon', results.recon);
      renderResults();
    });

    // Deep link, or start at the brief.
    var start = cleanHash(global.location.hash);
    if (indexOf(start) < 0) start = 'brief';
    go(start, { force: true, scroll: false });
  }

  global.App = {
    go: go,
    reset: resetAll,
    toast: toast,
    setTeacher: setTeacher,
    getResults: function () { return results; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
