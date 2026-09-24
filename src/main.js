/*
 * Erstellt mit Claude Code (KI-Werkzeug) im Auftrag von Dominik Wittkow,
 * W-Seminar Physik, CSG Ingolstadt, 24.09.2026.
 *
 * main.js — Aufbau und Animationsschleife.
 */
import {
  lorentzGamma,
  dopplerFactorForward,
  dopplerFactorBackward,
  apparentTemperature,
  beamingPointSource,
  beamingPointSourceVisible,
  wienPeakWavelengthNm,
  aberrateDirection,
  wavelengthShiftPercent,
  psiPrimeOfSideStar,
  forwardConeSkyFraction,
  beamingExtended,
  inverseAberrationCosPsi,
  accelerationBeta,
  properTimeNumeric,
  deg,
  rad,
} from './physics.js';
import { bodyCenter } from './bodies.js';
import { visibleLuminance } from './blackbody.js';
import { generateStars } from './stars.js';
import { createRenderer, WINDOW_HALF_ANGLE_DEG } from './render.js';
import { createCockpitOverlay, composeSnapshot } from './overlay.js';
import { createUI, createCharts, updateDebug, formatNumber, formatTime, BETA_MAX } from './ui.js';

/** Zentraler Zustand der Simulation. UI schreibt hinein, Renderer liest daraus. */
const state = {
  beta: 0,
  gamma: 1,
  aberration: true,
  doppler: true,
  beaming: true,
  visibleOnly: false,
  markBands: false,
  windowMarker: true,
  projection: 'perspective',
  fovDeg: 60,
  exposureMag: 4,
  yaw: 0,
  pitch: 0,
  starCount: 10000,
  bodies: {
    enabled: false,
    showCube: true,
    showSphere: true,
    psi: Math.PI / 2, // Richtung der Körper in S (Bogenmaß)
    distance: 10,
    observerZ: 0,
    exposureMag: 0,
    uniformTemperature: false,
  },
  // Beschleunigungsphase (Werte setzt ui.js aus den Bedienelementen)
  accel: {
    curve: 'constant',
    a: 9.81, // m/s²
    durationS: 5 * 31557600, // Dauer in S in s
    unitS: 31557600,
    unitName: 'Jahre',
    playSeconds: 20, // Abspielzeit in echten Sekunden
    t: 0, // aktuelle Zeit in S in s
    running: false,
    active: false, // gestartet und nicht zurückgesetzt
  },
};

const canvas = document.getElementById('canvas');
const view = createRenderer(canvas);
view.setStars(generateStars(state.starCount));

const overlay = createCockpitOverlay(document.getElementById('cockpit'));

const ui = createUI(state, {
  overlay,
  async onExport(withCaption) {
    // Direkt nach dem Rendern auslesen (WebGL-Zeichenpuffer wird danach geleert)
    view.render(renderState());
    const projection = state.projection === 'stereographic' ? 'stereografisch' : 'Perspektive';
    const caption = withCaption
      ? `β = ${formatNumber(state.beta, 4)} · γ = ${formatNumber(state.gamma, 4)} · ${projection} · ` +
        `Sichtfeld ${formatNumber(state.fovDeg, 3)}° · Simulation erstellt mit Claude Code (KI)`
      : null;
    const { blob, withoutCockpit } = await composeSnapshot(canvas, overlay, caption);
    const name = `simulation_beta${state.beta.toFixed(4)}_${state.projection}.png`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    return withoutCockpit
      ? `${name} gespeichert – OHNE Cockpit (Bild aus Datei-Pfad darf der Browser nicht mitspeichern; „Bild wählen…“ benutzen).`
      : `${name} gespeichert.`;
  },
  onStarCount(n) {
    state.starCount = n;
    view.setStars(generateStars(n));
  },
  onLookAt(which) {
    // Kamera in die GESEHENE Richtung des Körpermittelpunkts drehen
    const b = state.bodies;
    const c = bodyCenter(b.psi, which === 'cube' ? 0 : Math.PI, b.distance, b.observerZ);
    const len = Math.hypot(...c);
    let n = c.map((v) => v / len);
    if (state.aberration) n = aberrateDirection(state.beta, n);
    // Blickrichtung f = (−sin yaw · cos pitch, sin pitch, cos yaw · cos pitch), siehe render.viewMatrix
    state.pitch = Math.asin(Math.max(-1, Math.min(1, n[1])));
    state.yaw = Math.atan2(-n[0], n[2]);
  },
  onMeasureSphere() {
    view.render(renderState());
    const r = view.measureSphereRoundness();
    if (!r) return null;
    const projection = state.projection === 'stereographic' ? 'stereografisch' : 'Perspektive';
    return { ...r, projection };
  },
  onManualBeta() {
    state.accel.running = false;
  },
});
const charts = createCharts();

/** β der Beschleunigungskurve zur Zeit t, begrenzt auf den Reglerbereich. */
function curveBeta(t) {
  const acc = state.accel;
  return accelerationBeta(acc.curve, t, acc.a, acc.durationS);
}

new ResizeObserver(() => view.resize()).observe(canvas);
view.resize();

// Bildrate: gleitender Mittelwert über die letzten Bilder
let lastTime = performance.now();
let fps = 60;

function frame(now) {
  const dt = Math.max(1e-3, (now - lastTime) / 1000);
  lastTime = now;
  fps += (1 / dt - fps) * 0.05;

  // Beschleunigungsphase: Zeit in S weiterzählen, der β-Regler folgt der Kurve
  const acc = state.accel;
  if (acc.running) {
    acc.t = Math.min(acc.durationS, acc.t + (dt * acc.durationS) / acc.playSeconds);
    if (acc.t >= acc.durationS) acc.running = false;
    ui.setBeta(curveBeta(acc.t));
  }

  view.render(renderState());

  updateDebug(debugRows());
  charts.update(state);
  updateAccelInfo();

  requestAnimationFrame(frame);
}

/** Zustand für den Renderer zusammenstellen. */
function renderState() {
  state.gamma = lorentzGamma(state.beta);
  return {
    beta: state.beta,
    gamma: state.gamma,
    aberration: state.aberration,
    doppler: state.doppler,
    beaming: state.beaming,
    visibleOnly: state.visibleOnly,
    markBands: state.markBands,
    windowMarker: state.windowMarker,
    projection: state.projection,
    fovDeg: state.fovDeg,
    // Belichtung in mag → Faktor: Stern der Helligkeit m hat b = 10^(−0,4·(m − E))
    exposure: Math.pow(10, 0.4 * state.exposureMag),
    yaw: state.yaw,
    pitch: state.pitch,
    bodies: {
      ...state.bodies,
      // Belichtung in mag → Strahldichte auf dem Bildschirm (0,18 = mittleres Grau bei 0 mag)
      radiance: 0.18 * Math.pow(10, 0.4 * state.bodies.exposureMag),
    },
  };
}

/** Anzeige unter den Knöpfen der Beschleunigungsphase. */
function updateAccelInfo() {
  const acc = state.accel;
  const el = document.getElementById('acc-info');
  const end = curveBeta(acc.durationS);
  let text = `Ende nach ${formatTime(acc.durationS, acc.unitS, acc.unitName)}: β = ${formatNumber(end, 4)}`;
  if (end > BETA_MAX) text += ` (Anzeige auf ${BETA_MAX.toString().replace('.', ',')} begrenzt)`;
  if (acc.active) {
    const tau = properTimeNumeric(curveBeta, acc.t);
    text = `t = ${formatTime(acc.t, acc.unitS, acc.unitName)} in S · τ = ${formatTime(tau, acc.unitS, acc.unitName)} an Bord` +
      ` · ${acc.running ? 'läuft' : 'angehalten'}. ` + text;
  }
  if (el.textContent !== text) el.textContent = text;
}

/** Sichtfeld horizontal aus dem vertikalen Sichtfeld und dem Seitenverhältnis. */
function horizontalFov(vDeg) {
  const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
  const v = rad(vDeg);
  return state.projection === 'stereographic'
    ? deg(4 * Math.atan(Math.tan(v / 4) * aspect)) // Bildradius ∝ tan(α/2)
    : deg(2 * Math.atan(Math.tan(v / 2) * aspect)); // Bildradius ∝ tan(α)
}

// Kurzform der Kurvennamen (volle Namen: physics.ACCELERATION_CURVES)
const CURVE_SHORT = { constant: 'konst. Eigenbeschl.', linear: 'linear in β', smooth: 'weiche Kurve' };

const pct = (x, d = 1) => `${x.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })} %`;
const num = formatNumber;

/** Werte für das Debug-Panel, alle aus physics.js bzw. blackbody.js. */
function debugRows() {
  const beta = state.beta;
  const Df = dopplerFactorForward(beta);
  const Db = dopplerFactorBackward(beta);
  const Tsun = 5800;
  const TsunFwd = apparentTemperature(Tsun, Df);
  const visFwd = beamingPointSourceVisible(Df, visibleLuminance(Tsun), visibleLuminance(TsunFwd));
  // Aus welchem Himmelsbereich in S stammt das Licht im ±16°-Fenster?
  const cosWin = Math.cos(rad(WINDOW_HALF_ANGLE_DEG));
  const psiWindowS = deg(Math.acos(inverseAberrationCosPsi(beta, cosWin)));
  const acc = state.accel;
  return [
    ['β', num(beta, 4)],
    ['γ', num(state.gamma, 4)],
    ['D nach vorn (λ\'/λ)', num(Df, 4)],
    ['D nach hinten', num(Db, 4)],
    ['Wellenlänge vorn (λ\' − λ)/λ', pct(wavelengthShiftPercent(Df))],
    ['Wellenlänge hinten', pct(wavelengthShiftPercent(Db))],
    ["ψ' für ψ = 90°", `${num(deg(psiPrimeOfSideStar(beta)), 4)}°`],
    ['Himmelsanteil im Kegel (1 − β)/2', pct(100 * forwardConeSkyFraction(beta), 2)],
    ['Punkt vorn D⁻² (Sterne)', num(beamingPointSource(Df), 4)],
    ['Fläche vorn D⁻⁴ (Körper)', num(beamingExtended(Df), 4)],
    ["T' eines 5 800-K-Sterns vorn", `${num(TsunFwd, 4)} K`],
    ['  λ_max davon (Wien)', `${num(wienPeakWavelengthNm(TsunFwd), 3)} nm`],
    ['  sichtbare Helligkeit D²·Y(T\')/Y(T)', num(visFwd, 3)],
    [`±${WINDOW_HALF_ANGLE_DEG}°-Fenster zeigt Licht aus ψ ≤`, `${num(psiWindowS, 4)}°`],
    ['Sichtfeld vertikal × horizontal', `${num(state.fovDeg, 3)}° × ${num(horizontalFov(state.fovDeg), 3)}°`],
    ['Projektion', state.projection === 'stereographic' ? 'stereografisch' : 'Perspektive'],
    ['Beschleunigungskurve', CURVE_SHORT[acc.curve]],
    ['  a', `${num(acc.a, 4)} m/s²`],
    ['  t in S / τ an Bord', acc.active
      ? `${formatTime(acc.t, acc.unitS, acc.unitName)} / ${formatTime(properTimeNumeric(curveBeta, acc.t), acc.unitS, acc.unitName)}`
      : '–'],
    ['Sterne', state.starCount.toLocaleString('de-DE')],
    ['Bildrate', `${fps.toFixed(0)} Bilder/s`],
  ];
}
requestAnimationFrame(frame);

// Nur im Entwicklungsmodus: Zugriff für automatische Prüfungen im Browser.
if (import.meta.env.DEV) window.__sim = { state, view };
