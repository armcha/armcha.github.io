/* arcade.js - shared runtime for the DummyClicker prototypes.
 *
 * Logical screen is 180 x 320 pixels (9:16 portrait), upscaled with
 * nearest-neighbour so everything stays chunky pixel art.
 *
 * A game supplies: setup(g), update(g, dt), draw(g, ctx).
 * The runtime owns: canvas scaling, input, fixed timestep, game states,
 * score persistence, the light / dark palette and the overlays.
 *
 * Colours are never written into game code as hex. A game reads g.pal, which
 * is the base palette below merged with that game's own overrides for the
 * theme in use. Switching theme swaps the object, so the next frame is drawn
 * in the new colours with nothing to reload.
 */
(function (global) {
  'use strict';

  var W = 180;
  var H = 320;
  var STEP = 1 / 60;

  /* ---- palettes ------------------------------------------------------ */

  var BASE = {
    dark: {
      bg: '#0b1220',
      star: '#54708f', starDim: '#33445c',
      ice: '#48a8c4', ice2: '#3f95b0', iceTop: '#a9e9f7', iceBot: '#2b6d85', iceEdge: '#7fd0e4',
      snow: '#e6f6fc',
      rock: '#5b6472', rockTop: '#8a93a3', rockBot: '#3b4350',
      wall: '#16283c', wallEdge: '#22415f', wallSpec: '#1d3550',
      spike: '#2f6f8c', spikeTeeth: '#bfe9f7', flake: '#2c4460',
      grass: '#22402c', grassLight: '#2e5439', grassDark: '#1a3323', grassTuft: '#356140',
      ballast: '#2b2f38', sleeper: '#4a3a2c', rail: '#7b8494',
      road: '#33383f', roadLine: '#8a93a3', roadEdge: '#c8d5e2',
      mountain: '#16283c', floorIce: '#22415f',
      ink: '#12202e', skin: '#f4d3b0', parka: '#3f7fd0', parkaDark: '#2f5d8a',
      red: '#e05a4b', redDark: '#c04638', gold: '#f2c14e', goldLight: '#fff0b8',
      green: '#6cbf5a', purple: '#a15ec9', accent: '#6fd3e8',
      birdBody: '#e8eef5', birdWing: '#c8d5e2',
      condor: '#3a3f4c', condorLight: '#5a6070', condorDark: '#2a2e39', condorWing: '#6a7182',
      penguin: '#1a2433', penguinBelly: '#f2f7fb',
      text: '#f2f7fb', textDim: '#7f93ad',
      panel: 'rgba(7,10,18,0.82)', panelEdge: 'rgba(111,211,232,0.35)',
      hudInk: '#ffffff', hudOut: 'rgba(6,9,16,0.85)',
      shadow: 'rgba(0,0,0,0.35)', gloss: 'rgba(255,255,255,0.30)', shade: 'rgba(0,0,0,0.35)',
      flashRgb: '108,191,90', dangerRgb: '224,90,75',
      trains: ['#e05a4b', '#f2c14e', '#6cbf5a', '#c07be0', '#e8eef5'],
      cars: ['#e05a4b', '#f2c14e', '#6cbf5a', '#c07be0', '#e8eef5', '#4f8fe0']
    },
    light: {
      bg: '#d3eaf7',
      star: '#ffffff', starDim: '#a8cee2',
      ice: '#5fbad7', ice2: '#4ea9c6', iceTop: '#ffffff', iceBot: '#2c7c9a', iceEdge: '#a3ddee',
      snow: '#ffffff',
      rock: '#8c96a6', rockTop: '#c3ccd8', rockBot: '#5f6979',
      wall: '#cfe9f6', wallEdge: '#a6d3e8', wallSpec: '#b9dff0',
      spike: '#4f9fbd', spikeTeeth: '#ffffff', flake: '#ffffff',
      grass: '#5aa54a', grassLight: '#72c05e', grassDark: '#43873a', grassTuft: '#93d97e',
      ballast: '#8d929b', sleeper: '#7a5f45', rail: '#f0f4f8',
      road: '#9aa0a8', roadLine: '#eef2f6', roadEdge: '#ffffff',
      mountain: '#9ccae1', floorIce: '#6fb3cf',
      ink: '#16222e', skin: '#f7dcbd', parka: '#2f6fc0', parkaDark: '#20507f',
      red: '#d84a38', redDark: '#a8382a', gold: '#e8a92a', goldLight: '#ffe08a',
      green: '#4f9f3f', purple: '#8f4ab8', accent: '#0d7ea3',
      birdBody: '#ffffff', birdWing: '#b9cadb',
      condor: '#4a5160', condorLight: '#6b7385', condorDark: '#343a47', condorWing: '#7d8598',
      penguin: '#1f2a3a', penguinBelly: '#ffffff',
      text: '#0f1c28', textDim: '#4e6478',
      panel: 'rgba(255,255,255,0.88)', panelEdge: 'rgba(13,126,163,0.45)',
      hudInk: '#12202e', hudOut: 'rgba(255,255,255,0.92)',
      shadow: 'rgba(20,45,65,0.22)', gloss: 'rgba(255,255,255,0.55)', shade: 'rgba(0,0,0,0.20)',
      flashRgb: '79,159,63', dangerRgb: '216,74,56',
      trains: ['#d84a38', '#e8a92a', '#4f9f3f', '#8f4ab8', '#ffffff'],
      cars: ['#d84a38', '#e8a92a', '#4f9f3f', '#8f4ab8', '#ffffff', '#2f6fc0']
    }
  };

  function merge(base, over) {
    var out = {}, k;
    for (k in base) if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
    if (over) for (k in over) if (Object.prototype.hasOwnProperty.call(over, k)) out[k] = over[k];
    return out;
  }

  /* ---- 3x5 pixel font ------------------------------------------------ */

  var GLYPHS = {
    'A': '111101111101101', 'B': '110101110101110', 'C': '111100100100111',
    'D': '110101101101110', 'E': '111100111100111', 'F': '111100111100100',
    'G': '111100101101111', 'H': '101101111101101', 'I': '111010010010111',
    'J': '001001001101111', 'K': '101101110101101', 'L': '100100100100111',
    'M': '101111111101101', 'N': '110101101101101', 'O': '111101101101111',
    'P': '111101111100100', 'Q': '111101101111001', 'R': '111101110101101',
    'S': '111100111001111', 'T': '111010010010010', 'U': '101101101101111',
    'V': '101101101101010', 'W': '101101111111101', 'X': '101101010101101',
    'Y': '101101010010010', 'Z': '111001010100111',
    '0': '111101101101111', '1': '010110010010111', '2': '111001111100111',
    '3': '111001111001111', '4': '101101111001001', '5': '111100111001111',
    '6': '111100111101111', '7': '111001001001001', '8': '111101111101111',
    '9': '111101111001111',
    ' ': '000000000000000', '.': '000000000000010', ':': '000010000010000',
    '!': '010010010000010', '-': '000000111000000', '/': '001001010100100',
    '+': '000010111010000', '?': '111001011000010', ',': '000000000010100',
    "'": '010010000000000', '*': '101010101000000', '%': '101001010100101'
  };

  function drawText(ctx, str, x, y, scale, color) {
    scale = scale || 1;
    ctx.fillStyle = color || '#ffffff';
    str = String(str).toUpperCase();
    var cx = Math.round(x);
    var cy = Math.round(y);
    for (var i = 0; i < str.length; i++) {
      var gl = GLYPHS[str.charAt(i)];
      if (gl) {
        for (var r = 0; r < 5; r++) {
          for (var c = 0; c < 3; c++) {
            if (gl.charAt(r * 3 + c) === '1') {
              ctx.fillRect(cx + c * scale, cy + r * scale, scale, scale);
            }
          }
        }
      }
      cx += 4 * scale;
    }
  }

  function textWidth(str, scale) {
    scale = scale || 1;
    return String(str).length * 4 * scale - scale;
  }

  function drawTextC(ctx, str, cx, y, scale, color) {
    drawText(ctx, str, Math.round(cx - textWidth(str, scale) / 2), y, scale, color);
  }

  function drawTextCO(ctx, str, cx, y, scale, color, outline) {
    var x = Math.round(cx - textWidth(str, scale) / 2);
    if (outline) {
      drawText(ctx, str, x - scale, y, scale, outline);
      drawText(ctx, str, x + scale, y, scale, outline);
      drawText(ctx, str, x, y - scale, scale, outline);
      drawText(ctx, str, x, y + scale, scale, outline);
    }
    drawText(ctx, str, x, y, scale, color);
  }

  /* ---- runtime ------------------------------------------------------- */

  function create(cfg) {
    var canvas = document.getElementById('c');
    var stage = document.getElementById('stage');
    var ctx = canvas.getContext('2d');
    canvas.width = W;
    canvas.height = H;
    ctx.imageSmoothingEnabled = false;

    function resize() {
      var s = Math.min(stage.clientWidth / W, stage.clientHeight / H);
      canvas.style.width = Math.max(1, Math.floor(W * s)) + 'px';
      canvas.style.height = Math.max(1, Math.floor(H * s)) + 'px';
    }
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', function () { setTimeout(resize, 80); });
    resize();

    var over = cfg.palette || {};
    function paletteFor(theme) {
      return merge(BASE[theme] || BASE.dark, over[theme]);
    }

    var KEY = 'dc.hi.' + cfg.id;
    var hi = 0;
    try { hi = parseInt(localStorage.getItem(KEY) || '0', 10) || 0; } catch (e) { hi = 0; }

    var queue = [];
    var active = new Map();
    var keyLeft = false, keyRight = false, keyAct = false;

    var g = {
      W: W, H: H, ctx: ctx,
      pal: paletteFor(global.Theme ? global.Theme.get() : 'dark'),
      state: 'ready',
      score: 0,
      hi: hi,
      newBest: false,
      t: 0,
      deadFor: 0,
      shake: 0,
      tapped: false,
      tapX: 0, tapY: 0, tapSide: 0,
      held: false,
      heldSide: 0,

      rnd: function (a, b) { return a + Math.random() * (b - a); },
      rndi: function (a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },
      pick: function (arr) { return arr[Math.floor(Math.random() * arr.length)]; },
      chance: function (p) { return Math.random() < p; },

      rect: function (x, y, w, h, col) {
        var x0 = Math.round(x), y0 = Math.round(y);
        var x1 = Math.round(x + w), y1 = Math.round(y + h);
        if (x1 <= x0 || y1 <= y0) return;
        ctx.fillStyle = col;
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      },
      text: function (s, x, y, sc, col) { drawText(ctx, s, x, y, sc, col); },
      textC: function (s, cx, y, sc, col) { drawTextC(ctx, s, cx, y, sc, col); },

      // Set by a game while any tuning value is off its default, so debug runs
      // never overwrite a real high score.
      noSave: false,

      die: function () {
        if (g.state !== 'play') return;
        g.state = 'dead';
        g.deadFor = 0;
        g.shake = 5;
        var sc = Math.floor(g.score);
        g.newBest = !g.noSave && sc > g.hi;
        if (g.newBest) {
          g.hi = sc;
          try { localStorage.setItem(KEY, String(sc)); } catch (e) { /* private mode */ }
        }
        queue.length = 0;
        if (navigator.vibrate) { try { navigator.vibrate(14); } catch (e) { /* ignore */ } }
        if (cfg.onDeath) cfg.onDeath(g);
      }
    };

    if (global.Theme) {
      global.Theme.onChange(function (theme) { g.pal = paletteFor(theme); });
    }

    /* ---- input ---- */

    function localPos(clientX, clientY) {
      var r = canvas.getBoundingClientRect();
      return {
        x: (clientX - r.left) / r.width * W,
        y: (clientY - r.top) / r.height * H
      };
    }

    canvas.addEventListener('pointerdown', function (e) {
      var p = localPos(e.clientX, e.clientY);
      var side = p.x < W / 2 ? -1 : 1;
      active.set(e.pointerId, side);
      queue.push({ x: p.x, y: p.y, side: side });
      if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
      e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('pointermove', function (e) {
      if (!active.has(e.pointerId)) return;
      var p = localPos(e.clientX, e.clientY);
      active.set(e.pointerId, p.x < W / 2 ? -1 : 1);
      e.preventDefault();
    }, { passive: false });

    function release(e) { active.delete(e.pointerId); }
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    window.addEventListener('pointerup', release);
    window.addEventListener('blur', function () {
      active.clear();
      keyLeft = keyRight = keyAct = false;
    });

    window.addEventListener('keydown', function (e) {
      if (e.repeat) return;
      var code = e.code;
      if (code === 'ArrowLeft' || code === 'KeyA') {
        keyLeft = true; queue.push({ x: W * 0.25, y: H / 2, side: -1 }); e.preventDefault();
      } else if (code === 'ArrowRight' || code === 'KeyD') {
        keyRight = true; queue.push({ x: W * 0.75, y: H / 2, side: 1 }); e.preventDefault();
      } else if (code === 'Space' || code === 'ArrowUp' || code === 'KeyW' || code === 'Enter') {
        keyAct = true; queue.push({ x: W / 2, y: H / 2, side: 0 }); e.preventDefault();
      }
    });

    window.addEventListener('keyup', function (e) {
      var code = e.code;
      if (code === 'ArrowLeft' || code === 'KeyA') keyLeft = false;
      else if (code === 'ArrowRight' || code === 'KeyD') keyRight = false;
      else keyAct = false;
    });

    function pollInput() {
      if (queue.length) {
        var ev = queue.shift();
        g.tapped = true; g.tapX = ev.x; g.tapY = ev.y; g.tapSide = ev.side;
      } else {
        g.tapped = false;
      }
      var side = 0;
      active.forEach(function (s) { side = s; });
      if (keyLeft) side = -1;
      else if (keyRight) side = 1;
      g.held = active.size > 0 || keyLeft || keyRight || keyAct;
      g.heldSide = side;
    }

    /* ---- loop ---- */

    function startRun() {
      g.score = 0;
      g.t = 0;
      g.deadFor = 0;
      g.shake = 0;
      cfg.setup(g);
      g.state = 'play';
    }

    function step(dt) {
      if (g.shake > 0.01) g.shake *= 0.86; else g.shake = 0;

      if (g.state === 'ready') {
        if (g.tapped) startRun();
      } else if (g.state === 'play') {
        g.t += dt;
        cfg.update(g, dt);
      } else {
        g.deadFor += dt;
        if (g.tapped && g.deadFor > 0.45) startRun();
      }
    }

    function panel(y, h) {
      ctx.fillStyle = g.pal.panel;
      ctx.fillRect(0, y, W, h);
      ctx.fillStyle = g.pal.panelEdge;
      ctx.fillRect(0, y, W, 1);
      ctx.fillRect(0, y + h - 1, W, 1);
    }

    function drawHud() {
      var P = g.pal;

      if (g.state === 'play') {
        if (cfg.hud !== false) {
          drawTextCO(ctx, String(Math.floor(g.score)), W / 2, 7, 2, P.hudInk, P.hudOut);
        }
        return;
      }

      if (g.state === 'ready') {
        panel(86, 138);
        drawTextC(ctx, cfg.name, W / 2, 98, 2, P.text);
        if (cfg.tagline) drawTextC(ctx, cfg.tagline, W / 2, 116, 1, P.textDim);
        var lines = cfg.how || ['TAP TO PLAY'];
        if (typeof lines === 'string') lines = [lines];
        for (var i = 0; i < lines.length; i++) {
          drawTextC(ctx, lines[i], W / 2, 140 + i * 9, 1, P.accent);
        }
        drawTextC(ctx, 'BEST ' + g.hi, W / 2, 178, 1, P.gold);
        if (Math.floor(performance.now() / 450) % 2 === 0) {
          drawTextC(ctx, 'TAP TO START', W / 2, 202, 1, P.text);
        }
        return;
      }

      panel(96, 116);
      drawTextC(ctx, 'GAME OVER', W / 2, 108, 2, P.red);
      drawTextC(ctx, 'SCORE ' + Math.floor(g.score), W / 2, 132, 1, P.text);
      drawTextC(ctx, 'BEST ' + g.hi, W / 2, 146, 1, P.gold);
      if (g.newBest) drawTextC(ctx, 'NEW BEST!', W / 2, 162, 1, P.green);
      if (g.deadFor > 0.45 && Math.floor(g.deadFor * 2) % 2 === 0) {
        drawTextC(ctx, 'TAP TO RETRY', W / 2, 186, 1, P.accent);
      }
    }

    function render() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = g.pal.bg;
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      if (g.shake > 0.01) {
        ctx.translate(Math.round((Math.random() * 2 - 1) * g.shake),
                      Math.round((Math.random() * 2 - 1) * g.shake));
      }
      cfg.draw(g, ctx);
      ctx.restore();
      drawHud();
    }

    var last = 0;
    var acc = 0;

    function frame(now) {
      requestAnimationFrame(frame);
      if (!last) last = now;
      var dt = (now - last) / 1000;
      last = now;
      if (dt > 0.25) dt = 0.25;
      acc += dt;
      var steps = 0;
      while (acc >= STEP && steps < 5) {
        acc -= STEP;
        steps++;
        pollInput();
        step(STEP);
      }
      render();
    }

    g.restart = startRun;

    cfg.setup(g);
    g.state = 'ready';
    requestAnimationFrame(frame);

    return g;
  }

  global.Arcade = {
    W: W, H: H,
    create: create,
    palettes: BASE,
    drawText: drawText,
    drawTextC: drawTextC,
    textWidth: textWidth,
    ease: function (t) { return t * t * (3 - 2 * t); },
    clamp: function (v, a, b) { return v < a ? a : (v > b ? b : v); },
    hash: function (i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  };

})(window);
