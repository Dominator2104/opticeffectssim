/*
 * Erstellt mit Claude Code (KI-Werkzeug) im Auftrag von Dominik Wittkow,
 * W-Seminar Physik, CSG Ingolstadt, 24.09.2026.
 *
 * stars.js — erzeugt das Sternenfeld im Ruhesystem S.
 *
 * Jeder Stern hat
 *   - eine Richtung n (Einheitsvektor vom Beobachter zum Stern, z = Flugrichtung),
 *   - eine Temperatur T in Kelvin (für die Doppler-Farbe),
 *   - eine Grundhelligkeit F (Bestrahlungsstärke relativ zu einem Stern der
 *     scheinbaren Helligkeit 0 mag, für das Beaming).
 *
 * Ein fester Zufallsstartwert macht das Bild reproduzierbar (Voraussetzung für
 * Abbildungen in der Seminararbeit).
 *
 * Keine Abhängigkeit zu three.js — die Datei ist reine Datenerzeugung.
 */

/** Fester Startwert des Zufallsgenerators. Nicht ändern, sonst ändern sich alle Abbildungen. */
export const STAR_SEED = 20261110;

/**
 * mulberry32: kleiner, schneller Pseudozufallsgenerator mit 32-Bit-Zustand.
 * Liefert bei gleichem Startwert immer dieselbe Zahlenfolge in [0, 1).
 */
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Richtung gleichmäßig nach Raumwinkel.
 *
 * Das Raumwinkelelement ist dΩ = sin ψ dψ dφ = d(cos ψ) dφ. Gleichverteilung
 * nach Raumwinkel heißt also: cos ψ gleichverteilt in [−1, 1] und φ
 * gleichverteilt in [0, 2π). (Gleichverteilung in ψ selbst würde die Sterne an
 * den Polen ψ = 0° und ψ = 180° häufen — das wäre falsch.)
 */
function randomDirection(rnd) {
  const cosPsi = 2 * rnd() - 1;
  const sinPsi = Math.sqrt(1 - cosPsi * cosPsi);
  const phi = 2 * Math.PI * rnd();
  return [sinPsi * Math.cos(phi), sinPsi * Math.sin(phi), cosPsi];
}

/**
 * Häufigkeit der Spektralklassen (Hauptreihensterne, nach Anzahl) mit
 * typischen Temperaturbereichen der Harvard-Klassifikation.
 * Häufigkeiten nach LeDrew 2001 ("The Real Starry Sky"), wie sie z. B. in
 * gängigen Übersichten zur Spektralklassifikation zitiert werden.
 * Vereinfachung: O-Sterne sind wegen der Obergrenze von 30 000 K in B
 * enthalten, M beginnt bei 2 500 K statt 2 400 K.
 *
 * Ergebnis: deutliches Übergewicht kühler Sterne (M + K ≈ 89 %).
 */
const SPECTRAL_CLASSES = [
  { name: 'M', fraction: 0.7645, tMin: 2500, tMax: 3700 },
  { name: 'K', fraction: 0.121, tMin: 3700, tMax: 5200 },
  { name: 'G', fraction: 0.076, tMin: 5200, tMax: 6000 },
  { name: 'F', fraction: 0.03, tMin: 6000, tMax: 7500 },
  { name: 'A', fraction: 0.006, tMin: 7500, tMax: 10000 },
  { name: 'B', fraction: 0.00133, tMin: 10000, tMax: 30000 },
];
const FRACTION_SUM = SPECTRAL_CLASSES.reduce((s, c) => s + c.fraction, 0);

/** Temperatur zufällig nach den Klassenhäufigkeiten, innerhalb der Klasse gleichverteilt. */
function randomTemperature(rnd) {
  let u = rnd() * FRACTION_SUM;
  for (const c of SPECTRAL_CLASSES) {
    if (u < c.fraction) return c.tMin + (c.tMax - c.tMin) * rnd();
    u -= c.fraction;
  }
  const last = SPECTRAL_CLASSES[SPECTRAL_CLASSES.length - 1];
  return last.tMin + (last.tMax - last.tMin) * rnd();
}

/** Bereich der scheinbaren Helligkeiten in mag (hellster bis schwächster Stern). */
export const MAG_BRIGHTEST = -1.0;
export const MAG_FAINTEST = 6.5;

/**
 * Scheinbare Helligkeit m nach einer einfachen Leuchtkraftverteilung:
 * Bei gleichmäßig im Raum verteilten Sternen gleicher Leuchtkraft wächst die
 * Anzahl der Sterne heller als m wie N(<m) ∝ 10^(0,6·m)
 * (Flussabnahme ∝ 1/r², Anzahl ∝ r³). Die Dichte ist daher ∝ 10^(0,6·m);
 * gezogen wird durch Umkehren der Verteilungsfunktion.
 */
function randomMagnitude(rnd) {
  const a = Math.pow(10, 0.6 * MAG_BRIGHTEST);
  const b = Math.pow(10, 0.6 * MAG_FAINTEST);
  return Math.log10(a + (b - a) * rnd()) / 0.6;
}

/**
 * Erzeugt count Sterne mit festem Startwert.
 * Die ersten k Sterne sind bei jeder Anzahl ≥ k dieselben, weil pro Stern
 * immer gleich viele Zufallszahlen verbraucht werden
 * (3 für die Richtung, 2 für die Temperatur, 1 für die Helligkeit).
 *
 * @returns {{count:number, directions:Float32Array, temperatures:Float32Array, fluxes:Float32Array}}
 */
export function generateStars(count, seed = STAR_SEED) {
  const rnd = mulberry32(seed);
  const directions = new Float32Array(count * 3);
  const temperatures = new Float32Array(count);
  const fluxes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const [x, y, z] = randomDirection(rnd);
    directions[3 * i] = x;
    directions[3 * i + 1] = y;
    directions[3 * i + 2] = z;
    temperatures[i] = randomTemperature(rnd);
    // Bestrahlungsstärke relativ zu 0 mag: F = 10^(−0,4·m) (Pogson)
    fluxes[i] = Math.pow(10, -0.4 * randomMagnitude(rnd));
  }
  return { count, directions, temperatures, fluxes };
}
