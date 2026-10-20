/*
 * Erstellt mit Claude Code (KI-Werkzeug) im Auftrag von Dominik Wittkow,
 * W-Seminar Physik, CSG Ingolstadt, 24.09.2026.
 *
 * showcase.js — "Showcase-Bild": ein Poster (3840 × 2160), das auch ohne
 * Vorwissen zeigt, was in der Simulation passiert. Hauptbild in hoher
 * Auflösung, Markierungen an einzelnen Sternen mit ihren berechneten Werten,
 * Vergleichsbild in Ruhe, Faktenkarten, Spektrum, γ-Kurve und die Formeln.
 *
 * Alle Zahlen kommen aus physics.js bzw. blackbody.js; die Auswahl und
 * Bewertung der markierten Sterne rechnet exakt wie der Shader (render.js).
 */
import * as THREE from 'three';
import {
  C,
  LY_PER_PC,
  lorentzGamma,
  dopplerFactor,
  dopplerFactorForward,
  dopplerFactorBackward,
  aberrateDirection,
  apparentTemperature,
  beamingPointSource,
  visibleSpectralFactor,
  bolometricToVisibleRatio,
  psiPrimeOfSideStar,
  forwardConeSkyFraction,
  beamingExtended,
  wienPeakWavelengthNm,
  wavelengthShiftPercent,
  deg,
} from './physics.js';
import { blackbodyColor, planck, visibleFraction, createVisibleLuminanceLookup } from './blackbody.js';
import { CIE_1931_2DEG } from './cie1931.js';
import { viewMatrix, GLSL_PHYSICS } from './render.js';
import { formatNumber, sliderFromBeta } from './ui.js';

export const POSTER_W = 3840;
export const POSTER_H = 2160;
/** Hauptbild und Vergleichsbild (Pixel), vom Renderer außerhalb des Bildschirms berechnet. */
export const MAIN_W = 3840;
export const MAIN_H = 2160;
export const REST_W = 712;
export const REST_H = 400;

const num = formatNumber;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONO = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';
const COL = {
  bg0: '#04060b',
  bg1: '#0c1222',
  text: '#e6ebf5',
  muted: '#8e98ad',
  accent: '#7fb2ff',
  warm: '#ffb36b',
  line: 'rgba(127, 178, 255, 0.85)',
  box: 'rgba(8, 12, 22, 0.86)',
  border: 'rgba(127, 178, 255, 0.45)',
};

let Ylookup = null;
const Y = (T) => (Ylookup ??= createVisibleLuminanceLookup())(T);

/* ------------------------------------------------------------------------- */
/* Farben                                                                    */
/* ------------------------------------------------------------------------- */

const enc = (v) => {
  const c = Math.min(1, Math.max(0, v));
  return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
};
/** Farbe eines Schwarzkörpers (wie das Auge sie sähe) als CSS-Farbe. */
function tempCss(T) {
  const c = blackbodyColor(T);
  return `rgb(${enc(c.r)}, ${enc(c.g)}, ${enc(c.b)})`;
}
/** Farbe einer Wellenlänge (Spektralfarbe, auf sRGB begrenzt) als CSS-Farbe. */
function wavelengthCss(nm, brightness = 1) {
  const i = Math.max(0, Math.min(CIE_1931_2DEG.length - 2, Math.floor((nm - 380) / 5)));
  const f = (nm - CIE_1931_2DEG[i][0]) / 5;
  const [, x0, y0, z0] = CIE_1931_2DEG[i];
  const [, x1, y1, z1] = CIE_1931_2DEG[i + 1];
  const X = x0 + f * (x1 - x0);
  const Yv = y0 + f * (y1 - y0);
  const Z = z0 + f * (z1 - z0);
  let r = Math.max(0, 3.2406 * X - 1.5372 * Yv - 0.4986 * Z);
  let g = Math.max(0, -0.9689 * X + 1.8758 * Yv + 0.0415 * Z);
  let b = Math.max(0, 0.0557 * X - 0.204 * Yv + 1.057 * Z);
  const m = Math.max(r, g, b, 1e-6);
  r = (r / m) * brightness;
  g = (g / m) * brightness;
  b = (b / m) * brightness;
  return `rgb(${enc(r)}, ${enc(g)}, ${enc(b)})`;
}

/* ------------------------------------------------------------------------- */
/* Projektion wie im Shader (render.js, GLSL_PROJECTION)                     */
/* ------------------------------------------------------------------------- */

function makeProjector(rs, W, H) {
  const m = viewMatrix(rs.yaw, rs.pitch);
  const halfFov = (rs.fovDeg * Math.PI) / 360;
  const focal = 1 / Math.tan(halfFov);
  const stereo = 1 / (2 * Math.tan(halfFov / 2));
  const aspect = W / H;
  const v = new THREE.Vector3();
  return (dir) => {
    v.set(dir[0], dir[1], dir[2]).applyMatrix3(m);
    let nx;
    let ny;
    if (rs.projection === 'stereographic') {
      const k = (2 * stereo) / Math.max(1 - v.z, 1e-6);
      nx = (v.x * k) / aspect;
      ny = v.y * k;
    } else {
      if (-v.z <= 1e-6) return null;
      nx = (v.x * focal) / aspect / -v.z;
      ny = (v.y * focal) / -v.z;
    }
    return [((nx + 1) / 2) * W, ((1 - ny) / 2) * H];
  };
}

/* ------------------------------------------------------------------------- */
/* Sterne für die Markierungen auswählen                                     */
/* ------------------------------------------------------------------------- */

/**
 * Bewertet jeden Stern genau wie der Shader: Richtung in S, D, T' = T/D,
 * Helligkeit (Beaming, sichtbarer Anteil bzw. bolometrisch), Bildposition.
 * @returns {Array<{x,y,b,T,Tseen,ratio,psi,psiSeen,dist}>}  sichtbare Sterne im Bild
 */
export function analyzeStars(rs, source, W, H, region = null) {
  const project = makeProjector(rs, W, H);
  const out = [];
  const full = rs.spectrum === 'full';
  const margin = 60;

  const consider = (n, baseFlux, T, dist) => {
    const D = dopplerFactor(rs.beta, n[2]);
    const Tseen = rs.doppler ? apparentTemperature(T, D) : T;
    // Helligkeitsänderung gegenüber Ruhe im selben Modus
    let ratio = rs.beaming ? beamingPointSource(D) : 1;
    if (!full) ratio *= visibleSpectralFactor(T, Tseen, Y(T), Y(Tseen));
    const flux = baseFlux * (full ? bolometricToVisibleRatio(T, Y) : 1) * ratio;
    const b = flux * rs.exposure;
    if (b < 1) return; // auf dem Bildschirm nicht deutlich sichtbar
    const seen = rs.aberration ? aberrateDirection(rs.beta, n) : n;
    const p = project(seen);
    if (!p || p[0] < margin || p[0] > W - margin || p[1] < margin || p[1] > H - margin) return;
    // nur im freien Bildbereich (nicht unter den Bedienfenstern des Posters)
    if (region && (p[0] < region.x0 || p[0] > region.x1 || p[1] < region.y0 || p[1] > region.y1)) return;
    out.push({
      x: p[0],
      y: p[1],
      b,
      T,
      Tseen,
      ratio,
      psi: deg(Math.acos(Math.max(-1, Math.min(1, n[2])))),
      psiSeen: deg(Math.acos(Math.max(-1, Math.min(1, seen[2])))),
      dist,
    });
  };

  if (source.mode3d) {
    const o = source.observer;
    const tenPc = 10 * LY_PER_PC;
    source.field3d.forEachCell((origin, d) => {
      for (let i = 0; i < d.count; i++) {
        const x = d.positions[3 * i] + origin[0] - o[0];
        const y = d.positions[3 * i + 1] + origin[1] - o[1];
        const z = d.positions[3 * i + 2] + origin[2] - o[2];
        const r = Math.max(Math.hypot(x, y, z), 1e-4);
        consider([x / r, y / r, z / r], d.absFluxes[i] * (tenPc / r) ** 2, d.temperatures[i], r);
      }
    });
  } else {
    const s = source.stars;
    for (let i = 0; i < s.count; i++) {
      const n = [s.directions[3 * i], s.directions[3 * i + 1], s.directions[3 * i + 2]];
      consider(n, s.fluxes[i], s.temperatures[i], null);
    }
  }
  out.sort((a, b) => b.b - a.b);
  return out;
}

/** Bis zu drei markante, gut verteilte Sterne mit Überschrift. */
export function pickCallouts(cands, W) {
  const chosen = [];
  const farFrom = (c, d) => chosen.every((o) => Math.hypot(o.x - c.x, o.y - c.y) > d);
  const take = (pred, title) => {
    const c = cands.find((s) => pred(s) && farFrom(s, W * 0.1));
    if (c) chosen.push({ ...c, title });
  };
  take(() => true, 'Hellster Stern im Bild');
  take((s) => s.psi > 95 && s.psiSeen < s.psi - 20, 'Steht eigentlich hinter dir');
  take((s) => s.Tseen < 0.8 * s.T, 'Ins Rote verschoben');
  take((s) => s.Tseen > 2 * s.T, 'Ins Blaue verschoben');
  take(() => true, 'Noch ein Stern');
  return chosen.slice(0, 3);
}

/* ------------------------------------------------------------------------- */
/* Poster-Aufbau (Software-Oberfläche über dem randlosen Simulationsbild)    */
/* ------------------------------------------------------------------------- */

const TOP_H = 96;
const STATUS_H = 46;
const LEFT = { x: 36, y: TOP_H + 30, w: 640 };
const RIGHT = { x: POSTER_W - 36 - 760, y: TOP_H + 30, w: 760 };
const BAND = { y: 1716, h: POSTER_H - STATUS_H - 1716 - 24 };

/** Freier Bildbereich zwischen den Fenstern (für Markierungen). */
export const FREE_REGION = {
  x0: LEFT.x + LEFT.w + 60,
  x1: RIGHT.x - 60,
  y0: TOP_H + 300,
  y1: BAND.y - 40,
};
/** Bereich, in dem markierte Sterne liegen dürfen: Mitte, damit die Boxen am Rand sie nicht verdecken. */
export const CALLOUT_REGION = {
  x0: FREE_REGION.x0 + 760,
  x1: FREE_REGION.x1 - 760,
  y0: FREE_REGION.y0 + 40,
  y1: FREE_REGION.y1 - 40,
};

/* ------------------------------------------------------------------------- */
/* Zeichenhilfen                                                             */
/* ------------------------------------------------------------------------- */

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function text(g, str, x, y, size, color = COL.text, weight = 400, align = 'left', font = FONT) {
  g.font = `${weight} ${size}px ${font}`;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = 'alphabetic';
  g.fillText(str, x, y);
  return g.measureText(str).width;
}

function measure(g, str, size, weight = 400, font = FONT) {
  g.font = `${weight} ${size}px ${font}`;
  return g.measureText(str).width;
}

function swatch(g, x, y, size, css) {
  g.beginPath();
  g.arc(x + size / 2, y - size / 2 + 4, size / 2, 0, 2 * Math.PI);
  g.fillStyle = css;
  g.shadowColor = css;
  g.shadowBlur = 16;
  g.fill();
  g.shadowBlur = 0;
}

/** Fenster im Stil der Anwendung: Glas-Hintergrund, Kopfzeile mit Titel. */
function windowPanel(g, x, y, w, h, title, badge) {
  g.save();
  g.shadowColor = 'rgba(0, 0, 0, 0.55)';
  g.shadowBlur = 40;
  roundRect(g, x, y, w, h, 14);
  g.fillStyle = 'rgba(12, 16, 28, 0.84)';
  g.fill();
  g.restore();
  roundRect(g, x, y, w, h, 14);
  g.strokeStyle = 'rgba(127, 178, 255, 0.30)';
  g.lineWidth = 2;
  g.stroke();
  // Kopfzeile
  g.save();
  roundRect(g, x, y, w, 52, 14);
  g.clip();
  g.fillStyle = 'rgba(127, 178, 255, 0.08)';
  g.fillRect(x, y, w, 52);
  g.restore();
  g.fillStyle = 'rgba(127, 178, 255, 0.25)';
  g.fillRect(x, y + 52, w, 1.5);
  g.fillStyle = COL.accent;
  g.beginPath();
  g.arc(x + 26, y + 26, 6, 0, 2 * Math.PI);
  g.fill();
  text(g, title, x + 44, y + 35, 24, COL.text, 700);
  if (badge) {
    const bw = measure(g, badge, 20, 600, MONO) + 22;
    roundRect(g, x + w - bw - 16, y + 12, bw, 30, 8);
    g.fillStyle = 'rgba(127, 178, 255, 0.14)';
    g.fill();
    text(g, badge, x + w - bw - 5, y + 33, 20, COL.accent, 600, 'left', MONO);
  }
}

function sectionLabel(g, str, x, y, w) {
  text(g, str, x, y, 19, COL.muted, 700);
  g.fillStyle = 'rgba(142, 152, 173, 0.25)';
  g.fillRect(x + measure(g, str, 19, 700) + 12, y - 7, w - measure(g, str, 19, 700) - 12, 1.5);
}

/** Schieberegler wie in der App: Spur, gefüllter Teil, Knopf, Wertfeld, optional Skala. */
function slider(g, x, y, w, label, value, frac, ticks) {
  text(g, label, x, y, 23, COL.text, 500);
  const vw = measure(g, value, 22, 600, MONO) + 26;
  roundRect(g, x + w - vw, y - 26, vw, 36, 7);
  g.fillStyle = '#0a0e18';
  g.fill();
  g.strokeStyle = 'rgba(127, 178, 255, 0.35)';
  g.lineWidth = 1.5;
  g.stroke();
  text(g, value, x + w - vw + 13, y - 1, 22, COL.text, 600, 'left', MONO);
  const ty = y + 34;
  const f = Math.min(1, Math.max(0, frac));
  roundRect(g, x, ty - 4, w, 8, 4);
  g.fillStyle = 'rgba(142, 152, 173, 0.28)';
  g.fill();
  roundRect(g, x, ty - 4, Math.max(8, w * f), 8, 4);
  g.fillStyle = COL.accent;
  g.fill();
  g.save();
  g.shadowColor = COL.accent;
  g.shadowBlur = 16;
  g.beginPath();
  g.arc(x + w * f, ty, 13, 0, 2 * Math.PI);
  g.fillStyle = '#dbe8ff';
  g.fill();
  g.restore();
  g.beginPath();
  g.arc(x + w * f, ty, 13, 0, 2 * Math.PI);
  g.strokeStyle = COL.accent;
  g.lineWidth = 3;
  g.stroke();
  if (ticks) {
    for (const [tf, tl] of ticks) {
      g.fillStyle = 'rgba(142, 152, 173, 0.6)';
      g.fillRect(x + w * tf - 1, ty + 14, 2, 10);
      text(g, tl, x + w * tf, ty + 46, 18, COL.muted, 500, tf === 0 ? 'left' : tf === 1 ? 'right' : 'center', MONO);
    }
  }
  return ticks ? 112 : 84;
}

/** Schalter (an/aus) mit Fachbegriff und Erklärung. */
function toggle(g, x, y, w, label, sub, on) {
  roundRect(g, x + w - 70, y - 26, 70, 36, 18);
  g.fillStyle = on ? 'rgba(127, 178, 255, 0.85)' : 'rgba(142, 152, 173, 0.30)';
  g.fill();
  g.beginPath();
  g.arc(on ? x + w - 18 : x + w - 52, y - 8, 14, 0, 2 * Math.PI);
  g.fillStyle = on ? '#ffffff' : '#9aa3b6';
  g.fill();
  text(g, label, x, y - 6, 22, on ? COL.text : COL.muted, 600);
  if (sub) text(g, sub, x, y + 19, 18, COL.muted);
  return sub ? 58 : 48;
}

function radio(g, x, y, label, on) {
  g.beginPath();
  g.arc(x + 11, y - 8, 11, 0, 2 * Math.PI);
  g.strokeStyle = on ? COL.accent : 'rgba(142, 152, 173, 0.6)';
  g.lineWidth = 2.5;
  g.stroke();
  if (on) {
    g.beginPath();
    g.arc(x + 11, y - 8, 5.5, 0, 2 * Math.PI);
    g.fillStyle = COL.accent;
    g.fill();
  }
  text(g, label, x + 34, y, 21, on ? COL.text : COL.muted, on ? 600 : 400);
  return 40;
}

function dropdown(g, x, y, w, label, value) {
  text(g, label, x, y, 21, COL.muted, 500);
  const dx = x + 210;
  const dw = w - 210;
  roundRect(g, dx, y - 27, dw, 38, 7);
  g.fillStyle = '#0a0e18';
  g.fill();
  g.strokeStyle = 'rgba(127, 178, 255, 0.35)';
  g.lineWidth = 1.5;
  g.stroke();
  text(g, value, dx + 14, y - 1, 20, COL.text, 500);
  text(g, '▾', dx + dw - 14, y - 1, 20, COL.accent, 700, 'right');
  return 54;
}

/* ------------------------------------------------------------------------- */
/* Poster                                                                    */
/* ------------------------------------------------------------------------- */

/**
 * @param {object} p
 * @param {HTMLCanvasElement} p.mainImg  Simulationsbild MAIN_W × MAIN_H (randlos)
 * @param {HTMLCanvasElement} p.restImg  Referenzbild in Ruhe REST_W × REST_H
 * @param {object} p.rs        Zustand für den Renderer
 * @param {Array} p.callouts   pickCallouts(...)
 * @param {object} p.info      Zusatzwerte aus main.js (Sternzahl, 3D-Flug, Regler …)
 * @returns {Promise<Blob>}
 */
export async function composeShowcase({ mainImg, restImg, rs, callouts, info }) {
  const cv = document.createElement('canvas');
  cv.width = POSTER_W;
  cv.height = POSTER_H;
  const g = cv.getContext('2d');
  const beta = rs.beta;
  const gamma = lorentzGamma(beta);

  // randloses Simulationsbild, Ränder leicht abgedunkelt (Lesbarkeit der Fenster)
  g.drawImage(mainImg, 0, 0, POSTER_W, POSTER_H);
  const vig = g.createRadialGradient(POSTER_W / 2, POSTER_H * 0.46, POSTER_H * 0.35, POSTER_W / 2, POSTER_H / 2, POSTER_W * 0.62);
  vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vig.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
  g.fillStyle = vig;
  g.fillRect(0, 0, POSTER_W, POSTER_H);

  drawConeRing(g, rs);
  drawHud(g, rs, gamma);
  drawCallouts(g, callouts, info.mode3d);

  drawTopBar(g, rs, info);
  drawControls(g, rs, info);
  drawTelemetry(g, rs, gamma, info);
  drawReference(g, restImg, rs);
  drawPipeline(g, rs, gamma, callouts[0]);
  drawCode(g);
  drawStatusBar(g, rs, info);

  return new Promise((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG fehlgeschlagen'))), 'image/png'));
}

/** Kopfleiste wie ein Programmfenster. */
function drawTopBar(g, rs, info) {
  g.fillStyle = 'rgba(10, 13, 22, 0.92)';
  g.fillRect(0, 0, POSTER_W, TOP_H);
  g.fillStyle = 'rgba(127, 178, 255, 0.28)';
  g.fillRect(0, TOP_H - 2, POSTER_W, 2);
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => {
    g.beginPath();
    g.arc(46 + i * 34, TOP_H / 2, 10, 0, 2 * Math.PI);
    g.fillStyle = c;
    g.fill();
  });
  let x = 170;
  x += text(g, 'OpticEffectsSim', x, 60, 34, COL.text, 800) + 18;
  text(g, 'Relativistische Optik bei v → c · Echtzeit-Simulation', x, 60, 24, COL.muted, 500);
  // Reiter
  const tabs = [['Simulation', true], ['Übersicht', false]];
  let tx = 1500;
  for (const [t, on] of tabs) {
    const w = measure(g, t, 24, 600) + 48;
    if (on) {
      g.fillStyle = COL.accent;
      g.fillRect(tx, TOP_H - 6, w, 4);
    }
    text(g, t, tx + 24, 60, 24, on ? COL.text : COL.muted, 600);
    tx += w + 10;
  }
  // Statusanzeigen rechts
  const chips = [
    `${rs.projection === 'stereographic' ? 'stereografisch' : 'Perspektive'} · ${num(rs.fovDeg, 3)}°`,
    info.mode3d ? '3D-Flug' : 'Himmelskugel',
    '● GPU-Shader aktiv',
  ];
  let cx = POSTER_W - 40;
  for (const c of chips) {
    const w = measure(g, c, 21, 600, MONO) + 30;
    cx -= w;
    roundRect(g, cx, 26, w, 44, 10);
    g.fillStyle = 'rgba(127, 178, 255, 0.10)';
    g.fill();
    g.strokeStyle = 'rgba(127, 178, 255, 0.35)';
    g.lineWidth = 1.5;
    g.stroke();
    text(g, c, cx + 15, 56, 21, c.startsWith('●') ? '#5be08a' : COL.accent, 600, 'left', MONO);
    cx -= 14;
  }
}

/** Großanzeige in der Szene (wie ein Head-up-Display). */
function drawHud(g, rs, gamma) {
  const cx = POSTER_W / 2;
  const big = `β = ${num(rs.beta, 4)} c`;
  const sub = `v = ${num((rs.beta * C) / 1000, 6)} km/s   ·   γ = ${num(gamma, 4)}   ·   Zeitdilatation 1 : ${num(gamma, 3)}`;
  const w = Math.max(measure(g, big, 76, 700, MONO), measure(g, sub, 26, 500, MONO)) + 80;
  roundRect(g, cx - w / 2, TOP_H + 30, w, 150, 16);
  g.fillStyle = 'rgba(8, 12, 22, 0.62)';
  g.fill();
  g.strokeStyle = 'rgba(127, 178, 255, 0.30)';
  g.lineWidth = 2;
  g.stroke();
  text(g, big, cx, TOP_H + 112, 76, COL.text, 700, 'center', MONO);
  text(g, sub, cx, TOP_H + 158, 26, COL.accent, 500, 'center', MONO);
}

/** Aberrationskegel: ψ' = arccos β enthält die gesamte vordere Hemisphäre. */
function drawConeRing(g, rs) {
  if (!rs.aberration || rs.beta < 0.2) return;
  const project = makeProjector(rs, MAIN_W, MAIN_H);
  const a = psiPrimeOfSideStar(rs.beta);
  const pts = [];
  for (let i = 0; i <= 180; i++) {
    const phi = (2 * Math.PI * i) / 180;
    pts.push(project([Math.sin(a) * Math.cos(phi), Math.sin(a) * Math.sin(phi), Math.cos(a)]));
  }
  const onScreen = pts.filter((p) => p && p[0] > 0 && p[0] < MAIN_W && p[1] > 0 && p[1] < MAIN_H);
  if (onScreen.length < pts.length * 0.5) return;
  g.save();
  g.setLineDash([22, 16]);
  g.strokeStyle = 'rgba(255, 179, 107, 0.9)';
  g.lineWidth = 4;
  g.beginPath();
  let pen = false;
  for (const p of pts) {
    if (!p) {
      pen = false;
      continue;
    }
    if (pen) g.lineTo(p[0], p[1]);
    else g.moveTo(p[0], p[1]);
    pen = true;
  }
  g.stroke();
  const top = onScreen.reduce((a2, b2) => (b2[1] < a2[1] ? b2 : a2));
  const label = `Aberrationskegel ψ′ ≤ ${num(deg(a), 3)}° — enthält die gesamte vordere Hemisphäre (2π sr)`;
  const w = measure(g, label, 26, 600) + 36;
  const lx = Math.min(Math.max(top[0] - w / 2, FREE_REGION.x0), FREE_REGION.x1 - w);
  const ly = TOP_H + 210;
  if (top[1] > ly + 60) {
    g.setLineDash([8, 10]);
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(top[0], ly + 46);
    g.lineTo(top[0], top[1] - 6);
    g.stroke();
  }
  g.setLineDash([]);
  roundRect(g, lx, ly, w, 46, 10);
  g.fillStyle = COL.box;
  g.fill();
  g.strokeStyle = 'rgba(255, 179, 107, 0.7)';
  g.lineWidth = 2;
  g.stroke();
  text(g, label, lx + 18, ly + 32, 26, COL.warm, 600);
  g.restore();
}

/**
 * Fachbegriff für einen markierten Stern und eine Erklärung in Alltagssprache.
 * Jeder Stern bekommt möglichst einen anderen Begriff (used = bereits vergeben).
 */
const TERMS = {
  blue: ['Relativistische Blauverschiebung', 'Licht gestaucht – erscheint bläulicher und heißer'],
  behind: ['Aberration hinter der Querachse', 'steht eigentlich hinter dir – erscheint vor dir'],
  red: ['Relativistische Rotverschiebung', 'Licht gestreckt – erscheint röter und kühler'],
  aber: ['Aberration', 'Richtung zum Stern nach vorn verschoben'],
};
function describe(c, used) {
  const fits = [];
  if (c.Tseen > 1.2 * c.T) fits.push('blue');
  if (c.psi > 95 && c.psiSeen < c.psi - 20) fits.push('behind');
  if (c.Tseen < 0.8 * c.T) fits.push('red');
  fits.push('aber');
  const key = fits.find((k) => !used.has(k)) ?? fits[0];
  used.add(key);
  return TERMS[key];
}

/** Markierungen an einzelnen Sternen (A, B, C) mit Fachbegriffen und Werten. */
function drawCallouts(g, callouts, mode3d) {
  const used = { left: [], right: [] };
  const usedTerms = new Set();
  callouts.forEach((c, i) => {
    const letter = 'ABC'[i];
    const [term, plain] = describe(c, usedTerms);
    const D = c.Tseen > 0 ? c.T / c.Tseen : 1;
    const lines = [
      { kind: 'temps' },
      { str: `Aberration  ψ = ${num(c.psi, 3)}°  →  ψ′ = ${num(c.psiSeen, 3)}°` },
      { str: `Doppler  D = λ′/λ = ${num(D, 3)}    Beaming  F′/F = ${num(c.ratio, 3)}` },
    ];
    if (mode3d && c.dist) lines.push({ str: `Entfernung  r = ${num(c.dist, 3)} Lj` });
    lines.push({ str: plain, muted: true });
    const title = `${letter} · ${term}`;
    const boxW = Math.max(
      measure(g, title, 30, 700) + 40,
      ...lines.filter((l) => l.str).map((l) => measure(g, l.str, 23, 500, MONO) + 48),
      measure(g, `T = ${num(c.T, 3)} K  →  T′ = ${num(c.Tseen, 3)} K`, 23, 500, MONO) + 120,
    );
    const boxH = 66 + lines.length * 38;
    const side = c.x < (FREE_REGION.x0 + FREE_REGION.x1) / 2 ? 'left' : 'right';
    const bx = side === 'left' ? FREE_REGION.x0 : FREE_REGION.x1 - boxW;
    let by = Math.min(Math.max(c.y - boxH / 2, FREE_REGION.y0), FREE_REGION.y1 - boxH);
    for (const u of used[side]) if (by < u.y + u.h + 20 && by + boxH + 20 > u.y) by = u.y + u.h + 24;
    used[side].push({ y: by, h: boxH });

    g.save();
    g.strokeStyle = COL.line;
    g.lineWidth = 3;
    g.shadowColor = COL.accent;
    g.shadowBlur = 12;
    g.beginPath();
    g.arc(c.x, c.y, 30, 0, 2 * Math.PI);
    g.stroke();
    const ax = side === 'left' ? bx + boxW : bx;
    const ay = by + 34;
    const dx = ax - c.x;
    const dy = ay - c.y;
    const len = Math.hypot(dx, dy) || 1;
    g.beginPath();
    g.moveTo(c.x + (dx / len) * 32, c.y + (dy / len) * 32);
    g.lineTo(ax, ay);
    g.stroke();
    g.restore();
    // Buchstabe am Stern
    g.beginPath();
    g.arc(c.x + 30, c.y - 30, 18, 0, 2 * Math.PI);
    g.fillStyle = COL.accent;
    g.fill();
    text(g, letter, c.x + 30, c.y - 22, 22, '#06101f', 800, 'center');

    roundRect(g, bx, by, boxW, boxH, 12);
    g.fillStyle = COL.box;
    g.fill();
    g.strokeStyle = COL.border;
    g.lineWidth = 2;
    g.stroke();
    text(g, title, bx + 20, by + 44, 30, COL.text, 700);
    let ly = by + 44 + 40;
    for (const l of lines) {
      if (l.kind === 'temps') {
        let x = bx + 20;
        x += text(g, `T = ${num(c.T, 3)} K`, x, ly, 23, COL.text, 500, 'left', MONO) + 10;
        swatch(g, x, ly, 22, tempCss(c.T));
        x += 36;
        x += text(g, '→', x, ly, 23, COL.muted, 500, 'left', MONO) + 12;
        x += text(g, `T′ = ${num(c.Tseen, 3)} K`, x, ly, 23, COL.text, 500, 'left', MONO) + 10;
        swatch(g, x, ly, 22, tempCss(c.Tseen));
      } else if (l.muted) {
        text(g, l.str, bx + 20, ly, 22, COL.muted, 400);
      } else {
        text(g, l.str, bx + 20, ly, 23, COL.accent, 500, 'left', MONO);
      }
      ly += 38;
    }
  });
}

/** Fenster "Steuerung": die Regler der Anwendung mit dem aktuellen Zustand. */
const CONTROLS_H = 1130;
function drawControls(g, rs, info) {
  const { x, y, w } = LEFT;
  const h = CONTROLS_H;
  windowPanel(g, x, y, w, h, 'Steuerung', 'live');
  const ix = x + 28;
  const iw = w - 56;
  let yy = y + 100;
  sectionLabel(g, 'KINEMATIK', ix, yy, iw);
  yy += 46;
  const logTicks = [0, 0.9, 0.99, 0.999].map((b) => [sliderFromBeta(b), String(b).replace('.', ',')]);
  yy += slider(g, ix, yy, iw, 'β = v/c  Relativgeschwindigkeit', num(rs.beta, 4), sliderFromBeta(Math.min(rs.beta, 0.999)), logTicks);
  text(g, 'logarithmische Skala in (1 − β)', ix, yy - 4, 17, COL.muted);
  yy += 40;
  sectionLabel(g, 'ANSICHT', ix, yy, iw);
  yy += 46;
  yy += slider(g, ix, yy, iw, 'Sichtfeld (FOV)', `${num(rs.fovDeg, 3)}°`, (rs.fovDeg - 20) / 150);
  yy += slider(g, ix, yy, iw, 'Belichtung', `${num(info.exposureMag, 2)} mag`, (info.exposureMag + 4) / 12);
  yy += dropdown(g, ix, yy, iw, 'Projektion', rs.projection === 'stereographic' ? 'stereografisch (winkeltreu)' : 'Zentralprojektion');
  yy += 16;
  sectionLabel(g, 'EFFEKTE', ix, yy, iw);
  yy += 50;
  yy += toggle(g, ix, yy, iw, 'Aberration', 'Richtungsänderung des Lichts', rs.aberration);
  yy += toggle(g, ix, yy, iw, 'Relativistischer Doppler-Effekt', 'Frequenzverschiebung, T′ = T/D', rs.doppler);
  yy += toggle(g, ix, yy, iw, 'Relativistisches Beaming', 'Searchlight-Effekt, F′/F = D⁻²', rs.beaming);
  yy += toggle(g, ix, yy, iw, 'Terrell-Penrose-Rotation', 'scheinbare Drehung ausgedehnter Körper', !!rs.bodies?.enabled);
  yy += 6;
  sectionLabel(g, 'SPEKTRUM', ix, yy, iw);
  yy += 46;
  yy += radio(g, ix, yy, 'sichtbares Licht (380–780 nm)', rs.spectrum !== 'full');
  yy += radio(g, ix, yy, 'Gesamtspektrum 50 nm – 20 µm (Falschfarben)', rs.spectrum === 'full');
  yy += 10;
  sectionLabel(g, '3D-FLUG', ix, yy, iw);
  yy += 50;
  yy += toggle(g, ix, yy, iw, 'Flug durch 3D-Sternfeld', info.mode3d ? `Zeitfaktor ${info.timeFactorLabel}` : 'Himmelskugel (Sterne unendlich weit)', info.mode3d);
}

/** Fenster "Telemetrie": Fachbegriffe mit den aktuellen Messwerten. */
function drawTelemetry(g, rs, gamma, info) {
  const { x, y, w } = RIGHT;
  const h = 1080;
  windowPanel(g, x, y, w, h, 'Telemetrie', '10 Hz');
  const beta = rs.beta;
  const Df = dopplerFactorForward(beta);
  const Db = dopplerFactorBackward(beta);
  const Tsun = apparentTemperature(5800, Df);
  const lmax = wienPeakWavelengthNm(Tsun);
  const band = lmax < 100 ? 'EUV' : lmax < 380 ? 'UV' : lmax > 780 ? 'IR' : 'VIS';
  const groups = [
    ['KINEMATIK', [
      ['Lorentzfaktor', 'γ', num(gamma, 5), ''],
      ['Eigenzeit / Koordinatenzeit', 'dτ/dt', num(1 / gamma, 4), ''],
      ['Geschwindigkeit', 'v', num((beta * C) / 1000, 6), 'km/s'],
    ]],
    ['ABERRATION', [
      ['Aberrationswinkel (ψ = 90°)', 'ψ′', num(deg(psiPrimeOfSideStar(beta)), 4), '°'],
      ['Raumwinkelanteil des Kegels', '(1−β)/2', num(100 * forwardConeSkyFraction(beta), 3), '%'],
      ['Raumwinkelkompression vorn', 'dΩ′/dΩ', num(Df * Df, 3), ''],
    ]],
    ['DOPPLER · SPEKTRUM', [
      ['Dopplerfaktor vorn (Blau)', 'D', num(Df, 4), ''],
      ['Dopplerfaktor hinten (Rot)', 'D', num(Db, 4), ''],
      ['Wellenlängenverschiebung', 'Δλ/λ', num(wavelengthShiftPercent(Df), 3), '%'],
      ['Scheinbare Temperatur ☉', 'T′', num(Tsun, 5), 'K'],
      [`Wien-Maximum (${band})`, 'λmax', num(lmax, 3), 'nm'],
      ['Sichtbarer Strahlungsanteil', 'f', num(100 * visibleFraction(Tsun), 3), '%'],
    ]],
    ['PHOTOMETRIE', [
      ['Beaming Punktquelle', 'F′/F', num(beamingPointSource(Df), 4), ''],
      ['Beaming Fläche', 'L′/L', num(beamingExtended(Df), 4), ''],
    ]],
    ['RECHNUNG', [
      ['Sterne im Datensatz', 'N', info.starCount.toLocaleString('de-DE'), ''],
      ['Shader-Aufrufe bei 60 Hz', 'N·60', num(info.starCount * 60, 3), '/s'],
      ...(info.mode3d ? [['Strecke in S', 's', num(info.distanceLy, 4), 'Lj'], ['Bordzeit', 'τ', num(info.tauYears, 4), 'a']] : []),
    ]],
  ];
  let yy = y + 96;
  for (const [title, rows] of groups) {
    sectionLabel(g, title, x + 28, yy, w - 56);
    yy += 38;
    for (const [label, sym, val, unit] of rows) {
      text(g, label, x + 28, yy, 21, COL.muted);
      text(g, sym, x + 420, yy, 21, COL.accent, 600, 'left', MONO);
      text(g, val, x + w - 86, yy, 22, COL.text, 600, 'right', MONO);
      if (unit) text(g, unit, x + w - 76, yy, 19, COL.muted, 500, 'left', MONO);
      yy += 34;
    }
    yy += 14;
  }
}

/** Referenzbild: derselbe Blick im Ruhesystem S. */
function drawReference(g, restImg, rs) {
  const x = RIGHT.x;
  const y = RIGHT.y + 1080 + 24;
  const w = RIGHT.w;
  const h = BAND.y - 24 - y;
  windowPanel(g, x, y, w, h, 'Referenz: Ruhesystem S (β = 0)');
  const iw = w - 48;
  const ih = Math.min(h - 76, (iw * REST_H) / REST_W);
  g.drawImage(restImg, x + 24, y + 64, iw, ih);
  roundRect(g, x + 24, y + 64, iw, ih, 8);
  g.strokeStyle = 'rgba(127, 178, 255, 0.25)';
  g.lineWidth = 1.5;
  g.stroke();

  // links: Spektrum unter der Steuerung
  const lx = LEFT.x;
  const ly = LEFT.y + CONTROLS_H + 24;
  const lh = BAND.y - 24 - ly;
  drawSpectrum(g, lx, ly, LEFT.w, lh, rs.beta);
}

/** Planck-Spektrum der Sonne in Ruhe und von vorn gesehen (Wiensches Verschiebungsgesetz). */
function drawSpectrum(g, x, y, w, h, beta) {
  windowPanel(g, x, y, w, h, 'Planck-Spektrum B_λ(T) · Wien');
  const D = dopplerFactorForward(beta);
  const T0 = 5800;
  const T1 = apparentTemperature(T0, D);
  const px = x + 24;
  const pw = w - 48;
  const py = y + 74;
  const ph = h - 140;
  const lo = Math.log10(60);
  const hi = Math.log10(3000);
  const X = (nm) => px + ((Math.log10(nm) - lo) / (hi - lo)) * pw;
  g.fillStyle = 'rgba(120, 80, 200, 0.18)';
  g.fillRect(X(60), py, X(380) - X(60), ph);
  g.fillStyle = 'rgba(200, 60, 40, 0.14)';
  g.fillRect(X(780), py, X(3000) - X(780), ph);
  for (let nm = 380; nm < 780; nm += 2) {
    g.fillStyle = wavelengthCss(nm, 0.5);
    g.fillRect(X(nm), py, X(nm + 2) - X(nm) + 1, ph);
  }
  text(g, 'UV', X(150), py + 30, 20, COL.muted, 700, 'center');
  text(g, 'IR', X(1600), py + 30, 20, COL.muted, 700, 'center');
  const curve = (T, color, dash) => {
    let max = 0;
    const pts = [];
    for (let i = 0; i <= 240; i++) {
      const nm = 10 ** (lo + ((hi - lo) * i) / 240);
      const v = planck(nm, T);
      pts.push([nm, v]);
      if (v > max) max = v;
    }
    g.save();
    g.setLineDash(dash);
    g.strokeStyle = color;
    g.lineWidth = 4;
    g.beginPath();
    pts.forEach(([nm, v], i) => {
      const yy = py + ph - (v / max) * (ph - 16);
      if (i) g.lineTo(X(nm), yy);
      else g.moveTo(X(nm), yy);
    });
    g.stroke();
    g.restore();
  };
  curve(T0, COL.warm, [14, 10]);
  curve(T1, '#ffffff', []);
  const ly = y + h - 26;
  text(g, `- - Ruhe ${num(T0, 3)} K`, px, ly, 19, COL.warm, 600, 'left', MONO);
  text(g, `— vorn T′ = ${num(T1, 3)} K`, px + pw, ly, 19, '#ffffff', 600, 'right', MONO);
}

/** Render-Pipeline: Rechenschritte pro Stern mit den Werten des Sterns A. */
function drawPipeline(g, rs, gamma, star) {
  const x = LEFT.x;
  const y = BAND.y;
  const w = 2420 - x;
  const h = BAND.h;
  windowPanel(g, x, y, w, h, 'Render-Pipeline · Vertex-Shader, pro Stern und Bild', star ? 'Beispiel: Stern A' : 'Beispiel');
  const s = star ?? {
    psi: 60, psiSeen: deg(Math.acos((Math.cos(Math.PI / 3) + rs.beta) / (1 + rs.beta * Math.cos(Math.PI / 3)))),
    T: 5800, Tseen: apparentTemperature(5800, dopplerFactor(rs.beta, 0.5)), ratio: beamingPointSource(dopplerFactor(rs.beta, 0.5)), x: 0, y: 0,
  };
  const D = s.T / s.Tseen;
  const nodes = [
    ['Sternposition', 'Ruhesystem S', [`ψ = ${num(s.psi, 4)}°`, `T = ${num(s.T, 4)} K`]],
    ['Lorentz-Transformation', 'S → S′', [`β = ${num(rs.beta, 4)}`, `γ = ${num(gamma, 4)}`]],
    ['Aberration', '(cos ψ+β)/(1+β·cos ψ)', [`ψ′ = ${num(s.psiSeen, 4)}°`]],
    ['Doppler-Effekt', 'D = 1/(γ(1+β cos ψ))', [`D = ${num(D, 4)}`]],
    ['Wien-Verschiebung', 'T′ = T / D', [`T′ = ${num(s.Tseen, 4)} K`]],
    ['Planck → CIE 1931 → sRGB', '∫ B_λ(T′) x̄ȳz̄ dλ', null],
    ['Beaming', 'F′/F = D⁻²', [`× ${num(s.ratio, 4)}`]],
    ['Projektion → Pixel', rs.projection === 'stereographic' ? 'stereografisch' : 'zentral', [`(${Math.round(s.x)}, ${Math.round(s.y)})`]],
  ];
  const gap = 46;
  const nw = (w - 48 - gap * (nodes.length - 1)) / nodes.length;
  const ny = y + 80;
  const nh = h - 104;
  nodes.forEach(([title, formula, vals], i) => {
    const nx = x + 24 + i * (nw + gap);
    roundRect(g, nx, ny, nw, nh, 10);
    g.fillStyle = 'rgba(127, 178, 255, 0.07)';
    g.fill();
    g.strokeStyle = 'rgba(127, 178, 255, 0.35)';
    g.lineWidth = 1.5;
    g.stroke();
    text(g, String(i + 1).padStart(2, '0'), nx + 16, ny + 34, 20, COL.muted, 700, 'left', MONO);
    // Titel ggf. zweizeilig
    const words = title.replace(/-/g, '- ').split(' ').filter(Boolean);
    let line = '';
    let ty = ny + 70;
    for (const wd of words) {
      const test = line ? (line.endsWith('-') ? `${line}${wd}` : `${line} ${wd}`) : wd;
      if (measure(g, test, 23, 700) > nw - 28 && line) {
        text(g, line, nx + 16, ty, 23, COL.text, 700);
        line = wd;
        ty += 28;
      } else line = test;
    }
    text(g, line, nx + 16, ty, 23, COL.text, 700);
    g.save();
    g.beginPath();
    g.rect(nx + 4, ny, nw - 8, nh);
    g.clip();
    text(g, formula, nx + 16, ty + 34, 15, COL.muted, 500, 'left', MONO);
    g.restore();
    if (vals) {
      vals.forEach((v, k) => text(g, v, nx + 16, ny + nh - 22 - (vals.length - 1 - k) * 32, 22, COL.accent, 600, 'left', MONO));
    } else {
      swatch(g, nx + 16, ny + nh - 22, 30, tempCss(s.T));
      text(g, '→', nx + 62, ny + nh - 22, 22, COL.muted, 600, 'left', MONO);
      swatch(g, nx + 96, ny + nh - 22, 30, tempCss(s.Tseen));
    }
    if (i < nodes.length - 1) {
      const ax = nx + nw + 8;
      const ay = ny + nh / 2;
      g.strokeStyle = COL.accent;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(ax + gap - 16, ay);
      g.stroke();
      g.beginPath();
      g.moveTo(ax + gap - 16, ay - 8);
      g.lineTo(ax + gap - 6, ay);
      g.lineTo(ax + gap - 16, ay + 8);
      g.closePath();
      g.fillStyle = COL.accent;
      g.fill();
    }
  });
}

/** Ausschnitt aus dem echten Shader-Code (render.js) mit Syntaxfarben. */
function drawCode(g) {
  const x = 2456;
  const y = BAND.y;
  const w = POSTER_W - 36 - x;
  const h = BAND.h;
  windowPanel(g, x, y, w, h, 'render.js — Vertex-Shader (GLSL, GPU)', 'GLSL 3.0');
  const all = GLSL_PHYSICS.split('\n');
  const pick = [];
  all.forEach((l, i) => {
    if (/D = λ'\/λ = 1|cos ψ' = \(cos ψ \+ β\)/.test(l)) pick.push([i, l.replace(/^\/\/\s+/, '// ').replace(/\s{2,}\(.*$/, '')]);
  });
  const fnLines = (start) => {
    const out = [];
    let i = all.findIndex((l) => l.startsWith(start));
    while (i >= 0 && i < all.length) {
      out.push([i, all[i]]);
      if (all[i].startsWith('}')) break;
      i++;
    }
    return out;
  };
  const lines = [pick[0], ...fnLines('float dopplerFactor'), pick[1], ...fnLines('vec3 aberrateDirection')].filter(Boolean);
  const kw = /\b(float|vec3|return|uniform)\b/g;
  let yy = y + 96;
  for (const [i, l] of lines) {
    text(g, String(i + 1).padStart(3, ' '), x + 24, yy, 21, 'rgba(142, 152, 173, 0.6)', 500, 'left', MONO);
    let cx = x + 86;
    if (l.trim().startsWith('//')) {
      text(g, l, cx, yy, 21, '#7f9b78', 500, 'left', MONO);
    } else {
      // einfache Hervorhebung: Schlüsselwörter, Zahlen, Rest
      const parts = l.split(/(\b(?:float|vec3|return|uniform)\b|\b\d+\.\d+\b|\b(?:dopplerFactor|aberrateDirection)\b)/);
      for (const part of parts) {
        if (!part) continue;
        let col = COL.text;
        if (kw.test(part)) col = '#c792ea';
        else if (/^\d+\.\d+$/.test(part)) col = '#f78c6c';
        else if (/^(dopplerFactor|aberrateDirection)$/.test(part)) col = '#82aaff';
        kw.lastIndex = 0;
        cx += text(g, part, cx, yy, 21, col, 500, 'left', MONO);
      }
    }
    yy += 27;
  }
}

/** Statusleiste unten wie in einer Entwicklungsumgebung. */
function drawStatusBar(g, rs, info) {
  const y = POSTER_H - STATUS_H;
  g.fillStyle = 'rgba(10, 13, 22, 0.94)';
  g.fillRect(0, y, POSTER_W, STATUS_H);
  g.fillStyle = 'rgba(127, 178, 255, 0.28)';
  g.fillRect(0, y, POSTER_W, 2);
  const now = new Date();
  const items = [
    '● WebGL 2 · three.js',
    `Render ${MAIN_W} × ${MAIN_H}`,
    `${info.starCount.toLocaleString('de-DE')} Sterne einzeln berechnet`,
    'Formeln: physics.js · Shader: render.js',
    rs.spectrum === 'full' ? 'Gesamtspektrum (Falschfarben)' : 'sichtbares Licht',
    'Physikalische Grundlagen: Kapitel 3 der Seminararbeit',
    now.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }),
  ];
  let x = 36;
  for (const it of items) {
    x += text(g, it, x, y + 31, 20, it.startsWith('●') ? '#5be08a' : COL.muted, 500, 'left', MONO) + 46;
  }
}
