/*
 * Erstellt mit Claude Code (KI-Werkzeug) im Auftrag von Dominik Wittkow,
 * W-Seminar Physik, CSG Ingolstadt, 04.11.2026.
 *
 * Tests für das Standbild mit Bewegungsunschärfe im 3D-Flug (physics.js,
 * Abschnitt 8). Der Renderer zeichnet jedes Teilbild mit den üblichen Shadern;
 * hier wird mit derselben Rechnung auf der CPU nachgeprüft, wo ein Stern in
 * jedem Teilbild steht.
 */
import { describe, it, expect } from 'vitest';
import {
  C,
  rad,
  deg,
  lorentzGamma,
  aberrateDirection,
  aberrationCosPsi,
  dopplerFactor,
  beamingPointSource,
  psiFromPsiPrime,
  aberrationAngleRate,
  betaHyperbolicProperTime,
  betaConstantProperAcceleration,
  properTimeConstantAcceleration,
  properAccelerationForProperTime,
  properVelocity,
  motionBlurBetaAt,
  motionBlurOffsetLy,
  motionBlurSchedule,
  motionBlurStepCount,
  advanceProperTime,
  shutterPlanFromCurve,
  rapidityChangeDuringExposure,
  accelerationDuration,
  accelerationBeta,
  SECONDS_PER_YEAR,
} from '../src/physics.js';
import { generateStars, STAR_SEED } from '../src/stars.js';

const TB = 1 / 48;
const A_FILM = properAccelerationForProperTime(0, 0.99, 3); // Δv = 0,99 c in Δt = 3 s
const F_PX = 935; // Bildskala einer 60°-Kamera bei 1080 px Bildhöhe

/** Richtung in S aus Ruhewinkel ψ und Azimut φ. */
function dir(psi, phi) {
  return [Math.sin(psi) * Math.cos(phi), Math.sin(psi) * Math.sin(phi), Math.cos(psi)];
}

/**
 * CPU-Nachrechnung eines Teilbilds: Stern am Ort p (Lj, relativ zum
 * Beobachter am Ende der Belichtung), Beobachter um dz versetzt, Richtung in S,
 * Aberration mit β, Zentralprojektion entlang der Flugrichtung.
 */
function seen(p, sub) {
  const rel = [p[0], p[1], p[2] - sub.dzLy];
  const r = Math.hypot(...rel);
  const n = rel.map((c) => c / r);
  const m = aberrateDirection(sub.beta, n);
  return { n, m, psiPrime: Math.acos(Math.max(-1, Math.min(1, m[2]))), xy: [F_PX * m[0] / m[2], F_PX * m[1] / m[2]] };
}

describe('Beschleunigung aus Δv und Δt', () => {
  it('a = c·artanh(Δv/c)/Δt: 0,99 c in 3 s ergibt 2,645·10⁸ m/s²', () => {
    expect(A_FILM).toBeCloseTo((C * Math.atanh(0.99)) / 3, 0);
    expect(A_FILM / 2.645e8).toBeCloseTo(1, 3);
    expect(betaHyperbolicProperTime(A_FILM, 3)).toBeCloseTo(0.99, 12);
  });

  it('tanh(aτ/c) ist dieselbe Bewegung wie β(t) bei konstanter Eigenbeschleunigung', () => {
    for (const t of [0.5, 2, 5, 7.9]) {
      const tau = properTimeConstantAcceleration(A_FILM, t);
      expect(betaHyperbolicProperTime(A_FILM, tau)).toBeCloseTo(betaConstantProperAcceleration(A_FILM, t), 12);
    }
  });

  it('Belichtung endet beim aktuellen β, davor nicht unter β = 0', () => {
    expect(motionBlurBetaAt(0.99, A_FILM, 0)).toBeCloseTo(0.99, 14);
    expect(motionBlurBetaAt(0.99, A_FILM, -3)).toBeCloseTo(0, 12);
    expect(motionBlurBetaAt(0.99, A_FILM, -5)).toBe(0);
    expect(motionBlurBetaAt(0.5, 0, -1)).toBeCloseTo(0.5, 14); // Δv = 0: konstant
  });

  it('Strecke in S: geschlossene Form = ∫ β·γ·c dτ (numerisch)', () => {
    for (const [betaEnd, a, tau] of [[0.99, A_FILM, -TB], [0.99, A_FILM, -2], [0.3, A_FILM, -1], [0.9, 0, -0.5]]) {
      let s = 0;
      const n = 20000;
      for (let i = 0; i < n; i++) {
        const t = tau + ((i + 0.5) * -tau) / n;
        s += properVelocity(motionBlurBetaAt(betaEnd, a, t)) * C * (-tau / n);
      }
      expect(motionBlurOffsetLy(betaEnd, a, tau) / (-s / (C * SECONDS_PER_YEAR))).toBeCloseTo(1, 6);
    }
  });
});

describe('Belichtungsplan', () => {
  it('t_b = 0 liefert exakt das normale Standbild (ein Teilbild, aktuelles β, kein Versatz)', () => {
    const plan = motionBlurSchedule({ betaEnd: 0.97, a: A_FILM, exposure: 0, steps: 50 });
    expect(plan).toEqual([{ tau: 0, beta: 0.97, dzLy: 0, weight: 1 }]);
    expect(motionBlurStepCount({ a: A_FILM, exposure: 0, betaEnd: 0.97, pxPerRadian: 2000 })).toBe(1);
  });

  it('Gewichte ergeben zusammen 1, Teilbilder liegen in [−t_b, 0]', () => {
    const plan = motionBlurSchedule({ betaEnd: 0.99, a: A_FILM, exposure: TB, steps: 37 });
    expect(plan.reduce((s, p) => s + p.weight, 0)).toBeCloseTo(1, 12);
    for (const p of plan) {
      expect(p.tau).toBeGreaterThan(-TB);
      expect(p.tau).toBeLessThan(0);
    }
  });

  it('β = 0 und β konstant: Punkte, keine Streifen (Sterne im 3D-Feld ≥ 1 Lj entfernt)', () => {
    const stars = generateStars(2000, STAR_SEED);
    for (const [betaEnd, a] of [[0, A_FILM], [0, 0], [0.5, 0], [0.99, 0]]) {
      const plan = motionBlurSchedule({ betaEnd, a, exposure: TB, steps: 16 });
      for (let s = 0; s < stars.count; s += 7) {
        const p = [0, 1, 2].map((k) => stars.directions[3 * s + k]); // Abstand 1 Lj
        const first = seen(p, plan[0]);
        const last = seen(p, plan[plan.length - 1]);
        if (first.m[2] <= 0.1) continue;
        expect(Math.hypot(last.xy[0] - first.xy[0], last.xy[1] - first.xy[1])).toBeLessThan(1e-3);
      }
    }
  });

  it('β = 0,99 und Δβ = 0,002: Stern bei ψ′ = 10° wandert um etwa 1,0° zum Fluchtpunkt hin', () => {
    // a so, dass β während t_b von 0,99 auf 0,992 steigt
    const a = (C * (Math.atanh(0.992) - Math.atanh(0.99))) / TB;
    expect(motionBlurBetaAt(0.992, a, -TB)).toBeCloseTo(0.99, 12);
    const n = dir(psiFromPsiPrime(0.99, rad(10)), 0.7);
    const start = deg(Math.acos(aberrationCosPsi(0.99, n[2])));
    const end = deg(Math.acos(aberrationCosPsi(0.992, n[2])));
    expect(start).toBeCloseTo(10, 9);
    expect(end).toBeLessThan(start);
    expect(start - end).toBeGreaterThan(0.9);
    expect(start - end).toBeLessThan(1.1);
    // numerisch gegen dψ'/dβ = −γ² sin ψ' (Runge-Kutta 4. Ordnung)
    let psi = rad(10);
    const k = 2000;
    const h = 0.002 / k;
    for (let i = 0; i < k; i++) {
      const b = 0.99 + i * h;
      const k1 = aberrationAngleRate(b, psi);
      const k2 = aberrationAngleRate(b + h / 2, psi + (h / 2) * k1);
      const k3 = aberrationAngleRate(b + h / 2, psi + (h / 2) * k2);
      const k4 = aberrationAngleRate(b + h, psi + h * k3);
      psi += (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
    }
    expect(rad(end)).toBeCloseTo(psi, 9);
    const g = lorentzGamma(0.99);
    expect(deg(g * g * Math.sin(rad(10)) * 0.002)).toBeCloseTo(1.0, 3);
  });

  it('Beim Beschleunigen gilt für jeden Stern: ψ′ im letzten Teilbild < ψ′ im ersten', () => {
    const stars = generateStars(9096, STAR_SEED);
    for (const betaEnd of [0.3, 0.9, 0.99]) {
      const plan = motionBlurSchedule({ betaEnd, a: A_FILM, exposure: TB, steps: 8 });
      for (let s = 0; s < stars.count; s++) {
        const p = [0, 1, 2].map((k) => 5 * stars.directions[3 * s + k]); // 5 Lj entfernt
        expect(seen(p, plan[plan.length - 1]).psiPrime).toBeLessThan(seen(p, plan[0]).psiPrime);
      }
    }
  });

  it('Streifenlänge wächst bei konstanter Eigenbeschleunigung mit sin ψ′', () => {
    // dψ'/dτ = −(a/c)·sin ψ'  ⇔  tan(ψ'/2) schrumpft um den Faktor e^(−Δη) mit Δη = (a/c)·Δτ
    for (const betaEnd of [0.5, 0.9, 0.99]) {
      const plan = motionBlurSchedule({ betaEnd, a: A_FILM, exposure: TB, steps: 64 });
      const dEta = (A_FILM / C) * (plan[plan.length - 1].tau - plan[0].tau);
      let last = 0;
      for (const psiDeg of [2, 5, 10, 20, 30, 45]) {
        const p = dir(psiFromPsiPrime(betaEnd, rad(psiDeg)), 1.1).map((c) => 1e9 * c); // sehr weit weg
        const a = seen(p, plan[0]).psiPrime;
        const b = seen(p, plan[plan.length - 1]).psiPrime;
        expect((Math.log(Math.tan(a / 2)) - Math.log(Math.tan(b / 2))) / dEta).toBeCloseTo(1, 6);
        // Länge / sin ψ' ist (fast) konstant, die Länge wächst mit sin ψ'
        expect((a - b) / Math.sin((a + b) / 2) / dEta).toBeCloseTo(1, 3);
        expect(a - b).toBeGreaterThan(last);
        last = a - b;
      }
    }
  });

  it('Teilbilder: kein Stern wandert je Teilbild mehr als 1 px', () => {
    const stars = generateStars(9096, STAR_SEED);
    for (const [betaEnd, a, dist] of [[0.99, A_FILM, 3], [0.6, A_FILM, 1], [0.99, A_FILM * 20, 2]]) {
      // Bildskala der Nachrechnung ist F_PX in der Mitte; bis ψ′ = 45° höchstens 2·F_PX
      const steps = motionBlurStepCount({ a, exposure: TB, betaEnd, pxPerRadian: 2 * F_PX, nearestLy: dist });
      const plan = motionBlurSchedule({ betaEnd, a, exposure: TB, steps });
      let largest = 0;
      let moving = 0;
      for (let s = 0; s < stars.count; s += 5) {
        const p = [0, 1, 2].map((k) => dist * stars.directions[3 * s + k]);
        let u = seen(p, plan[0]);
        for (let i = 1; i < plan.length; i++) {
          const v = seen(p, plan[i]);
          if (u.psiPrime <= rad(45)) {
            const d = Math.hypot(v.xy[0] - u.xy[0], v.xy[1] - u.xy[1]);
            largest = Math.max(largest, d);
            if (d > 0.1) moving++;
          }
          u = v;
        }
      }
      expect(moving).toBeGreaterThan(0);
      expect(largest).toBeLessThanOrEqual(1);
    }
  }, 60000);

  it('Gesamtlicht bleibt beim Aufteilen in mehr Teilbilder gleich (1 %)', () => {
    for (const psiDeg of [1, 10, 30]) {
      const n = dir(psiFromPsiPrime(0.9, rad(psiDeg)), 2);
      const light = (steps) => motionBlurSchedule({ betaEnd: 0.9, a: A_FILM, exposure: 0.2, steps })
        .reduce((s, p) => s + p.weight * beamingPointSource(dopplerFactor(p.beta, n[2])), 0);
      expect(Math.abs(light(400) / light(20) - 1)).toBeLessThan(0.01);
    }
  });

  it('Grenzfall β → 0: unverändertes Sternenfeld', () => {
    const stars = generateStars(3000, STAR_SEED);
    const plan = motionBlurSchedule({ betaEnd: 1e-12, a: 1e-3, exposure: TB, steps: 4 });
    for (let s = 0; s < stars.count; s++) {
      const p = [0, 1, 2].map((k) => 10 * stars.directions[3 * s + k]);
      if (p[2] <= 2) continue; // nur Sterne vor dem Schiff (im Bild)
      const rest = [F_PX * p[0] / p[2], F_PX * p[1] / p[2]];
      for (const sub of plan) {
        const v = seen(p, sub);
        expect(Math.hypot(v.xy[0] - rest[0], v.xy[1] - rest[1])).toBeLessThan(1e-6);
      }
    }
  });
});

describe('Beliebige Beschleunigungskurve (live und Video)', () => {
  it('advanceProperTime: konstantes β → dt = γ·dτ, Strecke β·γ·dτ', () => {
    const r = advanceProperTime(() => 0.8, 10, 2, 4);
    expect(r.t).toBeCloseTo(10 + 2 / 0.6, 12);
    expect(r.distanceLy * SECONDS_PER_YEAR).toBeCloseTo((0.8 / 0.6) * 2, 10);
  });

  it('advanceProperTime folgt der Hyperbelbewegung: τ = (c/a)·arsinh(at/c)', () => {
    const a = FILM_A();
    const betaOfT = (t) => betaConstantProperAcceleration(a, Math.max(0, t));
    const t0 = 2;
    const r = advanceProperTime(betaOfT, t0, 0.7, 64);
    expect(properTimeConstantAcceleration(a, r.t) - properTimeConstantAcceleration(a, t0)).toBeCloseTo(0.7, 8);
  });

  it('shutterPlanFromCurve stimmt bei konstanter Eigenbeschleunigung mit motionBlurSchedule überein', () => {
    const a = FILM_A();
    const T = accelerationDuration(a, 0, 0.99);
    const betaOfT = (t) => accelerationBeta('constant', t, T, 0, 0.99);
    for (const tNow of [1, 3.5, 6]) {
      const betaEnd = betaOfT(tNow);
      const p1 = shutterPlanFromCurve({ betaOfT, tNow, exposure: TB, steps: 12, substeps: 16 });
      const p2 = motionBlurSchedule({ betaEnd, a, exposure: TB, steps: 12 });
      for (let i = 0; i < 12; i++) {
        expect(p1[i].tau).toBeCloseTo(p2[i].tau, 12);
        expect(p1[i].beta).toBeCloseTo(p2[i].beta, 9);
        expect(p1[i].dzLy / p2[i].dzLy).toBeCloseTo(1, 6);
      }
      expect(rapidityChangeDuringExposure(betaOfT, tNow, TB)).toBeCloseTo((a / C) * TB, 6);
    }
  });

  it('vor dem Beginn und bei t_b = 0', () => {
    const betaOfT = (t) => (t < 0 ? 0.2 : 0.2 + 0.1 * Math.min(1, t));
    expect(shutterPlanFromCurve({ betaOfT, tNow: 0.5, exposure: 0, steps: 9 })).toEqual([{ tau: 0, beta: 0.25, dzLy: 0, weight: 1 }]);
    const p = shutterPlanFromCurve({ betaOfT, tNow: -1, exposure: 0.1, steps: 4 });
    for (const s of p) expect(s.beta).toBe(0.2);
  });

  it('Teilbilder über die Rapidität: deltaEta ersetzt a·t_b/c', () => {
    const n1 = motionBlurStepCount({ a: A_FILM, exposure: TB, betaEnd: 0.99, pxPerRadian: 1000 });
    const n2 = motionBlurStepCount({ deltaEta: (A_FILM / C) * TB, exposure: TB, betaEnd: 0.99, pxPerRadian: 1000 });
    expect(n2).toBe(n1);
  });
});

function FILM_A() {
  return properAccelerationForProperTime(0, 0.99, 3);
}
