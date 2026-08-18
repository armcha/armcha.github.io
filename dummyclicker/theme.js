/* theme.js - light / dark theme for the DummyClicker prototypes.
 *
 * Load this in <head>, before anything paints, so the page never shows the
 * wrong colours for a frame.
 *
 * With no stored choice the page follows the device setting through the CSS
 * prefers-color-scheme rules. Once the user presses the toggle, the choice is
 * stored and pinned on <html data-theme>, which wins over the media query.
 */
(function (global) {
  'use strict';

  var KEY = 'dc.theme';
  var listeners = [];
  var mq = global.matchMedia ? global.matchMedia('(prefers-color-scheme: dark)') : null;

  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }

  function resolve() {
    var s = stored();
    if (s === 'light' || s === 'dark') return s;
    return mq && mq.matches ? 'dark' : 'light';
  }

  function apply() {
    var t = resolve();
    var el = document.documentElement;
    if (stored()) el.setAttribute('data-theme', t);
    else el.removeAttribute('data-theme');
    el.style.colorScheme = t;
    for (var i = 0; i < listeners.length; i++) listeners[i](t);
    updateButtons(t);
    return t;
  }

  var buttons = [];

  function updateButtons(t) {
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].textContent = t === 'dark' ? '☼' : '☾';
      buttons[i].setAttribute('aria-label', t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
      buttons[i].title = t === 'dark' ? 'Light theme' : 'Dark theme';
    }
  }

  function set(t) {
    try {
      if (t === 'light' || t === 'dark') localStorage.setItem(KEY, t);
      else localStorage.removeItem(KEY);
    } catch (e) { /* private mode: the theme lasts for this page only */ }
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    apply();
  }

  function toggle() { set(resolve() === 'dark' ? 'light' : 'dark'); }

  function mount(host) {
    if (!host) return null;
    var b = document.createElement('button');
    b.className = 'theme-toggle';
    b.type = 'button';
    b.addEventListener('click', function (e) { e.preventDefault(); toggle(); });
    host.appendChild(b);
    buttons.push(b);
    updateButtons(resolve());
    return b;
  }

  if (mq && mq.addEventListener) {
    mq.addEventListener('change', function () { if (!stored()) apply(); });
  }

  global.Theme = {
    get: resolve,
    set: set,
    toggle: toggle,
    mount: mount,
    onChange: function (fn) { listeners.push(fn); return fn; }
  };

  // Pin the stored choice immediately, before the body renders.
  var s = stored();
  if (s === 'light' || s === 'dark') {
    document.documentElement.setAttribute('data-theme', s);
    document.documentElement.style.colorScheme = s;
  }

  document.addEventListener('DOMContentLoaded', function () {
    mount(document.getElementById('bar'));
    apply();
  });

})(window);
