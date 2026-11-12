/*
 * Erstellt mit Claude Code (KI-Werkzeug) im Auftrag von Dominik Wittkow,
 * W-Seminar Physik, CSG Ingolstadt, 12.11.2026.
 *
 * Tests für src/optics.js (simuliertes Objektiv).
 */
import { describe, it, expect } from 'vitest';
import {
  FWHM_PER_SIGMA,
  gaussianKernel,
  gaussianPeak,
  besselJ1,
  airyIntensity,
  airyFirstMinimumPx,
  airyKernel,
  vignetteCos4,
  toneCurve,
  lensPeak,
  pixelPitch,
  SUPER35_WIDTH_M,
} from '../src/optics.js';

describe('Gauß-Punktbildfunktion', () => {
  it('Kern ist auf 1 normiert und hat die verlangte Halbwertsbreite', () => {
    for (const fwhm of [1, 2, 3.5, 8]) {
      const sigma = fwhm / FWHM_PER_SIGMA;
      const k = gaussianKernel(sigma);
      const sum = k[0] + 2 * k.slice(1).reduce((s, v) => s + v, 0);
      expect(sum).toBeCloseTo(1, 6);
      // halbe Höhe bei FWHM/2 (kontinuierliche Gaußfunktion)
      expect(Math.exp(-((fwhm / 2) ** 2) / (2 * sigma * sigma))).toBeCloseTo(0.5, 9);
    }
  });

  it('Spitzenanteil: FWHM 2 px → 0,2206 (wie im Filmvergleich), ohne Objektiv 1', () => {
    expect(gaussianPeak(2 / FWHM_PER_SIGMA)).toBeCloseTo(0.2206, 3);
    expect(lensPeak({ enabled: false })).toBe(1);
    expect(lensPeak({ enabled: true, fwhmPx: 2 })).toBeCloseTo(0.2206, 3);
  });
});

describe('Beugung an der Blende (Airy)', () => {
  it('Besselfunktion J₁: Tabellenwerte und erste Nullstelle', () => {
    expect(besselJ1(1)).toBeCloseTo(0.4400505857, 7);
    expect(besselJ1(5)).toBeCloseTo(-0.3275791376, 7);
    expect(besselJ1(10)).toBeCloseTo(0.04347274617, 6);
    expect(Math.abs(besselJ1(3.831706))).toBeLessThan(1e-6);
  });

  it('Airy-Muster: Maximum 1, erstes Minimum bei x = 3,8317, erster Ring ≈ 1,75 %', () => {
    expect(airyIntensity(0)).toBe(1);
    expect(airyIntensity(3.8317)).toBeLessThan(1e-8);
    let best = 0;
    for (let x = 4; x < 7; x += 0.001) best = Math.max(best, airyIntensity(x));
    expect(best).toBeCloseTo(0.0175, 3);
  });

  it('erstes Minimum r = 1,22·λ·N; bei Filmkamera und üblicher Blende kleiner als 1 Pixel', () => {
    const pitch = pixelPitch(SUPER35_WIDTH_M, 2272);
    expect(airyFirstMinimumPx(550e-9, 2.8, pitch)).toBeLessThan(1);
    expect(airyFirstMinimumPx(550e-9, 22, 5e-6)).toBeCloseTo((1.21967 * 550e-9 * 22) / 5e-6, 4);
    expect(airyKernel(550e-9, 2.8, pitch).radius).toBe(0);
  });

  it('Kern ist normiert und rotationssymmetrisch', () => {
    const { radius, weights } = airyKernel(550e-9, 32, 5e-6);
    expect(radius).toBeGreaterThan(2);
    const size = 2 * radius + 1;
    expect(weights.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 5);
    const at = (dx, dy) => weights[(dy + radius) * size + (dx + radius)];
    expect(at(2, 0)).toBeCloseTo(at(0, 2), 7);
    expect(at(-1, 1)).toBeCloseTo(at(1, -1), 7);
    expect(at(0, 0)).toBeGreaterThan(at(1, 0));
  });
});

describe('Randabdunklung und Tonkurve', () => {
  it('cos⁴-Gesetz', () => {
    expect(vignetteCos4(0)).toBe(1);
    expect(vignetteCos4(Math.tan(Math.PI / 6))).toBeCloseTo(Math.cos(Math.PI / 6) ** 4, 12);
  });

  it('Tonkurven: linear begrenzt, Film-Schulter mit Steigung 1 bei 0 und Grenzwert 1', () => {
    expect(toneCurve(0.5)).toBe(0.5);
    expect(toneCurve(3)).toBe(1);
    expect(toneCurve(1e-4, 'film')).toBeCloseTo(1e-4, 7);
    expect(toneCurve(50, 'film')).toBeCloseTo(1, 12);
    expect(toneCurve(1, 'film')).toBeCloseTo(1 - Math.exp(-1), 12);
  });
});
