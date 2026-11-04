/*
 * Erstellt mit Claude Code (KI-Werkzeug) im Auftrag von Dominik Wittkow,
 * W-Seminar Physik, CSG Ingolstadt, 24.09.2026.
 *
 * main.js — Aufbau und Animationsschleife.
 */
import {
  lorentzGamma,
  dopplerFactor,
  dopplerFactorForward,
  dopplerFactorBackward,
  apparentTemperature,
  beamingPointSource,
  beamingPointSourceVisible,
  wienPeakWavelengthNm,
  aberrateDirection,
  aberrationPsi,
  psiFromPsiPrime,
  terrellLengthFactor,
  wavelengthShiftPercent,
  psiPrimeOfSideStar,
  forwardConeSkyFraction,
  beamingExtended,
  inverseAberrationCosPsi,
  properTimeNumeric,
  coordinateTimeStep,
  distanceStepLy,
  SECONDS_PER_YEAR,
  properAccelerationForProperTime,
  motionBlurBetaAt,
  motionBlurSchedule,
  motionBlurStepCount,
  deg,
  rad,
} from './physics.js';
import { generateCell, neededCells, REAL_DENSITY_PER_LY3 } from './stars3d.js';
import { bodyCenter } from './bodies.js';
import { visibleFraction, createVisibleLuminanceLookup } from './blackbody.js';

/** Schnelle Y(T)-Tabelle für das Debug-Panel (statt jedes Mal neu zu integrieren). */
const visibleLuminance = createVisibleLuminanceLookup();
import { generateStars } from './stars.js';
import { createRenderer, WINDOW_HALF_ANGLE_DEG } from './render.js';
import { createCockpitOverlay, composeSnapshot } from './overlay.js';
import {
  createUI,
  createSimCharts,
  updateDebug,
  formatNumber,
  formatTime,
  accelTiming,
  accelBetaAt,
  fractionText,
} from './ui.js';
import { createOverview } from './overview.js';
import { analyzeStars, pickCallouts, composeShowcase, MAIN_W, MAIN_H, REST_W, REST_H, CALLOUT_REGION } from './showcase.js';

/** Zentraler Zustand der Simulation. UI schreibt hinein, Renderer liest daraus. */
const state = {
  tab: 'sim',
  beta: 0,
  gamma: 1,
  aberration: true,
  doppler: true,
  beaming: true,
  spectrum: 'visible', // 'visible' = nur sichtbares Licht, 'full' = gesamtes Spektrum (Falschfarben)
  windowMarker: false,
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
    placement: 'seen', // 'seen' = über den gesehenen Winkel ψ', 'S' = über ψ in S
    angleDeg: 90,
    distance: 10,
    observerZ: 0,
    exposureMag: 0,
    uniformTemperature: false,
    ghost: true,
    flyby: { running: false, z: 0 },
  },
  // 3D-Modus: Flug durch ein Sternfeld mit echten Positionen (Längen in Lj)
  flight: {
    enabled: false,
    running: false,
    timeFactor: SECONDS_PER_YEAR, // Sekunden Bordzeit τ pro echter Sekunde
    density: 1, // Vielfaches der realistischen Sterndichte
    cellSize: 100, // Kantenlänge der Zellen in Lj
    observer: [0, 0, 0], // Beobachterposition in S (Lj)
    tau: 0, // vergangene Bordzeit in s
    t: 0, // vergangene Zeit in S in s
    distance: 0, // zurückgelegte Strecke in S (Lj)
    anchors: null, // feste Positionen der Körper in S (Lj)
  },
  // Standbild mit Bewegungsunschärfe im 3D-Flug (Werte setzt ui.js)
  blur: {
    tb: 1 / 48, // Verschlusszeit in s (24 Bilder/s, 180°-Umlaufverschluss)
    dv: 0.99, // Geschwindigkeitsänderung Δv in Einheiten von c …
    dt: 3, // … in der Zeit Δt in s (Vorgabe: Filmszene 00:56:54 → 00:56:57)
    filmFormat: false, // Bildformat des Films (FILM_FORMAT) statt Bildschirmgröße
    last: null, // Kennwerte des letzten Bildes (Debug-Panel)
  },
  // Beschleunigungsphase (Werte setzt ui.js aus den Bedienelementen)
  accel: {
    curve: 'constant',
    beta0: 0,
    beta1: 0.99,
    mode: 'acceleration', // 'acceleration' = a vorgegeben, 'duration' = Dauer vorgegeben
    a: 9.81, // Eigenbeschleunigung in m/s²
    durationS: 0, // Dauer in S in s (berechnet oder vorgegeben)
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
let stars = generateStars(state.starCount);
view.setStars(stars);

const overlay = createCockpitOverlay(document.getElementById('cockpit'));

const ui = createUI(state, {
  overlay,
  async onExport(withCaption) {
    // Direkt nach dem Rendern auslesen (WebGL-Zeichenpuffer wird danach geleert)
    view.render(renderState());
    const projection = state.projection === 'stereographic' ? 'stereografisch' : 'Perspektive';
    const caption = withCaption
      ? `β = ${formatNumber(state.beta, 4)} · γ = ${formatNumber(state.gamma, 4)} · ${projection} · ` +
        `Sichtfeld ${formatNumber(state.fovDeg, 3)}°`
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
  async onShowcase() {
    const rs = renderState();
    // Hauptbild in hoher Auflösung und Vergleichsbild in Ruhe (gleicher Blick, β = 0)
    const mainImg = view.renderOffscreen(rs, MAIN_W, MAIN_H);
    const restImg = view.renderOffscreen({ ...rs, beta: 0, gamma: 1 }, REST_W, REST_H);
    sceneVersion++; // Bildschirm wieder normal zeichnen
    const f = state.flight;
    const source = f.enabled ? { mode3d: true, field3d: view.field3d, observer: f.observer } : { mode3d: false, stars };
    const callouts = pickCallouts(analyzeStars(rs, source, MAIN_W, MAIN_H, CALLOUT_REGION), MAIN_W);
    const starCount = f.enabled ? view.field3d.stats(f.observer).count : state.starCount;
    const blob = await composeShowcase({
      mainImg,
      restImg,
      rs,
      callouts,
      info: {
        starCount,
        mode3d: f.enabled,
        distanceLy: f.distance,
        tauYears: f.tau / SECONDS_PER_YEAR,
        exposureMag: state.exposureMag,
        timeFactorLabel: document.getElementById('time-factor').selectedOptions[0].textContent,
      },
    });
    const name = `showcase_beta${state.beta.toFixed(4)}${f.enabled ? '_3d' : ''}.png`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    return `${name} gespeichert (3840 × 2160, ${callouts.length} Sterne markiert).`;
  },
  async onBlurExport(withCaption) {
    const f = state.flight;
    if (!f.enabled) return 'Nur im 3D-Modus verfügbar.';
    const bl = state.blur;
    const a = blurAcceleration();
    const betaEnd = state.beta;
    const steps = motionBlurStepCount({
      a, exposure: bl.tb, betaEnd, pxPerRadian: maxPixelsPerRadian(blurImageSize()), nearestLy: nearestObjectLy(),
    });
    const plan = motionBlurSchedule({ betaEnd, a, exposure: bl.tb, steps });
    // Teilbilder: β und Beobachterort setzen, rendern, danach alles zurück
    const savedObserver = [...f.observer];
    const t0 = performance.now();
    let result;
    try {
      result = view.renderAccumulated(plan.length, (i) => {
        const p = plan[i];
        state.beta = p.beta;
        f.observer = [savedObserver[0], savedObserver[1], savedObserver[2] + p.dzLy];
        view.field3d.setObserver(f.observer);
        return { state: renderState(), weight: p.weight };
      }, bl.filmFormat ? FILM_FORMAT : undefined);
    } finally {
      state.beta = betaEnd;
      state.gamma = lorentzGamma(betaEnd);
      f.observer = savedObserver;
      view.field3d.setObserver(savedObserver);
      sceneVersion++;
    }
    const ms = performance.now() - t0;
    bl.last = { steps: plan.length, betaStart: motionBlurBetaAt(betaEnd, a, -bl.tb), ms, precision: result.precision };
    const caption = withCaption
      ? `β = ${formatNumber(motionBlurBetaAt(betaEnd, a, -bl.tb), 5)} → ${formatNumber(betaEnd, 5)} · ` +
        `Verschlusszeit ${fractionText(bl.tb)} s · a = ${formatNumber(a, 4)} m/s² (Δv = ${formatNumber(bl.dv, 3)} c in ${formatNumber(bl.dt, 3)} s) · ` +
        `${plan.length} Teilbilder`
      : null;
    const { blob, withoutCockpit } = await composeSnapshot(result.canvas, overlay, caption);
    const name = `bewegungsunschaerfe_beta${betaEnd.toFixed(4)}_tb${fractionText(bl.tb).replace('/', '-')}.png`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    return `${name} gespeichert (${result.canvas.width} × ${result.canvas.height}, ${plan.length} Teilbilder, ${ms.toFixed(0)} ms)` +
      (withoutCockpit ? ' – OHNE Cockpit (Bild aus Datei-Pfad; „Bild wählen…“ benutzen).' : '.');
  },
  onStarCount(n) {
    state.starCount = n;
    stars = generateStars(n);
    view.setStars(stars);
    sceneVersion++;
  },
  onLookAt(which) {
    lookAtBody(which);
  },
  onFlyby() {
    const f = state.bodies.flyby;
    f.running = !f.running;
    f.elapsed = 0;
    ui.setFlybyRunning(f.running);
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
  onAccelStart() {
    const acc = state.accel;
    const { T, valid } = accelTiming(acc);
    if (!valid) return;
    if (!acc.active || acc.t >= T) acc.t = 0; // am Ende oder neu: von vorn
    acc.active = true;
    acc.running = true;
    if (state.flight.enabled) state.flight.running = true; // im 3D-Modus läuft sie mit der Flug-Uhr
    ui.setBeta(accelBetaAt(acc, acc.t));
  },
  onPresentPlay() {
    // 3D-Modus: Flug abspielen/anhalten; sonst die Beschleunigungsphase
    const f = state.flight;
    const acc = state.accel;
    if (f.enabled) {
      f.running = !f.running;
      if (!f.running) acc.running = false;
    } else if (acc.running) {
      acc.running = false;
    } else {
      this.onAccelStart();
    }
  },
  onMode3d(enabled) {
    if (enabled && !state.flight.anchors) placeBodies3d();
    if (!enabled) {
      state.flight.running = false;
      view.field3d.clear();
    }
  },
  onFlightReset() {
    const f = state.flight;
    f.running = false;
    f.observer = [0, 0, 0];
    f.tau = 0;
    f.t = 0;
    f.distance = 0;
    placeBodies3d();
  },
  onField3dChange() {
    view.field3d.clear(); // Zellen mit neuer Größe bzw. Dichte erzeugen
    sceneVersion++;
  },
  onPlaceBodies3d() {
    placeBodies3d();
  },
  onTab(tab) {
    if (tab === 'sim') view.resize();
    sceneVersion++;
  },
});
const simCharts = createSimCharts();
const overviewView = createOverview();

new ResizeObserver(() => view.resize()).observe(canvas);
view.resize();

/* ------------------------------------------------------------------------- */
/* Terrell-Körper: Platzierung, Vergleichswürfel, Vorbeiflug                 */
/* ------------------------------------------------------------------------- */

/** Dauer des Vorbeiflugs in echten Sekunden und Strecke in Vielfachen des Abstands. */
const FLYBY_SECONDS = 15;
const FLYBY_HALF_LENGTH = 4;

/**
 * Mittelpunkte von Würfel (links, φ = 0) und Kugel (rechts, φ = 180°) in S
 * relativ zum Beobachter, dazu der Vergleichswürfel.
 *
 * Platzierung über ψ': Der Körper ruht in S. Gewählt wird der Augenblick, in
 * dem er unter dem gesehenen Winkel ψ' erscheint; seine Richtung in S ist dann
 * ψ = psiFromPsiPrime(β, ψ').
 * Vorbeiflug: Körper fest in S im seitlichen Abstand b, Beobachter fliegt auf
 * der z-Achse von −4b nach +4b.
 */
function bodyLayout() {
  const b = state.bodies;
  const f = state.flight;
  if (f.enabled && f.anchors) {
    // 3D-Modus: Körper fest im Raum, Mittelpunkt relativ zum Beobachter
    const rel = (a) => a.map((v, i) => v - f.observer[i]);
    return withGhost(rel(f.anchors.cube), rel(f.anchors.sphere));
  }
  return relativeLayout();
}

/**
 * 3D-Modus: Körper an der Stelle festmachen, an der sie bei der aktuellen
 * Platzierung (ψ' bzw. ψ, Entfernung) gerade stehen.
 */
function placeBodies3d() {
  const L = relativeLayout();
  const o = state.flight.observer;
  state.flight.anchors = {
    cube: L.cubeCenter.map((v, i) => v + o[i]),
    sphere: L.sphereCenter.map((v, i) => v + o[i]),
  };
}

/** Platzierung relativ zum Beobachter (Himmelskugel-Modus und Vorlage für 3D). */
function relativeLayout() {
  const b = state.bodies;
  let psiS;
  let dist = b.distance;
  let obsZ = b.observerZ;
  if (b.flyby.running) {
    psiS = Math.PI / 2;
    obsZ = b.flyby.z;
  } else if (b.placement === 'seen' && state.aberration) {
    psiS = psiFromPsiPrime(state.beta, rad(b.angleDeg));
  } else {
    psiS = rad(b.angleDeg);
  }
  return withGhost(bodyCenter(psiS, 0, dist, obsZ), bodyCenter(psiS, Math.PI, dist, obsZ));
}

/** Ergänzt den Vergleichswürfel und die Winkel des Würfels. */
function withGhost(cubeCenter, sphereCenter) {
  // Vergleichswürfel: ruhender Würfel an der gesehenen Stelle des Würfelmittelpunkts,
  // in der Entfernung r/D des Emissionsereignisses in S' (damit gleich groß)
  const r = Math.hypot(...cubeCenter);
  const n = cubeCenter.map((v) => v / r);
  const nSeen = state.aberration ? aberrateDirection(state.beta, n) : n;
  const rSeen = state.aberration ? r / dopplerFactor(state.beta, n[2]) : r;
  const ghostCenter = nSeen.map((v) => v * rSeen);

  const psiCube = Math.acos(Math.max(-1, Math.min(1, n[2])));
  const psiCubeSeen = state.aberration ? aberrationPsi(state.beta, psiCube) : psiCube;
  return { cubeCenter, sphereCenter, ghostCenter, nSeen, psiCube, psiCubeSeen };
}

/** Kamera in die GESEHENE Richtung eines Körpermittelpunkts drehen. */
function lookAtBody(which) {
  const L = bodyLayout();
  const c = which === 'cube' ? L.cubeCenter : L.sphereCenter;
  const len = Math.hypot(...c);
  let n = c.map((v) => v / len);
  if (state.aberration) n = aberrateDirection(state.beta, n);
  // Blickrichtung f = (−sin yaw · cos pitch, sin pitch, cos yaw · cos pitch), siehe render.viewMatrix
  state.pitch = Math.asin(Math.max(-1, Math.min(1, n[1])));
  state.yaw = Math.atan2(-n[0], n[2]);
}

function updateTerrellInfo(L) {
  const alpha = L.psiCube - L.psiCubeSeen;
  const factor = state.aberration ? terrellLengthFactor(state.beta, L.psiCubeSeen) : 1;
  ui.setTerrellInfo([
    ['Würfel: Richtung ψ in S', `${num(deg(L.psiCube), 4)}°`],
    ['gesehen unter ψ′', `${num(deg(L.psiCubeSeen), 4)}°`],
    ['Drehwinkel α = ψ − ψ′', `${num(deg(alpha), 4)}°`],
    ['scheinbare Verkürzung 1/D', num(factor, 4)],
  ]);
}

/* ------------------------------------------------------------------------- */
/* Animationsschleife                                                        */
/* ------------------------------------------------------------------------- */

// Bildrate: gleitender Mittelwert über die letzten Bilder
let lastTime = performance.now();
let fps = 60;
// Neu zeichnen nur bei Änderungen: Signatur des letzten gezeichneten Zustands
let lastSignature = '';
let sceneVersion = 0; // erhöhen, wenn sich Daten ändern, die nicht im Zustand stehen
let renderCount = 0;
let renderFps = 0;
let lastUiUpdate = 0;

function frame(now) {
  const dt = Math.max(1e-3, (now - lastTime) / 1000);
  lastTime = now;
  fps += (1 / dt - fps) * 0.05;

  // Beschleunigungsphase: Zeit in S weiterzählen, der β-Regler folgt der Kurve
  const acc = state.accel;
  if (state.flight.enabled) {
    advanceFlight(dt);
  } else if (acc.running) {
    const { T, valid } = accelTiming(acc);
    if (!valid) {
      acc.running = false;
    } else {
      acc.t = Math.min(T, acc.t + (dt * T) / acc.playSeconds);
      if (acc.t >= T) acc.running = false;
      ui.setBeta(accelBetaAt(acc, acc.t));
    }
  }

  // Vorbeiflug: Beobachter auf der z-Achse bewegen, Kamera folgt dem Würfel
  const fly = state.bodies.flyby;
  if (fly.running && state.flight.enabled) {
    fly.running = false;
    ui.setFlybyRunning(false);
  }
  if (fly.running) {
    fly.elapsed += dt;
    const s = Math.min(1, fly.elapsed / FLYBY_SECONDS);
    fly.z = state.bodies.distance * FLYBY_HALF_LENGTH * (2 * s - 1);
    lookAtBody('cube');
    if (s >= 1) {
      fly.running = false;
      ui.setFlybyRunning(false);
    }
  }

  if (state.tab === 'sim') {
    // Nur neu zeichnen, wenn sich etwas geändert hat (spart Grafikkarte und Akku)
    const rs = renderState();
    const sig = `${JSON.stringify(rs)}|${canvas.clientWidth}x${canvas.clientHeight}|${window.devicePixelRatio}|${sceneVersion}`;
    if (sig !== lastSignature) {
      view.render(rs);
      lastSignature = sig;
      renderCount++;
    }
    simCharts.update(state);
  } else {
    overviewView.update(state, stars);
  }
  // Textanzeigen 10-mal pro Sekunde genügen
  if (now - lastUiUpdate > 100) {
    renderFps = (renderCount * 1000) / (now - lastUiUpdate);
    renderCount = 0;
    lastUiUpdate = now;
    if (state.tab === 'sim') {
      updateDebug(debugRows());
      if (state.flight.enabled) updateFlightInfo();
    }
    updateAccelInfo();
    updateBlurInfo();
  }
  if (state.presenting) ui.setPresentPlaying(state.flight.enabled ? state.flight.running : state.accel.running);

  requestAnimationFrame(frame);
}

/**
 * 3D-Modus: Die Flug-Uhr läuft in Bordzeit τ mit dem gewählten Zeitfaktor.
 * Pro Schritt: dt (in S) = γ·dτ, Strecke in S = β·c·dt (physics.js).
 * Eine laufende Beschleunigungsphase rückt um dt (Zeit in S) weiter.
 * Große Schritte werden in Teilschritte zerlegt, damit β(t) genau folgt.
 */
function advanceFlight(dtReal) {
  const f = state.flight;
  const acc = state.accel;
  if (f.running) {
    const dTauTotal = dtReal * f.timeFactor;
    const steps = acc.running ? 32 : 1;
    for (let k = 0; k < steps; k++) {
      const dTau = dTauTotal / steps;
      const dtS = coordinateTimeStep(state.beta, dTau);
      const dz = distanceStepLy(state.beta, dtS / SECONDS_PER_YEAR);
      f.observer[2] += dz;
      f.distance += dz;
      f.tau += dTau;
      f.t += dtS;
      if (acc.running) {
        const { T, valid } = accelTiming(acc);
        if (!valid) {
          acc.running = false;
        } else {
          acc.t = Math.min(T, acc.t + dtS);
          if (acc.t >= T) acc.running = false;
          ui.setBeta(accelBetaAt(acc, acc.t));
        }
      }
    }
  }
  // benötigte Zellen um das Schiff laden, entfernte freigeben
  const L = f.cellSize;
  const density = REAL_DENSITY_PER_LY3 * f.density;
  const created = view.field3d.update(f.observer, neededCells(f.observer, L, 1), (i, j, k) => generateCell(i, j, k, L, density), L);
  if (created > 0) sceneVersion++;
}

let flightStats = { count: 0, nearest: Infinity };
let statsFrame = 0;

function updateFlightInfo() {
  const f = state.flight;
  if (statsFrame++ % 20 === 0) flightStats = view.field3d.stats(f.observer);
  const yr = SECONDS_PER_YEAR;
  const timeText = (s) => (s < 3600 ? `${num(s, 3)} s` : s < 86400 * 2 ? `${num(s / 3600, 3)} h` : s < yr ? `${num(s / 86400, 3)} Tage` : `${num(s / yr, 4)} Jahre`);
  ui.setFlightInfo([
    ['Bordzeit τ', timeText(f.tau)],
    ['Zeit in S', timeText(f.t)],
    ['Strecke in S', `${num(f.distance, 4)} Lj`],
    ['Sterne geladen', flightStats.count.toLocaleString('de-DE')],
    ['nächster Stern', Number.isFinite(flightStats.nearest) ? `${num(flightStats.nearest, 3)} Lj` : '–'],
    ['Flug', f.running ? 'läuft' : 'angehalten'],
  ]);
}

/** Zustand für den Renderer zusammenstellen. */
function renderState() {
  state.gamma = lorentzGamma(state.beta);
  const L = bodyLayout();
  if (state.bodies.enabled) updateTerrellInfo(L);
  return {
    beta: state.beta,
    gamma: state.gamma,
    aberration: state.aberration,
    doppler: state.doppler,
    beaming: state.beaming,
    spectrum: state.spectrum,
    mode3d: state.flight.enabled,
    observer3d: state.flight.enabled ? state.flight.observer : null, // nur für die Änderungserkennung
    windowMarker: state.windowMarker,
    projection: state.projection,
    fovDeg: state.fovDeg,
    // Belichtung in mag → Faktor: Stern der Helligkeit m hat b = 10^(−0,4·(m − E))
    exposure: Math.pow(10, 0.4 * state.exposureMag),
    yaw: state.yaw,
    pitch: state.pitch,
    bodies: {
      ...state.bodies,
      cubeCenter: L.cubeCenter,
      sphereCenter: L.sphereCenter,
      ghostCenter: L.ghostCenter,
      // Belichtung in mag → Strahldichte auf dem Bildschirm (0,18 = mittleres Grau bei 0 mag)
      radiance: 0.18 * Math.pow(10, 0.4 * state.bodies.exposureMag),
    },
  };
}

/* ------------------------------------------------------------------------- */
/* Standbild mit Bewegungsunschärfe                                          */
/* ------------------------------------------------------------------------- */

/** Bildformat des Films (wie die ausgewerteten Filmbilder): 2272 × 951 Pixel, 2,39 : 1. */
const FILM_FORMAT = { width: 2272, height: 951 };

/** Größe des Bildes mit Bewegungsunschärfe: Filmformat oder wie die Ansicht. */
function blurImageSize() {
  return state.blur.filmFormat ? FILM_FORMAT : { width: canvas.width, height: canvas.height };
}

/** Eigenbeschleunigung während der Belichtung aus Δv und Δt: a = c·artanh(Δv/c)/Δt. */
function blurAcceleration() {
  const b = state.blur;
  return b.dv > 0 && b.dt > 0 ? properAccelerationForProperTime(0, b.dv, b.dt) : 0;
}

/**
 * Größte Bildskala in Pixeln je Bogenmaß, in der Bildecke (dort streckt die
 * Projektion am stärksten): Perspektive r = f·tan α → dr/dα = f·(1 + tan²α);
 * stereografisch r ∝ tan(α/2) → dr/dα = r'(0)·(1 + tan²(α/2)).
 */
function maxPixelsPerRadian({ width: W, height: H }) {
  const half = rad(state.fovDeg) / 2;
  const rc = Math.hypot(W / 2, H / 2);
  if (state.projection === 'stereographic') {
    const t = Math.tan(half / 2);
    const tc = (rc * t) / (H / 2);
    return (H / 2 / (2 * t)) * (1 + tc * tc);
  }
  const f = H / 2 / Math.tan(half);
  return (f * f + rc * rc) / f;
}

/** Abstand zum nächsten Stern oder Körper (Lj), für die Parallaxe während der Belichtung. */
function nearestObjectLy() {
  const f = state.flight;
  let r = view.field3d.stats(f.observer).nearest;
  if (state.bodies.enabled && f.anchors) {
    for (const a of [f.anchors.cube, f.anchors.sphere]) {
      const d = Math.hypot(a[0] - f.observer[0], a[1] - f.observer[1], a[2] - f.observer[2]);
      r = Math.min(r, Math.max(1e-3, d - 1.8)); // Würfelecke höchstens √3 Lj vom Mittelpunkt
    }
  }
  return r;
}

/** Waagrechtes Sichtfeld im Filmformat bei gleichem vertikalen Sichtfeld. */
function filmHorizontalFov() {
  const aspect = FILM_FORMAT.width / FILM_FORMAT.height;
  const v = rad(state.fovDeg);
  return state.projection === 'stereographic'
    ? deg(4 * Math.atan(Math.tan(v / 4) * aspect))
    : deg(2 * Math.atan(Math.tan(v / 2) * aspect));
}

function updateBlurInfo() {
  const a = blurAcceleration();
  const bl = state.blur;
  ui.setBlurInfo(
    `a = ${formatNumber(a, 4)} m/s² (${formatNumber(a / 9.80665, 3)} g) · ` +
      `β während der Belichtung ${formatNumber(motionBlurBetaAt(state.beta, a, -bl.tb), 5)} → ${formatNumber(state.beta, 5)}` +
      (bl.filmFormat ? ` · Filmformat: Sichtfeld ${formatNumber(state.fovDeg, 3)}° × ${formatNumber(filmHorizontalFov(), 3)}°` : '') +
      (state.flight.enabled ? '' : ' · nur im 3D-Modus'),
  );
}

/** Anzeige unter den Knöpfen der Beschleunigungsphase (in beiden Ansichten). */
function updateAccelInfo() {
  const acc = state.accel;
  const { T, a, valid } = accelTiming(acc);
  if (!valid) {
    ui.setAccelInfo('Start- und End-β müssen sich unterscheiden (und a bzw. Dauer > 0 sein).');
    return;
  }
  const kind = acc.beta1 < acc.beta0 ? 'Bremsen' : 'Beschleunigen';
  let text = `${kind} von β = ${formatNumber(acc.beta0, 4)} auf ${formatNumber(acc.beta1, 4)}: ` +
    `Dauer ${formatTime(T, acc.unitS, acc.unitName)} in S bei a = ${formatNumber(a, 4)} m/s²` +
    ` (${formatNumber(a / 9.80665, 3)} g).`;
  if (acc.active) {
    const tau = properTimeNumeric((t) => accelBetaAt(acc, t), acc.t);
    text = `t = ${formatTime(acc.t, acc.unitS, acc.unitName)} in S · τ = ${formatTime(tau, acc.unitS, acc.unitName)} an Bord` +
      ` · ${acc.running ? 'läuft' : 'angehalten'}. ` + text;
  }
  ui.setAccelInfo(text);
}

/* ------------------------------------------------------------------------- */
/* Debug-Panel                                                               */
/* ------------------------------------------------------------------------- */

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
  const { T, a, valid } = accelTiming(acc);
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
    ['  Anteil im Sichtbaren', pct(100 * visibleFraction(TsunFwd))],
    ['  sichtbare Helligkeit D²·Y(T\')/Y(T)', num(visFwd, 3)],
    [`±${WINDOW_HALF_ANGLE_DEG}°-Fenster zeigt Licht aus ψ ≤`, `${num(psiWindowS, 4)}°`],
    ['Spektrum', state.spectrum === 'full' ? 'gesamt (Falschfarben)' : 'nur sichtbar'],
    ['Sichtfeld vertikal × horizontal', `${num(state.fovDeg, 3)}° × ${num(horizontalFov(state.fovDeg), 3)}°`],
    ['Projektion', state.projection === 'stereographic' ? 'stereografisch' : 'Perspektive'],
    ['Beschleunigungskurve', CURVE_SHORT[acc.curve]],
    ['  β₀ → β₁', `${num(acc.beta0, 4)} → ${num(acc.beta1, 4)}`],
    ['  a / Dauer in S', valid ? `${num(a, 4)} m/s² / ${formatTime(T, acc.unitS, acc.unitName)}` : '–'],
    ['  t in S / τ an Bord', acc.active
      ? `${formatTime(acc.t, acc.unitS, acc.unitName)} / ${formatTime(properTimeNumeric((t) => accelBetaAt(acc, t), acc.t), acc.unitS, acc.unitName)}`
      : '–'],
    ['Modus', state.flight.enabled ? '3D-Flug' : 'Himmelskugel'],
    ['Sterne', state.flight.enabled ? `${flightStats.count.toLocaleString('de-DE')} (3D)` : state.starCount.toLocaleString('de-DE')],
    ['Bewegungsunschärfe: Verschlusszeit', `${fractionText(state.blur.tb)} s`],
    ['  a = c·artanh(Δv/c)/Δt', `${num(blurAcceleration(), 4)} m/s²`],
    ['  β bei Verschlussöffnung → Ende', `${num(motionBlurBetaAt(beta, blurAcceleration(), -state.blur.tb), 6)} → ${num(beta, 6)}`],
    ['  Bildformat', state.blur.filmFormat ? `Film ${FILM_FORMAT.width} × ${FILM_FORMAT.height}` : 'wie Ansicht'],
    ['  Teilbilder (letztes Bild)', state.blur.last ? `${state.blur.last.steps} (${state.blur.last.precision}, ${state.blur.last.ms.toFixed(0)} ms)` : '–'],
    ['Bildrate (gezeichnet)', `${renderFps.toFixed(0)} Bilder/s`],
    ['  Schleife', `${fps.toFixed(0)} Durchläufe/s`],
  ];
}
requestAnimationFrame(frame);

// Nur im Entwicklungsmodus: Zugriff für automatische Prüfungen im Browser.
if (import.meta.env.DEV) window.__sim = { state, view, ui };

