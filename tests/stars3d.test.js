/*
 * Erstellt mit Claude Code (KI-Werkzeug) im Auftrag von Dominik Wittkow,
 * W-Seminar Physik, CSG Ingolstadt, 24.09.2026.
 *
 * Tests für den 3D-Modus: Sternfeld-Zellen (src/stars3d.js) und die
 * Flugformeln in src/physics.js.
 */
import { describe, it, expect } from 'vitest';
import {
  generateCell,
  cellSeed,
  cellIndex,
  neededCells,
  mainSequenceAbsMag,
  REAL_DENSITY_PER_LY3,
} from '../src/stars3d.js';
import {
  coordinateTimeStep,
  distanceStepLy,
  fluxFromAbsoluteMagnitude,
  lorentzGamma,
  LY_PER_PC,
} from '../src/physics.js';

describe('Flugformeln', () => {
  it('dt = γ·dτ und ds = β·c·dt', () => {
    expect(coordinateTimeStep(0.9, 1)).toBeCloseTo(lorentzGamma(0.9), 12);
    expect(coordinateTimeStep(0, 5)).toBe(5);
    // 1 Jahr Bordzeit bei β = 0,99: in S 7,09 Jahre, Strecke 7,02 Lj
    const dt = coordinateTimeStep(0.99, 1);
    expect(distanceStepLy(0.99, dt)).toBeCloseTo(0.99 * 7.0888, 3);
  });

  it('Entfernungsmodul: M = 0 in 10 pc ergibt 0 mag, doppelte Entfernung ¼ der Bestrahlungsstärke', () => {
    const tenPc = 10 * LY_PER_PC;
    expect(fluxFromAbsoluteMagnitude(0, tenPc)).toBeCloseTo(1, 12);
    expect(fluxFromAbsoluteMagnitude(0, 2 * tenPc)).toBeCloseTo(0.25, 12);
    // Sonne (M = 4,8) in 1 pc: m = 4,8 − 5 = −0,2 mag
    expect(-2.5 * Math.log10(fluxFromAbsoluteMagnitude(4.8, LY_PER_PC))).toBeCloseTo(-0.2, 9);
  });
});

describe('Sternfeld-Zellen', () => {
  it('dieselbe Zelle liefert immer dieselben Sterne, Nachbarzellen andere', () => {
    const a = generateCell(3, -2, 7, 50, REAL_DENSITY_PER_LY3);
    const b = generateCell(3, -2, 7, 50, REAL_DENSITY_PER_LY3);
    const c = generateCell(3, -2, 8, 50, REAL_DENSITY_PER_LY3);
    expect(a.count).toBe(b.count);
    expect(Array.from(a.positions.slice(0, 30))).toEqual(Array.from(b.positions.slice(0, 30)));
    expect(cellSeed(3, -2, 7)).not.toBe(cellSeed(3, -2, 8));
    expect(Array.from(a.positions.slice(0, 3))).not.toEqual(Array.from(c.positions.slice(0, 3)));
  });

  it('Anzahl ≈ ρ·L³, Positionen innerhalb der Zelle', () => {
    let total = 0;
    for (let i = 0; i < 20; i++) {
      const cell = generateCell(i, 0, 0, 50, REAL_DENSITY_PER_LY3);
      total += cell.count;
      for (const v of cell.positions) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(50);
      }
    }
    const expected = 20 * REAL_DENSITY_PER_LY3 * 50 ** 3; // 10 000
    expect(Math.abs(total - expected) / expected).toBeLessThan(0.05);
  });

  it('Leuchtkraft: Sonne ≈ 4,8 mag, heißere Sterne heller, Riesen selten', () => {
    expect(mainSequenceAbsMag(5770)).toBeCloseTo(4.8, 6);
    expect(mainSequenceAbsMag(9700)).toBeLessThan(mainSequenceAbsMag(5770));
    expect(mainSequenceAbsMag(3000)).toBeGreaterThan(mainSequenceAbsMag(5770));
    const cell = generateCell(1, 1, 1, 100, REAL_DENSITY_PER_LY3);
    // die meisten Sterne sind lichtschwache M-Zwerge (M > 8)
    let faint = 0;
    for (const f of cell.absFluxes) if (-2.5 * Math.log10(f) > 8) faint++;
    expect(faint / cell.count).toBeGreaterThan(0.6);
  });

  it('Zellindex und Nachbarschaft', () => {
    expect(cellIndex(-0.1, 100)).toBe(-1);
    expect(cellIndex(250, 100)).toBe(2);
    const cells = neededCells([5, 5, 199], 100, 1);
    expect(cells.length).toBe(27);
    expect(cells).toContainEqual([0, 0, 1]);
    expect(cells).toContainEqual([1, 1, 2]);
  });
});
