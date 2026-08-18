// SPDX-License-Identifier: Apache-2.0
/*
 * Single-screen embed mode for the mockup galleries.
 *
 * Documentation pages iframe these galleries with `?screen=<slug>` to show one
 * frame inline. Rather than re-parenting the frame (which would break the
 * gallery CSS that depends on ancestors like `.phone-grid`), this hides every
 * sibling along the path from <body> to the target and strips page chrome.
 *
 * The measured height is posted to the parent so the iframe can size itself.
 */
(function () {
  var params = new URLSearchParams(window.location.search);
  var screen = params.get('screen');
  if (!screen) return;

  var showLabel = params.get('label') === '1';
  var root = document.documentElement;
  root.setAttribute('data-embed', '');
  root.setAttribute('data-embed-pending', '');

  var style = document.createElement('style');
  style.textContent = [
    'html[data-embed-pending] body { visibility: hidden; }',
    'html[data-embed] { background: transparent; }',
    'html[data-embed] body { margin: 0; padding: 0; background: transparent; overflow: hidden; }',
    'html[data-embed] [data-embed-hidden] { display: none !important; }',
    'html[data-embed] [data-embed-path] {',
    '  display: block !important; margin: 0 !important; padding: 0 !important;',
    '  max-width: none !important; width: auto !important; min-height: 0 !important;',
    '  border: 0 !important; background: transparent !important; box-shadow: none !important;',
    '  gap: 0 !important;',
    '}',
    'html[data-embed] [data-embed-target] {',
    '  display: inline-block !important; margin: 0 !important; padding: 0 !important;',
    '}',
  ].join('\n');
  document.head.appendChild(style);

  function isolate() {
    var target = document.querySelector('[data-screen="' + CSS.escape(screen) + '"]');
    if (!target) {
      root.removeAttribute('data-embed-pending');
      return;
    }

    target.setAttribute('data-embed-target', '');
    var node = target;
    while (node && node !== document.body) {
      var parent = node.parentElement;
      if (!parent) break;
      for (var i = 0; i < parent.children.length; i += 1) {
        var child = parent.children[i];
        if (child !== node) child.setAttribute('data-embed-hidden', '');
      }
      if (parent !== document.body) parent.setAttribute('data-embed-path', '');
      node = parent;
    }

    if (!showLabel) {
      var labels = target.querySelectorAll('.screen-meta, .frame-label, .mock-label, .screen-note');
      for (var j = 0; j < labels.length; j += 1) labels[j].setAttribute('data-embed-hidden', '');
    }

    root.removeAttribute('data-embed-pending');
    report(target);
    if (window.ResizeObserver) new ResizeObserver(function () { report(target); }).observe(target);
    window.addEventListener('load', function () { report(target); });
  }

  var lastHeight = 0;
  function report(target) {
    var rect = target.getBoundingClientRect();
    var height = Math.ceil(rect.height);
    var width = Math.ceil(rect.width);
    if (!height || height === lastHeight) return;
    lastHeight = height;
    window.parent.postMessage(
      { type: 'claire-mockup-size', screen: screen, height: height, width: width },
      '*',
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', isolate);
  } else {
    isolate();
  }
})();
