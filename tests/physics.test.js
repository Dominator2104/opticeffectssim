/*
 * Erstellt mit Claude Code (KI-Werkzeug) im Auftrag von Dominik Wittkow,
 * W-Seminar Physik, CSG Ingolstadt, 24.09.2026.
 *
 * Tests für src/physics.js (Vitest). Aufruf: npm test
 *
 * Teil 1: Sollwerte bei β = 0,9 aus dem Auftrag.
 * Teil 2: strukturelle Eigenschaften der Aberration.
 * Teil 3: Gleichwertigkeit von θ- und ψ-Form.
 * Teil 4: weitere Selbsttests (Raumwinkel, Kugel bleibt Kreis, Beschleunigung).
 */
import { describe, it, expect } from 'vitest';
import {
  C,
  rad,
  deg,
  lorentzGamma,
  psiFromTheta,
  thetaFromPsi,
  aberrationCosPsi,
  aberrationPsi,
  inverseAberrationCosPsi,
  aberrationCosTheta,
  aberrateDirection,
  dopplerFactor,
  dopplerFactorTheta,
  dopplerFactorFromPrime,
  dopplerFactorForward,
  dopplerFactorBackward,
  wavelengthShiftPercent,
  apparentTemperature,
  beamingPointSource,
  beamingExtended,
  solidAngleRatio,
  psiPrimeOfSideStar,
  forwardConeSkyFraction,
  betaConstantProperAcceleration,
  timeToReachBeta,
  properTimeConstantAcceleration,
  betaLinear,
  betaSmooth,
  accelerationBeta,
  properTimeNumeric,
  properVelocity,
  betaFromProperVelocity,
  accelerationDuration,
  accelerationFromDuration,
  betaConstantBetween,
  psiFromPsiPrime,
  terrellRotationAngle,
  terrellLengthFactor,
} from '../src/physics.js';

/** Reproduzierbarer Zufallsgenerator (mulberry32), damit Tests deterministisch sind. */
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BETAS = [0.1, 0.5, 0.9, 0.99, 0.999];

/* ------------------------------------------------------------------------- */
describe('Sollwerte bei β = 0,9', () => {
  const beta = 0.9;

  it('γ = 2,294', () => {
    expect(lorentzGamma(beta)).toBeCloseTo(2.294, 3);
  });

  it('D nach vorn = 0,2294', () => {
    expect(dopplerFactorForward(beta)).toBeCloseTo(0.2294, 4);
    // allgemeine Formel mit ψ = 0 muss dasselbe liefern
    expect(dopplerFactor(beta, Math.cos(0))).toBeCloseTo(0.2294, 4);
  });

  it('ψ\' für ψ = 90° ist 25,84°', () => {
    expect(deg(aberrationPsi(beta, rad(90)))).toBeCloseTo(25.84, 2);
    expect(deg(psiPrimeOfSideStar(beta))).toBeCloseTo(25.84, 2);
  });

  it('Anteil des Himmels (1−β)/2 = 5,0 %', () => {
    expect(forwardConeSkyFraction(beta) * 100).toBeCloseTo(5.0, 6);
  });

  it('D^(−2) = 19,0', () => {
    expect(beamingPointSource(dopplerFactorForward(beta))).toBeCloseTo(19.0, 6);
  });

  it('D^(−4) = 361', () => {
    expect(beamingExtended(dopplerFactorForward(beta))).toBeCloseTo(361, 6);
  });

  it('nach vorn Blauverschiebung, nach hinten Rotverschiebung', () => {
    expect(dopplerFactorForward(beta)).toBeLessThan(1);
    expect(dopplerFactorBackward(beta)).toBeGreaterThan(1);
    expect(wavelengthShiftPercent(dopplerFactorForward(beta))).toBeCloseTo(-77.06, 2);
    // 5 800-K-Stern nach vorn erscheint mit T' = T/D ≈ 25 280 K
    expect(apparentTemperature(5800, dopplerFactorForward(beta))).toBeCloseTo(25282, -1);
  });
});

/* ------------------------------------------------------------------------- */
describe('Aberration: strukturelle Eigenschaften', () => {
  it('β = 0 lässt jede Richtung unverändert', () => {
    const rnd = mulberry32(1);
    for (let i = 0; i < 100; i++) {
      const psi = Math.PI * rnd();
      expect(aberrationPsi(0, psi)).toBeCloseTo(psi, 12);
      const phi = 2 * Math.PI * rnd();
      const n = [Math.sin(psi) * Math.cos(phi), Math.sin(psi) * Math.sin(phi), Math.cos(psi)];
      const n2 = aberrateDirection(0, n);
      for (let k = 0; k < 3; k++) expect(n2[k]).toBeCloseTo(n[k], 12);
    }
  });

  it('ψ = 0° und ψ = 180° sind Fixpunkte', () => {
    for (const beta of BETAS) {
      expect(aberrationPsi(beta, 0)).toBeCloseTo(0, 6);
      expect(aberrationPsi(beta, Math.PI)).toBeCloseTo(Math.PI, 6);
      expect(aberrateDirection(beta, [0, 0, 1])).toEqual([0, 0, 1]);
      expect(aberrateDirection(beta, [0, 0, -1])).toEqual([0, 0, -1]);
    }
  });

  it('ψ\' < ψ für 100 zufällige Winkel bei mehreren β', () => {
    const rnd = mulberry32(42);
    for (const beta of BETAS) {
      for (let i = 0; i < 100; i++) {
        // offenes Intervall (0°, 180°), die Fixpunkte sind oben getestet
        const psi = rad(0.01 + 179.98 * rnd());
        expect(aberrationPsi(beta, psi)).toBeLessThan(psi);
      }
    }
  });

  it('Umkehrung der Aberration liefert den Ausgangswinkel', () => {
    const rnd = mulberry32(7);
    for (const beta of BETAS) {
      for (let i = 0; i < 100; i++) {
        const cosPsi = 2 * rnd() - 1;
        const back = inverseAberrationCosPsi(beta, aberrationCosPsi(beta, cosPsi));
        expect(back).toBeCloseTo(cosPsi, 9);
      }
    }
  });

  it('Vektorform: Einheitslänge, Azimut φ erhalten, gleicher Winkel wie Winkelform', () => {
    const rnd = mulberry32(3);
    for (const beta of BETAS) {
      for (let i = 0; i < 100; i++) {
        const cosPsi = 2 * rnd() - 1;
        const sinPsi = Math.sqrt(1 - cosPsi * cosPsi);
        const phi = 2 * Math.PI * rnd();
        const n = [sinPsi * Math.cos(phi), sinPsi * Math.sin(phi), cosPsi];
        const [x, y, z] = aberrateDirection(beta, n);
        expect(Math.hypot(x, y, z)).toBeCloseTo(1, 12);
        expect(z).toBeCloseTo(aberrationCosPsi(beta, cosPsi), 12);
        if (sinPsi > 1e-6 && Math.hypot(x, y) > 1e-9) {
          // gleicher Azimut: Kreuzprodukt der Querkomponenten verschwindet, Skalarprodukt positiv
          expect(x * n[1] - y * n[0]).toBeCloseTo(0, 12);
          expect(x * n[0] + y * n[1]).toBeGreaterThan(0);
        }
      }
    }
  });
});

/* ------------------------------------------------------------------------- */
describe('θ-Form und ψ-Form sind gleichwertig', () => {
  it('psiFromTheta und thetaFromPsi sind zueinander invers, cos ψ = −cos θ', () => {
    const rnd = mulberry32(11);
    for (let i = 0; i < 100; i++) {
      const theta = Math.PI * rnd();
      expect(thetaFromPsi(psiFromTheta(theta))).toBeCloseTo(theta, 12);
      expect(Math.cos(psiFromTheta(theta))).toBeCloseTo(-Math.cos(theta), 12);
    }
  });

  it('Aberration: θ-Form ergibt dasselbe ψ\' wie ψ-Form', () => {
    const rnd = mulberry32(12);
    for (const beta of BETAS) {
      for (let i = 0; i < 100; i++) {
        const theta = Math.PI * rnd();
        const psi = psiFromTheta(theta);
        const cosThetaPrime = aberrationCosTheta(beta, Math.cos(theta));
        const cosPsiPrime = aberrationCosPsi(beta, Math.cos(psi));
        // ψ' = 180° − θ'  ⇔  cos ψ' = −cos θ'
        expect(cosPsiPrime).toBeCloseTo(-cosThetaPrime, 10);
      }
    }
  });

  it('Doppler: D aus θ-Form = D aus ψ-Form = D aus ψ\' (S\')', () => {
    const rnd = mulberry32(13);
    for (const beta of BETAS) {
      for (let i = 0; i < 100; i++) {
        const theta = Math.PI * rnd();
        const cosPsi = Math.cos(psiFromTheta(theta));
        const Dtheta = dopplerFactorTheta(beta, Math.cos(theta));
        const Dpsi = dopplerFactor(beta, cosPsi);
        const Dprime = dopplerFactorFromPrime(beta, aberrationCosPsi(beta, cosPsi));
        expect(Dpsi / Dtheta).toBeCloseTo(1, 10);
        expect(Dprime / Dpsi).toBeCloseTo(1, 10);
      }
    }
  });

  it('Sonderfälle: D(ψ=0) = √((1−β)/(1+β)), D(ψ=180°) = √((1+β)/(1−β))', () => {
    for (const beta of BETAS) {
      expect(dopplerFactor(beta, 1) / dopplerFactorForward(beta)).toBeCloseTo(1, 12);
      expect(dopplerFactor(beta, -1) / dopplerFactorBackward(beta)).toBeCloseTo(1, 12);
    }
  });
});

/* ------------------------------------------------------------------------- */
describe('Weitere Selbsttests', () => {
  it('dΩ\'/dΩ = D² (Sterndichte n\'/n = D^(−2)), numerisch nachgeprüft', () => {
    const h = 1e-6;
    for (const beta of BETAS) {
      for (const cosPsi of [-0.9, -0.5, 0, 0.5, 0.9]) {
        const numeric =
          (aberrationCosPsi(beta, cosPsi + h) - aberrationCosPsi(beta, cosPsi - h)) / (2 * h);
        expect(numeric / solidAngleRatio(beta, cosPsi)).toBeCloseTo(1, 6);
      }
    }
  });

  it('Kugel bleibt kreisrund: Umrisskreis bleibt nach der Aberration ein Kreis', () => {
    // Der Umriss einer Kugel ist von jedem Punkt aus ein Kreis auf der
    // Himmelskugel (Kegel der Tangentialstrahlen). Punkte auf der Einheitskugel
    // liegen genau dann auf einem Kreis, wenn sie in einer Ebene liegen.
    // Geprüft wird: Nach der Aberration liegen alle Umrisspunkte wieder in
    // einer Ebene (Terrell 1959; Boas 1961).
    const cases = [
      { psi: 90, phi: 0, alpha: 10 },
      { psi: 60, phi: 45, alpha: 5 },
      { psi: 120, phi: 200, alpha: 20 },
      { psi: 170, phi: 90, alpha: 8 },
    ];
    for (const beta of BETAS) {
      for (const { psi, phi, alpha } of cases) {
        const p = rad(psi), f = rad(phi), a = rad(alpha);
        const c = [Math.sin(p) * Math.cos(f), Math.sin(p) * Math.sin(f), Math.cos(p)];
        // Orthonormalbasis e1, e2 senkrecht zu c
        const e1 = [Math.cos(p) * Math.cos(f), Math.cos(p) * Math.sin(f), -Math.sin(p)];
        const e2 = [-Math.sin(f), Math.cos(f), 0];
        const pts = [];
        for (let k = 0; k < 36; k++) {
          const t = (2 * Math.PI * k) / 36;
          const n = [0, 1, 2].map(
            (i) => Math.cos(a) * c[i] + Math.sin(a) * (Math.cos(t) * e1[i] + Math.sin(t) * e2[i]),
          );
          pts.push(aberrateDirection(beta, n));
        }
        // Ebene durch drei weit auseinanderliegende Punkte
        const [A, B, Cp] = [pts[0], pts[12], pts[24]];
        const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
        const v = [Cp[0] - A[0], Cp[1] - A[1], Cp[2] - A[2]];
        const nrm = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const len = Math.hypot(...nrm);
        for (const P of pts) {
          const dist = ((P[0] - A[0]) * nrm[0] + (P[1] - A[1]) * nrm[1] + (P[2] - A[2]) * nrm[2]) / len;
          expect(Math.abs(dist)).toBeLessThan(1e-9);
        }
      }
    }
  });

  it('konstante Eigenbeschleunigung: β < 1, β·γ = a·t/c, Umkehrung stimmt', () => {
    const a = 9.81;
    expect(betaConstantProperAcceleration(a, 0)).toBe(0);
    for (const t of [1e3, 1e6, 3.15e7, 1e9, 1e12]) {
      const beta = betaConstantProperAcceleration(a, t);
      expect(beta).toBeGreaterThan(0);
      expect(beta).toBeLessThan(1);
      if (beta < 0.999999) {
        expect((beta * lorentzGamma(beta)) / ((a * t) / C)).toBeCloseTo(1, 9);
      }
    }
    for (const beta of BETAS) {
      expect(betaConstantProperAcceleration(a, timeToReachBeta(a, beta))).toBeCloseTo(beta, 12);
    }
    // bei 1 g dauert es in S etwa 2,1 Jahre bis β = 0,9
    expect(timeToReachBeta(9.81, 0.9) / (365.25 * 86400)).toBeCloseTo(2.0, 0);
    // Eigenzeit ist kürzer als die Zeit in S
    expect(properTimeConstantAcceleration(a, 1e8)).toBeLessThan(1e8);
  });

  it('lineare und weiche Kurve: Anfang β₀, Ende β₁, monoton (auch beim Bremsen)', () => {
    for (const f of [betaLinear, betaSmooth]) {
      for (const [b0, b1] of [[0, 0.9], [0.3, 0.99], [0.95, 0.2]]) {
        expect(f(0, 10, b0, b1)).toBeCloseTo(b0, 12);
        expect(f(10, 10, b0, b1)).toBeCloseTo(b1, 12);
        expect(f(20, 10, b0, b1)).toBeCloseTo(b1, 12);
        let prev = f(0, 10, b0, b1);
        for (let t = 0.5; t <= 10; t += 0.5) {
          const b = f(t, 10, b0, b1);
          expect(Math.sign(b - prev) * Math.sign(b1 - b0)).toBeGreaterThanOrEqual(0);
          prev = b;
        }
      }
    }
  });

  it('konstante Eigenbeschleunigung zwischen β₀ und β₁: Dauer ↔ a, Sonderfall Start aus der Ruhe', () => {
    const a = 9.81;
    // Start aus der Ruhe: identisch mit der alten Formel β·γ = a·t/c
    const T = accelerationDuration(a, 0, 0.9);
    expect(T / timeToReachBeta(a, 0.9)).toBeCloseTo(1, 12);
    for (const t of [0, 0.3 * T, 0.7 * T, T]) {
      expect(betaConstantBetween(t, T, 0, 0.9)).toBeCloseTo(betaConstantProperAcceleration(a, t), 12);
    }
    // a aus der Dauer und Dauer aus a sind zueinander invers, auch beim Bremsen
    for (const [b0, b1] of [[0.2, 0.95], [0.99, 0.5]]) {
      const Tx = accelerationDuration(a, b0, b1);
      expect(accelerationFromDuration(Tx, b0, b1)).toBeCloseTo(a, 9);
      expect(betaConstantBetween(0, Tx, b0, b1)).toBeCloseTo(b0, 12);
      expect(betaConstantBetween(Tx, Tx, b0, b1)).toBeCloseTo(b1, 12);
    }
    // u = βγ ist linear in t
    const Tm = accelerationDuration(a, 0.5, 0.99);
    const u = (t) => properVelocity(betaConstantBetween(t, Tm, 0.5, 0.99));
    expect(u(Tm / 2)).toBeCloseTo((u(0) + u(Tm)) / 2, 9);
    expect(betaFromProperVelocity(properVelocity(0.97))).toBeCloseTo(0.97, 12);
  });

  it('Kurvenwahl: alle drei Kurven starten bei β₀ und enden bei β₁', () => {
    const T = accelerationDuration(9.81, 0.1, 0.98);
    for (const curve of ['constant', 'linear', 'smooth']) {
      expect(accelerationBeta(curve, 0, T, 0.1, 0.98)).toBeCloseTo(0.1, 12);
      expect(accelerationBeta(curve, T, T, 0.1, 0.98)).toBeCloseTo(0.98, 12);
    }
  });

  it('Terrell: bei ψ\' = 90° Drehwinkel arcsin β und Verkürzung 1/γ; β = 0 ändert nichts', () => {
    for (const beta of [0.5, 0.9, 0.99]) {
      expect(terrellRotationAngle(beta, rad(90))).toBeCloseTo(Math.asin(beta), 12);
      expect(terrellLengthFactor(beta, rad(90))).toBeCloseTo(1 / lorentzGamma(beta), 12);
      // Verkürzung = sin ψ / sin ψ'
      for (const pp of [30, 60, 120, 150]) {
        const psi = psiFromPsiPrime(beta, rad(pp));
        expect(terrellLengthFactor(beta, rad(pp))).toBeCloseTo(Math.sin(psi) / Math.sin(rad(pp)), 10);
        expect(deg(aberrationPsi(beta, psi))).toBeCloseTo(pp, 9);
      }
    }
    expect(terrellRotationAngle(0, rad(70))).toBeCloseTo(0, 12);
    expect(terrellLengthFactor(0, rad(70))).toBeCloseTo(1, 12);
    // vorn gestreckt, hinten verkürzt
    expect(terrellLengthFactor(0.9, rad(20))).toBeGreaterThan(1);
    expect(terrellLengthFactor(0.9, rad(150))).toBeLessThan(1);
  });

  it('Eigenzeit numerisch = geschlossene Form bei konstanter Eigenbeschleunigung', () => {
    const a = 9.81;
    for (const t of [1e6, 3.15e7, 1.6e8]) {
      const numeric = properTimeNumeric((s) => betaConstantProperAcceleration(a, s), t);
      expect(numeric / properTimeConstantAcceleration(a, t)).toBeCloseTo(1, 8);
    }
  });

  it('Fenster ±16°: Licht stammt aus einem größeren Himmelsbereich in S', () => {
    // Umkehrung der Aberration: ψ' = 16° kommt bei β = 0,9 aus ψ ≈ 63,0° in S
    const psi = deg(Math.acos(inverseAberrationCosPsi(0.9, Math.cos(rad(16)))));
    expect(psi).toBeCloseTo(62.98, 2);
    expect(deg(aberrationPsi(0.9, rad(psi)))).toBeCloseTo(16, 9);
  });

  it('β ≥ 1 wird abgelehnt', () => {
    expect(() => lorentzGamma(1)).toThrow(RangeError);
    expect(() => lorentzGamma(1.2)).toThrow(RangeError);
  });
});

/* ------------------------------------------------------------------------- */
describe('Unabhängige Gegenprüfung (ohne die Formeln aus physics.js)', () => {
  it('Aberration und D stimmen mit der Lorentz-Transformation des Photonen-Viererimpulses überein', () => {
    // Photon kommt aus Richtung n (Blick zum Stern), Impuls k = −n, Energie E = 1.
    // Beobachter bewegt sich mit β in +z:  E' = γ(E − β k_z),  k'_z = γ(k_z − β E),  k'_⊥ = k_⊥
    const rnd = mulberry32(99);
    for (const beta of [0.3, 0.9, 0.999]) {
      const g = 1 / Math.sqrt(1 - beta * beta);
      for (let i = 0; i < 200; i++) {
        const cz = 2 * rnd() - 1;
        const s = Math.sqrt(1 - cz * cz);
        const phi = 2 * Math.PI * rnd();
        const n = [s * Math.cos(phi), s * Math.sin(phi), cz];
        const k = n.map((v) => -v);
        const E2 = g * (1 - beta * k[2]);
        const k2 = [k[0], k[1], g * (k[2] - beta)];
        const nSeen = k2.map((v) => -v / E2); // Blickrichtung in S'
        const got = aberrateDirection(beta, n);
        for (let c = 0; c < 3; c++) expect(got[c]).toBeCloseTo(nSeen[c], 9);
        // λ'/λ = E/E'
        expect(dopplerFactor(beta, cz) * E2).toBeCloseTo(1, 9);
      }
    }
  });

  it('konstante Eigenbeschleunigung: dβ/dt = (a/c)(1 − β²)^{3/2} numerisch integriert', () => {
    const a = 9.81;
    const b0 = 0.2;
    const b1 = 0.95;
    const T = accelerationDuration(a, b0, b1);
    let beta = b0;
    const n = 200000;
    const dt = T / n;
    for (let i = 0; i < n; i++) {
      // Runge-Kutta 2. Ordnung
      const f = (b) => (a / C) * Math.pow(1 - b * b, 1.5);
      const k1 = f(beta);
      const k2 = f(beta + 0.5 * dt * k1);
      beta += dt * k2;
    }
    expect(beta).toBeCloseTo(b1, 6);
    expect(betaConstantBetween(T / 2, T, b0, b1)).toBeGreaterThan(b0);
  });
});
