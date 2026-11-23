// CCK shared store
// ----------------------------------------------------------------------------
// The portals (HOD, Registration 1/2, Facility, Nehad, Student Hub) and the admin's
// Portal Review were written to keep their data in localStorage ("cck_*" keys). That only
// works inside one browser, so a submission on the HOD's computer never reached the admin.
//
// This script keeps those keys on the server (Cloudflare D1, /api/state):
//   * before any other script runs, it loads the shared keys into localStorage
//     (a synchronous request, so the existing page code finds its data as before);
//   * every localStorage write to a shared key is sent to the server;
//   * every 15 seconds, and when the tab gets focus, changes made by others are pulled in.
// The server decides who may read or write what (for example, only the admin can approve).
// Load this file first on every page, before cck_shared.js / app.js.
(function () {
  'use strict';

  var ls = window.localStorage;
  var proto = Object.getPrototypeOf(ls);
  var rawSet = proto.setItem, rawGet = proto.getItem, rawRemove = proto.removeItem;

  // Keys that stay in this browser only (caches of private data, per-device UI state)
  var LOCAL_ONLY = { cck_nehad_authed: 1, cck_students: 1, cck_students_app: 1, cck_audit_last_seen: 1, cck_current_semester: 1 };
  var LOCAL_PREFIXES = ['cck_semester_data_'];
  var STUDENT_WRITABLE = { cck_joined_clubs: 1, cck_registration_requests: 1 };

  function isShared(key) {
    if (typeof key !== 'string' || !/^cck_[A-Za-z0-9_]{1,80}$/.test(key)) return false;
    if (LOCAL_ONLY[key]) return false;
    for (var i = 0; i < LOCAL_PREFIXES.length; i++) if (key.indexOf(LOCAL_PREFIXES[i]) === 0) return false;
    return true;
  }

  var session = { role: null, user_id: null };
  var lastSync = 0;
  var pending = {};      // key -> {value, remove}
  var timers = {};

  function notify(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type || 'error');
    else console.warn('[cck-store]', msg);
  }

  function apply(state) {
    Object.keys(state).forEach(function (k) {
      if (pending[k]) return; // our own unsent change wins until it is sent
      rawSet.call(ls, k, state[k]);
    });
  }

  // ---------------------------------------------------------------- load (blocking)
  function clearShared() {
    for (var i = ls.length - 1; i >= 0; i--) {
      var k = ls.key(i);
      if (isShared(k)) rawRemove.call(ls, k);
    }
  }

  function loadNow() {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/state', false);
      xhr.send(null);
      if (xhr.status !== 200) return;
      var data = JSON.parse(xhr.responseText);
      session.role = data.role;
      session.user_id = data.user_id;
      lastSync = data.now || Date.now();
      if (session.role) {
        // The server is the source of truth: drop stale shared keys this browser kept from before
        for (var i = ls.length - 1; i >= 0; i--) {
          var k = ls.key(i);
          if (isShared(k) && !(k in data.state)) rawRemove.call(ls, k);
        }
        apply(data.state);
      }
    } catch (e) {
      console.warn('[cck-store] could not load shared data', e);
    }
  }
  loadNow();
  window.CCK_SESSION = session;

  // ---------------------------------------------------------------- pushing changes
  function canWrite(key) {
    if (!session.role) return false;
    if (session.role === 'student') return !!STUDENT_WRITABLE[key];
    return true;
  }

  function send(key) {
    var p = pending[key];
    if (!p) return;
    var body = JSON.stringify(p.remove ? { remove: true } : { value: p.value });
    var small = body.length < 60000;
    fetch('/api/state/' + encodeURIComponent(key), {
      method: 'PUT', credentials: 'same-origin', keepalive: small,
      headers: { 'content-type': 'application/json' }, body: body,
    }).then(function (res) {
      if (pending[key] === p) delete pending[key];
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (j) {
          notify('Not saved: ' + (j.error || res.statusText));
          refresh(true);
        });
      }
    }).catch(function () {
      // offline: keep it pending and retry
      setTimeout(function () { send(key); }, 5000);
    });
  }

  function queue(key, value, remove) {
    pending[key] = { value: value, remove: !!remove };
    clearTimeout(timers[key]);
    timers[key] = setTimeout(function () { send(key); }, 250);
  }

  proto.setItem = function (key, value) {
    rawSet.call(this, key, value);
    if (this === ls && isShared(key) && canWrite(key)) queue(key, String(value), false);
  };
  proto.removeItem = function (key) {
    rawRemove.call(this, key);
    if (this === ls && isShared(key) && canWrite(key)) queue(key, null, true);
  };

  function flushAll() {
    Object.keys(pending).forEach(function (k) {
      clearTimeout(timers[k]);
      var p = pending[k];
      var body = JSON.stringify(p.remove ? { remove: true } : { value: p.value });
      try {
        var x = new XMLHttpRequest();
        x.open('PUT', '/api/state/' + encodeURIComponent(k), false);
        x.setRequestHeader('content-type', 'application/json');
        x.send(body);
        delete pending[k];
      } catch (e) { /* leaving the page */ }
    });
  }
  window.addEventListener('pagehide', flushAll);

  // ---------------------------------------------------------------- pulling others' changes
  function refresh(full) {
    if (!session.role) return;
    fetch('/api/state' + (full ? '' : '?since=' + (lastSync - 2000)), { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.role) return;
        lastSync = d.now || Date.now();
        var changed = Object.keys(d.state).filter(function (k) { return !pending[k] && rawGet.call(ls, k) !== d.state[k]; });
        if (!changed.length) return;
        apply(d.state);
        window.dispatchEvent(new CustomEvent('cck:remote-update', { detail: { keys: changed } }));
      })
      .catch(function () {});
  }
  setInterval(refresh, 15000);
  window.addEventListener('focus', function () { refresh(false); });

  // The portal sidebars show a database badge that used to track Supabase; show the
  // shared-store state instead (pages may set it again while loading, so repeat once).
  function showSynced() {
    var el = document.getElementById('db-status');
    if (!el || !session.role) return;
    el.textContent = '\u25CF Synced';
    el.classList.remove('offline');
    el.classList.add('online');
    el.style.color = '#4ADE80';
    el.title = 'Changes are saved to the shared CCK database';
  }
  document.addEventListener('DOMContentLoaded', showSynced);
  window.addEventListener('load', function () { setTimeout(showSynced, 1500); });

  // ---------------------------------------------------------------- helpers for pages
  window.cckStore = {
    flush: flushAll,
    refresh: function () { refresh(true); },
    session: session,
    // call right after logging in on a page that does not reload (the main app)
    reload: loadNow,
    // call on logout: forget this user's shared data in this browser
    reset: function () { flushAll(); session.role = null; session.user_id = null; clearShared(); },
  };

  // Log out everywhere (server session) and go back to the login page
  window.cckLogout = function () {
    flushAll();
    clearShared();
    fetch('/api/auth/logout', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }, body: '{}',
    }).finally(function () { window.location.href = '/'; });
  };
})();
