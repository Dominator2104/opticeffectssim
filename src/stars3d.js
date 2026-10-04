/*
 * Erstellt mit Claude Code (KI-Werkzeug) im Auftrag von Dominik Wittkow,
 * W-Seminar Physik, CSG Ingolstadt, 24.09.2026.
 *
 * stars3d.js — Sternfeld mit echten 3D-Positionen (3D-Modus).
 *
 * Der Raum ist in würfelförmige Zellen der Kantenlänge L (in Lichtjahren)
 * eingeteilt. Jede Zelle (i, j, k) erzeugt ihre Sterne mit einem eigenen
 * Zufallsstartwert, der aus den Zellkoordinaten berechnet wird. Dadurch ist
 * das Sternfeld unendlich groß, wiederholt sich nie und ist trotzdem
 * reproduzierbar (dieselbe Zelle hat immer dieselben Sterne).
 *
 * Die Sterne ruhen im System S. Gespeichert wird für jeden Stern:
 *   - die Position innerhalb seiner Zelle (0 … L in x, y, z),
 *   - die Temperatur T (für die Doppler-Farbe),
 *   - 10^(−0,4·M) mit der absoluten Helligkeit M (Bestrahlungsstärke in 10 pc
 *     Entfernung relativ zu 0 mag; physics.fluxFromAbsoluteMagnitude).
 *
 * Keine Abhängigkeit zu three.js.
 */
import { mulberry32, randomTemperature, STAR_SEED } from './stars.js';

/**
 * Sterndichte der Sonnenumgebung, Richtwert: etwa 0,14 Sterne pro pc³,
 * also 0,14 / 3,26156³ ≈ 0,004 Sterne pro Lichtjahr³.
 */
export const REAL_DENSITY_PER_LY3 = 0.004;

/**
 * Absolute Helligkeit M_V von Hauptreihensternen in Abhängigkeit von der
 * Temperatur — gerundete Richtwerte nach der Hauptreihentabelle von
 * Pecaut & Mamajek (2013). Zwischen den Stützstellen wird linear in log T
 * interpoliert. Spalten: [T in K, M_V in mag]
 */
const MAIN_SEQUENCE = [
  [2500, 18.0], // spätes M
  [2650, 16.5],
  [3060, 12.3], // M5
  [3400, 10.9],
  [3850, 8.9], //  M0
  [4440, 7.4], //  K5
  [5270, 5.9], //  K0
  [5770, 4.8], //  G2 (Sonne)
  [5920, 4.3], //  G0
  [7220, 2.5], //  F0
  [9700, 1.1], //  A0
  [15700, -1.2], // B5
  [31500, -3.9], // B0
];

export function mainSequenceAbsMag(T) {
  const t = Math.log10(T);
  if (T <= MAIN_SEQUENCE[0][0]) return MAIN_SEQUENCE[0][1];
  for (let i = 1; i < MAIN_SEQUENCE.length; i++) {
    const [T1, M1] = MAIN_SEQUENCE[i];
    if (T <= T1) {
      const [T0, M0] = MAIN_SEQUENCE[i - 1];
      const f = (t - Math.log10(T0)) / (Math.log10(T1) - Math.log10(T0));
      return M0 + f * (M1 - M0);
    }
  }
  return MAIN_SEQUENCE[MAIN_SEQUENCE.length - 1][1];
}

/**
 * Vereinfachung: 1 % der Sterne sind Rote Riesen (3 600–5 000 K, M_V zwischen
 * −1 und +1,5). Sie sind selten, aber hell und deshalb am Himmel auffällig.
 */
export const GIANT_FRACTION = 0.01;

/** Streuung der Hauptreihe um die Richtwerte in mag. */
const MS_SCATTER = 0.3;

/**
 * Zufallsstartwert einer Zelle aus ihren ganzzahligen Koordinaten
 * (einfache Hash-Funktion; jede Zelle bekommt eine andere Zahlenfolge).
 */
export function cellSeed(i, j, k, seed = STAR_SEED) {
  let h = seed >>> 0;
  for (const v of [i, j, k]) {
    h = Math.imul(h ^ (v | 0), 0x9e3779b1) >>> 0;
    h = (h ^ (h >>> 15)) >>> 0;
    h = Math.imul(h, 0x85ebca77) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
  }
  return h;
}

/** Normalverteilte Zufallszahl (Box-Muller). */
function gauss(rnd) {
  const u = Math.max(rnd(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}

/**
 * Erzeugt die Sterne der Zelle (i, j, k).
 * Anzahl: Erwartungswert ρ·L³ mit zufälliger Schwankung ±√(ρ·L³) (Poisson,
 * genähert durch eine Normalverteilung). Positionen gleichverteilt in der Zelle.
 *
 * @param {number} sizeLy   Kantenlänge L der Zelle in Lichtjahren
 * @param {number} density  Sterne pro Lichtjahr³
 */
export function generateCell(i, j, k, sizeLy, density, seed = STAR_SEED) {
  const rnd = mulberry32(cellSeed(i, j, k, seed));
  const mean = density * sizeLy ** 3;
  const count = Math.max(0, Math.round(mean + Math.sqrt(mean) * gauss(rnd)));
  const positions = new Float32Array(count * 3);
  const temperatures = new Float32Array(count);
  const absFluxes = new Float32Array(count);
  for (let n = 0; n < count; n++) {
    positions[3 * n] = rnd() * sizeLy;
    positions[3 * n + 1] = rnd() * sizeLy;
    positions[3 * n + 2] = rnd() * sizeLy;
    let T;
    let M;
    if (rnd() < GIANT_FRACTION) {
      T = 3600 + 1400 * rnd();
      M = -1 + 2.5 * rnd();
    } else {
      T = randomTemperature(rnd);
      M = mainSequenceAbsMag(T) + MS_SCATTER * gauss(rnd);
    }
    temperatures[n] = T;
    absFluxes[n] = Math.pow(10, -0.4 * M);
  }
  return { i, j, k, count, positions, temperatures, absFluxes };
}

/** Index der Zelle, in der die Koordinate x (in Lj) liegt. */
export function cellIndex(x, sizeLy) {
  return Math.floor(x / sizeLy);
}

/**
 * Alle Zellen im Würfel (2R+1)³ um die Zelle des Beobachters.
 * R = 1 heißt: 27 Zellen, Sichtweite mindestens L in jede Richtung.
 */
export function neededCells(observer, sizeLy, radius = 1) {
  const [ci, cj, ck] = observer.map((v) => cellIndex(v, sizeLy));
  const cells = [];
  for (let di = -radius; di <= radius; di++) {
    for (let dj = -radius; dj <= radius; dj++) {
      for (let dk = -radius; dk <= radius; dk++) cells.push([ci + di, cj + dj, ck + dk]);
    }
  }
  return cells;
}
