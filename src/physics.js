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

/**
 * Umrechnung visuelle → bolometrische Helligkeit eines Schwarzkörpers,
 * bezogen auf einen sonnenähnlichen Stern (T_ref = 5 800 K):
 *
 *   F_bol / F_vis = k(T) = (T / T_ref)⁴ · Y(T_ref) / Y(T)
 *
 * (σT⁴/π ist die gesamte, Y(T) die sichtbare Strahldichte; k(T_ref) = 1.)
 * Die Grundhelligkeiten der Sterne sind visuelle Helligkeiten. Im Modus
 * "gesamtes Spektrum" wird mit k(T) auf die Helligkeit über alle
 * Wellenlängen umgerechnet: Kühle M-Sterne (vor allem IR) und sehr heiße
 * Sterne (vor allem UV) werden dadurch heller als im Sichtbaren.
 * Entspricht der bolometrischen Korrektur BC = −2,5·log10 k(T) eines
 * Schwarzkörpers relativ zur Sonne.
 *
 * @param {number} T
 * @param {(T:number)=>number} Y  sichtbare Helligkeit Y(T) (blackbody.js)
 */
export function bolometricToVisibleRatio(T, Y, Tref = 5800) {
  return (T / Tref) ** 4 * (Y(Tref) / Y(T));
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

/**
 * Grenzgröße des bloßen Auges unter dunklem Himmel in mag (üblicher Richtwert).
 */
export const NAKED_EYE_LIMIT_MAG = 6.5;

/**
 * Wie viele Sterne eines Sternfelds sind mit bloßem Auge sichtbar, wenn man
 * Doppler-Effekt und Beaming im SICHTBAREN Licht berücksichtigt?
 *
 * Für jeden Stern: D aus seiner Richtung (dopplerFactor), T' = T/D, sichtbare
 * Bestrahlungsstärke F'_vis = F · D²·Y(T')/Y(T) (beamingPointSourceVisible).
 * Sichtbar, wenn F'_vis ≥ 10^(−0,4 · 6,5), also heller als 6,5 mag.
 *
 * @param {{count:number, directions:Float32Array, temperatures:Float32Array, fluxes:Float32Array}} stars
 *        Sternfeld (stars.js); F relativ zu 0 mag
 * @param {number} beta
 * @param {(T:number)=>number} Y  sichtbare Helligkeit Y(T) (blackbody.js)
 * @param {number} stride  nur jeden stride-ten Stern auswerten (Ergebnis hochgerechnet)
 * @returns {{visible:number, invisible:number}}
 */
export function nakedEyeVisibleCount(stars, beta, Y, stride = 1, limitMag = NAKED_EYE_LIMIT_MAG) {
  const Fmin = Math.pow(10, -0.4 * limitMag);
  let visible = 0;
  let total = 0;
  for (let i = 0; i < stars.count; i += stride) {
    const D = dopplerFactor(beta, stars.directions[3 * i + 2]);
    const T = stars.temperatures[i];
    const F = stars.fluxes[i] * beamingPointSourceVisible(D, Y(T), Y(apparentTemperature(T, D)));
    if (F >= Fmin) visible++;
    total++;
  }
  const scale = stars.count / Math.max(1, total);
  return { visible: visible * scale, invisible: (total - visible) * scale };
}

/* ------------------------------------------------------------------------- */
/* 5. Terrell-Penrose (Form)                                                 */
/* ------------------------------------------------------------------------- */

/**
 * Blickwinkel ψ in S zu einem gesehenen Winkel ψ' (Umkehrung der Aberration).
 */
export function psiFromPsiPrime(beta, psiPrime) {
  return Math.acos(clampCos(inverseAberrationCosPsi(beta, Math.cos(psiPrime))));
}

/**
 * Terrell-Drehwinkel eines kleinen Körpers, der unter ψ' gesehen wird:
 *
 *   α = ψ − ψ'
 *
 * Das Bild eines kleinen, in S ruhenden Körpers ist (wegen der Winkeltreue der
 * Aberration) das Bild, das man in Ruhe aus der Richtung ψ sähe — nur an der
 * Stelle ψ'. Verglichen mit einem ruhenden Körper an derselben Bildstelle
 * erscheint er also um α gedreht (Terrell 1959; Boas 1961).
 * Bei ψ' = 90° ist cos ψ = −β, also α = arcsin β.
 */
export function terrellRotationAngle(beta, psiPrime) {
  return psiFromPsiPrime(beta, psiPrime) - psiPrime;
}

/**
 * Scheinbare Verkürzung der Ausdehnung in Flugrichtung, verglichen mit einem
 * ruhenden Körper an derselben Bildstelle:
 *
 *   sin ψ / sin ψ' = 1/D = 1 / (γ·(1 − β·cos ψ'))
 *
 * (wegen sin ψ' = D·sin ψ, siehe aberrateDirection). Bei ψ' = 90° ergibt das
 * genau 1/γ: Die Lorentz-Kontraktion erscheint als Drehung. Vorn ist der
 * Faktor größer als 1 (gestreckt), hinten kleiner als 1.
 */
export function terrellLengthFactor(beta, psiPrime) {
  return 1 / dopplerFactorFromPrime(beta, Math.cos(psiPrime));
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
 * Eigengeschwindigkeit u = β·γ (in Einheiten von c) und ihre Umkehrung
 * β = u / √(1 + u²).
 */
export function properVelocity(beta) {
  return beta * lorentzGamma(beta);
}
export function betaFromProperVelocity(u) {
  return u / Math.sqrt(1 + u * u);
}

/**
 * Konstante Eigenbeschleunigung von β₀ nach β₁ (β₁ < β₀ heißt Bremsen).
 *
 * Bei geradliniger Bewegung mit konstanter Eigenbeschleunigung a ändert sich
 * die Eigengeschwindigkeit u = β·γ linear mit der Zeit t in S:
 *
 *   u(t) = u₀ ± a·t/c       (Verallgemeinerung von β·γ = a·t/c für Start aus der Ruhe)
 *
 * (Begründung: Impuls p = mγv, und bei geradliniger Bewegung gilt
 * dp/dt = m·a mit der Eigenbeschleunigung a.) Daraus folgen die Dauer und,
 * umgekehrt, die nötige Eigenbeschleunigung:
 *
 *   T = (c/a) · |u₁ − u₀|          a = (c/T) · |u₁ − u₀|
 */
export function accelerationDuration(a, beta0, beta1) {
  return (C / a) * Math.abs(properVelocity(beta1) - properVelocity(beta0));
}
export function accelerationFromDuration(T, beta0, beta1) {
  return (C / T) * Math.abs(properVelocity(beta1) - properVelocity(beta0));
}

/**
 * β(t) bei konstanter Eigenbeschleunigung von β₀ (t = 0) nach β₁ (t = T):
 * u wächst bzw. fällt linear von u₀ nach u₁, dann β = u/√(1 + u²).
 */
export function betaConstantBetween(t, T, beta0, beta1) {
  const s = clamp01(t / T);
  const u0 = properVelocity(beta0);
  const u1 = properVelocity(beta1);
  return betaFromProperVelocity(u0 + (u1 - u0) * s);
}

/**
 * Linear in β (unphysikalisch, aber didaktisch praktisch):
 *   β(t) = β₀ + (β₁ − β₀) · t/T   für 0 ≤ t ≤ T
 */
export function betaLinear(t, T, beta0, beta1) {
  return beta0 + (beta1 - beta0) * clamp01(t / T);
}

/**
 * Weiche Ein-/Ausblendkurve (kubischer "smoothstep"):
 *   β(t) = β₀ + (β₁ − β₀) · (3s² − 2s³)  mit s = t/T
 * Start und Ende mit waagrechter Tangente. Ebenfalls rein didaktisch.
 */
export function betaSmooth(t, T, beta0, beta1) {
  const s = clamp01(t / T);
  return beta0 + (beta1 - beta0) * s * s * (3 - 2 * s);
}

/** Die drei wählbaren Kurven der Beschleunigungsphase. */
export const ACCELERATION_CURVES = {
  constant: 'konstante Eigenbeschleunigung',
  linear: 'linear in β (didaktisch)',
  smooth: 'weiche Ein-/Ausblendkurve (didaktisch)',
};

/**
 * β zur Zeit t (in S) für die gewählte Kurve von β₀ nach β₁.
 * Alle drei Kurven laufen über dieselbe Dauer T; T ergibt sich aus der
 * konstanten Eigenbeschleunigung (accelerationDuration), damit die Kurven
 * vergleichbar sind.
 *
 * @param {'constant'|'linear'|'smooth'} curve
 * @param {number} t      Zeit in S in s (0 ≤ t ≤ T)
 * @param {number} T      Dauer der Beschleunigungsphase in S in s
 * @param {number} beta0  Start-β
 * @param {number} beta1  End-β
 */
export function accelerationBeta(curve, t, T, beta0, beta1) {
  if (curve === 'constant') return betaConstantBetween(t, T, beta0, beta1);
  if (curve === 'linear') return betaLinear(t, T, beta0, beta1);
  return betaSmooth(t, T, beta0, beta1);
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
/* 7. Flug durch das 3D-Sternfeld                                            */
/* ------------------------------------------------------------------------- */

/** Lichtjahre pro Parsec (1 pc = 3,26156 Lj). */
export const LY_PER_PC = 3.26156;

/** Sekunden pro (julianischem) Jahr; in Lichtjahren und Jahren ist c = 1 Lj/a. */
export const SECONDS_PER_YEAR = 31557600;

/**
 * Zeitdilatation: Vergeht an Bord die Eigenzeit dτ, so vergeht in S
 *
 *   dt = γ · dτ
 *
 * (Die Zeitsteuerung im 3D-Modus bezieht sich auf die Bordzeit τ.)
 */
export function coordinateTimeStep(beta, dTau) {
  return lorentzGamma(beta) * dTau;
}

/**
 * In der Zeit dt (in S) legt das Schiff in S die Strecke
 *
 *   ds = β · c · dt
 *
 * zurück. Mit Lichtjahren und Jahren ist c = 1, also ds [Lj] = β · dt [a].
 */
export function distanceStepLy(beta, dtYears) {
  return beta * dtYears;
}

/**
 * Bestrahlungsstärke eines Sterns der absoluten Helligkeit M in der
 * Entfernung r, relativ zu einem Stern von 0 mag. Mit dem Entfernungsmodul
 *
 *   m = M + 5 · log10(r / 10 pc)
 *
 * folgt F = 10^(−0,4·m) = 10^(−0,4·M) · (10 pc / r)²  (1/r²-Gesetz).
 * Die Entfernung r ist die in S von der aktuellen Beobachterposition aus;
 * die Sterne ruhen in S.
 */
export function fluxFromAbsoluteMagnitude(M, rLy) {
  const tenPc = 10 * LY_PER_PC;
  return Math.pow(10, -0.4 * M) * (tenPc / rLy) ** 2;
}

/* ------------------------------------------------------------------------- */
/* 8. Belichtung während der Beschleunigung (Vergleich mit dem Film)         */
/* ------------------------------------------------------------------------- */
/*
 * Ergänzt am 03.11.2026 (Claude Code, KI-Werkzeug, im Auftrag von Dominik
 * Wittkow). Ein Filmbild entsteht mit endlicher Belichtungszeit t_b. Ändert
 * sich β während t_b, wandert jeder Stern auf dem Bild und hinterlässt einen
 * Streifen. Streifen entstehen hier AUSSCHLIESSLICH aus dieser Rechnung:
 * Belichtungsintervall in Teilschritte zerlegen, in jedem Schritt mit dem
 * momentanen β Lage, D und Helligkeit bestimmen, Licht linear aufsummieren.
 */

/**
 * Wanderung eines Sterns beim Beschleunigen:
 *
 *   dψ'/dβ = −γ² · sin ψ'
 *
 * Herleitung: Aus cos ψ' = (cos ψ + β)/(1 + β cos ψ) folgt bei festem ψ
 *   d(cos ψ')/dβ = sin²ψ / (1 + β cos ψ)² = γ² sin²ψ'
 * (wegen sin ψ' = sin ψ / (γ (1 + β cos ψ))), und d(cos ψ') = −sin ψ' dψ'.
 * Das Vorzeichen ist negativ: Beim Beschleunigen wandern alle Sterne zum
 * Fluchtpunkt hin (ψ' wird kleiner).
 */
export function aberrationAngleRate(beta, psiPrime) {
  const g = lorentzGamma(beta);
  return -g * g * Math.sin(psiPrime);
}

/**
 * Konstante Eigenbeschleunigung in Bordzeit τ: Die Rapidität η = artanh β
 * wächst linear mit der Eigenzeit, η(τ) = η₀ + a·τ/c. Also
 *
 *   β(τ) = tanh(artanh β₀ + a·τ/c),   aus der Ruhe:  β = tanh(a·τ/c).
 *
 * Dieselbe Bewegung wie betaConstantProperAcceleration() (dort in der Zeit t
 * in S); beide gehen über τ = (c/a)·arsinh(a·t/c) ineinander über (getestet).
 */
export function betaHyperbolicProperTime(a, tau, beta0 = 0) {
  return Math.tanh(Math.atanh(beta0) + (a * tau) / C);
}

/**
 * Eigenbeschleunigung, mit der in der Bordzeit τ von β₀ auf β₁ beschleunigt
 * wird:  a = c · |artanh β₁ − artanh β₀| / τ.
 * Filmszene (β = 0 → 0,99 in 3 s): a ≈ 2,645·10⁸ m/s².
 */
export function properAccelerationForProperTime(beta0, beta1, tau) {
  return (C * Math.abs(Math.atanh(beta1) - Math.atanh(beta0))) / tau;
}

/**
 * β als Funktion der Bordzeit τ für eine Kurve der Beschleunigungsphase.
 * Die Kurven selbst sind in der Zeit t in S angegeben (accelerationBeta),
 * die Kamera an Bord belichtet aber in ihrer Eigenzeit τ (τ = 0 beim Beginn).
 *
 *   konstante Eigenbeschleunigung: geschlossen über die Rapidität (siehe
 *     oben); Dauer an Bord τ_E = T · |η₁ − η₀| / |u₁ − u₀|, weil
 *     a = c·|u₁ − u₀|/T (accelerationFromDuration) und τ_E = c·|η₁ − η₀|/a.
 *   andere Kurven: τ(t) = ∫ dt/γ numerisch (Trapezregel mit n Schritten),
 *     umgekehrt durch Intervallhalbierung und lineare Interpolation.
 *
 * Vor dem Beginn (τ < 0) gilt β₀, nach dem Ende (τ > τ_E) bleibt β = β₁.
 *
 * @returns {{tauEnd:number, betaAt:(tau:number)=>number, tAt:(tau:number)=>number}}
 *   tAt: Zeit t in S zur Bordzeit τ (für die Anzeige)
 */
export function accelerationProfileProperTime(curve, T, beta0, beta1, n = 4096) {
  if (!(T > 0) || beta0 === beta1) {
    const g = lorentzGamma(beta0);
    return { tauEnd: 0, betaAt: () => beta0, tAt: (tau) => tau * g };
  }
  const g0 = lorentzGamma(beta0);
  const g1 = lorentzGamma(beta1);
  if (curve === 'constant') {
    const e0 = Math.atanh(beta0);
    const e1 = Math.atanh(beta1);
    const u0 = properVelocity(beta0);
    const u1 = properVelocity(beta1);
    const tauEnd = (T * Math.abs(e1 - e0)) / Math.abs(u1 - u0);
    const betaAt = (tau) => Math.tanh(e0 + (e1 - e0) * clamp01(tau / tauEnd));
    const tAt = (tau) => {
      if (tau <= 0) return tau * g0;
      if (tau >= tauEnd) return T + (tau - tauEnd) * g1;
      return (T * (Math.sinh(e0 + (e1 - e0) * (tau / tauEnd)) - u0)) / (u1 - u0);
    };
    return { tauEnd, betaAt, tAt };
  }
  const h = T / n;
  const taus = new Float64Array(n + 1);
  let prev = 1 / g0;
  for (let i = 1; i <= n; i++) {
    const b = accelerationBeta(curve, i * h, T, beta0, beta1);
    const inv = Math.sqrt(1 - b * b);
    taus[i] = taus[i - 1] + 0.5 * (prev + inv) * h;
    prev = inv;
  }
  const tauEnd = taus[n];
  const tAt = (tau) => {
    if (tau <= 0) return tau * g0;
    if (tau >= tauEnd) return T + (tau - tauEnd) * g1;
    let lo = 0;
    let hi = n;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (taus[mid] <= tau) lo = mid;
      else hi = mid;
    }
    return (lo + (tau - taus[lo]) / (taus[hi] - taus[lo])) * h;
  };
  const betaAt = (tau) => {
    if (tau <= 0) return beta0;
    if (tau >= tauEnd) return beta1;
    return accelerationBeta(curve, tAt(tau), T, beta0, beta1);
  };
  return { tauEnd, betaAt, tAt };
}

/**
 * Geradlinige (gnomonische) Kamera wie im Auswertungsprogramm der Arbeit
 * (szene_analysieren.py, brennweite_px):
 *
 *   f = (Breite / 2) / tan(Bildfeld / 2),   Abstand zum Fluchtpunkt r = f · tan ψ'.
 *
 * Die Kameraachse zeigt in Flugrichtung (+z). Ihr Durchstoßpunkt durch die
 * Bildebene (Hauptpunkt) ist deshalb zugleich der Fluchtpunkt (cx, cy); er
 * darf außerhalb der Bildmitte liegen (verschobenes Objektiv).
 * Pixelkoordinaten: x nach rechts, y nach unten, (0, 0) = linke obere Ecke
 * des linken oberen Pixels.
 */
export function rectilinearCamera({ width, height, hfovDeg, cx = width / 2, cy = height / 2 }) {
  return { width, height, hfovDeg, cx, cy, f: width / 2 / Math.tan(rad(hfovDeg) / 2) };
}

/**
 * Bildpunkt einer gesehenen Richtung n' im Raumschiffsystem (x links, y oben,
 * z vorn, wie in der ganzen Simulation):
 *
 *   x = cx − f · n'x / n'z,    y = cy − f · n'y / n'z
 *
 * Richtungen mit n'z ≤ 0 (90° oder mehr zur Flugrichtung) haben keinen
 * Bildpunkt → null.
 */
export function projectRectilinear(cam, n) {
  if (!(n[2] > 0)) return null;
  return [cam.cx - (cam.f * n[0]) / n[2], cam.cy - (cam.f * n[1]) / n[2]];
}

/**
 * Relative Bestrahlungsstärke F'/F eines Sterns beim Wellenlängenverhältnis D
 * und die gesehene Temperatur — genau wie im Shader (render.js, starAppearance):
 *
 *   nur sichtbares Licht:  F'/F = D^(−2) · Y(T')/Y(T) · (T/T')⁴ = D² · Y(T')/Y(T)
 *     Das ist die Bandformel F'_λ'(λ') = D⁻³ F_λ(λ'/D) für einen Schwarzkörper,
 *     integriert mit der Hellempfindlichkeit ȳ (wegen B_λ(λ/D, T) = D⁵ B_λ(λ, T/D)).
 *   gesamtes Spektrum:     F'/F = D^(−2) · k(T)   (bolometrisch, k siehe bolometricToVisibleRatio)
 *
 * Schalter: beaming (Faktor D^(−2)), doppler (T' = T/D statt T).
 *
 * @param {(T:number)=>number} Y  sichtbare Helligkeit Y(T) (blackbody.js)
 * @returns {{factor:number, Tseen:number}}
 */
export function starFluxFactor(D, T, Y, { beaming = true, doppler = true, fullSpectrum = false } = {}) {
  const Tseen = doppler ? apparentTemperature(T, D) : T;
  let factor = beaming ? beamingPointSource(D) : 1;
  if (fullSpectrum) factor *= bolometricToVisibleRatio(T, Y);
  else factor *= visibleSpectralFactor(T, Tseen, Y(T), Y(Tseen));
  return { factor, Tseen };
}

/** Größte Rekursionstiefe beim Halbieren (2⁴⁰ Teilschritte – wird nie erreicht). */
const EXPOSURE_MAX_DEPTH = 40;

/**
 * Belichtung EINES Sterns während des Intervalls [τ_m − t_b/2, τ_m + t_b/2]
 * (Bordzeit, die Kamera ist an Bord).
 *
 * Das Intervall wird so lange halbiert, bis der Bildpunkt in jedem
 * Teilschritt höchstens maxStepPx wandert und sich die Helligkeit um
 * höchstens 1 % ändert. In jedem Teilschritt gilt das momentane β in seiner
 * Mitte; daraus folgen die Lage (Aberration), D und die Helligkeit. Die
 * Lichtmenge eines Schritts ist
 *
 *   w = Helligkeit(D) · Δτ / t_b
 *
 * also der zeitliche Mittelwert über die Belichtung: t_b ändert die Länge
 * der Streifen, aber nicht die Helligkeit eines ruhenden Sterns. Die Summe
 * aller w ist das Gesamtlicht. Bei t_b = 0 gibt es genau einen Schritt bei
 * τ_m mit w = Helligkeit(D) – das bisherige Einzelbild.
 *
 * Die Kamera steht still (Achse in Flugrichtung), bewegt wird nur durch β(τ).
 * Weil φ' = φ ist, läuft jeder Bildpunkt auf einer Geraden durch den
 * Fluchtpunkt; der Abstand r = f·tan ψ' ändert sich monoton. Teilschritte,
 * die ganz außerhalb des Bildes (plus Rand) liegen, werden nicht weiter
 * zerlegt; ihr Licht zählt zum Gesamtlicht, wird aber nicht abgelegt.
 *
 * @param {number[]} n   Richtung zum Stern in S (Einheitsvektor)
 * @param {object}   o
 * @param {(tau:number)=>number} o.betaAt  β zur Bordzeit τ
 * @param {number}   o.tauMid      Bordzeit der Bildmitte τ_m in s
 * @param {number}   o.exposure    Belichtungszeit t_b in s (≥ 0)
 * @param {object}   o.camera      rectilinearCamera()
 * @param {(D:number)=>number} [o.brightness]  Helligkeit beim Wert D (Vorgabe D^(−2))
 * @param {number}   [o.maxStepPx=1]  größte Wanderung je Teilschritt in Pixeln
 * @param {boolean}  [o.aberration=true]
 * @param {number}   [o.marginPx=0]   Rand um das Bild, in dem Licht noch abgelegt wird
 */
export function exposeStar(n, o) {
  const cam = o.camera;
  const maxStep = o.maxStepPx ?? 1;
  const aberration = o.aberration ?? true;
  const brightness = o.brightness ?? beamingPointSource;
  const margin = o.marginPx ?? 0;
  const tb = o.exposure;
  const tau0 = o.tauMid - tb / 2;
  const tau1 = o.tauMid + tb / 2;

  // Strahl vom Fluchtpunkt aus, auf dem der Bildpunkt läuft, und sein Abstand
  // bis zum Bildrand (plus Rand). Liegt der Stern genau auf der Achse, bleibt
  // er im Fluchtpunkt.
  const perp = Math.hypot(n[0], n[1]);
  let rExit = Infinity;
  if (perp > 0) {
    const edge = (u, c, size) => (u > 0 ? (size + margin - c) / u : u < 0 ? (-margin - c) / u : Infinity);
    rExit = Math.min(edge(-n[0] / perp, cam.cx, cam.width), edge(-n[1] / perp, cam.cy, cam.height));
  }

  const at = (tau) => {
    const beta = o.betaAt(tau);
    const D = dopplerFactor(beta, n[2]);
    const seen = aberration ? aberrateDirection(beta, n) : n;
    const p = projectRectilinear(cam, seen);
    const r = p ? Math.hypot(p[0] - cam.cx, p[1] - cam.cy) : Infinity;
    return { tau, beta, D, seen, p, r, w: brightness(D) };
  };
  const inside = (p) => p[0] >= -margin && p[0] < cam.width + margin && p[1] >= -margin && p[1] < cam.height + margin;

  const steps = [];
  let total = 0;
  let stepCount = 0;
  let largestMove = 0;
  const emit = (m, fraction, move) => {
    const w = m.w * fraction;
    total += w;
    stepCount++;
    if (m.p && inside(m.p)) {
      steps.push({ x: m.p[0], y: m.p[1], w, D: m.D });
      if (move > largestMove) largestMove = move;
    }
  };
  const split = (s, e, depth) => {
    const m = at(0.5 * (s.tau + e.tau));
    const fraction = (e.tau - s.tau) / tb;
    const move = Math.abs(e.r - s.r);
    if (Math.min(s.r, e.r) > rExit) {
      emit(m, fraction, 0); // ganz außerhalb des Bildes
      return;
    }
    const steady = move <= maxStep && Math.abs(e.w - s.w) <= 0.01 * Math.max(e.w, s.w);
    if (steady || depth >= EXPOSURE_MAX_DEPTH) {
      emit(m, fraction, move);
      return;
    }
    split(s, m, depth + 1);
    split(m, e, depth + 1);
  };

  const start = at(tau0);
  const end = tb > 0 ? at(tau1) : start;
  if (tb > 0) split(start, end, 0);
  else emit(start, 1, 0);

  return {
    steps,
    total,
    stepCount,
    largestMovePx: largestMove,
    betaStart: start.beta,
    betaEnd: end.beta,
    DStart: start.D,
    DEnd: end.D,
    psiStart: Math.acos(clampCos(start.seen[2])),
    psiEnd: Math.acos(clampCos(end.seen[2])),
    pStart: start.p,
    pEnd: end.p,
    streakPx: start.p && end.p ? Math.hypot(end.p[0] - start.p[0], end.p[1] - start.p[1]) : NaN,
  };
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
