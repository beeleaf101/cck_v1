/* Accessibility helper for screens that are built in JavaScript.
 * Many form fields and icon buttons are created on the fly without a visible <label>.
 * This gives each one an accessible name from its placeholder, title, nearby label text
 * or id, so screen readers can announce it, and makes scrollable panels keyboard-reachable.
 * It never changes what is shown on screen. */
(function () {
  'use strict';
  function humanise(s) {
    return String(s || '').replace(/[-_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  }
  function hasName(el) {
    if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.title) return true;
    if (el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]')) return true;
    return !!el.closest('label');
  }
  function nearbyText(el) {
    var p = el.previousElementSibling;
    if (p && /^(LABEL|SPAN|DIV|STRONG|B|P)$/.test(p.tagName)) {
      var t = (p.textContent || '').trim();
      if (t && t.length <= 60) return t;
    }
    var parent = el.parentElement;
    if (parent) {
      var lab = parent.querySelector('label, .form-label, .label');
      if (lab && lab !== el && (lab.textContent || '').trim().length <= 60) return lab.textContent.trim();
    }
    return '';
  }
  function fix(root) {
    var scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('input:not([type=hidden]), select, textarea').forEach(function (el) {
      if (hasName(el)) return;
      var name = el.placeholder || nearbyText(el) || humanise(el.name || el.id) ||
        (el.tagName === 'SELECT' && el.options[0] ? 'Choose ' + el.options[0].text.replace(/^[-\s]+|[-\s]+$/g, '') : '') ||
        (el.type === 'checkbox' ? 'Select' : 'Input');
      el.setAttribute('aria-label', name);
    });
    scope.querySelectorAll('button, [role=button]').forEach(function (el) {
      if ((el.textContent || '').trim() || hasName(el)) return;
      var hint = humanise(el.id || el.className.split(' ')[0] || 'button').replace(/\bbtn\b/i, '').trim();
      var onclick = el.getAttribute('onclick') || '';
      if (/close/i.test(el.className + onclick)) hint = 'Close';
      el.setAttribute('aria-label', hint || 'Button');
    });
    scope.querySelectorAll('div, section, aside, nav, main').forEach(function (el) {
      if (el.tabIndex >= 0) return;
      var cs = getComputedStyle(el);
      var scrollY = (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 2;
      var scrollX = (cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 2;
      if ((scrollY || scrollX) && !el.querySelector('a, button, input, select, textarea, [tabindex]')) {
        el.setAttribute('tabindex', '0');
        if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', 'Scrollable panel');
      }
    });
  }
  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    (window.requestAnimationFrame || setTimeout)(function () { pending = false; fix(document); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule);
  else schedule();
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  window.cckA11yFix = fix;
})();
