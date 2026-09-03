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

  var BASE_W = 180;
  var BASE_H = 320;
  var W = BASE_W;          // the default logical screen; a game may ask for more
  var H = BASE_H;
  var STEP = 1 / 60;

  /* ---- palettes ------------------------------------------------------ */

  var BASE = {
    // Daylight only. The dark half of this palette was removed with night mode.
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

  // 5x7. The old font was 3x5, the smallest a pixel font can be, where S and
  // 5, B and 8, and most of the round letters share the same shape. Five wide
  // by seven tall is the first size with room for a real letterform.
  var GLYPH_W = 5, GLYPH_H = 7, GLYPH_GAP = 1;
  var GLYPHS = {
    'A': '01110100011000111111100011000110001', 'B': '11110100011000111110100011000111110',
    'C': '01110100011000010000100001000101110', 'D': '11110100011000110001100011000111110',
    'E': '11111100001000011110100001000011111', 'F': '11111100001000011110100001000010000',
    'G': '01110100011000010111100011000101110', 'H': '10001100011000111111100011000110001',
    'I': '11111001000010000100001000010011111', 'J': '00111000100001000010000101001001100',
    'K': '10001100101010011000101001001010001', 'L': '10000100001000010000100001000011111',
    'M': '10001110111010110101100011000110001', 'N': '10001110011010110011100011000110001',
    'O': '01110100011000110001100011000101110', 'P': '11110100011000111110100001000010000',
    'Q': '01110100011000110001101011001001101', 'R': '11110100011000111110101001001010001',
    'S': '01111100001000001110000010000111110', 'T': '11111001000010000100001000010000100',
    'U': '10001100011000110001100011000101110', 'V': '10001100011000110001100010101000100',
    'W': '10001100011000110101101011101110001', 'X': '10001100010101000100010101000110001',
    'Y': '10001100010101000100001000010000100', 'Z': '11111000010001000100010001000011111',
    '0': '01110100011001110101110011000101110', '1': '00100011000010000100001000010011111',
    '2': '01110100010000100010001000100011111', '3': '11111000100010000010000011000101110',
    '4': '00010001100101010010111110001000010', '5': '11111100001111000001000011000101110',
    '6': '00110010001000011110100011000101110', '7': '11111000010001000100010000100001000',
    '8': '01110100011000101110100011000101110', '9': '01110100011000101111000010001001100',
    ' ': '00000000000000000000000000000000000', '!': '00100001000010000100001000000000100',
    '%': '11001110010001000100010001001110011', '*': '00000101010111011111011101010100000',
    '+': '00000001000010011111001000010000000', ',': '00000000000000000000001000010001000',
    '-': '00000000000000011111000000000000000', '.': '00000000000000000000000000110001100',
    '/': '00001000100001000100010000100010000', ':': '00000011000110000000011000110000000',
    '?': '01110100010000100010001000000000100'
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
        for (var r = 0; r < GLYPH_H; r++) {
          for (var c = 0; c < GLYPH_W; c++) {
            if (gl.charAt(r * GLYPH_W + c) === '1') {
              ctx.fillRect(cx + c * scale, cy + r * scale, scale, scale);
            }
          }
        }
      }
      cx += (GLYPH_W + GLYPH_GAP) * scale;
    }
  }

  function textWidth(str, scale) {
    scale = scale || 1;
    return String(str).length * (GLYPH_W + GLYPH_GAP) * scale - GLYPH_GAP * scale;
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
    // cfg.res multiplies the logical screen. res 2 gives 360x640, which is
    // four times the pixels to draw into, so sprites can carry real detail.
    // Everything the runtime draws scales with it; a game scales its own
    // constants the same way.
    var u = cfg.res || 1;
    // A game may narrow or shorten the logical screen in base units. Icy
    // Hopper passes baseW 160 to show eight 60px columns instead of nine: same
    // art, same block, one column fewer across, so every pixel is 12.5% wider
    // on the phone. That is how it zooms without moving sprites off their grid.
    var W = (cfg.baseW || BASE_W) * u;
    var H = (cfg.baseH || BASE_H) * u;

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
      // Nearest-neighbour is right when a pixel is being made BIGGER: it keeps
      // the edges hard. It is wrong when the canvas is being made smaller, which
      // is what happens with a 540 wide screen on a 390 wide phone: it throws
      // whole rows of pixels away, so one stroke of a letter survives at three
      // pixels and the next at two, and the text looks broken rather than sharp.
      // Below 1:1 let the browser average instead - softer, but every stroke
      // comes out the same weight.
      canvas.style.imageRendering = s >= 1 ? 'pixelated' : 'auto';
    }
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', function () { setTimeout(resize, 80); });
    resize();

    var over = cfg.palette || {};
    function paletteFor() {
      var base = BASE.light;
      var over = cfg.palette && cfg.palette.light;
      if (!over) return base;
      var out = {}, k;
      for (k in base) if (base.hasOwnProperty(k)) out[k] = base[k];
      for (k in over) if (over.hasOwnProperty(k)) out[k] = over[k];
      return out;
    }

    var KEY = 'dc.hi.' + cfg.id;
    var hi = 0;
    try { hi = parseInt(localStorage.getItem(KEY) || '0', 10) || 0; } catch (e) { hi = 0; }

    var queue = [];
    var active = new Map();
    var keyLeft = false, keyRight = false, keyAct = false;

    var g = {
      W: W, H: H, u: u, ctx: ctx,
      pal: paletteFor(),
      state: 'ready',
      score: 0,
      hi: hi,
      newBest: false,
      t: 0,
      deadFor: 0,
      shake: 0,
      ss: 1,                             // backing-store multiplier, see render()
      control: cfg.control || 'sides',   // 'sides', 'follow' or 'both' - see the input section
      touching: false, touchX: 0, touchY: 0, touchDrag: false,
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


    /* ---- input ---- */

    function localPos(clientX, clientY) {
      var r = canvas.getBoundingClientRect();
      return {
        x: (clientX - r.left) / r.width * W,
        y: (clientY - r.top) / r.height * H
      };
    }

    // Three ways to steer, chosen by g.control.
    //
    // 'sides'   where the finger IS decides: left half steers left, right half
    //           right, for as long as it is down. Stops when it lifts.
    //
    // 'follow'  the finger DRAGS the climber. Each move's horizontal travel is
    //           added to g.dragDx and the game applies it directly: move and
    //           it moves with you, stop and it stops, lift and it stops.
    //
    // 'both'    a touch starts as a side hold and BECOMES a drag the moment it
    //           travels more than DRAG_START. So a tap or a still finger steers
    //           by side, and a slide steers by movement - the two never fight,
    //           because a touch is only ever one of them at a time, and the
    //           side hold is dropped for good once the slide begins.
    //
    // Every touch also reports where it is, so the game can draw a joystick.
    var DRAG_START = 8;                 // logical px before a hold becomes a drag
    var touches = new Map();            // id -> { x0, x, y, drag }
    var moveAcc = 0;

    canvas.addEventListener('pointerdown', function (e) {
      var p = localPos(e.clientX, e.clientY);
      var mode = g.control;
      var side = mode === 'follow' ? 0 : (p.x < W / 2 ? -1 : 1);
      touches.set(e.pointerId, { x0: p.x, x: p.x, y: p.y, drag: mode === 'follow' });
      active.set(e.pointerId, side);
      queue.push({ x: p.x, y: p.y, side: side });
      if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
      e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('pointermove', function (e) {
      var t = touches.get(e.pointerId);
      if (!t) return;
      var p = localPos(e.clientX, e.clientY);
      if (g.control === 'sides') {
        active.set(e.pointerId, p.x < W / 2 ? -1 : 1);
      } else if (t.drag) {
        moveAcc += p.x - t.x;
      } else if (Math.abs(p.x - t.x0) > DRAG_START) {
        // The hold becomes a drag. The travel so far was the cost of deciding,
        // not steering, so accumulation starts from here.
        t.drag = true;
        active.set(e.pointerId, 0);
      }
      t.x = p.x; t.y = p.y;
      e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    function release(e) { active.delete(e.pointerId); touches.delete(e.pointerId); }
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    window.addEventListener('pointerup', release);
    window.addEventListener('blur', function () {
      active.clear();
      touches.clear();
      moveAcc = 0;
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
      // The finger's travel since the last step, in logical px. Consumed here
      // so a slow browser frame delivers one big step rather than a repeat.
      g.dragDx = moveAcc;
      moveAcc = 0;
      // Where the (last) finger is, for the on-screen joystick.
      var t = null;
      touches.forEach(function (v) { t = v; });
      g.touching = !!t;
      g.touchX = t ? t.x : 0;
      g.touchY = t ? t.y : 0;
      g.touchDrag = !!(t && t.drag);
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
      ctx.fillRect(0, y * u, W, h * u);
      ctx.fillStyle = g.pal.panelEdge;
      ctx.fillRect(0, y * u, W, u);
      ctx.fillRect(0, (y + h) * u - u, W, u);
    }

    // Every HUD position and text size is written in base units and
    // multiplied by u, so the overlay looks the same at any resolution.
    function drawHud() {
      var P = g.pal;

      if (g.state === 'play') {
        if (cfg.hud !== false) {
          drawTextCO(ctx, String(Math.floor(g.score)), W / 2, 7 * u, 2 * u, P.hudInk, P.hudOut);
        }
        return;
      }

      if (g.state === 'ready') {
        panel(86, 138);
        drawTextC(ctx, cfg.name, W / 2, 98 * u, 2 * u, P.text);
        if (cfg.tagline) drawTextC(ctx, cfg.tagline, W / 2, 116 * u, u, P.textDim);
        var lines = cfg.how || ['TAP TO PLAY'];
        if (typeof lines === 'string') lines = [lines];
        for (var i = 0; i < lines.length; i++) {
          drawTextC(ctx, lines[i], W / 2, (140 + i * 9) * u, u, P.accent);
        }
        drawTextC(ctx, 'BEST ' + g.hi, W / 2, 178 * u, u, P.gold);
        if (Math.floor(performance.now() / 450) % 2 === 0) {
          drawTextC(ctx, 'TAP TO START', W / 2, 202 * u, u, P.text);
        }
        return;
      }

      panel(96, 116);
      drawTextC(ctx, 'GAME OVER', W / 2, 108 * u, 2 * u, P.red);
      drawTextC(ctx, 'SCORE ' + Math.floor(g.score), W / 2, 132 * u, u, P.text);
      drawTextC(ctx, 'BEST ' + g.hi, W / 2, 146 * u, u, P.gold);
      if (g.newBest) drawTextC(ctx, 'NEW BEST!', W / 2, 162 * u, u, P.green);
      if (g.deadFor > 0.45 && Math.floor(g.deadFor * 2) % 2 === 0) {
        drawTextC(ctx, 'TAP TO RETRY', W / 2, 186 * u, u, P.accent);
      }
    }

    // g.ss is the backing-store multiplier. At 2 the canvas holds four times
    // the pixels of the logical screen and every draw call is scaled up
    // through the transform, so integer-aligned pixel art lands on whole
    // device pixels instead of being smeared by a fractional upscale. A phone
    // with a 3x display gets a 1.4x smooth step instead of a 2.7x one, which is
    // most of the difference between soft and crisp. The game sets it from a
    // dial each frame; the backing store is rebuilt only when it changes.
    function render() {
      var ss = g.ss > 1 ? 2 : 1;
      if (canvas.width !== W * ss) {
        canvas.width = W * ss;
        canvas.height = H * ss;
        ctx.imageSmoothingEnabled = false;   // resizing a canvas resets this
      }
      ctx.setTransform(ss, 0, 0, ss, 0, 0);
      ctx.fillStyle = g.pal.bg;
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      if (g.shake > 0.01) {
        ctx.translate(Math.round((Math.random() * 2 - 1) * g.shake * u),
                      Math.round((Math.random() * 2 - 1) * g.shake * u));
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
