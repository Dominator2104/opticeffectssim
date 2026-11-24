/*
 * Erstellt mit Claude Code (KI-Werkzeug) im Auftrag von Dominik Wittkow,
 * W-Seminar Physik, CSG Ingolstadt, 24.11.2026.
 *
 * Tests für src/timeline.js (Zeitablauf des Videos, Zeitraffer im Nachlauf).
 */
import { describe, it, expect } from 'vitest';
import { timeLapseScale, timeLapseProperTime, videoProperTime } from '../src/timeline.js';

const MONTH = 31557600 / 12;

describe('Zeitraffer im Nachlauf', () => {
  it('Maßstab beginnt bei s₀, endet bei s₁, steigt dazwischen monoton', () => {
    expect(timeLapseScale(0, 1, MONTH, 1)).toBeCloseTo(1, 12);
    expect(timeLapseScale(1, 1, MONTH, 1)).toBeCloseTo(MONTH, 6);
    expect(timeLapseScale(5, 1, MONTH, 1)).toBeCloseTo(MONTH, 6);
    let prev = 0;
    for (let u = 0; u <= 1; u += 0.01) {
      const s = timeLapseScale(u, 1, MONTH, 1);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
    // logarithmische Mitte: geometrisches Mittel
    expect(timeLapseScale(0.5, 1, MONTH, 1)).toBeCloseTo(Math.sqrt(MONTH), 6);
  });

  it('Bordzeit = Integral des Maßstabs; ohne Zeitraffer s₀·u, mit Sprung s₁·u', () => {
    expect(timeLapseProperTime(3, 2, 2, 1)).toBeCloseTo(6, 9);
    expect(timeLapseProperTime(3, 1, MONTH, 0)).toBeCloseTo(3 * MONTH, 3);
    // Ableitung der Bordzeit = Maßstab (Stichproben im Übergang)
    for (const u of [0.1, 0.4, 0.7, 0.95]) {
      const h = 1e-4;
      const d = (timeLapseProperTime(u + h, 1, MONTH, 1) - timeLapseProperTime(u - h, 1, MONTH, 1)) / (2 * h);
      expect(d / timeLapseScale(u, 1, MONTH, 1)).toBeCloseTo(1, 4);
    }
    // nach dem Übergang wächst sie genau mit s₁
    const a = timeLapseProperTime(2, 1, MONTH, 1);
    const b = timeLapseProperTime(3, 1, MONTH, 1);
    expect((b - a) / MONTH).toBeCloseTo(1, 9);
  });
});

describe('Bordzeit des ganzen Videos', () => {
  const o = { pre: 1, phaseTau: 3, scale: 1, postScale: MONTH, ramp: 1 };

  it('Vorlauf und Phase in Echtzeit, Nachlauf im Zeitraffer, stetig', () => {
    expect(videoProperTime(0, o)).toBe(0);
    expect(videoProperTime(1, o)).toBe(1);
    expect(videoProperTime(4, o)).toBe(4); // Ende der Phase
    expect(videoProperTime(4 + 1e-6, o) - 4).toBeLessThan(1e-5);
    expect(videoProperTime(6, o)).toBeCloseTo(4 + timeLapseProperTime(2, 1, MONTH, 1), 6);
  });

  it('ohne Zeitraffer wie bisher: τ = w·s₀', () => {
    const p = { pre: 0.5, phaseTau: 3, scale: 2 };
    for (const w of [0, 1, 2.5, 7]) expect(videoProperTime(w, p)).toBeCloseTo(w * 2, 12);
  });
});
