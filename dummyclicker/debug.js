/* debug.js - a tuning drawer under the canvas.
 *
 * A game calls Debug.panel(id, fields, onChange) and gets back a plain object
 * of live values. The game reads those values while it runs, so moving a
 * slider changes the game on the next frame with no reload.
 *
 * Fields marked restart:true rebuild the run when they change, for values the
 * world is generated from.
 */
(function (global) {
  'use strict';

  var CSS = [
    '#debug{flex:0 0 auto;background:var(--bar);border-top:1px solid var(--bar-line);',
    'max-height:48vh;overflow-y:auto;overscroll-behavior:contain;touch-action:auto;',
    'font-size:10px;letter-spacing:.08em;display:none}',
    '#debug.open{display:block}',
    '.dbg-g{padding:8px 10px;border-bottom:1px solid var(--bar-line)}',
    '.dbg-g h4{font-size:9px;letter-spacing:.2em;color:var(--link);margin-bottom:6px}',
    '.dbg-seg,.dbg-toggles{display:flex;flex-wrap:wrap;gap:4px}',
    '.dbg-seg button,.dbg-toggles button{flex:1 1 auto;padding:8px 4px;font:inherit;font-size:9px;',
    'letter-spacing:.08em;color:var(--muted);background:var(--btn);border:1px solid var(--bar-line);',
    'border-radius:4px;cursor:pointer}',
    '.dbg-act button.on{border-color:var(--link);color:var(--link)}',
    '.dbg-seg button{min-width:80px}',
    '.dbg-toggles button{min-width:62px}',
    '.dbg-seg button.on,.dbg-toggles button.on{color:var(--btn-ink);border-color:var(--link)}',
    '.dbg-note{margin-top:7px;color:var(--muted);font-size:9px;line-height:1.65;letter-spacing:.03em}',
    '.dbg-hint{color:var(--muted);font-size:9px;line-height:1.55;letter-spacing:.02em;',
    'margin:-1px 0 7px 92px;opacity:.85}',
    '.dbg-hint.flush{margin-left:0;margin-top:5px}',
    '.dbg-g.hide-hints .dbg-hint{display:none}',
    '.dbg-row{display:flex;align-items:center;gap:8px;padding:2px 0}',
    '.dbg-row span{flex:0 0 84px;color:var(--muted)}',
        // A range input claims every touch it receives, so dragging the drawer
    // upward with a finger that happens to start on a slider moved the
    // slider instead of scrolling. pan-y hands vertical gestures back to
    // the scroller and leaves the horizontal ones, which is all a
    // horizontal slider ever needs.
    '.dbg-row input[type=range]{flex:1;min-width:0;accent-color:var(--link);height:26px;',
    'touch-action:pan-y}',
    '.dbg-row b{flex:0 0 44px;text-align:right;color:var(--btn-ink)}',
    '.dbg-act{display:flex;gap:6px;padding:8px 10px}',
    '.dbg-act button{flex:1;padding:10px;font:inherit;font-size:9px;letter-spacing:.12em;',
    'color:var(--btn-ink);background:var(--btn);border:1px solid var(--bar-line);',
    'border-radius:4px;cursor:pointer}',
    '.dbg-btn{flex:0 0 auto;width:26px;height:20px;display:flex;align-items:center;',
    'justify-content:center;font:inherit;font-size:11px;color:var(--btn-ink);background:var(--btn);',
    'border:1px solid var(--bar-line);border-radius:4px;cursor:pointer;margin-left:6px}',
    '.dbg-btn.on{border-color:var(--link)}'
  ].join('');

  function style() {
    var s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function panel(id, fields, onChange) {
    var KEY = 'dc.dbg.' + id;
    var tune = {};
    var defaults = {};
    var byKey = {};
    var game = null;
    // One note element per choice field, keyed by field. A single shared slot
    // would let a second choice group overwrite the first one's note.
    var ui = { rows: {}, segs: {}, toggles: {}, notes: {}, lives: [] };

    fields.forEach(function (f) {
      byKey[f.key] = f;
      defaults[f.key] = f.value;
      tune[f.key] = f.value;
    });

    // Share mode. "?share=1" hides the drawer completely and takes the values
    // from the URL, so a published link always plays one fixed setup and the
    // person you sent it to sees a game, not a control panel.
    var params = new URLSearchParams(global.location.search);
    var share = params.get('share') === '1';

    function readParam(f, raw) {
      if (f.type === 'toggle') return raw === '1' || raw === 'true';
      if (f.type === 'choice') return Math.max(0, Math.min(f.options.length - 1, parseInt(raw, 10) || 0));
      var n = parseFloat(raw);
      return isNaN(n) ? tune[f.key] : n;
    }

    function applyUrl() {
      var keys = [];
      params.forEach(function (raw, k) {
        if (!byKey[k]) return;
        tune[k] = readParam(byKey[k], raw);
        keys.push(k);
      });
      // Let the game react, so a mechanic can set its own presets.
      if (onChange) keys.forEach(function (k) { onChange(k, tune); });
      // A value written in the URL wins over anything onChange just changed.
      keys.forEach(function (k) { tune[k] = readParam(byKey[k], params.get(k)); });
      return keys;
    }

    // A fingerprint of one field's declared default. If that default changes -
    // which is what happens when the game is retuned or rescaled - the stored
    // value is from a different game and must be dropped, or it silently
    // overwrites the new one and nothing behaves as written.
    //
    // PER FIELD, deliberately. This used to be one fingerprint of all fifty
    // fields, so changing a single default threw away every value the player
    // had tuned. That is a data-loss bug wearing the costume of a safety check:
    // it did far more damage than the stale value it was guarding against.
    function sigOf(f) {
      return String(f.value) + (f.type === 'range' ? ':' + f.min + '-' + f.max : '');
    }
    var SIGS = {};
    fields.forEach(function (f) { SIGS[f.key] = sigOf(f); });

    if (!share) {
      try {
        var store = JSON.parse(localStorage.getItem(KEY) || '{}');
        var vals = store.values || {};
        var sigs = store.sigs || {};
        Object.keys(vals).forEach(function (k) {
          if (!byKey[k]) return;                              // field is gone
          if (typeof vals[k] !== typeof defaults[k]) return;  // type changed
          if (sigs[k] !== SIGS[k]) return;                    // THIS default moved
          tune[k] = vals[k];
        });
      } catch (e) { /* ignore a bad stored value */ }
    }

    applyUrl();

    // In share mode the published setup IS the default for that build, so the
    // game does not brand itself TUNED and still keeps a high score.
    if (share) fields.forEach(function (f) { defaults[f.key] = tune[f.key]; });

    function save() {
      var values = {};
      fields.forEach(function (f) { values[f.key] = tune[f.key]; });
      try { localStorage.setItem(KEY, JSON.stringify({ sigs: SIGS, values: values })); }
      catch (e) { /* ignore */ }
    }

    function isDefault() {
      return Object.keys(defaults).every(function (k) { return tune[k] === defaults[k]; });
    }

    function fmt(f) {
      var v = tune[f.key];
      return f.dec ? v.toFixed(f.dec) : String(v);
    }

    function set(key, value, silent) {
      tune[key] = value;
      if (onChange && !silent) onChange(key, tune);
      save();
      refresh();
      if (byKey[key].restart && game && game.restart) game.restart();
    }

    function refresh() {
      ui.lives.forEach(function (l) {
        try { l.el.textContent = l.f.live(tune); } catch (e) { /* never break the drawer */ }
      });
      fields.forEach(function (f) {
        if (f.type === 'range' && ui.rows[f.key]) {
          ui.rows[f.key].input.value = tune[f.key];
          ui.rows[f.key].out.textContent = fmt(f);
        } else if (f.type === 'choice' && ui.segs[f.key]) {
          ui.segs[f.key].forEach(function (b, i) {
            b.className = i === tune[f.key] ? 'on' : '';
          });
          if (f.notes && ui.notes[f.key]) ui.notes[f.key].textContent = f.notes[tune[f.key]] || '';
        } else if (f.type === 'toggle' && ui.toggles[f.key]) {
          ui.toggles[f.key].className = tune[f.key] ? 'on' : '';
        }
      });
    }

    // One short line under a control saying what it changes. Ranges and toggles
    // had no way to carry this at all - only choice groups did - which left most
    // of the drawer unexplained.
    function hint(parent, f, flush) {
      if (!f.note && !f.live) return;
      var el = document.createElement('div');
      el.className = flush ? 'dbg-hint flush' : 'dbg-hint';
      el.textContent = f.note || '';
      parent.appendChild(el);
      // A live note recomputes from the current values on every refresh. Some
      // dials only mean something in combination - jump height against floor
      // spacing, say - and a number nobody can see is a number nobody checks.
      if (f.live) ui.lives.push({ f: f, el: el });
    }

    function group(title) {
      var d = document.createElement('div');
      d.className = 'dbg-g';
      var h = document.createElement('h4');
      h.textContent = title;
      d.appendChild(h);
      return d;
    }

    function build() {
      style();

      var host = document.createElement('div');
      host.id = 'debug';

      var groups = {};
      var pendingToggleHints = [];
      fields.forEach(function (f) {
        var name = f.group || 'OPTIONS';
        if (!groups[name]) { groups[name] = group(name); host.appendChild(groups[name]); }
        var g = groups[name];

        if (f.type === 'choice') {
          var seg = document.createElement('div');
          seg.className = 'dbg-seg';
          ui.segs[f.key] = f.options.map(function (label, i) {
            var b = document.createElement('button');
            b.type = 'button';
            b.textContent = label;
            b.addEventListener('click', function () { set(f.key, i); });
            seg.appendChild(b);
            return b;
          });
          g.appendChild(seg);
          if (f.notes) {
            var note = document.createElement('p');
            note.className = 'dbg-note';
            g.appendChild(note);
            ui.notes[f.key] = note;
          }
        } else if (f.type === 'range') {
          var row = document.createElement('label');
          row.className = 'dbg-row';
          var name2 = document.createElement('span');
          name2.textContent = f.label;
          var input = document.createElement('input');
          input.type = 'range';
          input.min = f.min; input.max = f.max; input.step = f.step;
          var out = document.createElement('b');
          input.addEventListener('input', function () {
            tune[f.key] = parseFloat(input.value);
            out.textContent = fmt(f);
          });
          input.addEventListener('change', function () { set(f.key, parseFloat(input.value)); });
          row.appendChild(name2); row.appendChild(input); row.appendChild(out);
          g.appendChild(row);
          hint(g, f);
          ui.rows[f.key] = { input: input, out: out };
        } else {
          var box = g.querySelector('.dbg-toggles');
          if (!box) { box = document.createElement('div'); box.className = 'dbg-toggles'; g.appendChild(box); }
          var t = document.createElement('button');
          t.type = 'button';
          t.textContent = f.label;
          t.addEventListener('click', function () { set(f.key, !tune[f.key]); });
          box.appendChild(t);
          ui.toggles[f.key] = t;
          if (f.note) pendingToggleHints.push(f);
        }
      });

      // Toggles all live in one flex box, so their notes cannot sit under each
      // button. They are listed together underneath it instead.
      pendingToggleHints.forEach(function (f) {
        var host2 = ui.toggles[f.key].parentNode.parentNode;
        hint(host2, { note: f.label + ' \u2014 ' + f.note }, true);
      });

      var act = document.createElement('div');
      act.className = 'dbg-act';
      var restart = document.createElement('button');
      restart.type = 'button';
      restart.textContent = 'RESTART RUN';
      restart.addEventListener('click', function () { if (game && game.restart) game.restart(); });
      var copy = document.createElement('button');
      copy.type = 'button';
      copy.textContent = 'COPY SETUP';
      copy.addEventListener('click', function () {
        var parts = [];
        fields.forEach(function (f) {
          if (tune[f.key] === defaults[f.key]) return;        // only what was changed
          var v = f.type === 'toggle' ? (tune[f.key] ? 1 : 0) : tune[f.key];
          parts.push(encodeURIComponent(f.key) + '=' + encodeURIComponent(v));
        });
        var url = global.location.origin + global.location.pathname +
                  (parts.length ? '?' + parts.join('&') : '');
        function done(ok) {
          copy.textContent = ok ? (parts.length + ' CHANGES COPIED') : 'COPY FAILED';
          copy.classList.toggle('on', ok);
          setTimeout(function () { copy.textContent = 'COPY SETUP'; copy.classList.remove('on'); }, 2200);
        }
        if (global.navigator.clipboard && global.navigator.clipboard.writeText) {
          global.navigator.clipboard.writeText(url).then(function () { done(true); },
                                                        function () { done(false); });
        } else {
          done(false);
        }
      });

      var reset = document.createElement('button');
      reset.type = 'button';
      reset.textContent = 'RESET ALL';
      reset.addEventListener('click', function () {
        Object.keys(defaults).forEach(function (k) { tune[k] = defaults[k]; });
        save(); refresh();
        if (game && game.restart) game.restart();
      });
      act.appendChild(restart); act.appendChild(copy); act.appendChild(reset);
      host.appendChild(act);

      document.body.appendChild(host);

      var btn = document.createElement('button');
      btn.className = 'dbg-btn';
      btn.type = 'button';
      btn.textContent = '⚙';
      btn.title = 'Tuning';
      btn.addEventListener('click', function () {
        var open = host.classList.toggle('open');
        btn.classList.toggle('on', open);
        // the canvas shares the height, so let it re-fit
        window.dispatchEvent(new Event('resize'));
      });
      var bar = document.getElementById('bar');
      if (bar) bar.appendChild(btn);

      refresh();
    }

    if (!share) {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
      else build();
    }

    tune.__isDefault = isDefault;
    global.Debug.bind = function (g) { game = g; };
    return tune;
  }

  global.Debug = { panel: panel, bind: function () {} };

})(window);
