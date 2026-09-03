/* music.js - synthesised chip loops for the DummyClicker games.
 *
 * No audio files. A style is four bars of 8th notes: chords, a bass pattern,
 * a lead pattern and a drum pattern, and the sequencer turns those into
 * oscillators and noise bursts scheduled a fifth of a second ahead from a
 * timer, so a dropped animation frame never drops a note.
 *
 * Patterns are strings, one character per 8th note, eight per bar:
 *   bass  r root (an octave down)  o root  5 fifth  . rest
 *   lead  1 3 5 7 8 chord tones (8 = octave)  . rest
 *   drums x hit  . rest        (kick, snare, hat each have their own)
 * A 32-character pattern spans all four bars; an 8-character one repeats.
 *
 * Music.create(settings) takes a function returning { ctx, on, vol, style }
 * and gives back { start, stop, key }. The audio context is the caller's, so
 * the effects and the music share one and unlock together on the first tap.
 */
(function (global) {
  'use strict';

  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // Chords as [root midi, minor?]. Bars are the four entries of `chords`.
  var STYLES = [
    { name: 'ARCADE RUSH', bpm: 168, desc: 'Driving 8th-note bass, bright square lead, hats on every off-beat. The hypercasual default.',
      chords: [[57, 1], [53, 0], [48, 0], [55, 0]], bassWave: 'square', leadWave: 'square',
      bass: 'rrrrrr5r', lead: '1.351.83' + '1.35.8.5' + '1.351.83' + '8.5.3.1.',
      kick: 'x...x...', snare: '....x...', hat: '.x.x.x.x' },
    { name: 'BOUNCE', bpm: 156, desc: 'Off-beat bass and a kick on every beat. Springy, made for a bouncing climber.',
      chords: [[48, 0], [53, 0], [55, 0], [48, 0]], bassWave: 'triangle', leadWave: 'square',
      bass: '.r.r.r.o', lead: '1.3.5.8.' + '3.5.8.5.' + '1.3.5.8.' + '5.3.1...',
      kick: 'x.x.x.x.', snare: '....x...', hat: 'xxxxxxxx' },
    { name: 'SUNNY MAJOR', bpm: 160, desc: 'Cheerful major-key arpeggios, C G Am F. The friendliest of the set.',
      chords: [[48, 0], [55, 0], [57, 1], [53, 0]], bassWave: 'triangle', leadWave: 'square',
      bass: 'r.r.o.r.', lead: '13583531' + '13583531' + '13583531' + '13585.8.',
      kick: 'x...x...', snare: '....x...', hat: 'x.x.x.x.' },
    { name: 'ICE CAVE', bpm: 144, desc: 'Sparse and cold. Triangle lead, few notes, no kick. The one that stays out of the way.',
      chords: [[52, 1], [48, 0], [55, 0], [50, 0]], bassWave: 'triangle', leadWave: 'triangle',
      bass: 'r...5...', lead: '1..5..8.' + '3..5....' + '1..5..8.' + '8..5..3.',
      kick: '........', snare: '........', hat: '..x...x.' },
    { name: 'BREAKBEAT', bpm: 172, desc: 'Fast broken drums under a low bass and a quick lead. The most urgent one.',
      chords: [[57, 1], [57, 1], [53, 0], [55, 0]], bassWave: 'square', leadWave: 'square',
      bass: 'r.rr.r.r', lead: '8.5.3.1.' + '8.5.3.5.' + '8.5.3.1.' + '5.3.1.3.',
      kick: 'x..x..x.', snare: '..x...x.', hat: 'xxxxxxxx' },
    { name: '8-BIT DISCO', bpm: 130, desc: 'Octave bass, four-on-the-floor kick, off-beat hats. Slower, but it struts.',
      chords: [[50, 1], [58, 0], [53, 0], [48, 0]], bassWave: 'square', leadWave: 'square',
      bass: 'rorororo', lead: '1.5.3.8.' + '1.5.3.8.' + '3.8.5.1.' + '5.8.3.1.',
      kick: 'x.x.x.x.', snare: '..x...x.', hat: '.x.x.x.x' },
    { name: 'PRESSURE', bpm: 150, desc: 'Minor key with a half-step lurch every other bar. Tense. Suits the avalanche.',
      chords: [[57, 1], [58, 0], [57, 1], [59, 0]], bassWave: 'square', leadWave: 'square',
      bass: 'rrrrrrrr', lead: '1..1..1.' + '3..3..5.' + '1..1..1.' + '8..5..3.',
      kick: 'x...x...', snare: '....x...', hat: 'x.x.x.x.' },
    { name: 'MINIMAL PULSE', bpm: 140, desc: 'One chord, a heartbeat bass and a hat. Almost nothing, on purpose.',
      chords: [[57, 1], [57, 1], [57, 1], [57, 1]], bassWave: 'triangle', leadWave: 'triangle',
      bass: 'r.......', lead: '....5...' + '........' + '....5..8' + '........',
      kick: '........', snare: '........', hat: 'x.x.x.x.' }
  ];

  function at(pattern, i) {
    return pattern.length >= 32 ? pattern.charAt(i) : pattern.charAt(i % pattern.length);
  }

  function tone(chord, ch) {
    var root = chord[0], minor = chord[1];
    if (ch === '1' || ch === 'o') return root;
    if (ch === 'r') return root - 12;
    if (ch === '3') return root + (minor ? 3 : 4);
    if (ch === '5') return root + 7;
    if (ch === '7') return root + (minor ? 10 : 11);
    if (ch === '8') return root + 12;
    return null;
  }

  function create(settings) {
    var st = { on: false, timer: null, step: 0, next: 0, gain: null, noise: null, tr: 0 };

    function prep(a) {
      if (!st.gain) { st.gain = a.createGain(); st.gain.connect(a.destination); }
      if (!st.noise) {
        st.noise = a.createBuffer(1, a.sampleRate * 0.1, a.sampleRate);
        var d = st.noise.getChannelData(0);
        for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
    }

    function osc(a, f, t, dur, type, vol, slideTo) {
      var o = a.createOscillator(), g = a.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(st.gain);
      o.start(t); o.stop(t + dur + 0.02);
    }

    function burst(a, t, dur, vol, type, freq) {
      var s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
      s.buffer = st.noise;
      f.type = type; f.frequency.value = freq;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(st.gain);
      s.start(t); s.stop(t + dur + 0.01);
    }

    function scheduleStep(a, sty, i, t, stepDur) {
      var chord = sty.chords[Math.floor(i / 8) % 4];
      var b = tone(chord, at(sty.bass, i));
      if (b !== null) osc(a, hz(b + st.tr), t, stepDur * 0.9, sty.bassWave, 0.16);
      var l = tone(chord, at(sty.lead, i));
      if (l !== null) osc(a, hz(l + 12 + st.tr), t, stepDur * 0.75, sty.leadWave, 0.05);
      if (at(sty.kick, i) === 'x') osc(a, 95, t, 0.07, 'triangle', 0.32, 42);
      if (at(sty.snare, i) === 'x') burst(a, t, 0.07, 0.16, 'lowpass', 2600);
      if (at(sty.hat, i) === 'x') burst(a, t, 0.025, i % 8 === 0 ? 0.07 : 0.045, 'highpass', 6500);
    }

    function tick() {
      var s = settings();
      var a = s.ctx;
      if (!s.on || !a || a.state !== 'running') return;
      prep(a);
      st.gain.gain.value = (s.vol / 100) * 0.7;
      var sty = STYLES[s.style] || STYLES[0];
      var stepDur = 60 / sty.bpm / 2;
      while (st.next < a.currentTime + 0.2) {
        scheduleStep(a, sty, st.step % 32, st.next, stepDur);
        st.next += stepDur;
        st.step++;
      }
    }

    return {
      start: function () {
        if (st.on) return;
        var a = settings().ctx;
        if (!a) return;
        st.on = true; st.step = 0; st.next = a.currentTime + 0.05;
        st.timer = setInterval(tick, 60);
        tick();
      },
      stop: function () {
        if (!st.on) return;
        clearInterval(st.timer); st.timer = null; st.on = false;
      },
      key: function (semis) { st.tr = semis; },
      playing: function () { return st.on; }
    };
  }

  global.Music = { create: create, styles: STYLES };
})(window);
