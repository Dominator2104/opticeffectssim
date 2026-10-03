/*
 * Erstellt mit Claude Code (KI-Werkzeug) im Auftrag von Dominik Wittkow,
 * W-Seminar Physik, CSG Ingolstadt, 24.09.2026.
 *
 * blackbody.js — Farbe und sichtbare Helligkeit eines Schwarzkörpers:
 *   Planck-Spektrum → CIE-1931-XYZ → lineares sRGB → Nachschlagetabelle.
 *
 * Keine Abhängigkeit zu three.js; die Tabelle wird in render.js als Textur
 * hochgeladen. Getestet in tests/blackbody.test.js.
 *
 * Ehrlicher Hinweis: Bei großem β verschiebt sich sichtbares Licht ins UV und
 * Infrarotes ins Sichtbare. Die Simulation zeigt die Farbe des verschobenen
 * Schwarzkörpers (T' = T/D). Das ist korrekt, solange man das Spektrum des
 * Sterns als vollständiges Planck-Spektrum annimmt.
 */
import { CIE_1931_2DEG, CIE_STEP_NM } from './cie1931.js';

/* Naturkonstanten (SI, exakt seit 2019) */
const H = 6.62607015e-34; // Planck-Konstante in J·s
const C = 299792458; // Lichtgeschwindigkeit in m/s
const K_B = 1.380649e-23; // Boltzmann-Konstante in J/K

/** Grenzen des sichtbaren Bereichs in nm (wie im Auftrag). */
export const VISIBLE_MIN_NM = 380;
export const VISIBLE_MAX_NM = 780;

/**
 * Temperaturbereich der Nachschlagetabelle, logarithmisch gestuft.
 * Auf Wunsch des Auftraggebers erweitert (statt 1 000–40 000 K), weil T' = T/D
 * bei β = 0,999 bis etwa 1,3·10⁶ K (vorn) bzw. unter 100 K (hinten) reicht.
 * Außerhalb der Tabelle: Farbe vom Rand; die sichtbare Helligkeit wird oberhalb
 * nach Rayleigh-Jeans (Y ∝ T) fortgesetzt, unterhalb ist sie praktisch null.
 */
export const TABLE_T_MIN = 500;
export const TABLE_T_MAX = 1.0e6;
export const TABLE_SIZE = 1024;

/**
 * Plancksches Strahlungsgesetz, spektrale Strahldichte pro Wellenlänge:
 *
 *   B_λ(λ, T) = (2hc² / λ⁵) · 1 / (exp(hc / (λ k T)) − 1)
 *
 * @param {number} lambdaNm Wellenlänge in nm
 * @param {number} T        Temperatur in K
 * @returns {number} B_λ in W / (m² · sr · m)
 */
export function planck(lambdaNm, T) {
  const lambda = lambdaNm * 1e-9;
  const x = (H * C) / (lambda * K_B * T);
  // expm1 statt exp(x) − 1: genauer bei sehr hohen Temperaturen (x ≪ 1)
  return (2 * H * C * C) / Math.pow(lambda, 5) / Math.expm1(x);
}

/**
 * Normfarbwerte X, Y, Z eines Schwarzkörpers:
 *
 *   X = ∫ B_λ(λ, T) · x̄(λ) dλ   (entsprechend Y mit ȳ, Z mit z̄)
 *
 * über 380–780 nm, als Summe in 5-nm-Schritten (Rechteckregel, wie in der
 * CIE-Praxis üblich). Absolute Einheit ist unwichtig, es zählen nur
 * Verhältnisse. Y ist die sichtbare Helligkeit (Leuchtdichte bis auf den
 * konstanten Faktor 683 lm/W).
 */
export function blackbodyXYZ(T) {
  let X = 0;
  let Y = 0;
  let Z = 0;
  for (const [nm, xb, yb, zb] of CIE_1931_2DEG) {
    const b = planck(nm, T);
    X += b * xb;
    Y += b * yb;
    Z += b * zb;
  }
  const dl = CIE_STEP_NM * 1e-9;
  return { X: X * dl, Y: Y * dl, Z: Z * dl };
}

/** Normfarbwertanteile x = X/(X+Y+Z), y = Y/(X+Y+Z). */
export function chromaticity({ X, Y, Z }) {
  const s = X + Y + Z;
  return { x: X / s, y: Y / s };
}

/**
 * XYZ → lineares sRGB (Primärvalenzen nach ITU-R BT.709, Weißpunkt D65).
 * Matrix nach IEC 61966-2-1.
 */
export function xyzToLinearSrgb({ X, Y, Z }) {
  return {
    r: 3.2406 * X - 1.5372 * Y - 0.4986 * Z,
    g: -0.9689 * X + 1.8758 * Y + 0.0415 * Z,
    b: 0.0557 * X - 0.204 * Y + 1.057 * Z,
  };
}

/** Relative Leuchtdichte einer linearen sRGB-Farbe (Zeile Y der Rückmatrix). */
export function srgbLuminance({ r, g, b }) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Farbe eines Schwarzkörpers als lineares sRGB, nur der Farbton:
 *   1. XYZ berechnen, nach sRGB umrechnen.
 *   2. Negative Anteile auf 0 setzen. (Sehr kühle Schwarzkörper liegen
 *      außerhalb des sRGB-Farbraums; der Blauanteil wäre negativ.)
 *   3. So skalieren, dass der größte Kanal 1 ist.
 * Die Helligkeit wird davon getrennt behandelt: Der Shader gleicht über die
 * Punktgröße aus, dass z. B. Rot bei gleichem Kanalwert dunkler wirkt als
 * Weiß, sodass alle Farben bei gleicher Bestrahlungsstärke gleich hell sind.
 */
export function blackbodyColor(T) {
  const rgb = xyzToLinearSrgb(blackbodyXYZ(T));
  const r = Math.max(0, rgb.r);
  const g = Math.max(0, rgb.g);
  const b = Math.max(0, rgb.b);
  const m = Math.max(r, g, b);
  return { r: r / m, g: g / m, b: b / m };
}

/** Sichtbare Helligkeit Y(T) = ∫ B_λ ȳ dλ (willkürliche, aber feste Einheit). */
export function visibleLuminance(T) {
  return blackbodyXYZ(T).Y;
}

/** Temperatur des Tabelleneintrags i (logarithmisch gestuft). */
export function tableTemperature(i, size = TABLE_SIZE) {
  const lo = Math.log10(TABLE_T_MIN);
  const hi = Math.log10(TABLE_T_MAX);
  return Math.pow(10, lo + ((hi - lo) * i) / (size - 1));
}

/**
 * Nachschlagetabelle T → (R, G, B, log10 Y), einmal beim Start berechnet.
 * RGB: Farbton nach blackbodyColor(), A: log10 der sichtbaren Helligkeit Y(T)
 * (logarithmisch, weil Y über viele Zehnerpotenzen reicht).
 * @returns {Float32Array} Länge 4·size
 */
export function buildBlackbodyTable(size = TABLE_SIZE) {
  const data = new Float32Array(4 * size);
  for (let i = 0; i < size; i++) {
    const T = tableTemperature(i, size);
    const c = blackbodyColor(T);
    data[4 * i] = c.r;
    data[4 * i + 1] = c.g;
    data[4 * i + 2] = c.b;
    data[4 * i + 3] = Math.log10(visibleLuminance(T));
  }
  return data;
}

/**
 * Schnelle Näherung von Y(T) für viele Auswertungen (Übersicht): lineare
 * Interpolation von log10 Y in log10 T auf der Tabelle von buildBlackbodyTable.
 * Oberhalb der Tabelle Rayleigh-Jeans (Y ∝ T), unterhalb Fortsetzung mit der
 * Steigung am Tabellenanfang (dort ist Y ohnehin praktisch null).
 * @returns {(T:number)=>number}
 */
export function createVisibleLuminanceLookup(size = TABLE_SIZE) {
  const table = buildBlackbodyTable(size);
  const logY = new Float64Array(size);
  for (let i = 0; i < size; i++) logY[i] = table[4 * i + 3];
  const lo = Math.log10(TABLE_T_MIN);
  const hi = Math.log10(TABLE_T_MAX);
  const step = (hi - lo) / (size - 1);
  return (T) => {
    const x = (Math.log10(T) - lo) / step;
    if (x >= size - 1) return Math.pow(10, logY[size - 1] + (Math.log10(T) - hi));
    if (x <= 0) return Math.pow(10, logY[0] + x * (logY[1] - logY[0]));
    const i = Math.floor(x);
    const f = x - i;
    return Math.pow(10, logY[i] * (1 - f) + logY[i + 1] * f);
  };
}

/* ------------------------------------------------------------------------- */
/* Gesamtes Spektrum als Falschfarben                                        */
/* ------------------------------------------------------------------------- */

/** Stefan-Boltzmann-Konstante σ in W/(m²·K⁴) (CODATA 2018). */
const SIGMA = 5.670374419e-8;

/**
 * Wellenlängenbereich, der im Modus "gesamtes Spektrum" auf den sichtbaren
 * Bereich 380–780 nm gestaucht wird (logarithmisch, Wahl des Auftraggebers).
 */
export const FULL_MIN_NM = 50;
export const FULL_MAX_NM = 20000;

/** Grenze für "sendet praktisch nur IR bzw. UV": weniger als 1 % im Sichtbaren. */
export const VISIBLE_FRACTION_LIMIT = 0.01;

/**
 * Anteil der gesamten Strahlung eines Schwarzkörpers, der zwischen 380 und
 * 780 nm liegt:
 *
 *   f(T) = ∫₃₈₀⁷⁸⁰ B_λ(λ, T) dλ / (σT⁴/π)
 *
 * (σT⁴/π ist die über alle Wellenlängen integrierte Strahldichte.)
 * Beispiele: 5 800 K ≈ 47 %, unter ≈ 1 900 K und über ≈ 60 000 K unter 1 %.
 */
export function visibleFraction(T) {
  let sum = 0;
  for (let nm = VISIBLE_MIN_NM; nm < VISIBLE_MAX_NM; nm++) sum += planck(nm + 0.5, T);
  return (sum * 1e-9) / ((SIGMA * T ** 4) / Math.PI);
}

/**
 * Abbildung "Anzeige-Wellenlänge → echte Wellenlänge" für die Falschfarben:
 * 380 nm ↦ 50 nm, 780 nm ↦ 20 µm, dazwischen logarithmisch:
 *   λ_echt = λ_min · (λ_max/λ_min)^((λ_Anzeige − 380 nm)/400 nm)
 */
export function trueWavelengthForDisplay(displayNm) {
  const s = (displayNm - VISIBLE_MIN_NM) / (VISIBLE_MAX_NM - VISIBLE_MIN_NM);
  return FULL_MIN_NM * Math.pow(FULL_MAX_NM / FULL_MIN_NM, s);
}

/**
 * Normfarbwerte des gestauchten Spektrums: Die Strahlung jedes echten
 * Wellenlängenintervalls dλ_echt wird der zugehörigen Anzeige-Wellenlänge
 * zugeordnet und dort mit x̄, ȳ, z̄ gewichtet:
 *
 *   X = Σ B_λ(λ_echt, T) · dλ_echt · x̄(λ_Anzeige)    (Y, Z entsprechend)
 *
 * mit dλ_echt = λ_echt · ln(λ_max/λ_min) · Δλ_Anzeige / 400 nm.
 * Das ist eine FALSCHFARBEN-Darstellung: Sie zeigt, wo das Spektrum liegt,
 * nicht, was ein Auge sähe.
 */
export function falseColorXYZ(T) {
  const lnRatio = Math.log(FULL_MAX_NM / FULL_MIN_NM);
  let X = 0;
  let Y = 0;
  let Z = 0;
  for (const [nm, xb, yb, zb] of CIE_1931_2DEG) {
    const lt = trueWavelengthForDisplay(nm);
    const dl = lt * lnRatio * (CIE_STEP_NM / (VISIBLE_MAX_NM - VISIBLE_MIN_NM)) * 1e-9;
    const e = planck(lt, T) * dl;
    X += e * xb;
    Y += e * yb;
    Z += e * zb;
  }
  return { X, Y, Z };
}

/** Falschfarbe als lineares sRGB, größter Kanal = 1 (wie blackbodyColor). */
export function falseColor(T) {
  const rgb = xyzToLinearSrgb(falseColorXYZ(T));
  const r = Math.max(0, rgb.r);
  const g = Math.max(0, rgb.g);
  const b = Math.max(0, rgb.b);
  const m = Math.max(r, g, b, 1e-30);
  return { r: r / m, g: g / m, b: b / m };
}

/**
 * Zweite Nachschlagetabelle T → (R, G, B, log10 f) für den Modus
 * "gesamtes Spektrum": RGB = Falschfarbe, A = log10 des Sichtbarkeitsanteils
 * (für die automatische Kennzeichnung "nur IR/UV"). Gleiche Temperaturstufen
 * wie buildBlackbodyTable().
 */
export function buildFalseColorTable(size = TABLE_SIZE) {
  const data = new Float32Array(4 * size);
  for (let i = 0; i < size; i++) {
    const T = tableTemperature(i, size);
    const c = falseColor(T);
    data[4 * i] = c.r;
    data[4 * i + 1] = c.g;
    data[4 * i + 2] = c.b;
    data[4 * i + 3] = Math.max(-30, Math.log10(visibleFraction(T)));
  }
  return data;
}
