/*
 * Erstellt mit Claude Code (KI-Werkzeug) im Auftrag von Dominik Wittkow,
 * W-Seminar Physik, CSG Ingolstadt, 24.09.2026.
 *
 * Tests für src/blackbody.js und die Helligkeitsformeln "nur sichtbar" in
 * src/physics.js (Vitest).
 */
import { describe, it, expect } from 'vitest';
import {
  planck,
  blackbodyXYZ,
  chromaticity,
  blackbodyColor,
  visibleLuminance,
  buildBlackbodyTable,
  tableTemperature,
  TABLE_SIZE,
  TABLE_T_MIN,
  TABLE_T_MAX,
} from '../src/blackbody.js';
import {
  dopplerFactorForward,
  dopplerFactorBackward,
  apparentTemperature,
  beamingPointSource,
  beamingPointSourceVisible,
  visibleSpectralFactor,
  wienPeakWavelengthNm,
  peakBand,
} from '../src/physics.js';

describe('Planck-Spektrum und CIE-Integration', () => {
  it('Maximum des Planck-Spektrums liegt bei λ_max = b/T (Wien)', () => {
    for (const T of [3000, 5800, 10000]) {
      const lmax = wienPeakWavelengthNm(T);
      expect(planck(lmax, T)).toBeGreaterThan(planck(lmax * 0.98, T));
      expect(planck(lmax, T)).toBeGreaterThan(planck(lmax * 1.02, T));
    }
    expect(wienPeakWavelengthNm(5800)).toBeCloseTo(499.6, 1);
  });

  it('Farbort von Normlichtart A (Schwarzkörper 2856 K): x = 0,4476, y = 0,4074', () => {
    const { x, y } = chromaticity(blackbodyXYZ(2856));
    expect(x).toBeCloseTo(0.4476, 3);
    expect(y).toBeCloseTo(0.4074, 3);
  });

  it('Farbort auf der Planck-Kurve bei 6500 K: x ≈ 0,3135, y ≈ 0,3236', () => {
    const { x, y } = chromaticity(blackbodyXYZ(6500));
    expect(x).toBeCloseTo(0.3135, 3);
    expect(y).toBeCloseTo(0.3236, 3);
  });

  it('Farbe: kühl = rötlich, heiß = bläulich, größter Kanal = 1', () => {
    const cool = blackbodyColor(3000);
    const hot = blackbodyColor(30000);
    expect(cool.r).toBeCloseTo(1, 12);
    expect(cool.b).toBeLessThan(cool.g);
    expect(hot.b).toBeCloseTo(1, 12);
    expect(hot.r).toBeLessThan(hot.g);
    for (const T of [500, 1000, 5800, 40000, 1e6]) {
      const c = blackbodyColor(T);
      expect(Math.max(c.r, c.g, c.b)).toBeCloseTo(1, 12);
      expect(Math.min(c.r, c.g, c.b)).toBeGreaterThanOrEqual(0);
    }
  });

  it('Farbe konvergiert für T → ∞ (Rayleigh-Jeans): 10⁶ K und 10⁷ K fast gleich', () => {
    const a = blackbodyColor(1e6);
    const b = blackbodyColor(1e7);
    expect(Math.abs(a.r - b.r)).toBeLessThan(0.01);
    expect(Math.abs(a.g - b.g)).toBeLessThan(0.01);
  });

  it('Tabelle: richtige Länge, Endpunkte, log10 Y monoton steigend', () => {
    const t = buildBlackbodyTable();
    expect(t.length).toBe(4 * TABLE_SIZE);
    expect(tableTemperature(0)).toBeCloseTo(TABLE_T_MIN, 6);
    expect(tableTemperature(TABLE_SIZE - 1) / TABLE_T_MAX).toBeCloseTo(1, 12);
    for (let i = 1; i < TABLE_SIZE; i++) expect(t[4 * i + 3]).toBeGreaterThan(t[4 * (i - 1) + 3]);
  });
});

describe('Helligkeit nur im Sichtbaren', () => {
  it('Probe: mit vollständigem Spektrum (Y ∝ T⁴) ergibt sich genau D^(−2)', () => {
    const T = 5800;
    for (const beta of [0.5, 0.9, 0.99]) {
      for (const D of [dopplerFactorForward(beta), dopplerFactorBackward(beta)]) {
        const Tp = apparentTemperature(T, D);
        const bolometric = beamingPointSourceVisible(D, T ** 4, Tp ** 4);
        expect(bolometric / beamingPointSource(D)).toBeCloseTo(1, 10);
      }
    }
  });

  it('Sonne (5 800 K) bei β = 0,9 nach vorn: sichtbar heller, aber weniger als D^(−2) = 19', () => {
    const D = dopplerFactorForward(0.9);
    const f = beamingPointSourceVisible(D, visibleLuminance(5800), visibleLuminance(5800 / D));
    expect(f).toBeGreaterThan(1);
    expect(f).toBeLessThan(beamingPointSource(D));
  });

  it('nach hinten (Rotverschiebung) fällt die sichtbare Helligkeit stärker als bolometrisch', () => {
    const D = dopplerFactorBackward(0.9);
    const f = beamingPointSourceVisible(D, visibleLuminance(5800), visibleLuminance(5800 / D));
    expect(f).toBeLessThan(beamingPointSource(D));
  });

  it('Zerlegung: D^(−2) · Spektralfaktor = D² · Y(T\')/Y(T)', () => {
    for (const beta of [0.3, 0.9, 0.999]) {
      for (const D of [dopplerFactorForward(beta), dopplerFactorBackward(beta)]) {
        const T = 4000;
        const Tp = apparentTemperature(T, D);
        const Y = visibleLuminance(T);
        const Yp = visibleLuminance(Tp);
        const product = beamingPointSource(D) * visibleSpectralFactor(T, Tp, Y, Yp);
        expect(product / beamingPointSourceVisible(D, Y, Yp)).toBeCloseTo(1, 10);
      }
    }
    expect(visibleSpectralFactor(5800, 5800, 3, 3)).toBe(1);
  });

  it('Lage des Maximums: Sonne sichtbar, 2 500 K im IR, 30 000 K im UV', () => {
    expect(peakBand(5800)).toBe('sichtbar');
    expect(peakBand(2500)).toBe('ir');
    expect(peakBand(30000)).toBe('uv');
  });
});
