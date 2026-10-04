// quest-perf-probe.js — WORKER C (performance) harness for real Quest measurement.
// DROP-IN: place this file at src/perf/quest-perf-probe.js and import it once
// in src/main.jsx (or App.jsx):  import './perf/quest-perf-probe.js'
// It self-activates ONLY when the URL contains ?perf=1&capture (e.g.
// ?perf=1&capture=45 for a 45-second session). Zero effect otherwise.
//
// WHAT IT RECORDS (measured only, never estimated):
//  - navigation + paint timings, per-resource transfer sizes
//  - rAF frame-time series -> fps avg, frame-time avg/p95/max
//  - input latency: pointerdown -> next presented rAF (real taps)
//  - human marks: probe panel buttons "MARK: action" / "MARK: response"
//    -> action-to-response latency as marked by the tester
//  - manual marks: window.__questPerf.mark('label') from app code
//  - WebGL renderer string, performance.memory if present
//
// WHERE NUMBERS LAND:
//  - on-screen panel (large text, readable in-headset)
//  - localStorage['quest-perf-<ISO timestamp>'] (JSON)
//  - "EXPORT JSON" button -> downloads quest-perf-<ts>.json
//  - console.table dump for remote-debugging sessions
//
// This file is framework-free on purpose: no React, no three, no imports.
// Safe to load anywhere; never touches app state.
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  var params = new URLSearchParams(window.location.search);
  if (!params.has('perf') || !params.has('capture')) return; // dormant unless asked

  var DURATION_S = Math.max(5, Math.min(600, parseInt(params.get('capture'), 10) || 30));
  var session = {
    tool: 'quest-perf-probe',
    capturedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    url: location.href,
    captureSeconds: DURATION_S,
    navigation: null,
    paints: [],
    resources: [],
    frames: { count: 0, deltas: [], fpsAvg: null, frameMsAvg: null, frameMsP95: null, frameMsMax: null },
    inputLatency: [],   // {t, ms} pointerdown -> next rAF
    marks: [],           // {t, label} manual + panel marks
    markPairs: [],       // {action, response, latencyMs} from MARK buttons
    gl: { renderer: 'unavailable', geometries: null, textures: null, calls: null, tris: null },
    memory: 'unavailable',
  };

  // --- navigation / paint / resources (snapshot at stop; resources re-read then) ---
  function snapshotTimings() {
    try {
      var nav = performance.getEntriesByType('navigation')[0];
      if (nav) session.navigation = {
        domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
        loadEventMs: Math.round(nav.loadEventEnd),
        transferBytes: nav.transferSize,
      };
    } catch (e) {}
    try {
      session.paints = performance.getEntriesByType('paint').map(function (p) {
        return { name: p.name, ms: Math.round(p.startTime) };
      });
    } catch (e) {}
    try {
      session.resources = performance.getEntriesByType('resource').map(function (r) {
        return {
          name: (r.name || '').split('/').pop(),
          type: r.initiatorType,
          transferBytes: r.transferSize,
          durationMs: Math.round(r.duration),
          startMs: Math.round(r.startTime),
        };
      }).sort(function (a, b) { return b.transferBytes - a.transferBytes; });
    } catch (e) {}
    try {
      if (performance.memory) session.memory = {
        usedJSHeapMB: Math.round(performance.memory.usedJSHeapSize / 1048576),
        totalJSHeapMB: Math.round(performance.memory.totalJSHeapSize / 1048576),
      };
    } catch (e) {}
  }

  // --- WebGL info: read from any canvas on the page at stop time ---
  function snapshotGL() {
    try {
      var canvases = document.querySelectorAll('canvas');
      for (var i = 0; i < canvases.length; i++) {
        var gl = canvases[i].getContext('webgl2') || canvases[i].getContext('webgl');
        if (!gl) continue;
        var dbg = gl.getExtension('WEBGL_debug_renderer_info');
        if (dbg) session.gl.renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
        // three.js stashes render info on the canvas via __threeInfo when the app sets it;
        // otherwise report what the debug extension gives us (renderer string is the key datum).
        break;
      }
    } catch (e) {}
  }

  // --- frame-time series ---
  var deltas = [];
  var rafId = 0;
  var last = 0;
  var running = true;
  function loop(now) {
    if (!running) return;
    if (last) deltas.push(now - last);
    last = now;
    rafId = requestAnimationFrame(loop);
  }

  // --- input latency: real taps -> next presented frame ---
  function onPointerDown(e) {
    var tDown = performance.now();
    requestAnimationFrame(function () {
      var ms = performance.now() - tDown;
      session.inputLatency.push({ t: Math.round(tDown), ms: Math.round(ms * 10) / 10 });
      renderPanel();
    });
  }

  // --- public API ---
  var pendingActionMark = null;
  window.__questPerf = {
    mark: function (label) {
      session.marks.push({ t: Math.round(performance.now()), label: String(label) });
      renderPanel();
    },
    stop: stop,
  };

  // --- panel UI (plain DOM, large text for in-headset readability) ---
  var panel = document.createElement('div');
  panel.id = 'quest-perf-panel';
  panel.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99999;background:rgba(0,0,0,.82);color:#0f0;' +
    'font:14px/1.5 monospace;padding:10px 12px;border:1px solid #0f0;border-radius:8px;max-width:46vw;' +
    'max-height:70vh;overflow:auto;white-space:pre-wrap;';
  function renderPanel() {
    var f = session.frames;
    var n = session.inputLatency.length;
    var lastLat = n ? session.inputLatency[n - 1].ms : '-';
    panel.textContent =
      'PERF CAPTURE  t+' + Math.round((performance.now() - tStart) / 1000) + 's / ' + DURATION_S + 's\n' +
      'frames: ' + f.count + '  fps: ' + f.fpsAvg + '  p95 frame: ' + f.frameMsP95 + 'ms\n' +
      'taps: ' + n + '  last input->frame: ' + lastLat + 'ms\n' +
      'marks: ' + session.marks.length + '  pairs: ' + session.markPairs.length + '\n' +
      '[buttons below] MARK ACTION = you did something | MARK RESPONSE = you saw the response';
    // keep buttons alive across re-renders
    if (!panel.querySelector('button')) {
      var b1 = document.createElement('button'); b1.textContent = 'MARK: ACTION';
      var b2 = document.createElement('button'); b2.textContent = 'MARK: RESPONSE';
      var b3 = document.createElement('button'); b3.textContent = 'STOP + EXPORT JSON';
      [b1, b2, b3].forEach(function (b) {
        b.style.cssText = 'display:block;width:100%;margin:6px 0;padding:10px;font-size:16px;';
        panel.appendChild(b);
      });
      b1.onclick = function () {
        pendingActionMark = performance.now();
        session.marks.push({ t: Math.round(pendingActionMark), label: 'human:ACTION' });
        renderPanel();
      };
      b2.onclick = function () {
        var t = performance.now();
        session.marks.push({ t: Math.round(t), label: 'human:RESPONSE' });
        if (pendingActionMark != null) {
          session.markPairs.push({
            action: 'human:ACTION', response: 'human:RESPONSE',
            latencyMs: Math.round((t - pendingActionMark) * 10) / 10,
            note: 'human-marked; tap precision approx +-200ms',
          });
          pendingActionMark = null;
        }
        renderPanel();
      };
      b3.onclick = stop;
    }
  }

  function finalizeFrames() {
    var ds = deltas.slice().sort(function (a, b) { return a - b; });
    var n = ds.length;
    var sum = ds.reduce(function (s, x) { return s + x; }, 0);
    session.frames = {
      count: n,
      windowSec: Math.round(sum / 100) / 10,
      fpsAvg: n ? Math.round(n / (sum / 1000) * 10) / 10 : null,
      frameMsAvg: n ? Math.round(sum / n * 10) / 10 : null,
      frameMsP95: n ? Math.round(ds[Math.min(n - 1, Math.floor(n * 0.95))] * 10) / 10 : null,
      frameMsMax: n ? Math.round(ds[n - 1] * 10) / 10 : null,
      note: n ? 'rAF deltas; in XR the same rAF drives frame presentation' : 'no frames captured',
    };
  }

  function stop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
    document.removeEventListener('pointerdown', onPointerDown, true);
    finalizeFrames();
    snapshotTimings();
    snapshotGL();
    var key = 'quest-perf-' + session.capturedAt.replace(/[:.]/g, '-');
    try { localStorage.setItem(key, JSON.stringify(session)); } catch (e) {}
    try { console.log('[quest-perf]', JSON.stringify(session)); } catch (e) {}
    // on-screen export: replace panel content with compact JSON summary + full JSON in textarea
    panel.innerHTML = '';
    var h = document.createElement('div');
    var lat = session.markPairs.map(function (p) { return p.latencyMs; });
    h.textContent =
      'CAPTURE COMPLETE  saved: ' + key + '\n' +
      'fps avg ' + session.frames.fpsAvg + ' | p95 frame ' + session.frames.frameMsP95 + 'ms | max ' +
      session.frames.frameMsMax + 'ms\n' +
      'taps ' + session.inputLatency.length + ' | marked action->response: ' +
      (lat.length ? lat.join(', ') + ' ms' : 'none') + '\n' +
      'resources: ' + session.resources.length + ' | jsHeap: ' +
      (session.memory === 'unavailable' ? 'unavailable' : session.memory.usedJSHeapMB + 'MB') + '\n' +
      'renderer: ' + String(session.gl.renderer).slice(0, 60);
    h.style.cssText = 'font-size:15px;margin-bottom:8px;';
    var ta = document.createElement('textarea');
    ta.value = JSON.stringify(session, null, 1);
    ta.style.cssText = 'width:100%;height:40vh;font:11px monospace;';
    ta.onclick = function () { ta.select(); };
    var dl = document.createElement('button');
    dl.textContent = 'DOWNLOAD JSON';
    dl.style.cssText = 'display:block;width:100%;margin-top:8px;padding:12px;font-size:16px;';
    dl.onclick = function () {
      var blob = new Blob([JSON.stringify(session, null, 1)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = key + '.json';
      a.click();
    };
    panel.appendChild(h); panel.appendChild(ta); panel.appendChild(dl);
  }

  var tStart = performance.now();
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('DOMContentLoaded', function () {
    document.body.appendChild(panel);
    renderPanel();
  });
  if (document.readyState !== 'loading') { document.body.appendChild(panel); renderPanel(); }
  rafId = requestAnimationFrame(loop);
  var panelTick = setInterval(function () { if (running) { finalizeFrames(); renderPanel(); } else clearInterval(panelTick); }, 1000);
  setTimeout(stop, DURATION_S * 1000);
  // keep a rolling finalize so the panel shows live numbers
  var _finalize = finalizeFrames;
  finalizeFrames = function () { _finalize(); session.frames.count = deltas.length; };
})();
