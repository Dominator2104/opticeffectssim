/*
 * Erstellt mit Claude Code (KI-Werkzeug) im Auftrag von Dominik Wittkow,
 * W-Seminar Physik, CSG Ingolstadt, 24.09.2026.
 *
 * ui.js — Bedienelemente und Debug-Panel.
 * Physikalische Werte kommen ausschließlich aus src/physics.js.
 */
import { lorentzGamma } from './physics.js';

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

function clampBeta(beta) {
  if (!Number.isFinite(beta)) return 0;
  return Math.min(BETA_MAX, Math.max(0, beta));
}

const $ = (id) => document.getElementById(id);

/**
 * Verbindet die Bedienelemente mit dem Zustandsobjekt state.
 * onStarCount(n) wird aufgerufen, wenn die Sternzahl geändert wird.
 */
export function createUI(state, { onStarCount, onLookAt, onMeasureSphere }) {
  const slider = $('beta-slider');
  const input = $('beta-input');

  function setBeta(beta, source) {
    state.beta = clampBeta(beta);
    state.gamma = lorentzGamma(state.beta);
    if (source !== 'slider') slider.value = String(sliderFromBeta(state.beta));
    if (source !== 'input') input.value = state.beta.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  }
  slider.addEventListener('input', () => setBeta(betaFromSlider(Number(slider.value)), 'slider'));
  input.addEventListener('change', () => setBeta(Number(input.value.replace(',', '.')), 'input'));

  bindCheckbox('fx-aberration', (v) => (state.aberration = v));
  bindCheckbox('fx-doppler', (v) => (state.doppler = v));
  bindCheckbox('fx-beaming', (v) => (state.beaming = v));
  bindCheckbox('fx-visible', (v) => (state.visibleOnly = v));
  bindCheckbox('fx-bands', (v) => (state.markBands = v));
  bindCheckbox('fx-bodies', (v) => {
    state.bodies.enabled = v;
    $('bodies-panel').classList.toggle('hidden', !v);
  });
  bindCheckbox('body-cube', (v) => (state.bodies.showCube = v));
  bindCheckbox('body-sphere', (v) => (state.bodies.showSphere = v));
  bindCheckbox('body-uniform', (v) => (state.bodies.uniformTemperature = v));
  bindRange('body-psi', 'body-psi-out', (v) => (state.bodies.psi = (v * Math.PI) / 180), 0);
  bindRange('body-dist', 'body-dist-out', (v) => (state.bodies.distance = v), 1);
  bindRange('body-z', 'body-z-out', (v) => (state.bodies.observerZ = v), 1);
  bindRange('body-exp', 'body-exp-out', (v) => (state.bodies.exposureMag = v), 1);
  $('look-cube').addEventListener('click', () => onLookAt('cube'));
  $('look-sphere').addEventListener('click', () => onLookAt('sphere'));
  $('measure-sphere').addEventListener('click', () => {
    const r = onMeasureSphere();
    $('measure-result').textContent = r
      ? `Achsenverhältnis ${r.ratio.toFixed(4)} bei β = ${state.beta.toFixed(4)}, ` +
        `Radius ${r.radiusPx.toFixed(0)} px (${r.projection}).`
      : 'Kugel nicht vollständig im Bild — erst „Blick auf Kugel“.';
  });

  $('projection').addEventListener('change', (e) => (state.projection = e.target.value));
  bindRange('fov', 'fov-out', (v) => (state.fovDeg = v), 0);
  bindRange('exposure', 'exposure-out', (v) => (state.exposureMag = v), 1);
  $('star-count').addEventListener('change', (e) => onStarCount(Number(e.target.value)));

  setupLookAround($('canvas'), state);
  setBeta(state.beta);

  return { setBeta };
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

/**
 * Debug-Panel: Tabelle mit Beschriftung, Wert und Einheit.
 * rows: Array von [Beschriftung, Text].
 */
export function updateDebug(rows) {
  const table = $('debug');
  if (table.rows.length !== rows.length) {
    table.innerHTML = rows.map(() => '<tr><td></td><td></td></tr>').join('');
  }
  rows.forEach(([label, value], i) => {
    const cells = table.rows[i].cells;
    if (cells[0].textContent !== label) cells[0].textContent = label;
    if (cells[1].textContent !== value) cells[1].textContent = value;
  });
}
