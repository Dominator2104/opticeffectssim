/*
 * Erstellt mit Claude Code (KI-Werkzeug) im Auftrag von Dominik Wittkow,
 * W-Seminar Physik, CSG Ingolstadt, 24.09.2026.
 *
 * ui.js — Bedienelemente und Debug-Panel.
 * Physikalische Werte kommen ausschließlich aus src/physics.js.
 */
import { lorentzGamma, accelerationBeta } from './physics.js';

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
export function createUI(state, { onStarCount, onLookAt, onMeasureSphere, onManualBeta, overlay, onExport }) {
  const slider = $('beta-slider');
  const input = $('beta-input');

  function setBeta(beta, source) {
    state.beta = clampBeta(beta);
    state.gamma = lorentzGamma(state.beta);
    if (source !== 'slider') slider.value = String(sliderFromBeta(state.beta));
    if (source !== 'input') input.value = state.beta.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  }
  // Handeingriff am Regler hält eine laufende Beschleunigungsphase an
  slider.addEventListener('input', () => {
    onManualBeta();
    setBeta(betaFromSlider(Number(slider.value)), 'slider');
  });
  input.addEventListener('change', () => {
    onManualBeta();
    setBeta(Number(input.value.replace(',', '.')), 'input');
  });

  setupAcceleration(state);

  bindCheckbox('fx-aberration', (v) => (state.aberration = v));
  bindCheckbox('fx-doppler', (v) => (state.doppler = v));
  bindCheckbox('fx-beaming', (v) => (state.beaming = v));
  bindCheckbox('fx-visible', (v) => (state.visibleOnly = v));
  bindCheckbox('fx-bands', (v) => (state.markBands = v));
  bindCheckbox('fx-window', (v) => (state.windowMarker = v));
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

  $('export-png').addEventListener('click', async () => {
    $('export-status').textContent = 'Speichere …';
    try {
      const msg = await onExport($('export-caption').checked);
      $('export-status').textContent = msg;
    } catch (e) {
      $('export-status').textContent = `Fehler: ${e.message}`;
    }
  });
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

/**
 * Bedienelemente der Beschleunigungsphase. Der eigentliche Ablauf (Zeit
 * weiterzählen, β setzen) steht in main.js; hier wird nur state.accel gesetzt.
 */
function setupAcceleration(state) {
  const acc = state.accel;
  const aInput = $('acc-a');
  const aSlider = $('acc-a-slider');
  const readDuration = () => {
    const v = Number($('acc-duration').value.replace(',', '.'));
    acc.durationS = Math.max(1e-3, v || 1) * Number($('acc-unit').value);
    acc.unitS = Number($('acc-unit').value);
    acc.unitName = $('acc-unit').selectedOptions[0].textContent;
  };
  const setA = (a, source) => {
    acc.a = Math.min(1e6, Math.max(0.01, a || 9.81));
    if (source !== 'input') aInput.value = String(Number(acc.a.toPrecision(4)));
    // logarithmischer Regler: Stellung = log10(a)
    if (source !== 'slider') aSlider.value = String(Math.log10(acc.a));
  };
  $('acc-curve').addEventListener('change', (e) => (acc.curve = e.target.value));
  aInput.addEventListener('change', () => setA(Number(aInput.value.replace(',', '.')), 'input'));
  aSlider.addEventListener('input', () => setA(Math.pow(10, Number(aSlider.value)), 'slider'));
  $('acc-duration').addEventListener('change', readDuration);
  $('acc-unit').addEventListener('change', readDuration);
  $('acc-play').addEventListener('change', (e) => {
    acc.playSeconds = Math.min(600, Math.max(1, Number(e.target.value) || 20));
  });
  $('acc-start').addEventListener('click', () => {
    if (acc.t >= acc.durationS) acc.t = 0; // am Ende: von vorn
    acc.active = true;
    acc.running = true;
  });
  $('acc-pause').addEventListener('click', () => (acc.running = false));
  $('acc-reset').addEventListener('click', () => {
    acc.running = false;
    acc.active = false;
    acc.t = 0;
  });
  acc.curve = $('acc-curve').value;
  setA(Number(aInput.value));
  readDuration();
  acc.playSeconds = Number($('acc-play').value);
}

/** Zeit in s → Text in der gewählten Einheit. */
export function formatTime(seconds, unitS, unitName) {
  return `${formatNumber(seconds / unitS, 3)} ${unitName}`;
}

/** Zahl mit deutscher Schreibweise und sinnvoller Stellenzahl. */
export function formatNumber(x, significant = 4) {
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
    // führende Leerzeichen = eingerückte Unterzeile
    const text = label.trimStart();
    if (cells[0].textContent !== text) {
      cells[0].textContent = text;
      cells[0].classList.toggle('sub', text !== label);
    }
    if (cells[1].textContent !== value) cells[1].textContent = value;
  });
}

/* ------------------------------------------------------------------------- */
/* Graphen: γ über β und β über t                                            */
/* ------------------------------------------------------------------------- */

// Farben der Graphen (dunkles Panel). Linienfarbe mit dem Farbprüfskript der
// Diagramm-Richtlinien geprüft (Helligkeitsband und Kontrast ≥ 3:1 auf #151922).
const CHART = {
  surface: '#151922',
  grid: '#262c3a',
  axisText: '#8a93a6',
  line: '#3987e5',
  crosshair: '#5a6378',
};

/**
 * Zeichnet einen einfachen Liniengraphen auf ein <canvas>.
 * opts: { xMin, xMax, yMin, yMax, xTicks, yTicks, xFormat, yFormat,
 *         points: [[x, y], …], marker: [x, y] | null, hover: [x, y] | null }
 */
function drawLineChart(canvas, opts) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = CHART.surface;
  g.fillRect(0, 0, w, h);

  const pad = { l: 34, r: 8, t: 6, b: 20 };
  const X = (x) => pad.l + ((x - opts.xMin) / (opts.xMax - opts.xMin)) * (w - pad.l - pad.r);
  const Y = (y) => h - pad.b - ((y - opts.yMin) / (opts.yMax - opts.yMin)) * (h - pad.t - pad.b);
  canvas._chart = { X, Y, pad, w, h, opts };

  // Gitterlinien (Haarlinien, zurückhaltend) und Achsenbeschriftung
  g.font = '10px system-ui, sans-serif';
  g.fillStyle = CHART.axisText;
  g.strokeStyle = CHART.grid;
  g.lineWidth = 1;
  g.textAlign = 'right';
  g.textBaseline = 'middle';
  for (const y of opts.yTicks) {
    const py = Math.round(Y(y)) + 0.5;
    g.beginPath(); g.moveTo(pad.l, py); g.lineTo(w - pad.r, py); g.stroke();
    g.fillText(opts.yFormat(y), pad.l - 4, py);
  }
  g.textBaseline = 'top';
  opts.xTicks.forEach((x, i) => {
    const px = Math.round(X(x)) + 0.5;
    g.beginPath(); g.moveTo(px, pad.t); g.lineTo(px, h - pad.b); g.stroke();
    // erste Beschriftung linksbündig, letzte rechtsbündig, damit nichts abgeschnitten wird
    g.textAlign = i === 0 ? 'left' : i === opts.xTicks.length - 1 ? 'right' : 'center';
    g.fillText(opts.xFormat(x), px, h - pad.b + 4);
  });

  // Kurve: 2 px, runde Verbindungen
  g.save();
  g.beginPath();
  g.rect(pad.l, pad.t - 4, w - pad.l - pad.r, h - pad.t - pad.b + 4);
  g.clip();
  g.strokeStyle = CHART.line;
  g.lineWidth = 2;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.beginPath();
  opts.points.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
  g.stroke();
  g.restore();

  // Fadenkreuz beim Überfahren mit der Maus
  if (opts.hover) {
    const px = X(opts.hover[0]);
    g.strokeStyle = CHART.crosshair;
    g.beginPath(); g.moveTo(px, pad.t); g.lineTo(px, h - pad.b); g.stroke();
    drawDot(g, px, Y(opts.hover[1]), 4, CHART.crosshair);
  }
  // Marker beim aktuellen Wert: r = 5 px mit 2 px Ring in der Flächenfarbe
  if (opts.marker) drawDot(g, X(opts.marker[0]), Y(opts.marker[1]), 5, CHART.line);
}

function drawDot(g, x, y, r, color) {
  g.fillStyle = CHART.surface;
  g.beginPath(); g.arc(x, y, r + 2, 0, 2 * Math.PI); g.fill();
  g.fillStyle = color;
  g.beginPath(); g.arc(x, y, r, 0, 2 * Math.PI); g.fill();
}

/** Mausposition über einem Graphen → x-Wert (oder null) */
function trackHover(canvas, onX) {
  canvas.addEventListener('pointermove', (e) => {
    const c = canvas._chart;
    if (!c) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const frac = (px - c.pad.l) / (c.w - c.pad.l - c.pad.r);
    onX(frac < 0 || frac > 1 ? null : c.opts.xMin + frac * (c.opts.xMax - c.opts.xMin), px);
  });
  canvas.addEventListener('pointerleave', () => onX(null));
}

function placeTip(tip, canvas, x, y, text) {
  const c = canvas._chart;
  tip.hidden = false;
  tip.textContent = text;
  const px = c.X(x);
  const left = px + 8 + tip.offsetWidth > c.w ? px - 8 - tip.offsetWidth : px + 8;
  tip.style.left = `${left}px`;
  tip.style.top = `${Math.max(14, c.Y(y) - 10 + 14)}px`;
}

/** Stützstellen für γ(β), dicht bei β → 1, wo γ steil ansteigt. */
const GAMMA_POINTS = Array.from({ length: 241 }, (_, i) => {
  const beta = BETA_MAX * (1 - Math.pow(1 - i / 240, 3));
  return [beta, lorentzGamma(beta)];
});

export function createCharts() {
  const gammaCanvas = $('gamma-graph');
  const gammaTip = $('gamma-tip');
  const btCanvas = $('beta-t-graph');
  const btTip = $('beta-t-tip');
  let hoverBeta = null;
  let hoverT = null;
  trackHover(gammaCanvas, (x) => (hoverBeta = x === null ? null : Math.min(BETA_MAX, Math.max(0, x))));
  trackHover(btCanvas, (x) => (hoverT = x));

  const gammaMax = lorentzGamma(BETA_MAX);

  /** Einmal pro Bild aufrufen. */
  function update(state) {
    drawLineChart(gammaCanvas, {
      xMin: 0, xMax: 1, yMin: 0, yMax: Math.ceil(gammaMax / 5) * 5,
      xTicks: [0, 0.2, 0.4, 0.6, 0.8, 1], yTicks: [0, 5, 10, 15, 20, 25].filter((v) => v <= gammaMax + 5),
      xFormat: (x) => (x === 0 ? '0' : x.toFixed(1).replace('.', ',')),
      yFormat: (y) => String(y),
      points: GAMMA_POINTS,
      marker: [state.beta, state.gamma],
      hover: hoverBeta === null ? null : [hoverBeta, lorentzGamma(hoverBeta)],
    });
    if (hoverBeta !== null) {
      placeTip(gammaTip, gammaCanvas, hoverBeta, lorentzGamma(hoverBeta),
        `β = ${formatNumber(hoverBeta, 3)}   γ = ${formatNumber(lorentzGamma(hoverBeta), 4)}`);
    } else {
      gammaTip.hidden = true;
    }

    const acc = state.accel;
    $('beta-t-figure').hidden = !acc.active;
    if (!acc.active) return;
    $('beta-t-curve').textContent = {
      constant: 'konstante Eigenbeschleunigung', linear: 'linear in β', smooth: 'weiche Kurve',
    }[acc.curve];
    const T = acc.durationS;
    const u = acc.unitS;
    const betaAt = (t) => Math.min(BETA_MAX, accelerationBeta(acc.curve, t, acc.a, T));
    const pts = Array.from({ length: 201 }, (_, i) => [(i / 200) * T / u, betaAt((i / 200) * T)]);
    drawLineChart(btCanvas, {
      xMin: 0, xMax: T / u, yMin: 0, yMax: 1,
      xTicks: [0, T / u / 2, T / u], yTicks: [0, 0.25, 0.5, 0.75, 1],
      xFormat: (x) => (x === 0 ? '0' : `${formatNumber(x, 3)} ${acc.unitName}`),
      yFormat: (y) => y.toFixed(2).replace('.', ','),
      points: pts,
      marker: [acc.t / u, state.beta],
      hover: hoverT === null ? null : [hoverT, betaAt(hoverT * u)],
    });
    if (hoverT !== null) {
      placeTip(btTip, btCanvas, hoverT, betaAt(hoverT * u),
        `t = ${formatNumber(hoverT, 3)} ${acc.unitName}   β = ${formatNumber(betaAt(hoverT * u), 4)}`);
    } else {
      btTip.hidden = true;
    }
  }
  return { update };
}
