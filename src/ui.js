/*
 * Erstellt mit Claude Code (KI-Werkzeug) im Auftrag von Dominik Wittkow,
 * W-Seminar Physik, CSG Ingolstadt, 24.09.2026.
 *
 * ui.js — Bedienelemente, Reiter, Debug-Panel, Graphen der Simulation.
 * Physikalische Werte kommen ausschließlich aus src/physics.js.
 *
 * Der β-Regler und die Beschleunigungs-Einstellungen gibt es zweimal (in der
 * Simulation und in der Übersicht). Beide schreiben in denselben Zustand und
 * werden nach jeder Änderung gemeinsam aktualisiert.
 */
import {
  lorentzGamma,
  accelerationBeta,
  accelerationDuration,
  accelerationFromDuration,
  ACCELERATION_CURVES,
} from './physics.js';
import { createLineChart, CHART } from './charts.js';

/** Größtes β, das der Regler zulässt. */
export const BETA_MAX = 0.999;

/**
 * Reglerstellung s ∈ [0, 1] → β. Logarithmisch in (1 − β):
 *   β = 1 − 10^(−3·s)
 * s = 0 → β = 0, s = 1/3 → β = 0,9, s = 2/3 → β = 0,99, s = 1 → β = 0,999.
 * Damit ist der Regler im oberen Bereich fein, wo sich am meisten ändert.
 * (Reine Bedienung, keine Physik.)
 */
export function betaFromSlider(s) {
  return 1 - Math.pow(10, -3 * s);
}

/** Umkehrung von betaFromSlider: s = −log10(1 − β) / 3. */
export function sliderFromBeta(beta) {
  return -Math.log10(1 - beta) / 3;
}

export function clampBeta(beta) {
  if (!Number.isFinite(beta)) return 0;
  return Math.min(BETA_MAX, Math.max(0, beta));
}

const $ = (id) => document.getElementById(id);
const parse = (el) => Number(String(el.value).replace(',', '.'));

/* ------------------------------------------------------------------------- */
/* Beschleunigungsphase: Dauer ↔ Eigenbeschleunigung                         */
/* ------------------------------------------------------------------------- */

/**
 * Dauer T und Eigenbeschleunigung a der Beschleunigungsphase von β₀ nach β₁.
 * Je nach Modus ist eines vorgegeben und das andere berechnet
 * (physics.accelerationDuration bzw. accelerationFromDuration).
 * @returns {{T:number, a:number, valid:boolean}}
 */
export function accelTiming(acc) {
  if (Math.abs(acc.beta1 - acc.beta0) < 1e-9) return { T: 0, a: 0, valid: false };
  if (acc.mode === 'acceleration') {
    return { T: accelerationDuration(acc.a, acc.beta0, acc.beta1), a: acc.a, valid: acc.a > 0 };
  }
  return { T: acc.durationS, a: accelerationFromDuration(acc.durationS, acc.beta0, acc.beta1), valid: acc.durationS > 0 };
}

/** β der Beschleunigungskurve zur Zeit t (in S). */
export function accelBetaAt(acc, t) {
  const { T } = accelTiming(acc);
  if (!(T > 0)) return acc.beta0;
  return accelerationBeta(acc.curve, t, T, acc.beta0, acc.beta1);
}

const UNITS = [
  [1, 's'],
  [3600, 'h'],
  [86400, 'Tage'],
  [31557600, 'Jahre'],
];

function betaControlHtml() {
  return `
    <label class="row">β = v/c</label>
    <div class="row">
      <input data-k="slider" type="range" min="0" max="1" step="0.0001" value="0" aria-label="β-Regler" />
      <input data-k="input" type="number" min="0" max="0.999" step="0.001" value="0" aria-label="β" />
    </div>
    <p class="note">Skala logarithmisch in (1 − β): feiner im oberen Bereich.</p>`;
}

function accelControlHtml(inst) {
  const curves = Object.entries(ACCELERATION_CURVES)
    .map(([k, v]) => `<option value="${k}">${v}</option>`)
    .join('');
  const units = UNITS.map(([s, n]) => `<option value="${s}">${n}</option>`).join('');
  return `
    <label class="row">Kurve <select data-k="curve">${curves}</select></label>
    <div class="row"><span>Start-β</span><input data-k="beta0" type="number" min="0" max="0.999" step="0.001" /></div>
    <div class="row"><span>End-β</span><input data-k="beta1" type="number" min="0" max="0.999" step="0.001" /></div>
    <div class="mode-row">
      <label><input type="radio" name="accmode-${inst}" value="acceleration" data-k="mode" /> Beschleunigung vorgeben</label>
      <label><input type="radio" name="accmode-${inst}" value="duration" data-k="mode" /> Dauer vorgeben</label>
    </div>
    <label class="row">Eigenbeschleunigung a
      <span><input data-k="a" type="number" min="0" step="any" /> m/s²</span></label>
    <label class="row">Dauer (Zeit in S)
      <span><input data-k="duration" type="number" min="0" step="any" /> <select data-k="unit">${units}</select></span></label>
    <label class="row">Abspielzeit <span><input data-k="play" type="number" min="1" max="600" step="1" /> s</span></label>
    <div class="row buttons">
      <button type="button" data-action="start">▶ Start</button>
      <button type="button" data-action="pause">⏸ Pause</button>
      <button type="button" data-action="reset">⟲ Zurücksetzen</button>
    </div>
    <p class="note" data-k="info"></p>`;
}

/** Zahl für ein Eingabefeld (Punkt als Dezimaltrenner, ohne überflüssige Stellen). */
function fieldNumber(x, significant = 5) {
  return String(Number(x.toPrecision(significant)));
}

/* ------------------------------------------------------------------------- */
/* Hauptfunktion                                                             */
/* ------------------------------------------------------------------------- */

/**
 * Verbindet alle Bedienelemente mit dem Zustandsobjekt state.
 * Rückgabe: { setBeta(β), refreshAccel(), setAccelInfo(text), setTerrellInfo(rows) }
 */
export function createUI(state, cb) {
  const betaEls = [...document.querySelectorAll('.beta-control')].map((el) => {
    el.innerHTML = betaControlHtml();
    return { slider: el.querySelector('[data-k=slider]'), input: el.querySelector('[data-k=input]') };
  });
  const accelEls = [...document.querySelectorAll('.accel-control')].map((el) => {
    el.innerHTML = accelControlHtml(el.dataset.instance);
    return el;
  });

  // ---- β ----
  function setBeta(beta, sourceEl) {
    state.beta = clampBeta(beta);
    state.gamma = lorentzGamma(state.beta);
    for (const { slider, input } of betaEls) {
      if (slider !== sourceEl) slider.value = String(sliderFromBeta(state.beta));
      if (input !== sourceEl) input.value = state.beta.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
    }
  }
  for (const { slider, input } of betaEls) {
    // Handeingriff am Regler hält eine laufende Beschleunigungsphase an
    slider.addEventListener('input', () => {
      cb.onManualBeta();
      setBeta(betaFromSlider(Number(slider.value)), slider);
    });
    input.addEventListener('change', () => {
      cb.onManualBeta();
      setBeta(parse(input), input);
    });
  }

  // ---- Beschleunigungsphase ----
  const acc = state.accel;
  /** Berechnete Größe neu bestimmen und alle Instanzen der Bedienelemente aktualisieren. */
  function refreshAccel(sourceEl) {
    const { T, a, valid } = accelTiming(acc);
    if (valid) {
      if (acc.mode === 'acceleration') acc.durationS = T;
      else acc.a = a;
    }
    for (const el of accelEls) {
      const f = (k) => el.querySelector(`[data-k=${k}]`);
      const set = (k, v) => {
        const e = f(k);
        if (e !== sourceEl && String(e.value) !== v) e.value = v;
      };
      set('curve', acc.curve);
      set('beta0', String(acc.beta0));
      set('beta1', String(acc.beta1));
      for (const r of el.querySelectorAll('[data-k=mode]')) r.checked = r.value === acc.mode;
      set('unit', String(acc.unitS));
      set('a', valid ? fieldNumber(acc.a) : '–');
      set('duration', valid ? fieldNumber(acc.durationS / acc.unitS) : '–');
      set('play', String(acc.playSeconds));
      // im 3D-Modus läuft die Beschleunigung mit dem Zeitfaktor des Flugs
      f('play').readOnly = !!state.flight?.enabled;
      f('play').title = state.flight?.enabled ? 'Im 3D-Modus gilt der Zeitfaktor des 3D-Flugs' : '';
      // berechnete Größe nur anzeigen, nicht eingeben
      f('a').readOnly = acc.mode !== 'acceleration';
      f('duration').readOnly = acc.mode !== 'duration';
      el.querySelector('[data-action=start]').disabled = !valid;
    }
  }
  for (const el of accelEls) {
    const f = (k) => el.querySelector(`[data-k=${k}]`);
    const on = (k, ev, fn) => f(k).addEventListener(ev, (e) => {
      fn(e.target);
      refreshAccel(e.target);
    });
    on('curve', 'change', (t) => (acc.curve = t.value));
    on('beta0', 'change', (t) => (acc.beta0 = clampBeta(parse(t))));
    on('beta1', 'change', (t) => (acc.beta1 = clampBeta(parse(t))));
    for (const r of el.querySelectorAll('[data-k=mode]')) {
      r.addEventListener('change', () => {
        acc.mode = r.value;
        refreshAccel(null);
      });
    }
    on('a', 'change', (t) => {
      const v = parse(t);
      if (v > 0) acc.a = Math.min(1e9, v);
    });
    on('duration', 'change', (t) => {
      const v = parse(t);
      if (v > 0) acc.durationS = v * acc.unitS;
    });
    on('unit', 'change', (t) => {
      acc.unitS = Number(t.value);
      acc.unitName = t.selectedOptions[0].textContent;
    });
    on('play', 'change', (t) => (acc.playSeconds = Math.min(600, Math.max(1, parse(t) || 20))));
    el.querySelector('[data-action=start]').addEventListener('click', () => cb.onAccelStart());
    el.querySelector('[data-action=pause]').addEventListener('click', () => (acc.running = false));
    el.querySelector('[data-action=reset]').addEventListener('click', () => {
      acc.running = false;
      acc.active = false;
      acc.t = 0;
    });
  }

  // ---- Reiter ----
  for (const btn of document.querySelectorAll('#tabs button')) {
    btn.addEventListener('click', () => {
      for (const b of document.querySelectorAll('#tabs button')) b.setAttribute('aria-selected', String(b === btn));
      $('app').hidden = btn.dataset.tab !== 'sim';
      $('overview').hidden = btn.dataset.tab !== 'overview';
      state.tab = btn.dataset.tab;
      cb.onTab(state.tab);
    });
  }

  // ---- 3D-Flug ----
  const flight = state.flight;
  bindCheckbox('mode3d', (v) => {
    flight.enabled = v;
    $('mode3d-panel').classList.toggle('hidden', !v);
    $('place3d-row').hidden = !v;
    $('flyby').disabled = v;
    cb.onMode3d(v);
    refreshAccel(null);
  });
  $('time-factor').addEventListener('change', (e) => (flight.timeFactor = Number(e.target.value)));
  flight.timeFactor = Number($('time-factor').value);
  $('flight-play').addEventListener('click', () => (flight.running = true));
  $('flight-pause').addEventListener('click', () => (flight.running = false));
  $('flight-reset').addEventListener('click', () => cb.onFlightReset());
  $('density3d').addEventListener('change', (e) => {
    flight.density = Number(e.target.value);
    cb.onField3dChange();
  });
  flight.density = Number($('density3d').value);
  const cellSize = $('cell-size');
  bindRange('cell-size', 'cell-size-out', (v) => (flight.cellSize = v), 0);
  cellSize.addEventListener('change', () => cb.onField3dChange());
  $('place3d').addEventListener('click', () => cb.onPlaceBodies3d());

  // ---- Effekte ----
  bindCheckbox('fx-aberration', (v) => (state.aberration = v));
  bindCheckbox('fx-doppler', (v) => (state.doppler = v));
  bindCheckbox('fx-beaming', (v) => (state.beaming = v));
  for (const r of document.querySelectorAll('input[name=spectrum]')) {
    const apply = () => {
      if (!r.checked) return;
      state.spectrum = r.value;
      $('spectrum-note-visible').hidden = r.value !== 'visible';
      $('spectrum-note-full').hidden = r.value !== 'full';
    };
    r.addEventListener('change', apply);
    apply();
  }
  bindCheckbox('fx-window', (v) => (state.windowMarker = v));

  // ---- Cockpit ----
  const overlay = cb.overlay;
  bindCheckbox('fx-cockpit', (v) => {
    overlay.setVisible(v);
    $('cockpit-panel').classList.toggle('hidden', !v);
  });
  bindRange('cockpit-opacity', 'cockpit-opacity-out', (v) => overlay.setOpacity(v / 100), 0);
  $('cockpit-choose').addEventListener('click', () => $('cockpit-file').click());
  $('cockpit-file').addEventListener('change', (e) => {
    if (e.target.files[0]) overlay.loadFile(e.target.files[0]);
  });
  setInterval(() => {
    const t = `Bild: ${overlay.status()}`;
    if ($('cockpit-status').textContent !== t) $('cockpit-status').textContent = t;
  }, 300);

  // ---- Standbild ----
  $('export-png').addEventListener('click', async () => {
    $('export-status').textContent = 'Speichere …';
    try {
      $('export-status').textContent = await cb.onExport($('export-caption').checked);
    } catch (e) {
      $('export-status').textContent = `Fehler: ${e.message}`;
    }
  });

  // ---- Terrell-Körper ----
  const bodies = state.bodies;
  bindCheckbox('fx-bodies', (v) => {
    bodies.enabled = v;
    $('bodies-panel').classList.toggle('hidden', !v);
  });
  bindCheckbox('body-cube', (v) => (bodies.showCube = v));
  bindCheckbox('body-sphere', (v) => (bodies.showSphere = v));
  bindCheckbox('body-uniform', (v) => (bodies.uniformTemperature = v));
  bindCheckbox('body-ghost', (v) => (bodies.ghost = v));
  $('body-placement').addEventListener('change', (e) => {
    bodies.placement = e.target.value;
    $('body-angle-label').textContent = bodies.placement === 'seen' ? 'Gesehener Winkel ψ′' : 'Winkel ψ in S';
  });
  bindRange('body-angle', 'body-angle-out', (v) => (bodies.angleDeg = v), 0);
  bindRange('body-dist', 'body-dist-out', (v) => (bodies.distance = v), 1);
  bindRange('body-z', 'body-z-out', (v) => (bodies.observerZ = v), 1);
  bindRange('body-exp', 'body-exp-out', (v) => (bodies.exposureMag = v), 1);
  $('look-cube').addEventListener('click', () => cb.onLookAt('cube'));
  $('look-sphere').addEventListener('click', () => cb.onLookAt('sphere'));
  $('flyby').addEventListener('click', () => cb.onFlyby());
  $('measure-sphere').addEventListener('click', () => {
    const r = cb.onMeasureSphere();
    $('measure-result').textContent = r
      ? `Achsenverhältnis ${r.ratio.toFixed(4)} bei β = ${state.beta.toFixed(4)}, ` +
        `Radius ${r.radiusPx.toFixed(0)} px (${r.projection}).`
      : 'Kugel nicht vollständig im Bild — erst „Blick auf Kugel“.';
  });

  // ---- Ansicht ----
  $('projection').addEventListener('change', (e) => (state.projection = e.target.value));
  bindRange('fov', 'fov-out', (v) => (state.fovDeg = v), 0);
  bindRange('exposure', 'exposure-out', (v) => (state.exposureMag = v), 1);
  $('star-count').addEventListener('change', (e) => cb.onStarCount(Number(e.target.value)));

  setupLookAround($('canvas'), state);
  setupPresentation(state, cb);
  setBeta(state.beta);
  refreshAccel(null);

  return {
    setBeta,
    refreshAccel,
    setAccelInfo(text) {
      for (const el of accelEls) {
        const p = el.querySelector('[data-k=info]');
        if (p.textContent !== text) p.textContent = text;
      }
    },
    setFlybyRunning(running) {
      $('flyby').textContent = running ? '⏹ Vorbeiflug stoppen' : '▶ Vorbeiflug';
    },
    setTerrellInfo(rows) {
      fillTable($('terrell-info'), rows);
    },
    setFlightInfo(rows) {
      fillTable($('flight-info'), rows);
    },
    setPresentPlaying(playing) {
      const b = $('pres-play');
      const t = playing ? '⏸' : '▶';
      if (b.textContent !== t) b.textContent = t;
    },
  };
}

/* ------------------------------------------------------------------------- */
/* Hilfsfunktionen                                                           */
/* ------------------------------------------------------------------------- */

/** Zeit in s → Text in der gewählten Einheit. */
export function formatTime(seconds, unitS, unitName) {
  return `${formatNumber(seconds / unitS, 3)} ${unitName}`;
}

/** Zahl mit deutscher Schreibweise und sinnvoller Stellenzahl. */
export function formatNumber(x, significant = 4) {
  if (!Number.isFinite(x)) return '–';
  if (x === 0) return '0';
  if (Math.abs(x) >= 1e6 || Math.abs(x) < 1e-3) {
    const [m, e] = x.toExponential(significant - 1).split('e');
    return `${m.replace('.', ',')}·10${superscript(Number(e))}`;
  }
  const digits = Math.max(0, significant - 1 - Math.floor(Math.log10(Math.abs(x))));
  return x.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function superscript(n) {
  const map = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  return String(n).split('').map((c) => map[c]).join('');
}

function bindCheckbox(id, apply) {
  const el = $(id);
  el.addEventListener('change', () => apply(el.checked));
  apply(el.checked);
}

function bindRange(id, outId, apply, digits) {
  const el = $(id);
  const out = $(outId);
  const update = () => {
    const v = Number(el.value);
    out.value = v.toFixed(digits);
    apply(v);
  };
  el.addEventListener('input', update);
  update();
}

/**
 * Präsentationsmodus: Vollbild, sichtbar bleiben nur Play/Anhalten, der
 * 3D-Schalter und der β-Regler. Die Leiste blendet sich aus, wenn die Maus
 * 3 s ruht. Beenden mit ✕ oder Esc (Esc verlässt auch das Vollbild).
 */
function setupPresentation(state, cb) {
  const body = document.body;
  const bar = $('present-bar');
  const pres3d = $('pres-3d');
  const mode3d = $('mode3d');
  let idleTimer = 0;

  const poke = () => {
    body.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => body.classList.add('idle'), 3000);
  };

  function enter() {
    if (state.presenting) return;
    state.presenting = true;
    // immer die Simulation zeigen
    document.querySelector('#tabs button[data-tab=sim]').click();
    body.classList.add('presenting');
    bar.hidden = false;
    pres3d.checked = mode3d.checked;
    poke();
    document.documentElement.requestFullscreen?.().catch(() => {});
  }
  function exit() {
    if (!state.presenting) return;
    state.presenting = false;
    body.classList.remove('presenting', 'idle');
    bar.hidden = true;
    clearTimeout(idleTimer);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }

  $('present-btn').addEventListener('click', enter);
  $('pres-exit').addEventListener('click', exit);
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) exit();
  });
  document.addEventListener('keydown', (e) => {
    if (!state.presenting) return;
    if (e.key === 'Escape') exit();
    if (e.key === ' ' && e.target.tagName !== 'INPUT') {
      e.preventDefault();
      cb.onPresentPlay();
    }
  });
  document.addEventListener('pointermove', () => state.presenting && poke());
  pres3d.addEventListener('change', () => {
    mode3d.checked = pres3d.checked;
    mode3d.dispatchEvent(new Event('change'));
  });
  mode3d.addEventListener('change', () => (pres3d.checked = mode3d.checked));
  $('pres-play').addEventListener('click', () => cb.onPresentPlay());
}

/** Umschauen durch Ziehen mit der Maus (bzw. Finger); Doppelklick = nach vorn. */
function setupLookAround(canvas, state) {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    // Drehwinkel pro Pixel so, dass der Himmel ungefähr der Maus folgt
    const radPerPx = ((state.fovDeg * Math.PI) / 180) / canvas.clientHeight;
    state.yaw -= (e.clientX - lastX) * radPerPx;
    state.pitch += (e.clientY - lastY) * radPerPx;
    state.pitch = Math.max(-Math.PI / 2 + 1e-3, Math.min(Math.PI / 2 - 1e-3, state.pitch));
    lastX = e.clientX;
    lastY = e.clientY;
  });
  const stop = () => (dragging = false);
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
  canvas.addEventListener('dblclick', () => {
    state.yaw = 0;
    state.pitch = 0;
  });
}

/** Zweispaltige Tabelle [Beschriftung, Wert]; führende Leerzeichen = eingerückte Unterzeile. */
function fillTable(table, rows) {
  if (table.rows.length !== rows.length) {
    table.innerHTML = rows.map(() => '<tr><td></td><td></td></tr>').join('');
  }
  rows.forEach(([label, value], i) => {
    const cells = table.rows[i].cells;
    const text = label.trimStart();
    if (cells[0].textContent !== text) {
      cells[0].textContent = text;
      cells[0].classList.toggle('sub', text !== label);
    }
    if (cells[1].textContent !== value) cells[1].textContent = value;
  });
}

/** Debug-Panel: Tabelle mit Beschriftung und Wert (mit Einheit). */
export function updateDebug(rows) {
  fillTable($('debug'), rows);
}

/* ------------------------------------------------------------------------- */
/* Graphen der Simulation: γ über β und β über t                             */
/* ------------------------------------------------------------------------- */

/** Stützstellen für γ(β), dicht bei β → 1, wo γ steil ansteigt. */
export const GAMMA_POINTS = Array.from({ length: 241 }, (_, i) => {
  const beta = BETA_MAX * (1 - Math.pow(1 - i / 240, 3));
  return [beta, lorentzGamma(beta)];
});

const commaFixed = (x, d) => x.toFixed(d).replace('.', ',');

/** Diagramm γ über β mit Marker beim aktuellen β. */
export function drawGammaChart(chart, state) {
  const gammaMax = lorentzGamma(BETA_MAX);
  chart.draw({
    key: state.beta,
    xMin: 0, xMax: 1, yMin: 0, yMax: Math.ceil(gammaMax / 5) * 5,
    xTicks: [0, 0.2, 0.4, 0.6, 0.8, 1], yTicks: [0, 5, 10, 15, 20, 25],
    xFormat: (x) => (x === 0 ? '0' : commaFixed(x, 1)),
    yFormat: (y) => String(y),
    series: [{ points: GAMMA_POINTS, color: CHART.series[0] }],
    markers: [{ x: state.beta, y: state.gamma, color: CHART.series[0] }],
    hover: (x) => {
      const b = Math.min(BETA_MAX, Math.max(0, x));
      return { title: `β = ${formatNumber(b, 3)}`, rows: [{ y: lorentzGamma(b), color: CHART.series[0], text: `γ = ${formatNumber(lorentzGamma(b), 4)}` }] };
    },
  });
}

/** Diagramm β über t (Zeit in S) der Beschleunigungsphase mit Marker bei t. */
export function drawBetaTimeChart(chart, state) {
  const acc = state.accel;
  const { T } = accelTiming(acc);
  if (!(T > 0)) return;
  const u = acc.unitS;
  const betaAt = (t) => Math.min(BETA_MAX, accelBetaAt(acc, t));
  const pts = Array.from({ length: 201 }, (_, i) => [((i / 200) * T) / u, betaAt((i / 200) * T)]);
  chart.draw({
    key: `${state.beta}|${acc.t}|${T}|${acc.curve}|${acc.beta0}|${acc.beta1}|${u}`,
    xMin: 0, xMax: T / u, yMin: 0, yMax: 1,
    xTicks: [0, T / u / 2, T / u], yTicks: [0, 0.25, 0.5, 0.75, 1],
    xFormat: (x) => (x === 0 ? '0' : `${formatNumber(x, 3)} ${acc.unitName}`),
    yFormat: (y) => commaFixed(y, 2),
    series: [{ points: pts, color: CHART.series[0] }],
    markers: [{ x: acc.t / u, y: state.beta, color: CHART.series[0] }],
    hover: (x) => ({
      title: `t = ${formatNumber(x, 3)} ${acc.unitName}`,
      rows: [{ y: betaAt(x * u), color: CHART.series[0], text: `β = ${formatNumber(betaAt(x * u), 4)}` }],
    }),
  });
}

export function curveName(curve) {
  return { constant: 'konstante Eigenbeschleunigung', linear: 'linear in β', smooth: 'weiche Kurve' }[curve];
}

/** Graphen in der Seitenleiste der Simulation. */
export function createSimCharts() {
  const gFig = $('gamma-graph').parentElement;
  const tFig = $('beta-t-figure');
  const gamma = createLineChart($('gamma-graph'), gFig.querySelector('.chart-tip'));
  const betaT = createLineChart($('beta-t-graph'), tFig.querySelector('.chart-tip'));
  return {
    update(state) {
      drawGammaChart(gamma, state);
      tFig.hidden = !state.accel.active;
      if (state.accel.active) {
        tFig.querySelector('.curve-name').textContent = curveName(state.accel.curve);
        drawBetaTimeChart(betaT, state);
      }
    },
  };
}
