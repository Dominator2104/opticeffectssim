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
  deg,
} from './physics.js';
import { blackbodyColor, planck, createVisibleLuminanceLookup } from './blackbody.js';
import { CIE_1931_2DEG } from './cie1931.js';
import { viewMatrix } from './render.js';
import { formatNumber } from './ui.js';

export const POSTER_W = 3840;
export const POSTER_H = 2160;
/** Hauptbild und Vergleichsbild (Pixel), vom Renderer außerhalb des Bildschirms berechnet. */
export const MAIN_W = 2400;
export const MAIN_H = 1500;
export const REST_W = 640;
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
export function analyzeStars(rs, source, W, H) {
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

function panel(g, x, y, w, h) {
  roundRect(g, x, y, w, h, 18);
  g.fillStyle = 'rgba(14, 20, 36, 0.78)';
  g.fill();
  g.strokeStyle = 'rgba(127, 178, 255, 0.22)';
  g.lineWidth = 2;
  g.stroke();
}

function text(g, str, x, y, size, color = COL.text, weight = 400, align = 'left', font = FONT) {
  g.font = `${weight} ${size}px ${font}`;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = 'alphabetic';
  g.fillText(str, x, y);
  return g.measureText(str).width;
}

/** Text mit Zeilenumbruch; gibt die Höhe zurück. */
function wrap(g, str, x, y, maxW, size, color = COL.muted, lineH = 1.3) {
  g.font = `400 ${size}px ${FONT}`;
  g.fillStyle = color;
  g.textAlign = 'left';
  const words = str.split(' ');
  let line = '';
  let yy = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > maxW && line) {
      g.fillText(line, x, yy);
      line = w;
      yy += size * lineH;
    } else {
      line = test;
    }
  }
  if (line) g.fillText(line, x, yy);
  return yy - y + size * lineH;
}

function swatch(g, x, y, size, css) {
  g.beginPath();
  g.arc(x + size / 2, y - size / 2 + 4, size / 2, 0, 2 * Math.PI);
  g.fillStyle = css;
  g.shadowColor = css;
  g.shadowBlur = 18;
  g.fill();
  g.shadowBlur = 0;
}

/* ------------------------------------------------------------------------- */
/* Poster                                                                    */
/* ------------------------------------------------------------------------- */

/**
 * @param {object} p
 * @param {HTMLCanvasElement} p.mainImg  Hauptbild MAIN_W × MAIN_H
 * @param {HTMLCanvasElement} p.restImg  Vergleichsbild in Ruhe REST_W × REST_H
 * @param {object} p.rs        Zustand für den Renderer
 * @param {Array} p.callouts   pickCallouts(...)
 * @param {object} p.info      { starCount, mode3d, distanceLy, tauYears }
 * @returns {Promise<Blob>}
 */
export async function composeShowcase({ mainImg, restImg, rs, callouts, info }) {
  const cv = document.createElement('canvas');
  cv.width = POSTER_W;
  cv.height = POSTER_H;
  const g = cv.getContext('2d');
  const beta = rs.beta;
  const gamma = lorentzGamma(beta);

  // Hintergrund
  const bg = g.createRadialGradient(POSTER_W * 0.35, POSTER_H * 0.45, 200, POSTER_W * 0.5, POSTER_H * 0.5, POSTER_W * 0.75);
  bg.addColorStop(0, COL.bg1);
  bg.addColorStop(1, COL.bg0);
  g.fillStyle = bg;
  g.fillRect(0, 0, POSTER_W, POSTER_H);

  const PAD = 70;
  // Kopfzeile
  const pct = num(beta * 100, beta >= 0.995 ? 4 : 3);
  text(g, beta > 0 ? `Mit ${pct} % der Lichtgeschwindigkeit durch die Sterne` : 'Der Sternenhimmel in Ruhe', PAD, 135, 86, COL.text, 700);
  text(g, 'Jeder einzelne Stern berechnet: Richtung, Farbe und Helligkeit nach Einsteins Spezieller Relativitätstheorie', PAD, 192, 36, COL.muted);

  // Hauptbild
  const mx = PAD;
  const my = 230;
  g.save();
  roundRect(g, mx, my, MAIN_W, MAIN_H, 22);
  g.clip();
  g.drawImage(mainImg, mx, my);
  drawConeRing(g, rs, mx, my);
  drawHud(g, rs, mx, my, gamma, info);
  // Vergleichsbild in Ruhe (Bild im Bild)
  const rx = mx + MAIN_W - REST_W - 36;
  const ry = my + MAIN_H - REST_H - 36;
  g.drawImage(restImg, rx, ry);
  roundRect(g, rx, ry, REST_W, REST_H, 12);
  g.strokeStyle = COL.border;
  g.lineWidth = 3;
  g.stroke();
  g.fillStyle = COL.box;
  g.fillRect(rx, ry, REST_W, 54);
  text(g, 'Derselbe Blick in Ruhe (β = 0)', rx + 18, ry + 37, 28, COL.text, 600);
  g.restore();
  roundRect(g, mx, my, MAIN_W, MAIN_H, 22);
  g.strokeStyle = COL.border;
  g.lineWidth = 3;
  g.stroke();
  drawCallouts(g, callouts, mx, my, info.mode3d, { x: rx, y: ry });

  // Faktenkarten rechts
  const cx = mx + MAIN_W + 60;
  const cw = POSTER_W - cx - PAD;
  drawFacts(g, cx, my, cw, MAIN_H, rs, gamma, info);

  // untere Leiste: Spektrum, γ-Kurve, Formeln
  const by = my + MAIN_H + 40;
  const bh = 300;
  drawSpectrum(g, mx, by, 1560, bh, rs);
  drawGammaCurve(g, mx + 1600, by, MAIN_W - 1600, bh, beta, gamma);
  drawFormulas(g, cx, by, cw, bh, beta, gamma);

  // Fußzeile
  text(g, 'Optische Effekte bei Bewegung nahe der Lichtgeschwindigkeit · Physikalische Grundlagen: Kapitel 3 der Seminararbeit · Alle Bildinhalte sind berechnet, nicht gemalt.', PAD, POSTER_H - 34, 26, COL.muted);

  return new Promise((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG fehlgeschlagen'))), 'image/png'));
}

/** Kreis, in den die ganze vordere Himmelshälfte zusammengedrängt ist (ψ' = arccos β). */
function drawConeRing(g, rs, ox, oy) {
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
  g.strokeStyle = 'rgba(255, 179, 107, 0.85)';
  g.lineWidth = 4;
  g.beginPath();
  let pen = false;
  for (const p of pts) {
    if (!p) {
      pen = false;
      continue;
    }
    if (pen) g.lineTo(ox + p[0], oy + p[1]);
    else g.moveTo(ox + p[0], oy + p[1]);
    pen = true;
  }
  g.stroke();
  g.setLineDash([]);
  // Beschriftung oben in der Bildmitte, gestrichelte Linie zum obersten Punkt des Kreises
  const top = onScreen.reduce((a2, b2) => (b2[1] < a2[1] ? b2 : a2));
  const label = 'In diesem Kreis: alles, was vor dir liegt – die halbe Himmelskugel';
  g.font = `600 30px ${FONT}`;
  const w = g.measureText(label).width + 36;
  const lx = Math.min(Math.max(ox + top[0] - w / 2, ox + 20), ox + MAIN_W - w - 20);
  const ly = oy + 100;
  if (oy + top[1] > ly + 60) {
    g.setLineDash([8, 10]);
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(ox + top[0], ly + 50);
    g.lineTo(ox + top[0], oy + top[1] - 6);
    g.stroke();
    g.setLineDash([]);
  }
  roundRect(g, lx, ly, w, 50, 10);
  g.fillStyle = COL.box;
  g.fill();
  g.strokeStyle = 'rgba(255, 179, 107, 0.7)';
  g.lineWidth = 2;
  g.stroke();
  text(g, label, lx + 18, ly + 35, 30, COL.warm, 600);
  g.restore();
}

/** Messwerte in den Ecken des Hauptbilds. */
function drawHud(g, rs, ox, oy, gamma, info) {
  const tag = (str, x, y, align) => {
    g.font = `500 30px ${MONO}`;
    const w = g.measureText(str).width + 32;
    const bx = align === 'right' ? x - w : x;
    roundRect(g, bx, y, w, 50, 10);
    g.fillStyle = COL.box;
    g.fill();
    g.strokeStyle = COL.border;
    g.lineWidth = 2;
    g.stroke();
    text(g, str, bx + 16, y + 35, 30, COL.accent, 500, 'left', MONO);
  };
  tag(`β = ${num(rs.beta, 4)}   γ = ${num(gamma, 4)}`, ox + 30, oy + 30, 'left');
  const proj = rs.projection === 'stereographic' ? 'stereografisch' : 'Perspektive';
  tag(`Sichtfeld ${num(rs.fovDeg, 3)}° · ${proj}`, ox + MAIN_W - 30, oy + 30, 'right');
  const mode = info.mode3d
    ? `3D-Flug · ${num(info.distanceLy, 3)} Lj geflogen`
    : `${info.starCount.toLocaleString('de-DE')} Sterne`;
  tag(`${mode} · ${rs.spectrum === 'full' ? 'gesamtes Spektrum' : 'sichtbares Licht'}`, ox + 30, oy + MAIN_H - 80, 'left');
}

/** Markierungen an einzelnen Sternen mit Beschriftung. */
function drawCallouts(g, callouts, ox, oy, mode3d, avoid) {
  const used = { left: [], right: [] };
  for (const c of callouts) {
    const sx = ox + c.x;
    const sy = oy + c.y;
    const side = c.x < MAIN_W / 2 ? 'left' : 'right';
    const lines = [];
    lines.push({ kind: 'temps' });
    const ratioText = c.ratio >= 1
      ? `Licht ${num(c.ratio, 3)}-mal stärker als in Ruhe`
      : `Licht ${num(1 / c.ratio, 3)}-mal schwächer als in Ruhe`;
    lines.push({ kind: 'text', str: ratioText });
    lines.push({ kind: 'text', str: `Wahre Richtung ${num(c.psi, 3)}° → gesehen bei ${num(c.psiSeen, 3)}°` });
    if (c.title === 'Steht eigentlich hinter dir') lines.push({ kind: 'text', str: 'also eigentlich hinter der Querachse des Schiffs' });
    if (mode3d && c.dist) lines.push({ kind: 'text', str: `${num(c.dist, 3)} Lichtjahre entfernt` });
    const boxH = 70 + lines.length * 44;
    // Breite nach dem längsten Text
    g.font = `400 27px ${FONT}`;
    const tempsW = g.measureText(`eigentlich  ${num(c.T, 3)} K  → erscheint  ${num(c.Tseen, 3)} K`).width + 100;
    const textW = Math.max(tempsW, ...lines.filter((l) => l.kind === 'text').map((l) => g.measureText(l.str).width));
    g.font = `700 34px ${FONT}`;
    const boxW = Math.max(textW, g.measureText(c.title).width) + 56;
    const bx = side === 'left' ? ox + 40 : ox + MAIN_W - 40 - boxW;
    // Abstand zur Kreis-Beschriftung oben (bis oy + 170) und zur Fußleiste
    let by = Math.min(Math.max(sy - boxH / 2, oy + 180), oy + MAIN_H - boxH - 110);
    // nicht überlappen
    for (const u of used[side]) {
      if (by < u.y + u.h + 20 && by + boxH + 20 > u.y) by = u.y + u.h + 24;
    }
    if (side === 'right' && by + boxH > avoid.y - 20 && bx + boxW > avoid.x) by = Math.max(oy + 180, avoid.y - boxH - 30);
    used[side].push({ y: by, h: boxH });

    // Ring um den Stern und Verbindungslinie
    g.save();
    g.strokeStyle = COL.line;
    g.lineWidth = 3;
    g.shadowColor = COL.accent;
    g.shadowBlur = 12;
    g.beginPath();
    g.arc(sx, sy, 30, 0, 2 * Math.PI);
    g.stroke();
    const ax = side === 'left' ? bx + boxW : bx;
    const ay = by + boxH / 2;
    const dx = ax - sx;
    const dy = ay - sy;
    const len = Math.hypot(dx, dy) || 1;
    g.beginPath();
    g.moveTo(sx + (dx / len) * 32, sy + (dy / len) * 32);
    g.lineTo(ax, ay);
    g.stroke();
    g.restore();

    roundRect(g, bx, by, boxW, boxH, 14);
    g.fillStyle = COL.box;
    g.fill();
    g.strokeStyle = COL.border;
    g.lineWidth = 2;
    g.stroke();
    text(g, c.title, bx + 24, by + 50, 34, COL.text, 700);
    let ly = by + 50 + 46;
    for (const l of lines) {
      if (l.kind === 'temps') {
        let x = bx + 24;
        x += text(g, 'eigentlich ', x, ly, 27, COL.muted) + 4;
        swatch(g, x, ly, 24, tempCss(c.T));
        x += 34;
        x += text(g, `${num(c.T, 3)} K`, x, ly, 27, COL.text, 600) + 18;
        x += text(g, '→ erscheint ', x, ly, 27, COL.muted) + 4;
        swatch(g, x, ly, 24, tempCss(c.Tseen));
        x += 34;
        text(g, `${num(c.Tseen, 3)} K`, x, ly, 27, COL.text, 600);
      } else {
        text(g, l.str, bx + 24, ly, 27, COL.muted);
      }
      ly += 44;
    }
  }
}

/** Faktenkarten mit großen Zahlen in Alltagssprache. */
function drawFacts(g, x, y, w, h, rs, gamma, info) {
  const beta = rs.beta;
  const Df = dopplerFactorForward(beta);
  const Db = dopplerFactorBackward(beta);
  const vKmS = (beta * C) / 1000;
  const laps = vKmS / 40075;
  const cone = 2 * deg(psiPrimeOfSideStar(beta));
  const frac = forwardConeSkyFraction(beta) * 100;
  const Tsun = apparentTemperature(5800, Df);
  const perSecond = info.starCount * 60;
  const cards = [
    {
      big: `${num(vKmS, 4)} km/s`,
      title: 'Geschwindigkeit',
      body: `${num(beta * 100, 4)} % der Lichtgeschwindigkeit – in einer Sekunde ${num(laps, 3)}-mal um die Erde.`,
    },
    {
      big: `× ${num(gamma, 3)}`,
      title: 'Zeit vergeht langsamer',
      body: `1 Jahr an Bord sind ${num(gamma, 3)} Jahre auf der Erde (Zeitdilatation).`,
    },
    {
      big: `${num(cone, 3)}°`,
      title: 'Der Himmel schrumpft nach vorn',
      body: `Die halbe Himmelskugel – alles vor dir – drängt sich in einen Kreis von ${num(cone, 3)}° Durchmesser, ${num(frac, 3)} % des Himmels.`,
    },
    {
      big: `${num(Tsun, 3)} K`,
      title: 'Farben verschieben sich',
      body: 'Ein Stern wie die Sonne (5 800 K, gelblich-weiß) leuchtet von vorn so heiß wie ein blauer Riese.',
      swatches: [5800, Tsun],
    },
    {
      big: `× ${num(beamingPointSource(Df), 3)}`,
      title: 'Licht von vorn wird stärker',
      body: `So viel mehr Strahlung kommt von vorn an. Von hinten nur noch 1/${num(1 / beamingPointSource(Db), 3)} – die Sterne dort verblassen.`,
    },
    {
      big: perSecond >= 1e6 ? `${num(perSecond / 1e6, 3)} Mio./s` : `${num(perSecond, 3)}/s`,
      title: 'Sterne einzeln berechnet',
      body: `${info.starCount.toLocaleString('de-DE')} Sterne, für jeden 60-mal pro Sekunde: Richtung (Aberration), Farbe (Doppler, Planck-Spektrum) und Helligkeit (Beaming).`,
    },
  ];
  const gap = 24;
  const ch = (h - gap * (cards.length - 1)) / cards.length;
  cards.forEach((c, i) => {
    const cy = y + i * (ch + gap);
    panel(g, x, cy, w, ch);
    text(g, c.title.toUpperCase(), x + 34, cy + 52, 26, COL.muted, 600);
    let bw = text(g, c.big, x + 34, cy + 128, 70, i % 2 ? COL.warm : COL.accent, 700);
    if (c.swatches) {
      let sx = x + 34 + bw + 30;
      for (const T of c.swatches) {
        swatch(g, sx, cy + 118, 40, tempCss(T));
        sx += 56;
      }
    }
    wrap(g, c.body, x + 34, cy + 172, w - 68, 26);
  });
}

/** Spektrum des Sonnenlichts in Ruhe und von vorn gesehen. */
function drawSpectrum(g, x, y, w, h, rs) {
  panel(g, x, y, w, h);
  const D = dopplerFactorForward(rs.beta);
  const T0 = 5800;
  const T1 = apparentTemperature(T0, D);
  const shiftWord = T1 > T0 * 1.05 ? 'rutscht ins Ultraviolette' : T1 < T0 * 0.95 ? 'rutscht ins Infrarote' : 'bleibt fast gleich';
  text(g, `Sonnenlicht von vorn: das Spektrum ${shiftWord}`, x + 30, y + 52, 32, COL.text, 600);
  const px = x + 30;
  const pw = w - 60;
  const py = y + 80;
  const ph = h - 140;
  const lo = Math.log10(60);
  const hi = Math.log10(3000);
  const X = (nm) => px + ((Math.log10(nm) - lo) / (hi - lo)) * pw;
  // Bereiche
  g.fillStyle = 'rgba(120, 80, 200, 0.18)';
  g.fillRect(X(60), py, X(380) - X(60), ph);
  g.fillStyle = 'rgba(200, 60, 40, 0.14)';
  g.fillRect(X(780), py, X(3000) - X(780), ph);
  for (let nm = 380; nm < 780; nm += 2) {
    g.fillStyle = wavelengthCss(nm, 0.55);
    g.fillRect(X(nm), py, X(nm + 2) - X(nm) + 1, ph);
  }
  text(g, 'UV', X(130), py + ph - 14, 26, COL.muted, 600, 'center');
  text(g, 'sichtbar', X(540), py + ph - 14, 26, '#0b0f18', 700, 'center');
  text(g, 'Infrarot', X(1550), py + ph - 14, 26, COL.muted, 600, 'center');
  // Kurven (je auf ihr Maximum normiert)
  const curve = (T, color, dash) => {
    let max = 0;
    const pts = [];
    for (let i = 0; i <= 300; i++) {
      const nm = 10 ** (lo + ((hi - lo) * i) / 300);
      const v = planck(nm, T);
      pts.push([nm, v]);
      if (v > max) max = v;
    }
    g.save();
    g.setLineDash(dash);
    g.strokeStyle = color;
    g.lineWidth = 5;
    g.beginPath();
    pts.forEach(([nm, v], i) => {
      const yy = py + ph - (v / max) * (ph - 20);
      if (i) g.lineTo(X(nm), yy);
      else g.moveTo(X(nm), yy);
    });
    g.stroke();
    g.restore();
  };
  curve(T0, COL.warm, [16, 12]);
  curve(T1, '#ffffff', []);
  // Legende
  const ly = y + h - 22;
  g.strokeStyle = COL.warm;
  g.lineWidth = 5;
  g.setLineDash([16, 12]);
  g.beginPath();
  g.moveTo(px, ly - 9);
  g.lineTo(px + 60, ly - 9);
  g.stroke();
  g.setLineDash([]);
  let lx = px + 74 + text(g, `in Ruhe (${num(T0, 3)} K)`, px + 74, ly, 24, COL.muted) + 40;
  g.strokeStyle = '#ffffff';
  g.beginPath();
  g.moveTo(lx, ly - 9);
  g.lineTo(lx + 60, ly - 9);
  g.stroke();
  text(g, `von vorn gesehen (${num(T1, 3)} K)`, lx + 74, ly, 24, COL.muted);
}

/** γ über β mit Marker. */
function drawGammaCurve(g, x, y, w, h, beta, gamma) {
  panel(g, x, y, w, h);
  text(g, 'Zeitdehnung γ', x + 30, y + 52, 32, COL.text, 600);
  const px = x + 70;
  const pw = w - 110;
  const py = y + 80;
  const ph = h - 130;
  const yMax = 25;
  const X = (b) => px + b * pw;
  const Yc = (v) => py + ph - (Math.min(v, yMax) / yMax) * ph;
  g.strokeStyle = 'rgba(142, 152, 173, 0.3)';
  g.lineWidth = 1;
  for (const v of [1, 10, 20]) {
    g.beginPath();
    g.moveTo(px, Yc(v));
    g.lineTo(px + pw, Yc(v));
    g.stroke();
    text(g, String(v), px - 12, Yc(v) + 8, 22, COL.muted, 400, 'right');
  }
  text(g, '0', X(0), py + ph + 32, 22, COL.muted, 400, 'center');
  text(g, 'β → 1', X(1), py + ph + 32, 22, COL.muted, 400, 'right');
  g.strokeStyle = COL.accent;
  g.lineWidth = 5;
  g.beginPath();
  for (let i = 0; i <= 300; i++) {
    const b = 0.999 * (1 - (1 - i / 300) ** 3);
    const v = lorentzGamma(b);
    if (i) g.lineTo(X(b), Yc(v));
    else g.moveTo(X(b), Yc(v));
  }
  g.stroke();
  const bx = X(beta);
  const by = Yc(gamma);
  g.fillStyle = COL.warm;
  g.beginPath();
  g.arc(bx, by, 12, 0, 2 * Math.PI);
  g.fill();
  text(g, `jetzt: γ = ${num(gamma, 3)}`, Math.min(bx - 20, x + w - 30), Math.max(by - 22, py + 26), 26, COL.warm, 600, 'right');
}

/** Die Formeln dahinter (echt, aus physics.js). */
function drawFormulas(g, x, y, w, h, beta, gamma) {
  panel(g, x, y, w, h);
  text(g, 'Die Formeln dahinter', x + 30, y + 52, 32, COL.text, 600);
  const lines = [
    `γ = 1/√(1 − β²) = ${num(gamma, 4)}`,
    'cos ψ′ = (cos ψ + β) / (1 + β·cos ψ)',
    'D = λ′/λ = 1 / (γ·(1 + β·cos ψ))',
    'T′ = T/D    F′/F = D⁻²    L′/L = D⁻⁴',
  ];
  lines.forEach((l, i) => text(g, l, x + 30, y + 108 + i * 46, 28, i === 0 ? COL.accent : COL.text, 500, 'left', MONO));
}
