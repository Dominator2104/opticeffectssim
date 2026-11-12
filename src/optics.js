/*
 * Erstellt mit Claude Code (KI-Werkzeug) im Auftrag von Dominik Wittkow,
 * W-Seminar Physik, CSG Ingolstadt, 12.11.2026.
 *
 * optics.js — das simulierte Objektiv als reine Funktionen (keine Abhängigkeit
 * zu three.js oder zum Browser; getestet in tests/optics.test.js). Der
 * Renderer (render.js) übersetzt diese Kerne nur in Shader-Durchgänge.
 *
 * Bausteine, jeder einzeln abschaltbar:
 *   1. Beugung an der kreisrunden Blende (Airy-Scheibchen)
 *   2. Unschärfe des Objektivs als Gauß-Punktbildfunktion
 *   3. Streulicht: schwacher, breiter Lichthof (zweite Gaußfunktion)
 *   4. Randabdunklung nach dem cos⁴-Gesetz
 *   5. Tonkurve: linear mit harter Grenze oder weiche „Film-Schulter“
 * Alle Faltungen erhalten die Lichtmenge (Kerne auf Summe 1 normiert).
 */

/** Halbwertsbreite → Standardabweichung: FWHM = 2·√(2 ln 2)·σ ≈ 2,3548·σ. */
export const FWHM_PER_SIGMA = 2 * Math.sqrt(2 * Math.LN2);

/** Bezugshöhe für Längen in Pixeln: Angaben gelten für ein Bild mit 1080 Zeilen. */
export const REFERENCE_HEIGHT_PX = 1080;

/**
 * Eindimensionaler Gaußkern, abgetastet in den Pixelmitten, Radius ⌈3σ⌉,
 * auf Summe 1 normiert. Rückgabe: Gewichte für die Abstände 0, 1, …, R.
 * (Der zweidimensionale Kern ist das Produkt zweier solcher Kerne.)
 */
export function gaussianKernel(sigma) {
  if (!(sigma > 0)) return Float32Array.of(1);
  const R = Math.ceil(3 * sigma);
  const w = new Float64Array(R + 1);
  let sum = 0;
  for (let i = 0; i <= R; i++) {
    w[i] = Math.exp(-(i * i) / (2 * sigma * sigma));
    sum += i === 0 ? w[i] : 2 * w[i];
  }
  return Float32Array.from(w, (v) => v / sum);
}

/** Anteil des Lichts im mittleren Pixel bei zweidimensionaler Gaußfaltung (Punkt in der Pixelmitte). */
export function gaussianPeak(sigma) {
  const k = gaussianKernel(sigma);
  return k[0] * k[0];
}

/**
 * Besselfunktion erster Art, Ordnung 1 (rationale Näherung nach Numerical
 * Recipes, Abschnitt 6.5; relative Genauigkeit besser als 1e-7).
 */
export function besselJ1(x) {
  const ax = Math.abs(x);
  if (ax < 8) {
    const y = x * x;
    const a = x * (72362614232.0 + y * (-7895059235.0 + y * (242396853.1 + y * (-2972611.439 + y * (15704.4826 + y * -30.16036606)))));
    const b = 144725228442.0 + y * (2300535178.0 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y))));
    return a / b;
  }
  const z = 8 / ax;
  const y = z * z;
  const xx = ax - 2.356194491;
  const p = 1 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * -0.240337019e-6)));
  const q = 0.04687499995 + y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)));
  const ans = Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * p - z * Math.sin(xx) * q);
  return x < 0 ? -ans : ans;
}

/**
 * Airy-Muster der kreisrunden Blende: I(x)/I(0) = (2·J₁(x)/x)²,
 * x = π·r / (λ·N) (r: Abstand in der Bildebene, N: Blendenzahl).
 * Erstes Minimum bei x = 3,8317, also r = 1,22·λ·N.
 */
export function airyIntensity(x) {
  if (Math.abs(x) < 1e-8) return 1;
  const v = (2 * besselJ1(x)) / x;
  return v * v;
}

/** Radius des ersten dunklen Rings in Pixeln: r = 1,22·λ·N / Pixelabstand. */
export function airyFirstMinimumPx(lambdaM, fNumber, pixelPitchM) {
  return (1.21966989 * lambdaM * fNumber) / pixelPitchM;
}

/**
 * Zweidimensionaler Airy-Kern für eine Wellenlänge, Radius höchstens maxRadius
 * Pixel, auf Summe 1 normiert. Abgetastet mit 4 × 4 Punkten je Pixel (über die
 * Pixelfläche gemittelt). Ist das Scheibchen kleiner als ein Pixel, liefert die
 * Funktion den Radius 0 (Kern = 1, keine Wirkung).
 *
 * @returns {{radius:number, weights:Float32Array}}  weights[(dy+R)·(2R+1) + (dx+R)]
 */
export function airyKernel(lambdaM, fNumber, pixelPitchM, maxRadius = 8) {
  const r1 = airyFirstMinimumPx(lambdaM, fNumber, pixelPitchM);
  if (!(r1 >= 0.5)) return { radius: 0, weights: Float32Array.of(1) };
  const R = Math.min(maxRadius, Math.ceil(3 * r1));
  const size = 2 * R + 1;
  const w = new Float64Array(size * size);
  const scale = Math.PI * pixelPitchM / (lambdaM * fNumber); // x pro Pixel
  let sum = 0;
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      let v = 0;
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const px = dx - 0.375 + 0.25 * sx;
          const py = dy - 0.375 + 0.25 * sy;
          v += airyIntensity(scale * Math.hypot(px, py));
        }
      }
      w[(dy + R) * size + (dx + R)] = v;
      sum += v;
    }
  }
  return { radius: R, weights: Float32Array.from(w, (v) => v / sum) };
}

/** Wellenlängen, mit denen die drei Farbkanäle für die Beugung gerechnet werden (nm). */
export const CHANNEL_WAVELENGTHS_NM = [610, 550, 465];

/**
 * Pixelabstand auf dem Sensor: Sensorbreite / Bildbreite in Pixeln.
 * Vorgabe Super 35 (Filmkamera): 24,89 mm Bildbreite.
 */
export const SUPER35_WIDTH_M = 24.89e-3;
export function pixelPitch(sensorWidthM, imageWidthPx) {
  return sensorWidthM / imageWidthPx;
}

/**
 * Randabdunklung (natürliche Vignettierung) nach dem cos⁴-Gesetz:
 *   E(α)/E(0) = cos⁴ α = 1 / (1 + tan²α)²,
 * α = Winkel zur optischen Achse.
 */
export function vignetteCos4(tanAlpha) {
  const c2 = 1 / (1 + tanAlpha * tanAlpha);
  return c2 * c2;
}

/**
 * Tonkurven (je Farbkanal, Eingang = lineares Licht, 1 = Weiß):
 *   'linear': v = min(1, x)              (Sensor, harte Sättigung)
 *   'film':   v = 1 − e^(−x)              (weiche Schulter wie Filmmaterial;
 *                                          Steigung 1 bei x = 0, nähert sich 1)
 */
export function toneCurve(x, kind = 'linear') {
  if (kind === 'film') return 1 - Math.exp(-Math.max(0, x));
  return Math.min(1, Math.max(0, x));
}

/**
 * Anteil des Lichts eines Sterns im hellsten Pixel nach Objektiv (Gauß-Kern,
 * Streulicht-Anteil f mit eigenem Kern), Stern in einer Pixelmitte. Dient zur
 * Normierung im Kamera-Modell: Mit Belichtungsfaktor 1 erreicht ein Stern der
 * Helligkeit „Belichtung“ im hellsten Pixel gerade Weiß.
 */
export function lensPeak({ enabled, fwhmPx, haloFraction = 0, haloFwhmPx = 0 }) {
  if (!enabled) return 1;
  const core = gaussianPeak(fwhmPx / FWHM_PER_SIGMA);
  const halo = haloFraction > 0 ? gaussianPeak(haloFwhmPx / FWHM_PER_SIGMA) : 0;
  return (1 - haloFraction) * core + haloFraction * halo;
}
