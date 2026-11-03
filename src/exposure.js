/*
 * Erstellt mit Claude Code (KI-Werkzeug) im Auftrag von Dominik Wittkow,
 * W-Seminar Physik, CSG Ingolstadt, 03.11.2026.
 *
 * exposure.js — belichtetes Bild für den Vergleich mit dem Film.
 *
 * Die Physik steckt in physics.js (exposeStar): Für jeden Stern liefert sie
 * die Teilschritte der Belichtung mit Bildpunkt, Lichtmenge und D. Diese
 * Datei übersetzt das nur in ein Bild:
 *
 *   1. Licht jedes Teilschritts linear aufsummieren (lineares sRGB, Farbe des
 *      Schwarzkörpers bei T' = T/D, Leuchtdichte = Lichtmenge).
 *   2. Objektiv (abschaltbar): Gauß-Punktbildfunktion. Ausgeschaltet landet
 *      das Licht eines Teilschritts vollständig in dem Pixel, in das der
 *      Bildpunkt fällt (ideale Lochkamera, idealer Sensor).
 *   3. Erst danach Tonkurve (linear, hart begrenzt) und sRGB-Kennlinie.
 *
 * Dazu die Ausgaben für die Auswertung: CSV je Stern, Metadaten als JSON.
 * Keine Abhängigkeit zum Browser: Die Datei läuft auch in den Tests unter Node.
 */
import {
  accelerationProfileProperTime,
  rectilinearCamera,
  exposeStar,
  starFluxFactor,
  properAccelerationForProperTime,
  accelerationFromDuration,
  deg,
} from './physics.js';
import {
  buildBlackbodyTable,
  buildFalseColorTable,
  createVisibleLuminanceLookup,
  TABLE_T_MIN,
  TABLE_T_MAX,
  TABLE_SIZE,
} from './blackbody.js';

/* ------------------------------------------------------------------------- */
/* Vorgaben                                                                  */
/* ------------------------------------------------------------------------- */

/**
 * Filmszene: β = 0 bei 00:56:54 bis β = 0,99 bei 00:56:57, konstante
 * Eigenbeschleunigung, β = tanh(a·τ/c). Die Filmzeit wird als Bordzeit
 * gelesen (die Kamera ist an Bord).
 */
export const FILM_SCENE = {
  beta0: 0,
  beta1: 0.99,
  properDurationS: 3,
  filmStartS: 56 * 60 + 54,
};
FILM_SCENE.a = properAccelerationForProperTime(FILM_SCENE.beta0, FILM_SCENE.beta1, FILM_SCENE.properDurationS);

/**
 * Kamera und Belichtung wie im Auswertungsprogramm der Arbeit gemessen:
 * 2272 × 951 px, 60° horizontal, geradlinig, Fluchtpunkt (1114, 464) px.
 * t_b = 1/48 s: 24 Bilder/s mit 180°-Umlaufverschluss.
 */
export const EXPORT_DEFAULTS = {
  width: 2272,
  height: 951,
  hfovDeg: 60,
  cx: 1114,
  cy: 464,
  exposureS: 1 / 48,
  fwhmPx: 2,
  k: 1,
  starCount: 9096,
  maxStepPx: 1,
};

/** Wählbare Sternzahlen am ganzen Himmel (−1 bis 6,5 mag); 9096 ≙ 724 Sterne je sr. */
export const STAR_COUNT_OPTIONS = [2274, 4548, 9096, 18192, 36384];

/** Sterne je Steradiant bei gleichmäßiger Verteilung über die Vollkugel. */
export function starsPerSteradian(count) {
  return count / (4 * Math.PI);
}

/** Halbwertsbreite → Standardabweichung der Gaußfunktion: FWHM = 2·√(2 ln 2)·σ ≈ 2,3548·σ. */
export const FWHM_PER_SIGMA = 2 * Math.sqrt(2 * Math.LN2);

/* ------------------------------------------------------------------------- */
/* Objektiv: Punktbildfunktion                                               */
/* ------------------------------------------------------------------------- */

/**
 * Beschreibung des Objektivs (für Debug-Panel, README und Metadaten).
 *
 * Eingeschaltet: Gauß-Punktbildfunktion
 *   PSF(Δx, Δy) = exp(−(Δx² + Δy²) / (2σ²)) / N,   σ = FWHM / 2,3548,
 * ausgewertet in den Pixelmitten eines Fensters von ±⌈3σ⌉ Pixeln um den
 * Bildpunkt; N ist die Summe über das Fenster (das Licht bleibt erhalten).
 * Licht, das über den Bildrand fällt, ist verloren (wie beim Sensor).
 * Ausgeschaltet: keine Verschmierung, das Licht landet in genau einem Pixel.
 */
export function describeLens(lens) {
  if (!lens.enabled) {
    return {
      an: false,
      punktbildfunktion: 'keine (ideale Lochkamera): Licht eines Teilschritts vollständig im Pixel des Bildpunkts',
    };
  }
  const sigma = lens.fwhmPx / FWHM_PER_SIGMA;
  return {
    an: true,
    punktbildfunktion: 'Gauß, rotationssymmetrisch',
    formel: 'PSF(Δx, Δy) = exp(−(Δx² + Δy²)/(2σ²)) / N,  σ = FWHM/(2·√(2 ln 2))',
    halbwertsbreite_px: lens.fwhmPx,
    sigma_px: sigma,
    fenster_px: 2 * Math.ceil(3 * sigma) + 1,
    normierung: 'N = Summe der Gaußwerte in den Pixelmitten des Fensters (Gesamtlicht bleibt erhalten)',
    spitzenanteil: psfPeak(lens),
  };
}

/** Eindimensionale Gaußgewichte in den Pixelmitten um die Lage x (Pixelkoordinate). */
function gaussWeights(x, sigma, R, out) {
  const i0 = Math.floor(x) - R;
  const k = -1 / (2 * sigma * sigma);
  let sum = 0;
  for (let j = 0; j <= 2 * R; j++) {
    const d = i0 + j + 0.5 - x;
    const g = Math.exp(k * d * d);
    out[j] = g;
    sum += g;
  }
  return { i0, sum };
}

/**
 * Anteil des Lichts im hellsten Pixel, wenn der Bildpunkt genau in einer
 * Pixelmitte liegt (1 ohne Objektiv). Bezugsgröße der Tonkurve.
 */
export function psfPeak(lens) {
  if (!lens.enabled) return 1;
  const sigma = lens.fwhmPx / FWHM_PER_SIGMA;
  const R = Math.ceil(3 * sigma);
  const w = new Float64Array(2 * R + 1);
  const { sum } = gaussWeights(0.5, sigma, R, w);
  return 1 / (sum * sum);
}

/* ------------------------------------------------------------------------- */
/* Farbe                                                                     */
/* ------------------------------------------------------------------------- */

let tables = null;
function colorTables() {
  if (!tables) {
    tables = {
      visible: buildBlackbodyTable(),
      full: buildFalseColorTable(),
      Y: createVisibleLuminanceLookup(),
    };
  }
  return tables;
}

/**
 * Farbe zur Temperatur T aus der Tabelle, linear interpoliert in log T
 * (wie die Textur im Shader), als lineares sRGB mit Leuchtdichte 1.
 * So hat ein Teilschritt mit Lichtmenge w die Leuchtdichte w – wie im Shader,
 * wo durch die Leuchtdichte des Farbtons geteilt wird.
 */
function colorPerLuminance(table, T, out) {
  const lo = Math.log10(TABLE_T_MIN);
  const hi = Math.log10(TABLE_T_MAX);
  const u = Math.min(1, Math.max(0, (Math.log10(T) - lo) / (hi - lo))) * (TABLE_SIZE - 1);
  const i = Math.min(TABLE_SIZE - 2, Math.floor(u));
  const f = u - i;
  const r = table[4 * i] * (1 - f) + table[4 * i + 4] * f;
  const g = table[4 * i + 1] * (1 - f) + table[4 * i + 5] * f;
  const b = table[4 * i + 2] * (1 - f) + table[4 * i + 6] * f;
  const L = Math.max(0.2126 * r + 0.7152 * g + 0.0722 * b, 1e-3);
  out[0] = r / L;
  out[1] = g / L;
  out[2] = b / L;
}

/* ------------------------------------------------------------------------- */
/* Belichtetes Bild                                                          */
/* ------------------------------------------------------------------------- */

/**
 * Rechnet das belichtete Bild.
 *
 * @param {{count:number, directions:Float32Array, temperatures:Float32Array, fluxes:Float32Array}} stars  (stars.js)
 * @param {object} p
 * @param {object} p.camera        rectilinearCamera()
 * @param {(tau:number)=>number} p.betaAt
 * @param {number} p.tauMid        Bordzeit der Bildmitte in s
 * @param {number} p.exposure      Belichtungszeit t_b in s
 * @param {{aberration:boolean, doppler:boolean, beaming:boolean, fullSpectrum:boolean}} p.effects
 * @param {{enabled:boolean, fwhmPx:number}} p.lens
 * @param {number} [p.maxStepPx=1]
 * @returns {{energy:Float32Array, records:object[], stats:object}}
 *   energy: Licht je Pixel und Kanal (lineares sRGB, Einheit: 0-mag-Stern), vor der Tonkurve
 */
export function renderExposure(stars, p) {
  const cam = p.camera;
  const W = cam.width;
  const H = cam.height;
  const fx = p.effects;
  const { visible, full, Y } = colorTables();
  const table = fx.fullSpectrum ? full : visible;
  const energy = new Float32Array(W * H * 3);

  const lensOn = p.lens.enabled;
  const sigma = lensOn ? p.lens.fwhmPx / FWHM_PER_SIGMA : 0;
  const R = lensOn ? Math.ceil(3 * sigma) : 0;
  const wx = new Float64Array(2 * R + 1);
  const wy = new Float64Array(2 * R + 1);
  const rgb = [0, 0, 0];

  const records = [];
  let stepCount = 0;
  let deposits = 0;
  let largestMove = 0;
  let totalLight = 0;

  const deposit = (x, y, w, T) => {
    colorPerLuminance(table, T, rgb);
    deposits++;
    if (!lensOn) {
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
      const o = 3 * (iy * W + ix);
      energy[o] += w * rgb[0];
      energy[o + 1] += w * rgb[1];
      energy[o + 2] += w * rgb[2];
      return;
    }
    const gx = gaussWeights(x, sigma, R, wx);
    const gy = gaussWeights(y, sigma, R, wy);
    const norm = w / (gx.sum * gy.sum);
    for (let j = 0; j <= 2 * R; j++) {
      const iy = gy.i0 + j;
      if (iy < 0 || iy >= H) continue;
      const wyj = wy[j] * norm;
      for (let i = 0; i <= 2 * R; i++) {
        const ix = gx.i0 + i;
        if (ix < 0 || ix >= W) continue;
        const v = wyj * wx[i];
        const o = 3 * (iy * W + ix);
        energy[o] += v * rgb[0];
        energy[o + 1] += v * rgb[1];
        energy[o + 2] += v * rgb[2];
      }
    }
  };

  const n = [0, 0, 0];
  for (let s = 0; s < stars.count; s++) {
    n[0] = stars.directions[3 * s];
    n[1] = stars.directions[3 * s + 1];
    n[2] = stars.directions[3 * s + 2];
    const F = stars.fluxes[s];
    const T = stars.temperatures[s];
    const res = exposeStar(n, {
      betaAt: p.betaAt,
      tauMid: p.tauMid,
      exposure: p.exposure,
      camera: cam,
      aberration: fx.aberration,
      maxStepPx: p.maxStepPx ?? 1,
      marginPx: R + 1,
      brightness: (D) => F * starFluxFactor(D, T, Y, fx).factor,
    });
    stepCount += res.stepCount;
    totalLight += res.total;
    let inFrame = false;
    let lightInFrame = 0;
    for (const st of res.steps) {
      const Tseen = fx.doppler ? T / st.D : T;
      deposit(st.x, st.y, st.w, Tseen);
      if (st.x >= 0 && st.x < W && st.y >= 0 && st.y < H) {
        inFrame = true;
        lightInFrame += st.w;
      }
    }
    if (res.largestMovePx > largestMove) largestMove = res.largestMovePx;
    if (inFrame) {
      records.push({
        star: s,
        mag: -2.5 * Math.log10(F),
        T,
        psi: deg(Math.acos(Math.max(-1, Math.min(1, n[2])))),
        phi: deg(Math.atan2(n[1], n[0])),
        psiStart: deg(res.psiStart),
        psiEnd: deg(res.psiEnd),
        pStart: res.pStart,
        pEnd: res.pEnd,
        streakPx: res.streakPx,
        DStart: res.DStart,
        DEnd: res.DEnd,
        light: lightInFrame,
        steps: res.steps.length,
      });
    }
  }

  return {
    energy,
    records,
    stats: {
      stars: stars.count,
      starsInFrame: records.length,
      steps: stepCount,
      deposits,
      largestMovePx: largestMove,
      totalLight,
    },
  };
}

/* ------------------------------------------------------------------------- */
/* Tonkurve und sRGB                                                         */
/* ------------------------------------------------------------------------- */

/**
 * Skalierung der Tonkurve: s = k / Spitzenanteil der PSF.
 * k = 1 heißt: Ein Stern von 0 mag bei β = 0 erreicht in seinem hellsten
 * Pixel gerade Weiß (Bildpunkt in einer Pixelmitte). Gleiche Skalierung für
 * alle Bilder eines Exports.
 */
export function toneScale(k, lens) {
  return k / psfPeak(lens);
}

/** Beschreibung der Tonkurve (Debug-Panel, Metadaten). */
export function describeTone(k, lens) {
  return {
    formel: 'v = min(1, s · E) je Kanal, danach sRGB-Kennlinie (IEC 61966-2-1), 8 Bit',
    belichtungsfaktor_k: k,
    skalierung_s: toneScale(k, lens),
    bezug: 'k = 1: Stern von 0 mag bei β = 0 erreicht im hellsten Pixel gerade Weiß',
    E: 'aufsummiertes Licht je Pixel in linearem sRGB, Einheit: 0-mag-Stern',
  };
}

/** sRGB-Kennlinie (IEC 61966-2-1) für einen Wert in [0, 1]. */
export function linearToSrgb(c) {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** Tonkurve anwenden: Ergebnis RGBA (8 Bit) für ImageData. */
export function toneMap(energy, W, H, scale) {
  const out = new Uint8ClampedArray(W * H * 4);
  const lut = new Uint8ClampedArray(4097);
  for (let i = 0; i <= 4096; i++) lut[i] = Math.round(255 * linearToSrgb(i / 4096));
  for (let p = 0, q = 0; p < W * H; p++, q += 3) {
    for (let c = 0; c < 3; c++) {
      const v = Math.min(1, scale * energy[q + c]);
      // fein gestuft im Dunkeln: direkt rechnen, sonst Tabelle
      out[4 * p + c] = v < 0.01 ? Math.round(255 * linearToSrgb(v)) : lut[Math.round(v * 4096)];
    }
    out[4 * p + 3] = 255;
  }
  return out;
}

/* ------------------------------------------------------------------------- */
/* Zeit                                                                      */
/* ------------------------------------------------------------------------- */

/** Filmzeit in s → "hh:mm:ss.mmm". */
export function formatFilmTime(seconds) {
  const ms = Math.round(seconds * 1000);
  const sign = ms < 0 ? '−' : '';
  const a = Math.abs(ms);
  const h = Math.floor(a / 3600000);
  const m = Math.floor((a % 3600000) / 60000);
  const s = Math.floor((a % 60000) / 1000);
  const pad = (x, k = 2) => String(x).padStart(k, '0');
  return `${sign}${pad(h)}:${pad(m)}:${pad(s)}.${pad(a % 1000, 3)}`;
}

/** "hh:mm:ss(.sss)" oder "mm:ss" oder Sekunden → Sekunden (NaN bei Unsinn). */
export function parseFilmTime(text) {
  const parts = String(text).trim().replace(',', '.').split(':');
  if (parts.length > 3 || parts.some((x) => x === '' || isNaN(Number(x)))) return NaN;
  return parts.reduce((acc, x) => acc * 60 + Number(x), 0);
}

/** Belichtungszeit: "1/48" oder Dezimalzahl in s → Sekunden (NaN bei Unsinn). */
export function parseExposureTime(text) {
  const t = String(text).trim().replace(',', '.').replace(/\s*s$/, '');
  const m = t.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (m) return Number(m[1]) / Number(m[2]);
  return t === '' ? NaN : Number(t);
}

/* ------------------------------------------------------------------------- */
/* Ein ganzer Export: Parameter → Bild, CSV, JSON                            */
/* ------------------------------------------------------------------------- */

/**
 * Vollständige Beschreibung einer Belichtung aus den Einstellungen.
 * @param {object} cfg  { accel:{curve,beta0,beta1,durationS}, tauMid, exposure, effects, lens, k,
 *                        starCount, seed, filmStartS, betaZero?: true für Bild (a) }
 */
export function exposureSetup(cfg) {
  const camera = rectilinearCamera(EXPORT_DEFAULTS);
  const acc = cfg.accel;
  const profile = accelerationProfileProperTime(acc.curve, acc.durationS, acc.beta0, acc.beta1);
  const betaAt = cfg.betaZero ? () => 0 : profile.betaAt;
  return { camera, profile, betaAt };
}

/** Metadaten einer Belichtung als Objekt (wird als JSON neben das Bild gelegt). */
export function exposureMetadata(cfg, setup, result, extra = {}) {
  const { camera, profile, betaAt } = setup;
  const acc = cfg.accel;
  const tb = cfg.exposure;
  const tau0 = cfg.tauMid - tb / 2;
  const tau1 = cfg.tauMid + tb / 2;
  const samples = [];
  for (let i = 0; i <= 8; i++) {
    const tau = tau0 + (tb * i) / 8;
    samples.push({ bordzeit_s: tau, filmzeit: formatFilmTime(cfg.filmStartS + tau), beta: betaAt(tau) });
  }
  const aConst = acc.curve === 'constant' && acc.durationS > 0
    ? accelerationFromDuration(acc.durationS, acc.beta0, acc.beta1)
    : null;
  return {
    bild: {
      name: extra.name ?? null,
      breite_px: camera.width,
      hoehe_px: camera.height,
      projektion: 'geradlinig (gnomonisch), r = f · tan ψ′',
      bildfeld_horizontal_grad: camera.hfovDeg,
      brennweite_px: camera.f,
      fluchtpunkt_px: [camera.cx, camera.cy],
      kamera: 'Achse in Flugrichtung, Hauptpunkt = Fluchtpunkt; Kamera steht still, bewegt wird nur durch β(τ)',
      inhalt: 'nur Sternenhimmel, keine Statuszeile, keine Bedienelemente',
    },
    zeit: {
      bezug: 'Bordzeit τ (Eigenzeit der Kamera), τ = 0 beim Beginn der Beschleunigung',
      filmzeit_beginn_beschleunigung: formatFilmTime(cfg.filmStartS),
      bordzeit_bildmitte_s: cfg.tauMid,
      filmzeit_bildmitte: formatFilmTime(cfg.filmStartS + cfg.tauMid),
      belichtungszeit_s: tb,
      belichtung_beginn_s: tau0,
      belichtung_ende_s: tau1,
      helligkeit: 'zeitlicher Mittelwert über t_b (t_b ändert die Streifenlänge, nicht die Helligkeit ruhender Sterne)',
    },
    beta_verlauf: cfg.betaZero
      ? { kurve: 'β = 0 (Bild a, ruhend)', stuetzstellen: samples }
      : {
          kurve: acc.curve,
          beta_start: acc.beta0,
          beta_ende: acc.beta1,
          dauer_in_S_s: acc.durationS,
          dauer_bordzeit_s: profile.tauEnd,
          eigenbeschleunigung_m_s2: aConst,
          formel: acc.curve === 'constant'
            ? 'β(τ) = tanh(artanh β₀ + a·τ/c)'
            : 'β(t) nach Kurve in der Zeit t in S, τ(t) = ∫ dt/γ (Trapezregel)',
          ausserhalb: 'vor dem Beginn β = β₀, nach dem Ende β = β₁',
          beta_beginn_belichtung: betaAt(tau0),
          beta_bildmitte: betaAt(cfg.tauMid),
          beta_ende_belichtung: betaAt(tau1),
          stuetzstellen: samples,
        },
    effekte: {
      aberration: cfg.effects.aberration,
      doppler: cfg.effects.doppler,
      beaming: cfg.effects.beaming,
      spektrum: cfg.effects.fullSpectrum ? 'gesamtes Spektrum (Falschfarben, bolometrisch)' : 'nur sichtbares Licht',
      helligkeit_einzelstern: cfg.effects.fullSpectrum ? 'F′/F = D⁻² · k(T)' : 'F′/F = D² · Y(T′)/Y(T), T′ = T/D',
    },
    objektiv: describeLens(cfg.lens),
    tonkurve: describeTone(cfg.k, cfg.lens),
    sterne: {
      startwert: cfg.seed,
      anzahl_himmel: cfg.starCount,
      dichte_pro_sr: starsPerSteradian(cfg.starCount),
      helligkeiten_mag: [-1, 6.5],
      im_bild: result.stats.starsInFrame,
    },
    teilschritte: {
      regel: 'adaptiv halbiert, bis der Bildpunkt je Schritt höchstens max_wanderung_px wandert und sich die Helligkeit um höchstens 1 % ändert',
      max_wanderung_px: cfg.maxStepPx ?? 1,
      anzahl: result.stats.steps,
      groesste_wanderung_im_bild_px: result.stats.largestMovePx,
    },
    ...extra.more,
  };
}

/** Zahl für CSV: Punkt als Dezimaltrenner, 6 gültige Stellen (wie szene_analysieren.py). */
function csvNum(x) {
  if (x === null || x === undefined || Number.isNaN(x)) return '';
  if (!Number.isFinite(x)) return 'inf';
  return String(Number(x.toPrecision(6)));
}

/** CSV je Stern im Bild (Trennzeichen ";"). */
export function exposureCsv(records) {
  const head = [
    'stern', 'mag', 'T_K', 'psi_ruhe_grad', 'phi_grad',
    'psi_strich_beginn_grad', 'psi_strich_ende_grad',
    'x_beginn_px', 'y_beginn_px', 'x_ende_px', 'y_ende_px',
    'streifenlaenge_px', 'D_beginn', 'D_ende', 'licht_rel_0mag', 'teilschritte',
  ];
  const rows = records.map((r) => [
    r.star, csvNum(r.mag), csvNum(r.T), csvNum(r.psi), csvNum(r.phi),
    csvNum(r.psiStart), csvNum(r.psiEnd),
    csvNum(r.pStart?.[0]), csvNum(r.pStart?.[1]), csvNum(r.pEnd?.[0]), csvNum(r.pEnd?.[1]),
    csvNum(r.streakPx), csvNum(r.DStart), csvNum(r.DEnd), csvNum(r.light), r.steps,
  ].join(';'));
  return [head.join(';'), ...rows].join('\n') + '\n';
}

/** Bordzeiten der Bildmitten einer Sequenz: gleichmäßig, alle Belichtungen innerhalb der Phase. */
export function sequenceTimes(tauEnd, exposure, count) {
  const n = Math.max(2, Math.round(count));
  const a = exposure / 2;
  const b = Math.max(a, tauEnd - exposure / 2);
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
}
