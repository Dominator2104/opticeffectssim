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
} from './physics.js';
import { bodyCenter } from './bodies.js';
import { visibleLuminance } from './blackbody.js';
import { generateStars } from './stars.js';
import { createRenderer } from './render.js';
import { createUI, updateDebug } from './ui.js';

/** Zentraler Zustand der Simulation. UI schreibt hinein, Renderer liest daraus. */
const state = {
  beta: 0,
  gamma: 1,
  aberration: true,
  doppler: true,
  beaming: true,
  visibleOnly: false,
  markBands: false,
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
};

const canvas = document.getElementById('canvas');
const view = createRenderer(canvas);
view.setStars(generateStars(state.starCount));

createUI(state, {
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
});

new ResizeObserver(() => view.resize()).observe(canvas);
view.resize();

// Bildrate: gleitender Mittelwert über die letzten Bilder
let lastTime = performance.now();
let fps = 60;

function frame(now) {
  const dt = Math.max(1e-3, (now - lastTime) / 1000);
  lastTime = now;
  fps += (1 / dt - fps) * 0.05;

  view.render(renderState());

  updateDebug(debugRows());

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

/** Werte für das Debug-Panel, alle aus physics.js bzw. blackbody.js. */
function debugRows() {
  const beta = state.beta;
  const Df = dopplerFactorForward(beta);
  const Db = dopplerFactorBackward(beta);
  const Tsun = 5800;
  const TsunFwd = apparentTemperature(Tsun, Df);
  const visFwd = beamingPointSourceVisible(Df, visibleLuminance(Tsun), visibleLuminance(TsunFwd));
  return [
    ['β', beta.toFixed(4)],
    ['γ', state.gamma.toFixed(3)],
    ['D nach vorn', Df.toFixed(4)],
    ['D nach hinten', Db.toFixed(3)],
    ['Helligkeit vorn D⁻² (bolometrisch)', beamingPointSource(Df).toPrecision(3)],
    ["T' eines 5 800-K-Sterns vorn", `${Math.round(TsunFwd).toLocaleString('de-DE')} K`],
    ['  λ_max davon (Wien)', `${wienPeakWavelengthNm(TsunFwd).toFixed(0)} nm`],
    ['  Helligkeit vorn nur sichtbar', visFwd.toPrecision(3)],
    ['Sterne', state.starCount.toLocaleString('de-DE')],
    ['Bildrate', `${fps.toFixed(0)} fps`],
  ];
}
requestAnimationFrame(frame);

// Nur im Entwicklungsmodus: Zugriff für automatische Prüfungen im Browser.
if (import.meta.env.DEV) window.__sim = { state, view };
