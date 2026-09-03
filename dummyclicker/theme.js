/* theme.js - there is no night mode any more.
 *
 * The game and every page around it are daylight only. This file stays because
 * eleven pages load it and their CSS is written as
 * ":root:not([data-theme='light'])" for the dark blocks - pinning data-theme to
 * light on the root element switches all of those off in one move, without
 * having to strip the media queries out of every stylesheet.
 *
 * The API is kept so nothing that calls it has to change: get() always answers
 * 'light', set and toggle do nothing, mount adds no button, and onChange never
 * fires because the theme cannot change.
 */
(function (global) {
  'use strict';

  function apply() {
    if (document.documentElement) document.documentElement.setAttribute('data-theme', 'light');
  }

  apply();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  }

  global.Theme = {
    get: function () { return 'light'; },
    set: apply,
    toggle: apply,
    mount: function () { return null; },
    onChange: function () { }
  };

})(window);
