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
  shutterPlanFromCurve,
  rapidityChangeDuringExposure,
  advanceProperTime,
  deg,
  rad,
} from './physics.js';
import {
  FWHM_PER_SIGMA,
  REFERENCE_HEIGHT_PX,
  CHANNEL_WAVELENGTHS_NM,
  lensPeak,
  airyKernel,
  airyFirstMinimumPx,
  pixelPitch,
} from './optics.js';
import { createVideoWriter, encoderSize, supportedCodecs, webCodecsAvailable, VIDEO_CODECS } from './video.js';
import { setupPanel } from './panel.js';
import { generateCell, neededCells, REAL_DENSITY_PER_LY3 } from './stars3d.js';
import { bodyCenter } from './bodies.js';
import { visibleFraction, createVisibleLuminanceLookup } from './blackbody.js';

/** Schnelle Y(T)-Tabelle für das Debug-Panel (statt jedes Mal neu zu integrieren). */
const visibleLuminance = createVisibleLuminanceLookup();
import { generateStars } from './stars.js';
import { createRenderer, WINDOW_HALF_ANGLE_DEG } from './render.js';
import { createCockpitOverlay, composeSnapshot, drawCockpit, drawCaption } from './overlay.js';
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
  // Kamera: Abbildung der Sterne, Objektiv, Tonkurve (Werte setzt ui.js)
  camera: {
    starModel: 'screen', // 'screen' = Bildschirm-Modell, 'camera' = Punkt + Objektiv + Sättigung
    lens: { enabled: false, fwhm: 2 }, // Gauß-Punktbildfunktion, Halbwertsbreite in px (bei 1080 Zeilen)
    halo: { enabled: false, percent: 2, fwhm: 40 }, // Streulicht: Lichtanteil in %, Halbwertsbreite in px
    airy: { enabled: false, fNumber: 2.8, sensorMm: 24.89 }, // Beugung an der Blende
    vignette: false, // Randabdunklung cos⁴ α
    tone: 'linear', // 'linear' oder 'film'
    hud: false, // Werte im Bild anzeigen
  },
  // Bewegungsunschärfe: Belichtungszeit live, im Standbild und (mit Verschlusswinkel) im Video
  blur: {
    enabled: false,
    tb: 1 / 48, // Verschlusszeit in s Bordzeit (24 Bilder/s, 180°-Umlaufverschluss)
    source: 'phase', // 'phase' = aus der Beschleunigungsphase, 'dvdt' = fest Δv in Δt
    dv: 0.99, // Geschwindigkeitsänderung Δv in Einheiten von c …
    dt: 3, // … in der Zeit Δt in s (Vorgabe: Filmszene 00:56:54 → 00:56:57)
    liveCap: 16, // höchstens so viele Teilbilder live
  },
  // Standbild-Export
  export: { format: 'view', caption: true, cockpit: true },
  // Video-Export
  video: {
    res: '1920x1080',
    fps: 30,
    mode: 'phase', // 'phase' = Beschleunigungsphase von Anfang bis Ende, 'run' = ab jetzt
    pre: 1,
    post: 1,
    duration: 5,
    scale: 1, // Bordzeit je Videosekunde (in scaleUnit)
    scaleUnit: 1,
    shutterDeg: 180,
    blur: true,
    codec: 'avc',
    bitrateMbps: 16,
    keyframeSeconds: 1,
    cockpit: true,
    caption: false,
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
  onExport() {
    return exportStill();
  },
  onShowcase() {
    return exportShowcase();
  },
  onVideo() {
    return exportVideo();
  },
  onCancel() {
    cancelRequested = true;
  },
  onPresetFilm() {
    applyFilmPreset();
  },
  onResetAll() {
    panel.resetAll();
    this.onFlightReset();
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
      else if (acc.active && acc.t < accelTiming(acc).T) acc.running = true; // angehaltene Phase läuft mit weiter
      else if (!acc.active && accelTiming(acc).valid && state.beta === acc.beta0) this.onAccelStart();
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
  if (exporting) {
    // Während eines Exports steht die Zeit; der Export benutzt den Renderer allein.
    requestAnimationFrame(frame);
    return;
  }

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
    // Nur neu zeichnen, wenn sich etwas geändert hat (spart Grafikkarte und Akku);
    // bei unverändertem Bild mit Bewegungsunschärfe wird nach und nach in voller Qualität nachgerechnet.
    const rs = renderState();
    const acc = state.accel;
    const sig = `${JSON.stringify(rs)}|${JSON.stringify(state.camera)}|${JSON.stringify(state.blur)}|` +
      `${acc.t}|${acc.active}|${acc.curve}|${acc.beta0}|${acc.beta1}|${acc.durationS}|` +
      `${canvas.clientWidth}x${canvas.clientHeight}|${window.devicePixelRatio}|${sceneVersion}`;
    if (sig !== lastSignature) {
      renderLive();
      lastSignature = sig;
      renderCount++;
    } else if (refine) {
      refineStep();
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
      updateHud();
      updateCameraInfo();
    }
    updateAccelInfo();
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
function renderState(quiet = false) {
  state.gamma = lorentzGamma(state.beta);
  const L = bodyLayout();
  if (state.bodies.enabled && !quiet) updateTerrellInfo(L);
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
    starModel: state.camera.starModel,
    cameraGain,
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
/* Kamera: Objektiv, Bewegungsunschärfe, Live-Bild                           */
/* ------------------------------------------------------------------------- */

/** Bildformat des Films (wie die ausgewerteten Filmbilder): 2272 × 951 Pixel, 2,39 : 1. */
const FILM_FORMAT = { width: 2272, height: 951 };
const EXPORT_SIZES = { film: FILM_FORMAT, fhd: { width: 1920, height: 1080 }, '4k': { width: 3840, height: 2160 } };
/** Auf Geräten mit Fingerbedienung live weniger Teilbilder (Rechenleistung). */
const COARSE_POINTER = window.matchMedia?.('(pointer: coarse)').matches ?? false;

let cameraGain = 1; // Kamera-Modell: 1 / Spitzenanteil des Objektivs (für das gerade gerenderte Bild)
let liveInfo = { steps: 1, full: 1, kind: 'aus' };
let refine = null; // Nachrechnen in voller Qualität, solange sich nichts ändert
let subBase = null; // Zustand vor den Teilbildern (wird danach wiederhergestellt)
let exporting = false;
let cancelRequested = false;

/** Kern mit Radius r in einen Kern mit Radius R einbetten (Mitte bleibt Mitte). */
function embedKernel({ radius: r, weights }, R) {
  const size = 2 * R + 1;
  const out = new Float32Array(size * size);
  const s = 2 * r + 1;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) out[(y + R - r) * size + (x + R - r)] = weights[y * s + x];
  return out;
}

/**
 * Nachbearbeitung für ein Bild der Größe size (optics.js). Pixelangaben gelten
 * für 1080 Bildzeilen und werden mit der Bildhöhe skaliert. Setzt außerdem die
 * Verstärkung des Kamera-Modells (1 / Spitzenanteil): Mit Objektiv erreicht ein
 * Stern der Helligkeit „Belichtung“ im hellsten Pixel gerade Weiß.
 */
function postFor(size) {
  const c = state.camera;
  const k = size.height / REFERENCE_HEIGHT_PX;
  const haloFraction = c.halo.enabled ? c.halo.percent / 100 : 0;
  const lens = c.lens.enabled || haloFraction > 0
    ? {
        sigmaPx: c.lens.enabled ? (c.lens.fwhm * k) / FWHM_PER_SIGMA : 0,
        haloFraction,
        haloSigmaPx: (c.halo.fwhm * k) / FWHM_PER_SIGMA,
      }
    : null;
  let airy = null;
  if (c.airy.enabled) {
    const pitch = pixelPitch(c.airy.sensorMm * 1e-3, size.width);
    const kernels = CHANNEL_WAVELENGTHS_NM.map((nm) => airyKernel(nm * 1e-9, c.airy.fNumber, pitch, 8));
    const R = Math.max(...kernels.map((x) => x.radius));
    if (R > 0) airy = { radius: R, weights: kernels.map((x) => embedKernel(x, R)), key: `${c.airy.fNumber}|${c.airy.sensorMm}|${size.width}` };
  }
  cameraGain = c.starModel === 'camera'
    ? 1 / lensPeak({
        enabled: !!lens,
        fwhmPx: c.lens.enabled ? c.lens.fwhm * k : 0,
        haloFraction,
        haloFwhmPx: c.halo.fwhm * k,
      })
    : 1;
  return { airy, lens, vignette: c.vignette, tone: c.tone };
}

/** Eigenbeschleunigung „fest“: a = c·artanh(Δv/c)/Δt. */
function blurAcceleration() {
  const b = state.blur;
  return b.dv > 0 && b.dt > 0 ? properAccelerationForProperTime(0, b.dv, b.dt) : 0;
}

/** Läuft (oder steht angehalten) eine Beschleunigungsphase, deren β gerade angezeigt wird? */
function phaseActive() {
  const acc = state.accel;
  if (!acc.active || !accelTiming(acc).valid) return false;
  return Math.abs(accelBetaAt(acc, acc.t) - state.beta) < 1e-9;
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
  if (!f.enabled) return Infinity;
  let r = view.field3d.stats(f.observer).nearest;
  if (state.bodies.enabled && f.anchors) {
    for (const a of [f.anchors.cube, f.anchors.sphere]) {
      const d = Math.hypot(a[0] - f.observer[0], a[1] - f.observer[1], a[2] - f.observer[2]);
      r = Math.min(r, Math.max(1e-3, d - 1.8)); // Würfelecke höchstens √3 Lj vom Mittelpunkt
    }
  }
  return r;
}

/**
 * Belichtungsplan für ein Bild der Größe size: Teilbilder mit β, Ortsversatz
 * und Gewicht (physics.js). cap begrenzt die Zahl (live); full ist die Zahl für
 * höchstens 1 px Wanderung je Teilbild; make(n) erzeugt den Plan mit n Teilbildern.
 */
function blurPlan(size, cap, tb = state.blur.tb, enabled = state.blur.enabled, source = state.blur.source) {
  const single = { plan: [{ tau: 0, beta: state.beta, dzLy: 0, weight: 1 }], full: 1, make: null, kind: 'aus' };
  if (!enabled || !(tb > 0)) return single;
  const pxr = maxPixelsPerRadian(size);
  const nearestLy = nearestObjectLy();
  const acc = state.accel;
  let full;
  let make;
  let kind;
  if (source === 'phase' && phaseActive()) {
    const betaOfT = (t) => accelBetaAt(acc, t);
    const deltaEta = rapidityChangeDuringExposure(betaOfT, acc.t, tb);
    full = motionBlurStepCount({ deltaEta, exposure: tb, betaEnd: state.beta, pxPerRadian: pxr, nearestLy });
    make = (n) => shutterPlanFromCurve({ betaOfT, tNow: acc.t, exposure: tb, steps: n });
    kind = 'aus der Beschleunigungsphase';
  } else {
    const a = source === 'dvdt' ? blurAcceleration() : 0;
    full = motionBlurStepCount({ a, exposure: tb, betaEnd: state.beta, pxPerRadian: pxr, nearestLy });
    make = (n) => motionBlurSchedule({ betaEnd: state.beta, a, exposure: tb, steps: n });
    kind = a > 0 ? `fest, a = ${num(a, 3)} m/s²` : 'konstantes β';
  }
  if (full <= 1) return { ...single, kind, full: 1 };
  return { plan: make(Math.min(full, cap)), full, make, kind };
}

/** Zustand eines Teilbilds setzen (β, Ort im 3D-Flug); restoreSub() stellt danach alles wieder her. */
function stateAt(p) {
  const f = state.flight;
  if (!subBase) subBase = { beta: state.beta, observer: [...f.observer] };
  state.beta = p.beta;
  if (f.enabled && p.dzLy !== 0) {
    f.observer = [subBase.observer[0], subBase.observer[1], subBase.observer[2] + p.dzLy];
    view.field3d.setObserver(f.observer);
  }
  return renderState(true);
}
function restoreSub() {
  if (!subBase) return;
  state.beta = subBase.beta;
  state.gamma = lorentzGamma(state.beta);
  if (state.flight.enabled) {
    state.flight.observer = subBase.observer;
    view.field3d.setObserver(subBase.observer);
  }
  subBase = null;
}

/** Reihenfolge grob → fein (jedes Zwischenergebnis deckt die ganze Belichtung ab). */
function coarseToFine(n) {
  const order = [];
  const used = new Uint8Array(n);
  for (let s = 1 << Math.ceil(Math.log2(Math.max(1, n))); s >= 1; s >>= 1) {
    for (let i = 0; i < n; i += s) {
      if (!used[i]) {
        used[i] = 1;
        order.push(i);
      }
    }
  }
  return order;
}

function liveCap() {
  return COARSE_POINTER ? Math.min(8, state.blur.liveCap) : state.blur.liveCap;
}

/** Ein Bild der Ansicht zeichnen (mit Teilbildern, falls Bewegungsunschärfe an ist). */
function renderLive() {
  const size = view.imageSize();
  const post = postFor(size);
  const bp = blurPlan(size, liveCap());
  liveInfo = { steps: bp.plan.length, full: bp.full, kind: bp.kind };
  refine = null;
  if (bp.plan.length === 1) {
    view.render(stateAt(bp.plan[0]), post);
    restoreSub();
    return;
  }
  view.beginAccumulation();
  for (const p of bp.plan) view.accumulate(stateAt(p), p.weight);
  restoreSub();
  view.present(post);
  if (bp.full > bp.plan.length) refine = { plan: bp.make(bp.full), order: coarseToFine(bp.full), next: 0, post };
}

/** Steht die Simulation still, nach und nach alle Teilbilder rechnen. */
function refineStep() {
  const r = refine;
  if (r.next === 0) view.beginAccumulation();
  const end = Math.min(r.order.length, r.next + liveCap());
  for (let i = r.next; i < end; i++) {
    const p = r.plan[r.order[i]];
    view.accumulate(stateAt(p), p.weight);
  }
  restoreSub();
  r.next = end;
  view.present(r.post);
  liveInfo.steps = end;
  if (end >= r.order.length) refine = null;
}

/* ------------------------------------------------------------------------- */
/* Exporte: Standbild, Showcase-Poster, Video                                */
/* ------------------------------------------------------------------------- */

class Cancelled extends Error {}
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

/** Export ausführen: Zeit anhalten, Renderer exklusiv, Fortschritt, Abbrechen, danach alles zurück. */
async function withExport(fn) {
  if (exporting) return 'Es läuft schon ein Export.';
  exporting = true;
  cancelRequested = false;
  ui.setExporting(true);
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Cancelled) return 'Abgebrochen.';
    throw e;
  } finally {
    restoreSub();
    view.setRenderSize(null);
    exporting = false;
    ui.setExporting(false);
    ui.setProgress(null);
    lastSignature = '';
    sceneVersion++;
  }
}

function exportSize() {
  return EXPORT_SIZES[state.export.format] ?? { width: canvas.width, height: canvas.height };
}

/** Ein Bild in voller Qualität (alle Teilbilder) in der Größe size rechnen; Rückgabe: Kopie als Canvas. */
async function renderImage(size, label, opts = {}) {
  view.setRenderSize(size);
  const post = postFor(size);
  const bp = blurPlan(size, 4096, opts.tb, opts.blur, opts.source);
  const plan = bp.full > bp.plan.length ? bp.make(bp.full) : bp.plan;
  if (plan.length === 1) {
    view.render(stateAt(plan[0]), post);
    restoreSub();
  } else {
    view.beginAccumulation();
    for (let i = 0; i < plan.length; i++) {
      view.accumulate(stateAt(plan[i]), plan[i].weight);
      if (opts.progress !== false && i % 8 === 7) {
        restoreSub();
        ui.setProgress(i / plan.length, `${label}: Teilbild ${i + 1} von ${plan.length}`);
        await nextFrame();
        if (cancelRequested) throw new Cancelled();
      }
    }
    restoreSub();
    view.present(post);
  }
  return { canvas: opts.copy === false ? null : view.copyCanvas(), steps: plan.length, kind: bp.kind };
}

/** Beschriftung mit den wichtigsten Werten. */
function captionText(steps) {
  const parts = [`β = ${num(state.beta, 5)}`, `γ = ${num(lorentzGamma(state.beta), 4)}`];
  if (state.flight.enabled) parts.push(`τ = ${num(state.flight.tau, 4)} s`);
  parts.push(state.projection === 'stereographic' ? 'stereografisch' : 'Perspektive', `Sichtfeld ${num(state.fovDeg, 3)}°`);
  if (state.camera.starModel === 'camera') parts.push('Kamera-Modell');
  const lens = lensSummary();
  if (lens !== 'aus') parts.push(`Objektiv: ${lens}`);
  if (state.blur.enabled) parts.push(`t_b = ${fractionText(state.blur.tb)} s (${steps} Teilbilder)`);
  return parts.join(' · ');
}

/** Overlay-Ersatz, damit der Export das Cockpit nur auf Wunsch enthält. */
function exportOverlay(include) {
  return include ? overlay : { image: overlay.image, isVisible: () => false, opacity: () => 0 };
}

function exportStill() {
  return withExport(async () => {
    const size = exportSize();
    const r = await renderImage(size, 'Standbild');
    const ex = state.export;
    const { blob, withoutCockpit } = await composeSnapshot(r.canvas, exportOverlay(ex.cockpit), ex.caption ? captionText(r.steps) : null);
    const name = `simulation_beta${state.beta.toFixed(4)}_${size.width}x${size.height}${state.blur.enabled ? '_unschaerfe' : ''}.png`;
    download(blob, name);
    return `${name} gespeichert (${r.steps} Teilbild${r.steps === 1 ? '' : 'er'})` +
      (withoutCockpit ? ' – ohne Cockpit (Bild aus Datei-Pfad darf der Browser nicht mitspeichern).' : '.');
  });
}

function exportShowcase() {
  return withExport(async () => {
    ui.setProgress(0.1, 'Showcase: Hauptbild');
    await nextFrame();
    const mainPost = postFor({ width: MAIN_W, height: MAIN_H });
    const rs = renderState(true);
    const mainImg = view.renderOffscreen(rs, MAIN_W, MAIN_H, mainPost);
    const restPost = postFor({ width: REST_W, height: REST_H });
    const restImg = view.renderOffscreen({ ...renderState(true), beta: 0, gamma: 1, cameraGain }, REST_W, REST_H, restPost);
    ui.setProgress(0.6, 'Showcase: Sterne auswählen');
    await nextFrame();
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
    download(blob, name);
    return `${name} gespeichert (3840 × 2160, ${callouts.length} Sterne markiert).`;
  });
}

/** Videogröße aus der Auswahl (gerade Seitenlängen für den Encoder). */
function videoSize() {
  const v = state.video.res;
  const size = v === 'view' ? { width: canvas.width, height: canvas.height } : { width: Number(v.split('x')[0]), height: Number(v.split('x')[1]) };
  return encoderSize(size);
}

/** Bordzeit je Videosekunde in s. */
function videoTimeScale() {
  return state.video.scale * state.video.scaleUnit;
}

/** Dauer der Beschleunigungsphase an Bord (Eigenzeit) in s. */
function phaseProperDuration() {
  const acc = state.accel;
  const { T, valid } = accelTiming(acc);
  return valid ? properTimeNumeric((t) => accelBetaAt(acc, t), T, 2000) : NaN;
}

/** Ablauf des Videos: Startzeit in S, Bordzeit-Dauer, Zahl der Bilder, Verschlusszeit. */
function videoTimeline() {
  const v = state.video;
  const acc = state.accel;
  const scale = videoTimeScale();
  const valid = accelTiming(acc).valid;
  let seconds;
  let tStart;
  let usePhase;
  if (v.mode === 'phase') {
    if (!valid) return { error: 'Für „Beschleunigungsphase“ müssen sich Start- und End-β unterscheiden.' };
    seconds = v.pre + phaseProperDuration() / scale + v.post;
    tStart = -v.pre * scale * lorentzGamma(acc.beta0); // Vorlauf: β₀ konstant, dt = γ·dτ
    usePhase = true;
  } else {
    seconds = v.duration;
    usePhase = valid && acc.active && (acc.running || phaseActive());
    tStart = acc.t;
  }
  const frames = Math.max(1, Math.round(seconds * v.fps));
  const tb = v.blur ? (v.shutterDeg / 360 / v.fps) * scale : 0;
  return { seconds, frames, tStart, usePhase, scale, tb };
}

async function exportVideo() {
  if (!webCodecsAvailable()) return 'Dieser Browser kann keine Videos kodieren (WebCodecs fehlt). Chrome, Edge oder ein aktueller Firefox/Safari geht.';
  const v = state.video;
  const tl = videoTimeline();
  if (tl.error) return tl.error;
  const size = videoSize();
  const bitrate = v.bitrateMbps * 1e6;
  const codecs = await supportedCodecs(size.width, size.height, bitrate, v.fps);
  if (!codecs.includes(v.codec)) {
    return `${VIDEO_CODECS[v.codec].label} kann dieser Browser in ${size.width} × ${size.height} nicht kodieren` +
      (codecs.length ? ` – möglich: ${codecs.map((c) => VIDEO_CODECS[c].label).join(', ')}.` : '.');
  }
  return withExport(async () => {
    const acc = state.accel;
    const f = state.flight;
    const saved = {
      beta: state.beta, accT: acc.t, accActive: acc.active, accRunning: acc.running,
      observer: [...f.observer], tau: f.tau, t: f.t, distance: f.distance, flightRunning: f.running,
    };
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = size.width;
    frameCanvas.height = size.height;
    const g = frameCanvas.getContext('2d');
    const writer = await createVideoWriter(frameCanvas, { codec: v.codec, fps: v.fps, bitrate, keyFrameInterval: v.keyframeSeconds });
    const betaOfT = tl.usePhase ? (t) => accelBetaAt(acc, t) : () => saved.beta;
    let t = tl.tStart;
    let z = 0;
    let tauNow = 0;
    let includeCockpit = v.cockpit;
    const t0 = performance.now();
    try {
      acc.running = false;
      f.running = false;
      if (tl.usePhase) acc.active = true;
      for (let k = 0; k < tl.frames; k++) {
        // Ende der Belichtung von Bild k: τ = k/fps · Zeitraffer + t_b
        const tauTarget = (k / v.fps) * tl.scale + tl.tb;
        const step = advanceProperTime(betaOfT, t, tauTarget - tauNow, 32);
        t = step.t;
        z += step.distanceLy;
        tauNow = tauTarget;
        acc.t = t;
        state.beta = betaOfT(t);
        if (f.enabled) {
          f.observer = [saved.observer[0], saved.observer[1], saved.observer[2] + z];
          f.tau = saved.tau + tauNow;
          const L = f.cellSize;
          const density = REAL_DENSITY_PER_LY3 * f.density;
          view.field3d.update(f.observer, neededCells(f.observer, L, 1), (i, j, kk) => generateCell(i, j, kk, L, density), L, 27);
        }
        await renderImage(size, 'Video', { tb: tl.tb, blur: v.blur, source: tl.usePhase ? 'phase' : 'none', progress: false, copy: false });
        g.drawImage(view.renderer.domElement, 0, 0);
        if (includeCockpit && drawCockpit(g, size.width, size.height, overlay)) {
          try {
            g.getImageData(0, 0, 1, 1); // Bild aus file:// „verunreinigt“ die Zeichenfläche → ohne Cockpit
          } catch {
            includeCockpit = false;
            g.drawImage(view.renderer.domElement, 0, 0);
          }
        }
        if (v.caption) {
          drawCaption(g, `β = ${num(state.beta, 5)} · γ = ${num(lorentzGamma(state.beta), 4)} · Bordzeit ${num(tauNow, 4)} s` +
            (tl.tb > 0 ? ` · Verschluss ${num(v.shutterDeg, 3)}°` : ''), size.width, size.height);
        }
        await writer.add(k);
        const elapsed = (performance.now() - t0) / 1000;
        const left = (elapsed / (k + 1)) * (tl.frames - k - 1);
        ui.setProgress((k + 1) / tl.frames, `Video: Bild ${k + 1} von ${tl.frames} · noch etwa ${Math.ceil(left)} s`);
        await nextFrame();
        if (cancelRequested) {
          await writer.cancel();
          throw new Cancelled();
        }
      }
      ui.setProgress(1, 'Video: Datei wird geschrieben …');
      const blob = await writer.finish();
      const name = `video_${size.width}x${size.height}_${v.fps}fps_${v.mode === 'phase' ? 'beschleunigung' : 'flug'}.${writer.container}`;
      download(blob, name);
      return `${name} gespeichert (${tl.frames} Bilder, ${num(tl.seconds, 3)} s, ${(blob.size / 1e6).toFixed(1)} MB)` +
        (v.cockpit && !includeCockpit ? ' – ohne Cockpit (Bild aus Datei-Pfad).' : '.');
    } finally {
      state.beta = saved.beta;
      state.gamma = lorentzGamma(saved.beta);
      acc.t = saved.accT;
      acc.active = saved.accActive;
      acc.running = saved.accRunning;
      Object.assign(f, { observer: saved.observer, tau: saved.tau, t: saved.t, distance: saved.distance, running: saved.flightRunning });
      if (f.enabled) view.field3d.setObserver(f.observer);
      ui.setBeta(saved.beta);
    }
  });
}

/* ------------------------------------------------------------------------- */
/* Vorgabe „Filmszene“, Werte im Bild, Anzeigen                               */
/* ------------------------------------------------------------------------- */

/** Bedienelement setzen und die üblichen Ereignisse auslösen (damit der Zustand folgt). */
function setControl(id, value) {
  const el = document.getElementById(id);
  if (el.type === 'checkbox' || el.type === 'radio') el.checked = value;
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Filmszene: 3D-Flug in Echtzeit, Beschleunigung 0 → 0,99 c in 3 s Bordzeit
 * (konstante Eigenbeschleunigung β = tanh(aτ/c)), Filmformat, Cockpit,
 * Kamera-Modell mit Objektiv, Bewegungsunschärfe 1/48 s.
 */
function applyFilmPreset() {
  if (!state.flight.enabled) setControl('mode3d', true);
  setControl('time-factor', '1');
  const acc = state.accel;
  acc.curve = 'constant';
  acc.beta0 = 0;
  acc.beta1 = 0.99;
  acc.mode = 'acceleration';
  acc.a = properAccelerationForProperTime(0, 0.99, 3);
  acc.unitS = 1;
  acc.unitName = 's';
  acc.running = false;
  acc.active = false;
  acc.t = 0;
  ui.refreshAccel(null);
  ui.setBeta(0);
  setControl('fov', '60');
  document.querySelector('input[name=star-model][value=camera]').checked = true;
  document.querySelector('input[name=star-model][value=camera]').dispatchEvent(new Event('change', { bubbles: true }));
  setControl('cam-lens', true);
  setControl('cam-halo', true);
  setControl('blur-on', true);
  setControl('blur-tb', '1/48');
  setControl('blur-source', 'phase');
  setControl('fx-cockpit', true);
  setControl('export-format', 'film');
  setControl('video-res', '2272x951');
  setControl('video-fps', '24');
  setControl('video-mode', 'phase');
  setControl('video-scale', '1');
  setControl('video-scale-unit', '1');
  setControl('video-shutter', '180');
  ui.setStatus('Vorgabe Filmszene gesetzt: ▶ Start unter „Beschleunigungsphase“ (oder Leertaste).');
}

/** Kurzbeschreibung des Objektivs. */
function lensSummary() {
  const c = state.camera;
  const parts = [];
  if (c.lens.enabled) parts.push(`Gauß ${num(c.lens.fwhm, 3)} px`);
  if (c.halo.enabled) parts.push(`Streulicht ${num(c.halo.percent, 2)} %`);
  if (c.airy.enabled) parts.push(`f/${num(c.airy.fNumber, 3)}`);
  if (c.vignette) parts.push('cos⁴');
  return parts.length ? parts.join(', ') : 'aus';
}

/** Werte im Bild (oben links in der Ansicht). */
function updateHud() {
  if (!state.camera.hud) return;
  const f = state.flight;
  const lines = [`β = ${num(state.beta, 5)}   γ = ${num(lorentzGamma(state.beta), 4)}`];
  if (f.enabled) lines.push(`Bordzeit τ = ${hudTime(f.tau)} · Strecke ${num(f.distance, 4)} Lj`);
  if (state.accel.active) lines.push(`Beschleunigung: ${state.accel.running ? 'läuft' : 'angehalten'}`);
  const fx = [state.aberration && 'Aberration', state.doppler && 'Doppler', state.beaming && 'Beaming'].filter(Boolean).join(', ') || 'keine Effekte';
  lines.push(fx);
  const cam = [state.camera.starModel === 'camera' ? 'Kamera-Modell' : 'Bildschirm-Modell'];
  if (lensSummary() !== 'aus') cam.push(`Objektiv ${lensSummary()}`);
  if (state.blur.enabled) cam.push(`Unschärfe ${fractionText(state.blur.tb)} s (${liveInfo.steps}/${liveInfo.full})`);
  lines.push(cam.join(' · '));
  const text = lines.join('\n');
  const hud = document.getElementById('hud');
  if (hud.textContent !== text) hud.textContent = text;
}
function hudTime(s) {
  const yr = SECONDS_PER_YEAR;
  return s < 120 ? `${num(s, 4)} s` : s < 86400 * 2 ? `${num(s / 3600, 4)} h` : s < yr ? `${num(s / 86400, 4)} Tage` : `${num(s / yr, 4)} Jahre`;
}

/** Hinweise unter Objektiv, Bewegungsunschärfe, Export und Video. */
function updateCameraInfo() {
  const c = state.camera;
  const size = view.imageSize();
  if (c.airy.enabled) {
    const pitch = pixelPitch(c.airy.sensorMm * 1e-3, size.width);
    const r = airyFirstMinimumPx(550e-9, c.airy.fNumber, pitch);
    ui.setText('cam-airy-info', `Erster dunkler Ring (550 nm): ${num(r, 3)} px bei ${size.width} px Bildbreite` +
      (r < 0.5 ? ' – kleiner als ein Pixel, keine sichtbare Wirkung.' : '.'));
  }
  const bl = state.blur;
  if (bl.enabled) {
    let text = `Teilbilder: ${liveInfo.steps} von ${liveInfo.full} (${liveInfo.kind})`;
    if (bl.source === 'phase' && !phaseActive()) text += ' · Beschleunigungsphase nicht aktiv → bei konstantem β keine sichtbare Unschärfe.';
    else if (bl.source === 'dvdt') {
      const a = blurAcceleration();
      text += ` · a = ${num(a, 4)} m/s² (${num(a / 9.80665, 3)} g), β ${num(motionBlurBetaAt(state.beta, a, -bl.tb), 5)} → ${num(state.beta, 5)}`;
    }
    ui.setBlurInfo(text);
  }
  const es = exportSize();
  const aspect = es.width / es.height;
  const v = rad(state.fovDeg);
  const hfov = state.projection === 'stereographic' ? deg(4 * Math.atan(Math.tan(v / 4) * aspect)) : deg(2 * Math.atan(Math.tan(v / 2) * aspect));
  ui.setText('export-format-info', `${es.width} × ${es.height} Pixel · Sichtfeld ${num(state.fovDeg, 3)}° × ${num(hfov, 3)}°`);
  if (!document.getElementById('video-panel').classList.contains('hidden')) {
    const tl = videoTimeline();
    const vs = videoSize();
    ui.setText('video-info', tl.error ? tl.error
      : `${vs.width} × ${vs.height} · ${tl.frames} Bilder · ${num(tl.seconds, 3)} s Video = ${hudTime(tl.seconds * tl.scale)} Bordzeit` +
        ` · Verschlusszeit je Bild ${tl.tb > 0 ? `${num(tl.tb, 3)} s Bordzeit` : 'aus'}` +
        (webCodecsAvailable() ? '' : ' · Dieser Browser kann keine Videos kodieren.'));
  }
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
    ['Sterne abbilden', state.camera.starModel === 'camera' ? `Kamera-Modell (Verstärkung ${num(cameraGain, 3)})` : 'Bildschirm-Modell'],
    ['Objektiv', lensSummary()],
    ['Tonkurve', state.camera.tone === 'film' ? 'Film-Schulter 1 − e^(−x)' : 'linear, begrenzt'],
    ['Bewegungsunschärfe', state.blur.enabled ? `t_b = ${fractionText(state.blur.tb)} s, ${liveInfo.kind}` : 'aus'],
    ['  Teilbilder live / voll', state.blur.enabled ? `${liveInfo.steps} / ${liveInfo.full}` : '–'],
    ['  Summe der Teilbilder', view.sumPrecision],
    ['Bildrate (gezeichnet)', `${renderFps.toFixed(0)} Bilder/s`],
    ['  Schleife', `${fps.toFixed(0)} Durchläufe/s`],
  ];
}

// Seitenleiste: einklappbare Abschnitte, gespeicherte Einstellungen, Tastenkürzel, mobile Leiste
const panel = setupPanel({
  state,
  actions: {
    playPause: () => ui.playPause(),
    frontView: () => {
      state.yaw = 0;
      state.pitch = 0;
    },
    exportPng: () => document.getElementById('export-png').click(),
    openVideo: () => {
      document.getElementById('sec-export').open = true;
      if (document.getElementById('video-panel').classList.contains('hidden')) document.getElementById('video-toggle').click();
    },
    present: () => document.getElementById('present-btn').click(),
  },
});

requestAnimationFrame(frame);

// Nur im Entwicklungsmodus: Zugriff für automatische Prüfungen im Browser.
if (import.meta.env.DEV) window.__sim = { state, view, ui };

