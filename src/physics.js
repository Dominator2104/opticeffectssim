/*
 * Erstellt mit Claude Code (KI-Werkzeug) im Auftrag von Dominik Wittkow,
 * W-Seminar Physik, CSG Ingolstadt, 24.09.2026.
 *
 * physics.js — alle physikalischen Formeln der Simulation als reine Funktionen.
 *
 * Diese Datei hat KEINE Abhängigkeit zu three.js oder zum Browser. Sie ist die
 * Datei, die geprüft wird, und gegen sie laufen die Tests (tests/physics.test.js).
 * Der Vertex-Shader in render.js ist nur eine Übersetzung dieser Funktionen.
 *
 * Konventionen (verbindlich, aus Kapitel 3 der Seminararbeit):
 *
 *   S      Ruhesystem der Sterne und der Umgebung
 *   S'     Ruhesystem des Raumschiffs (momentan mitbewegtes Inertialsystem)
 *   β      = v/c, Relativgeschwindigkeit, Bewegung entlang der +z-Achse
 *   γ      = 1/√(1−β²), Lorentzfaktor
 *   θ      Winkel des WELLENVEKTORS (Ausbreitungsrichtung des Lichts) gegen +z, in S
 *   ψ      = 180° − θ, BLICKWINKEL zum Stern gegen die Flugrichtung; cos ψ = −cos θ
 *   D      Wellenlängenverhältnis: λ' = λ·D. Nach vorn ist D < 1 (Blauverschiebung).
 *
 *   D = 1 / (γ·(1 − β·cos θ)) = 1 / (γ·(1 + β·cos ψ))
 *
 * Achtung: Viele Quellen (u. a. Kraus 2000) nennen den KEHRWERT 1/D
 * "Dopplerfaktor". Hier ist D immer das Wellenlängenverhältnis λ'/λ.
 *
 * Gestrichene Größen (ψ', λ', T', …) sind im Raumschiffsystem S' gemessen,
 * ungestrichene im Sternsystem S. Alle Winkel werden intern im Bogenmaß
 * übergeben; für Anzeige und Tests gibt es deg() und rad().
 */

/** Lichtgeschwindigkeit im Vakuum in m/s (exakt, SI-Definition). */
export const C = 299792458;

/** Grad → Bogenmaß */
export function rad(degrees) {
  return (degrees * Math.PI) / 180;
}

/** Bogenmaß → Grad */
export function deg(radians) {
  return (radians * 180) / Math.PI;
}

/* ------------------------------------------------------------------------- */
/* Grundgrößen                                                               */
/* ------------------------------------------------------------------------- */

/**
 * Lorentzfaktor γ = 1/√(1−β²).
 * Gültig für 0 ≤ β < 1; bei β ≥ 1 wird ein Fehler geworfen, weil die
 * Simulation β immer unter 1 halten muss.
 */
export function lorentzGamma(beta) {
  if (!(beta >= 0 && beta < 1)) {
    throw new RangeError(`β muss in [0, 1) liegen, erhalten: ${beta}`);
  }
  return 1 / Math.sqrt(1 - beta * beta);
}

/* ------------------------------------------------------------------------- */
/* Umrechnung zwischen θ-Form (Wellenvektor) und ψ-Form (Blickrichtung)      */
/* ------------------------------------------------------------------------- */

/**
 * Blickwinkel ψ aus dem Wellenvektorwinkel θ: ψ = 180° − θ (Bogenmaß: π − θ).
 * Das Licht läuft vom Stern zum Beobachter; man blickt also genau entgegen
 * der Ausbreitungsrichtung. Daraus folgt cos ψ = −cos θ.
 */
export function psiFromTheta(theta) {
  return Math.PI - theta;
}

/** Wellenvektorwinkel θ aus dem Blickwinkel ψ: θ = 180° − ψ. */
export function thetaFromPsi(psi) {
  return Math.PI - psi;
}

/* ------------------------------------------------------------------------- */
/* 1. Aberration (Richtung)                                                  */
/* ------------------------------------------------------------------------- */

/**
 * Aberrationsformel in der ψ-Form (Blickwinkel):
 *
 *   cos ψ' = (cos ψ + β) / (1 + β·cos ψ)          φ' = φ
 *
 * Quelle: Dragon 2006, S. 42, Gl. (3.24);
 *         gleichwertig Weiskopf u. a. 1999, S. 280, Gl. (4) und (5).
 *
 * @param {number} beta   β = v/c
 * @param {number} cosPsi cos ψ, Blickwinkel zum Stern gegen die Flugrichtung in S
 * @returns {number} cos ψ', derselbe Blickwinkel im Raumschiffsystem S'
 */
export function aberrationCosPsi(beta, cosPsi) {
  return (cosPsi + beta) / (1 + beta * cosPsi);
}

/**
 * Aberration als Winkel: ψ (in S) → ψ' (in S'), beides im Bogenmaß.
 * Nur eine Umschreibung von aberrationCosPsi() mit arccos.
 */
export function aberrationPsi(beta, psi) {
  return Math.acos(clampCos(aberrationCosPsi(beta, Math.cos(psi))));
}

/**
 * Umkehrung der Aberration: ψ' (in S') → ψ (in S).
 * Man erhält sie aus der Formel oben, indem man β durch −β ersetzt
 * (Rücktransformation von S' nach S):
 *
 *   cos ψ = (cos ψ' − β) / (1 − β·cos ψ')
 */
export function inverseAberrationCosPsi(beta, cosPsiPrime) {
  return (cosPsiPrime - beta) / (1 - beta * cosPsiPrime);
}

/**
 * Dieselbe Aberrationsformel in der θ-Form (Wellenvektor):
 *
 *   cos θ' = (cos θ − β) / (1 − β·cos θ)
 *
 * Herleitung aus der ψ-Form durch Einsetzen von cos ψ = −cos θ und
 * cos ψ' = −cos θ':
 *   −cos θ' = (−cos θ + β) / (1 − β·cos θ)   ⇒   cos θ' = (cos θ − β) / (1 − β·cos θ)
 *
 * Wird nur benutzt, um in den Tests zu zeigen, dass beide Formen dasselbe
 * liefern.
 */
export function aberrationCosTheta(beta, cosTheta) {
  return (cosTheta - beta) / (1 - beta * cosTheta);
}

/**
 * Aberration einer Richtung als Einheitsvektor (x, y, z) mit z = Flugrichtung.
 * Das ist die Form, die der Vertex-Shader in render.js verwendet.
 *
 * Der Vektor n zeigt vom Beobachter zum Stern (Blickrichtung), also gilt
 * n_z = cos ψ und √(n_x² + n_y²) = sin ψ. Der Azimut φ bleibt erhalten
 * (φ' = φ), deshalb werden n_x und n_y nur gemeinsam skaliert.
 *
 *   z-Komponente:  n'_z = cos ψ' = (cos ψ + β) / (1 + β·cos ψ)
 *   x, y:          n'_x = D·n_x,  n'_y = D·n_y
 *
 * Begründung für den Faktor D: Aus der Aberrationsformel folgt
 *   sin ψ' = √(1 − cos²ψ') = sin ψ · √(1−β²) / (1 + β·cos ψ)
 *          = sin ψ / (γ·(1 + β·cos ψ)) = D · sin ψ.
 * Damit ist n'_⊥ = n_⊥ · (sin ψ' / sin ψ) = D · n_⊥. Diese Schreibweise
 * vermeidet die Division durch sin ψ, die bei ψ = 0° und ψ = 180° versagt.
 *
 * @param {number} beta
 * @param {number[]} n  Einheitsvektor [x, y, z] in S
 * @returns {number[]}  Einheitsvektor [x', y', z'] in S'
 */
export function aberrateDirection(beta, n) {
  const [x, y, z] = n;
  const D = dopplerFactor(beta, z);
  return [D * x, D * y, aberrationCosPsi(beta, z)];
}

/* ------------------------------------------------------------------------- */
/* 2. Doppler-Effekt (Farbe)                                                 */
/* ------------------------------------------------------------------------- */

/**
 * Wellenlängenverhältnis D in der ψ-Form:
 *
 *   D = λ'/λ = 1 / (γ·(1 + β·cos ψ))
 *
 * ψ ist der Blickwinkel in S. Nach vorn (ψ = 0) ist D < 1: Blauverschiebung.
 * Konvention aus Kapitel 3 der Seminararbeit (Kehrwert des "Dopplerfaktors"
 * bei Kraus 2000).
 */
export function dopplerFactor(beta, cosPsi) {
  return 1 / (lorentzGamma(beta) * (1 + beta * cosPsi));
}

/**
 * Wellenlängenverhältnis D in der θ-Form:
 *
 *   D = 1 / (γ·(1 − β·cos θ))
 *
 * θ ist der Winkel des Wellenvektors in S. Wegen cos ψ = −cos θ identisch mit
 * dopplerFactor().
 */
export function dopplerFactorTheta(beta, cosTheta) {
  return 1 / (lorentzGamma(beta) * (1 - beta * cosTheta));
}

/**
 * Wellenlängenverhältnis D, ausgedrückt durch den Blickwinkel ψ' im
 * Raumschiffsystem S' (so, wie der Pilot den Stern sieht):
 *
 *   D = γ·(1 − β·cos ψ')
 *
 * Herleitung: Aus der Umkehrung der Aberration folgt
 *   1 + β·cos ψ = (1 − β²) / (1 − β·cos ψ'),
 * eingesetzt in D = 1/(γ·(1 + β·cos ψ)) ergibt das γ·(1 − β·cos ψ').
 * Wird im Fragment-Shader für die Terrell-Körper verwendet, wo nur die
 * gesehene Richtung bekannt ist.
 */
export function dopplerFactorFromPrime(beta, cosPsiPrime) {
  return lorentzGamma(beta) * (1 - beta * cosPsiPrime);
}

/**
 * D genau nach vorn (ψ = 0):  D = √((1−β)/(1+β))
 */
export function dopplerFactorForward(beta) {
  return Math.sqrt((1 - beta) / (1 + beta));
}

/**
 * D genau nach hinten (ψ = 180°):  D = √((1+β)/(1−β))
 */
export function dopplerFactorBackward(beta) {
  return Math.sqrt((1 + beta) / (1 - beta));
}

/** Beobachtete Wellenlänge λ' = λ·D. */
export function shiftedWavelength(lambda, D) {
  return lambda * D;
}

/**
 * Relative Wellenlängenänderung in Prozent: (λ' − λ)/λ · 100 % = (D − 1) · 100 %.
 * Negativ bedeutet Blauverschiebung.
 */
export function wavelengthShiftPercent(D) {
  return (D - 1) * 100;
}

/**
 * Scheinbare Temperatur eines Schwarzkörpers:
 *
 *   T' = T / D
 *
 * Begründung: Jede Wellenlänge des Spektrums wird mit demselben Faktor D
 * multipliziert. Nach dem Wienschen Verschiebungsgesetz (λ_max · T = const)
 * ist das verschobene Spektrum wieder ein Planck-Spektrum, nun mit T' = T/D.
 * Nach vorn ist D < 1, also T' > T: der Stern erscheint heißer und blauer.
 *
 * Ehrlicher Hinweis: Bei großem β wandert sichtbares Licht ins UV und
 * Infrarotes ins Sichtbare. Die Farbe des verschobenen Schwarzkörpers ist nur
 * dann richtig, wenn man das Spektrum des Sterns als vollständiges
 * Planck-Spektrum annimmt (keine Absorptionslinien, kein Abschneiden im UV).
 */
export function apparentTemperature(T, D) {
  return T / D;
}

/* ------------------------------------------------------------------------- */
/* 3. Beaming (Helligkeit)                                                   */
/* ------------------------------------------------------------------------- */

/**
 * Beaming für einen PUNKTFÖRMIG erscheinenden Stern: Verhältnis der
 * empfangenen Bestrahlungsstärke
 *
 *   F' / F = D^(−2)
 *
 * Quelle: Weiskopf u. a. 1999, S. 283, Gl. (14) und (15); Kraus 2000, S. 56.
 *
 * STERNE SIND PUNKTE → für Sterne immer diese Funktion verwenden.
 */
export function beamingPointSource(D) {
  return 1 / (D * D);
}

/**
 * Beaming für eine AUSGEDEHNTE Fläche: Verhältnis der Strahldichte
 *
 *   L' / L = D^(−4)
 *
 * Quelle: Weiskopf u. a. 1999, S. 283, Gl. (14) und (15); Kraus 2000, S. 56.
 *
 * Nur für flächige Objekte (Würfel, Kugel) verwenden, NICHT für Sterne.
 */
export function beamingExtended(D) {
  const D2 = D * D;
  return 1 / (D2 * D2);
}

/**
 * Helligkeit eines punktförmigen Sterns NUR IM SICHTBAREN (380–780 nm).
 * Umschaltbar gegen die bolometrische Helligkeit D^(−2) (Wunsch des
 * Auftraggebers).
 *
 *   F'_vis / F_vis = D² · Y(T') / Y(T)       mit T' = T/D
 *
 * Y(T) = ∫ B_λ(λ, T) · ȳ(λ) dλ ist die sichtbare Helligkeit eines
 * Schwarzkörpers (berechnet in blackbody.js).
 *
 * Herleitung: Das empfangene Spektrum ist wieder ein Planck-Spektrum, nun mit
 * der Temperatur T' = T/D (siehe apparentTemperature). Die Bestrahlungsstärke
 * eines Sterns ist Strahldichte × scheinbarer Raumwinkel des Sternscheibchens;
 * der Raumwinkel ändert sich mit dΩ'/dΩ = D² (siehe solidAngleRatio). Also
 *   F'_vis = Ω·D² · Y(T')   und   F_vis = Ω · Y(T).
 *
 * Probe: Über das ganze Spektrum integriert (statt nur über den sichtbaren
 * Bereich) ist Y durch σT⁴/π zu ersetzen, und die Formel ergibt
 *   D² · (T'/T)⁴ = D² · D^(−4) = D^(−2),
 * also genau das bolometrische Beaming. (Getestet.)
 *
 * @param {number} D         Wellenlängenverhältnis
 * @param {number} Yrest     Y(T), sichtbare Helligkeit bei der Ruhetemperatur
 * @param {number} Yshifted  Y(T'), sichtbare Helligkeit bei der scheinbaren Temperatur
 */
export function beamingPointSourceVisible(D, Yrest, Yshifted) {
  return D * D * (Yshifted / Yrest);
}

/**
 * Zerlegung der sichtbaren Helligkeit in zwei unabhängig schaltbare Faktoren
 * (so rechnet der Shader, damit "Doppler" und "Beaming" getrennt zuschaltbar
 * bleiben):
 *
 *   D² · Y(T')/Y(T)  =  D^(−2)  ·  [ Y(T')/Y(T) · (T/T')⁴ ]
 *                       Beaming    Spektralfaktor (Anteil im Sichtbaren)
 *
 * denn (T/T')⁴ = D⁴. Der Spektralfaktor ist das Verhältnis der
 * Sichtbarkeitsanteile Y/(σT⁴/π) nach und vor der Verschiebung. Er ist 1, wenn
 * das Spektrum nicht verschoben wird (T' = T, Doppler aus).
 */
export function visibleSpectralFactor(T, Tprime, Yrest, Yshifted) {
  const r = T / Tprime;
  return (Yshifted / Yrest) * r * r * r * r;
}

/** Wiensche Verschiebungskonstante b in m·K (CODATA 2018). */
export const WIEN_B = 2.897771955e-3;

/**
 * Strahldichte einer AUSGEDEHNTEN, selbstleuchtenden Fläche (Schwarzkörper
 * der Temperatur T) NUR IM SICHTBAREN:
 *
 *   L'_vis / L_vis = Y(T') / Y(T)
 *
 * Begründung: Die Strahldichte eines Schwarzkörpers bleibt nach der
 * Transformation eine Planck-Strahldichte, nun bei T' = T/D; es gibt keinen
 * Raumwinkelfaktor wie beim Punkt. Zerlegt wie beim Stern:
 *   Y(T')/Y(T) = D^(−4) · visibleSpectralFactor(T, T', Y(T), Y(T'))
 * (Probe mit Y ∝ T⁴: ergibt D^(−4). Getestet.)
 */
export function beamingExtendedVisible(Yrest, Yshifted) {
  return Yshifted / Yrest;
}

/**
 * Wiensches Verschiebungsgesetz: Wellenlänge des Strahlungsmaximums
 *
 *   λ_max = b / T
 *
 * @returns {number} λ_max in nm
 */
export function wienPeakWavelengthNm(T) {
  return (WIEN_B / T) * 1e9;
}

/**
 * Liegt das Strahlungsmaximum im UV, im Sichtbaren oder im IR?
 * Grenzen 380 nm und 780 nm wie im Auftrag.
 * @returns {'uv'|'sichtbar'|'ir'}
 */
export function peakBand(T) {
  const l = wienPeakWavelengthNm(T);
  if (l < 380) return 'uv';
  if (l > 780) return 'ir';
  return 'sichtbar';
}

/* ------------------------------------------------------------------------- */
/* 4. Sterndichte und abgeleitete Kenngrößen                                 */
/* ------------------------------------------------------------------------- */

/**
 * Verhältnis der Raumwinkelelemente dΩ'/dΩ = D².
 *
 * Herleitung: dΩ = d(cos ψ)·dφ und dφ' = dφ. Ableiten der Aberrationsformel:
 *   d(cos ψ')/d(cos ψ) = (1 − β²) / (1 + β·cos ψ)² = D²
 *
 * Damit ist die Sterndichte n'/n = dΩ/dΩ' = D^(−2).
 *
 * WICHTIG: Diese Funktion dient nur der Anzeige und den Tests. Im Renderer
 * entsteht die Verdichtung automatisch, weil jeder Stern einzeln durch die
 * Aberrationsformel geht. Ein zusätzlicher Dichtefaktor wäre Doppelzählung.
 */
export function solidAngleRatio(beta, cosPsi) {
  const D = dopplerFactor(beta, cosPsi);
  return D * D;
}

/**
 * Blickwinkel ψ', unter dem ein Stern erscheint, der in S genau seitlich
 * (ψ = 90°) steht. Aus der Aberrationsformel mit cos ψ = 0:
 *
 *   cos ψ' = β   ⇒   ψ' = arccos β
 *
 * Das ist zugleich der halbe Öffnungswinkel des Kegels, in dem die gesamte
 * vordere Hälfte des Sternhimmels von S erscheint.
 */
export function psiPrimeOfSideStar(beta) {
  return Math.acos(beta);
}

/**
 * Anteil des Himmels im Kegel: Die vordere Himmelshälfte aus S (ψ ≤ 90°)
 * erscheint in S' im Kegel ψ' ≤ arccos β. Dessen Raumwinkel ist
 * 2π·(1 − cos ψ') = 2π·(1 − β), der Anteil an der Vollkugel (4π) also
 *
 *   (1 − β) / 2
 */
export function forwardConeSkyFraction(beta) {
  return (1 - beta) / 2;
}

/* ------------------------------------------------------------------------- */
/* 6. Beschleunigungsphase                                                   */
/* ------------------------------------------------------------------------- */

/**
 * Konstante Eigenbeschleunigung a (Hyperbelbewegung), Start aus der Ruhe:
 *
 *   β(t) = (a·t/c) / √(1 + (a·t/c)²)
 *
 * t ist die Zeit im Sternsystem S. β bleibt für jedes t unter 1, ganz ohne
 * künstliche Begrenzung. Es gilt β·γ = a·t/c.
 *
 * @param {number} a  Eigenbeschleunigung in m/s²
 * @param {number} t  Zeit in S in Sekunden
 */
export function betaConstantProperAcceleration(a, t) {
  const u = (a * t) / C;
  return u / Math.sqrt(1 + u * u);
}

/**
 * Zeit in S, nach der bei konstanter Eigenbeschleunigung a die Geschwindigkeit
 * β erreicht ist. Umkehrung der Formel oben: a·t/c = β·γ  ⇒  t = (c/a)·β·γ.
 */
export function timeToReachBeta(a, beta) {
  return (C / a) * beta * lorentzGamma(beta);
}

/**
 * Eigenzeit τ an Bord bei konstanter Eigenbeschleunigung, wenn in S die Zeit
 * t vergangen ist:  τ = (c/a) · arsinh(a·t/c).
 * (Standardergebnis der Hyperbelbewegung; nur für die Anzeige.)
 */
export function properTimeConstantAcceleration(a, t) {
  return (C / a) * Math.asinh((a * t) / C);
}

/**
 * Linear in β (unphysikalisch, aber didaktisch praktisch):
 *   β(t) = β_end · t/T   für 0 ≤ t ≤ T
 */
export function betaLinear(t, T, betaEnd) {
  return betaEnd * clamp01(t / T);
}

/**
 * Weiche Ein-/Ausblendkurve (kubischer "smoothstep"):
 *   β(t) = β_end · (3u² − 2u³)  mit u = t/T
 * Start und Ende mit waagrechter Tangente. Ebenfalls rein didaktisch.
 */
export function betaSmooth(t, T, betaEnd) {
  const u = clamp01(t / T);
  return betaEnd * u * u * (3 - 2 * u);
}

/** Die drei wählbaren Kurven der Beschleunigungsphase. */
export const ACCELERATION_CURVES = {
  constant: 'konstante Eigenbeschleunigung',
  linear: 'linear in β (didaktisch)',
  smooth: 'weiche Ein-/Ausblendkurve (didaktisch)',
};

/**
 * β zur Zeit t (in S) für die gewählte Kurve.
 * Damit die drei Kurven vergleichbar sind, laufen "linear" und "smooth" über
 * dieselbe Dauer T bis zum selben End-β wie die konstante Eigenbeschleunigung:
 *   β_end = β_konst(a, T).
 *
 * @param {'constant'|'linear'|'smooth'} curve
 * @param {number} t  Zeit in S in s (0 ≤ t ≤ T)
 * @param {number} a  Eigenbeschleunigung in m/s²
 * @param {number} T  Dauer der Beschleunigungsphase in S in s
 */
export function accelerationBeta(curve, t, a, T) {
  if (curve === 'constant') return betaConstantProperAcceleration(a, Math.min(t, T));
  const betaEnd = betaConstantProperAcceleration(a, T);
  if (curve === 'linear') return betaLinear(t, T, betaEnd);
  return betaSmooth(t, T, betaEnd);
}

/**
 * Eigenzeit an Bord für eine beliebige Kurve β(t), numerisch:
 *
 *   τ = ∫₀ᵗ √(1 − β(t')²) dt' = ∫₀ᵗ dt'/γ
 *
 * (Zeitdilatation; Simpson-Regel mit n Teilintervallen, n gerade.)
 * Für die konstante Eigenbeschleunigung stimmt das mit der geschlossenen Form
 * properTimeConstantAcceleration() überein (getestet).
 */
export function properTimeNumeric(betaOfT, t, n = 400) {
  if (t <= 0) return 0;
  const h = t / n;
  const f = (s) => {
    const b = betaOfT(s);
    return Math.sqrt(1 - b * b);
  };
  let sum = f(0) + f(t);
  for (let i = 1; i < n; i++) sum += (i % 2 === 1 ? 4 : 2) * f(i * h);
  return (sum * h) / 3;
}

/* ------------------------------------------------------------------------- */
/* Hilfsfunktionen                                                           */
/* ------------------------------------------------------------------------- */

/** Rundungsfehler abfangen, damit acos() nie NaN liefert. */
function clampCos(c) {
  return Math.min(1, Math.max(-1, c));
}

function clamp01(x) {
  return Math.min(1, Math.max(0, x));
}
