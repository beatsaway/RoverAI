/* =========================================================================
   quiz.js — starter: seven simple questions about driving on the Moon.
   Every answer teaches something. The correct option is deliberately varied.
   ========================================================================= */
(function (global) {
  'use strict';

  /* ---- generated plot: surface temperature over one lunar day ----------- */
  function tempChartSVG() {
    var W = 900, H = 600, padL = 84, padR = 46, padT = 54, padB = 78;
    var x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
    var TMIN = -200, TMAX = 160;
    var DAYS = 29.5;
    function X(t) { return x0 + (t / DAYS) * (x1 - x0); }
    function Y(T) { return y0 + ((TMAX - T) / (TMAX - TMIN)) * (y1 - y0); }
    function tempAt(t) { return -25 + 145 * Math.cos((t / DAYS) * Math.PI * 2); }

    var curve = '';
    for (var i = 0; i <= 240; i++) {
      var t = (i / 240) * DAYS;
      curve += (i ? 'L' : 'M') + X(t).toFixed(1) + ' ' + Y(tempAt(t)).toFixed(1) + ' ';
    }
    var area = curve + 'L' + X(DAYS).toFixed(1) + ' ' + Y(TMIN) + ' L' + X(0).toFixed(1) + ' ' + Y(TMIN) + ' Z';

    var grid = '';
    for (var T = -200; T <= 150; T += 50) {
      grid += '<line x1="' + x0 + '" y1="' + Y(T) + '" x2="' + x1 + '" y2="' + Y(T) + '" stroke="#1b2634" stroke-width="1"/>' +
              '<text x="' + (x0 - 12) + '" y="' + (Y(T) + 4) + '" text-anchor="end" font-family="ui-monospace,monospace" font-size="13" fill="#66788d">' + (T > 0 ? '+' : '') + T + '</text>';
    }
    var dayTicks = '';
    for (var d = 0; d <= 29; d += 5) {
      dayTicks += '<line x1="' + X(d) + '" y1="' + y1 + '" x2="' + X(d) + '" y2="' + (y1 + 6) + '" stroke="#2a384b"/>' +
                  '<text x="' + X(d) + '" y="' + (y1 + 24) + '" text-anchor="middle" font-family="ui-monospace,monospace" font-size="13" fill="#66788d">' + d + '</text>';
    }

    var noonX = X(14.75), noonY = Y(120);
    var nightX = X(0), nightY = Y(-170);
    var sunriseX = X(7.4), sunsetX = X(22.1);

    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">' +
      '<defs>' +
        '<linearGradient id="hot" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="#ff8a4c" stop-opacity=".55"/>' +
          '<stop offset="45%" stop-color="#ffb454" stop-opacity=".12"/>' +
          '<stop offset="70%" stop-color="#6fe4f2" stop-opacity=".05"/>' +
          '<stop offset="100%" stop-color="#6fe4f2" stop-opacity=".3"/>' +
        '</linearGradient>' +
        '<filter id="glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
      '</defs>' +
      '<rect width="' + W + '" height="' + H + '" fill="#070b11"/>' +
      '<rect x="' + x0 + '" y="' + y0 + '" width="' + (x1 - x0) + '" height="' + (y1 - y0) + '" fill="#080d15"/>' +
      grid +
      '<rect x="' + sunriseX + '" y="' + y0 + '" width="' + (sunsetX - sunriseX) + '" height="' + (y1 - y0) + '" fill="#ffb454" opacity=".045"/>' +
      '<text x="' + X(14.75) + '" y="' + (y0 + 20) + '" text-anchor="middle" font-family="ui-monospace,monospace" font-size="11" letter-spacing="3" fill="#7a5524">SUN UP</text>' +
      '<text x="' + X(3.6) + '" y="' + (y0 + 20) + '" text-anchor="middle" font-family="ui-monospace,monospace" font-size="11" letter-spacing="3" fill="#3f6f7c">NIGHT</text>' +
      '<text x="' + X(26.4) + '" y="' + (y0 + 20) + '" text-anchor="middle" font-family="ui-monospace,monospace" font-size="11" letter-spacing="3" fill="#3f6f7c">NIGHT</text>' +
      '<path d="' + area + '" fill="url(#hot)"/>' +
      '<path d="' + curve + '" fill="none" stroke="#ffb454" stroke-width="2.6" filter="url(#glow)"/>' +
      '<line x1="' + x0 + '" y1="' + Y(0) + '" x2="' + x1 + '" y2="' + Y(0) + '" stroke="#2a384b" stroke-dasharray="4 5"/>' +
      dayTicks +
      '<circle cx="' + noonX + '" cy="' + noonY + '" r="5" fill="#ffb454"/>' +
      '<line x1="' + noonX + '" y1="' + (noonY - 14) + '" x2="' + noonX + '" y2="' + (y0 + 34) + '" stroke="#ffb454" stroke-opacity=".4"/>' +
      '<text x="' + (noonX + 14) + '" y="' + (noonY + 6) + '" font-family="ui-monospace,monospace" font-size="20" font-weight="600" fill="#ffcf8f">+120 °C</text>' +
      '<circle cx="' + nightX + '" cy="' + nightY + '" r="5" fill="#6fe4f2"/>' +
      '<text x="' + (nightX + 16) + '" y="' + (nightY + 26) + '" font-family="ui-monospace,monospace" font-size="20" font-weight="600" fill="#9ceef8">−170 °C</text>' +
      '<text x="' + (x0 - 12) + '" y="' + (y0 - 22) + '" font-family="ui-monospace,monospace" font-size="12" letter-spacing="2" fill="#66788d">SURFACE TEMPERATURE (°C)</text>' +
      '<text x="' + ((x0 + x1) / 2) + '" y="' + (H - 22) + '" text-anchor="middle" font-family="ui-monospace,monospace" font-size="12" letter-spacing="2" fill="#66788d">ONE LUNAR DAY · 29.5 EARTH DAYS</text>' +
      '<rect x="' + (x1 - 196) + '" y="' + (y1 - 62) + '" width="180" height="46" rx="6" fill="#0a1018" stroke="#1d2735"/>' +
      '<text x="' + (x1 - 184) + '" y="' + (y1 - 43) + '" font-family="ui-monospace,monospace" font-size="11" fill="#9aa9bb">SWING ACROSS ONE DAY</text>' +
      '<text x="' + (x1 - 184) + '" y="' + (y1 - 26) + '" font-family="ui-monospace,monospace" font-size="16" font-weight="600" fill="#e7eef7">290 °C</text>' +
      '</svg>';
  }

  var QUESTIONS = [
    {
      id: 'nomap',
      img: 'assets/img/no-map.jpg',
      alt: 'Apollo 17 astronaut on a wide, featureless grey lunar plain',
      imgTag: 'APOLLO 17',
      caption: 'A grey plain with no roads, signs or landmarks.',
      badge: 'FIELD PHOTO',
      q: 'The rover has no sat-nav. How does it find its way?',
      options: [
        'It follows roads marked on a paper map.',
        'It counts wheel turns and checks direction.',
        'It asks Mission Control for its position.',
        'It follows a radio signal from the lander.'
      ],
      correct: 1,
      explain: 'Apollo crews used a gyro for direction and wheel turns for distance. Then they marked the spot on a photo map. Every slip made the guess a little worse.',
      challenge: 'No map'
    },
    {
      id: 'slope',
      img: 'assets/img/rover-slope.jpg',
      alt: 'Lunar rover parked on a sloping hillside covered with boulders',
      imgTag: 'APOLLO 16',
      caption: 'A rover parked on a slope of about 25°.',
      badge: 'FIELD PHOTO',
      q: 'Why is a 25° slope dangerous?',
      options: [
        'Radio signals cannot travel uphill.',
        'The wheels can slip, slide or tip over.',
        'The battery charges far too quickly.',
        'The camera stops working on a slope.'
      ],
      correct: 1,
      explain: 'The ground is loose dust over rock. A wheel can spin while the rover slides sideways. Past the limit, it can tip and strand the crew.',
      challenge: 'Steep slopes'
    },
    {
      id: 'wheels',
      img: 'assets/img/rover-wheel.jpg',
      alt: 'Close-up of the Apollo 17 rover wheel and a makeshift fender made from maps',
      imgTag: 'APOLLO 17',
      caption: 'A wire-mesh wheel and a fender rebuilt from maps and tape.',
      badge: 'FIELD PHOTO',
      q: 'Why did Apollo use wire wheels, not rubber tyres?',
      options: [
        'Rubber is too heavy in Moon gravity.',
        'Rubber cracks in vacuum and cuts on rock.',
        'Wire wheels are much cheaper to build.',
        'Rubber would attract static electricity.'
      ],
      correct: 1,
      explain: 'Rubber fails in vacuum and at extreme temperatures. Sharp rock would also cut it. Wire mesh flexes and grips the dusty ground.',
      challenge: 'Sharp rocks'
    },
    {
      id: 'heat',
      chart: true,
      imgTag: 'DATA PLOT',
      caption: 'The surface temperature across one lunar day.',
      badge: 'DATA PLOT',
      alt: 'Graph of lunar surface temperature rising to plus 120 degrees Celsius at noon and falling to minus 170 at night',
      q: 'The surface swings from +120 °C to −170 °C. What must the rover do?',
      options: [
        'Nothing, because there is no air on the Moon.',
        'Only the wheels need to cope with the heat.',
        'Keep its electronics warm and cool at once.',
        'Drive only at night, when the ground is cooler.'
      ],
      correct: 2,
      explain: 'With no air, heat only leaves by radiation. The rover needs radiators to dump heat and heaters to survive the cold night.',
      challenge: 'Hot and cold'
    },
    {
      id: 'power',
      img: 'assets/img/rover-parked.jpg',
      alt: 'Apollo 15 lunar rover standing alone on the Moon with its dish antenna',
      imgTag: 'APOLLO 15',
      caption: 'Apollo 15’s rover at its final parking place.',
      badge: 'FIELD PHOTO',
      q: 'The battery cannot be recharged. What is the safest plan?',
      options: [
        'Drive as far as possible, then walk home.',
        'Keep a reserve and turn back in time.',
        'Recharge the battery from the lander.',
        'Use solar panels while the rover drives.'
      ],
      correct: 1,
      explain: 'Apollo planned the farthest point first and kept a reserve. Every detour cost metres. Running out meant walking back in a heavy suit.',
      challenge: 'One battery'
    },
    {
      id: 'signal',
      img: 'assets/img/earth.jpg',
      alt: 'Earth hanging above the lunar horizon',
      imgTag: 'EARTHRISE',
      caption: 'Earth is 384,000 km away. Radio takes about 1.3 s to get there.',
      badge: 'FIELD PHOTO',
      q: 'A command takes 1.3 s to reach the Moon. Why does that matter?',
      options: [
        'The rover reacts to a picture that is old.',
        'The rover sees each command before it is sent.',
        'Radio waves are too slow to cross space.',
        'The delay only happens during the night.'
      ],
      correct: 0,
      explain: 'The camera picture is already 1.3 s old when it reaches Earth. The rover must make some choices itself instead of waiting for every turn.',
      challenge: 'Signal delay'
    },
    {
      id: 'rim',
      img: 'assets/img/crater-wall.jpg',
      alt: 'Boulder field on the rim of Hadley Rille with the crater wall falling away',
      imgTag: 'HADLEY RILLE',
      caption: 'The ground beyond the boulders falls away into the rille.',
      badge: 'FIELD PHOTO',
      q: 'A crater edge can look flat in a camera. Why is it dangerous?',
      options: [
        'Gravity is stronger along the crater edge.',
        'The ground may drop away past the edge.',
        'The rover’s antenna stops at the crater.',
        'The dust there is too cold to drive on.'
      ],
      correct: 1,
      explain: 'The ground curves away, so the drop is hidden until you are on it. A slope layer or a 3D map shows the edge before the rover reaches it.',
      challenge: 'Hidden cliffs'
    }
  ];

  var state = { i: 0, answered: false, score: 0, logged: [] };
  var el = {};
  var chartURL = null;

  function $(id) { return document.getElementById(id); }

  function init() {
    el.img = $('quiz-img');
    el.media = $('quiz-media');
    el.tag = $('quiz-imgtag');
    el.caption = $('quiz-caption');
    el.badge = $('quiz-badge');
    el.q = $('quiz-q');
    el.options = $('quiz-options');
    el.feedback = $('quiz-feedback');
    el.verdict = $('quiz-verdict');
    el.explain = $('quiz-explain');
    el.challenge = $('quiz-challenge');
    el.next = $('quiz-next');
    el.hint = $('quiz-hint');
    el.bar = $('quiz-bar');
    el.count = $('quiz-count');
    el.score = $('quiz-score');

    if (!chartURL) chartURL = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(tempChartSVG());

    el.next.addEventListener('click', function () {
      if (!state.answered && !state.finished) return;
      if (state.finished) {
        if (global.App) global.App.go('drive');
        return;
      }
      if (state.i >= QUESTIONS.length - 1) {
        finish();
      } else {
        state.i++;
        state.answered = false;
        render();
      }
    });

    document.addEventListener('keydown', function (e) {
      var view = document.getElementById('view-starter');
      if (!view || !view.classList.contains('active')) return;
      if (e.target && /input|textarea/i.test(e.target.tagName)) return;
      if (!state.answered && /^[1-4]$/.test(e.key)) {
        var idx = parseInt(e.key, 10) - 1;
        if (idx < 4) choose(idx);
      } else if (state.answered && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        el.next.click();
      }
    });

    render();
  }

  function render() {
    var q = QUESTIONS[state.i];
    state.answered = false;

    el.tag.textContent = q.imgTag;
    el.caption.textContent = q.caption;
    el.badge.textContent = q.badge;
    el.media.classList.remove('swap');
    if (q.chart) {
      el.img.src = chartURL;
      el.img.alt = q.alt;
      el.img.style.objectFit = 'contain';
      el.img.style.background = '#070b11';
    } else {
      el.img.style.objectFit = 'cover';
      el.img.style.background = '';
      el.img.src = q.img;
      el.img.alt = q.alt;
    }

    el.q.textContent = q.q;
    el.count.textContent = 'Question ' + (state.i + 1) + ' of ' + QUESTIONS.length;
    el.score.textContent = state.score + (state.score === 1 ? ' correct' : ' correct');
    el.bar.style.width = (state.i / QUESTIONS.length * 100) + '%';
    el.options.innerHTML = q.options.map(function (text, i) {
      return '<button class="qopt" data-i="' + i + '" data-correct="' + (i === q.correct ? '1' : '0') + '"><span class="key">' + (i + 1) + '</span><span class="txt">' + text + '</span></button>';
    }).join('');
    Array.prototype.forEach.call(el.options.querySelectorAll('.qopt'), function (btn) {
      btn.addEventListener('click', function () { choose(parseInt(btn.dataset.i, 10)); });
    });

    el.feedback.hidden = true;
    el.next.disabled = true;
    el.hint.textContent = 'Press 1–4 to answer';
    el.next.innerHTML = (state.i === QUESTIONS.length - 1) ? 'Finish <span aria-hidden="true">→</span>' : 'Next <span aria-hidden="true">→</span>';
  }

  function choose(i) {
    if (state.answered) return;
    state.answered = true;
    var q = QUESTIONS[state.i];
    var right = i === q.correct;
    if (right) state.score++;
    state.logged.push(q.id);

    Array.prototype.forEach.call(el.options.querySelectorAll('.qopt'), function (btn, bi) {
      btn.disabled = true;
      if (bi === q.correct) btn.classList.add('correct');
      else if (bi === i) btn.classList.add('wrong');
      else btn.classList.add('dim');
    });

    el.verdict.textContent = right ? 'That’s right' : 'Not quite';
    el.verdict.className = 'feedback-verdict' + (right ? '' : ' bad');
    el.explain.textContent = q.explain;
    el.challenge.textContent = q.challenge;
    el.feedback.hidden = false;
    el.next.disabled = false;
    el.hint.textContent = 'Press Enter to continue';
    el.score.textContent = state.score + ' correct';
    el.bar.style.width = ((state.i + 1) / QUESTIONS.length * 100) + '%';

    el.feedback.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    el.next.focus({ preventScroll: true });
  }

  function finish() {
    state.finished = true;
    el.bar.style.width = '100%';
    el.next.disabled = false;
    el.next.innerHTML = 'Go to the drive <span aria-hidden="true">→</span>';
    el.hint.textContent = 'Challenges complete';
    window.dispatchEvent(new CustomEvent('quiz:done', {
      detail: { score: state.score, total: QUESTIONS.length, ids: state.logged.slice() }
    }));
  }

  function reset() {
    state = { i: 0, answered: false, score: 0, logged: [] };
    if (!el.options) return;
    render();
  }

  global.Quiz = { init: init, reset: reset, questions: QUESTIONS, getState: function () { return state; } };
})(window);
