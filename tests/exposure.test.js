/*
 * Erstellt mit Claude Code (KI-Werkzeug) im Auftrag von Dominik Wittkow,
 * W-Seminar Physik, CSG Ingolstadt, 03.11.2026.
 *
 * Tests für die Belichtung während der Beschleunigung (physics.js, Abschnitt 8,
 * und exposure.js). Die Testfälle stammen aus dem Auftrag
 * "Belichtung während der Beschleunigung in der Simulation".
 */
import { describe, it, expect } from 'vitest';
import {
  C,
  rad,
  deg,
  lorentzGamma,
  aberrationCosPsi,
  aberrateDirection,
  dopplerFactor,
  beamingPointSource,
  psiFromPsiPrime,
  aberrationAngleRate,
  betaHyperbolicProperTime,
  properAccelerationForProperTime,
  betaConstantProperAcceleration,
  properTimeConstantAcceleration,
  accelerationProfileProperTime,
  accelerationDuration,
  properTimeNumeric,
  accelerationBeta,
  rectilinearCamera,
  projectRectilinear,
  exposeStar,
} from '../src/physics.js';
import {
  EXPORT_DEFAULTS,
  FILM_SCENE,
  renderExposure,
  toneMap,
  toneScale,
  psfPeak,
  sequenceTimes,
  parseExposureTime,
  parseFilmTime,
  formatFilmTime,
} from '../src/exposure.js';
import { generateStars, STAR_SEED } from '../src/stars.js';
import { crc32, createZip } from '../src/zip.js';

const cam = rectilinearCamera(EXPORT_DEFAULTS);
const TB = 1 / 48;

/** Richtung in S aus Ruhewinkel ψ und Azimut φ (Bogenmaß). */
function dir(psi, phi) {
  return [Math.sin(psi) * Math.cos(phi), Math.sin(psi) * Math.sin(phi), Math.cos(psi)];
}

/** Richtung in S eines Sterns, der bei β unter dem Sehwinkel ψ' erscheint. */
function dirSeenAt(beta, psiPrime, phi) {
  return dir(psiFromPsiPrime(beta, psiPrime), phi);
}

/** β linear von b0 nach b0 + db über das Belichtungsintervall um tauMid. */
function linearRamp(b0, db, tauMid, tb) {
  return (tau) => b0 + (db * (tau - (tauMid - tb / 2))) / tb;
}

/** Profil der Filmszene in Bordzeit. */
function filmProfile() {
  const T = accelerationDuration(FILM_SCENE.a, 0, 0.99);
  return accelerationProfileProperTime('constant', T, 0, 0.99);
}

/** Einzelner Stern als "Sternfeld" für renderExposure. */
function oneStar(n, F = 1, T = 5800) {
  return {
    count: 1,
    directions: Float32Array.from(n),
    temperatures: Float32Array.of(T),
    fluxes: Float32Array.of(F),
  };
}

const EFFECTS = { aberration: true, doppler: true, beaming: true, fullSpectrum: false };

/** Schwerpunkt der Leuchtdichte im Bildpuffer (Pixelmitten). */
function centroid(energy, W, H) {
  let sx = 0;
  let sy = 0;
  let s = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = 3 * (y * W + x);
      const L = 0.2126 * energy[o] + 0.7152 * energy[o + 1] + 0.0722 * energy[o + 2];
      sx += L * (x + 0.5);
      sy += L * (y + 0.5);
      s += L;
    }
  }
  return [sx / s, sy / s, s];
}

describe('Bewegung in Bordzeit', () => {
  it('Filmszene: β = tanh(aτ/c) erreicht 0,99 nach 3 s Bordzeit', () => {
    const a = properAccelerationForProperTime(0, 0.99, 3);
    expect(a).toBeCloseTo((C * Math.atanh(0.99)) / 3, 0);
    expect(betaHyperbolicProperTime(a, 3)).toBeCloseTo(0.99, 12);
    expect(FILM_SCENE.a).toBeCloseTo(a, 6);
  });

  it('tanh(aτ/c) ist dieselbe Bewegung wie β(t) bei konstanter Eigenbeschleunigung', () => {
    const a = FILM_SCENE.a;
    for (const t of [0.5, 2, 5, 7.9]) {
      const tau = properTimeConstantAcceleration(a, t);
      expect(betaHyperbolicProperTime(a, tau)).toBeCloseTo(betaConstantProperAcceleration(a, t), 12);
    }
  });

  it('Bordzeit-Profil: konstante Kurve geschlossen, Dauer an Bord 3 s', () => {
    const p = filmProfile();
    expect(p.tauEnd).toBeCloseTo(3, 9);
    expect(p.betaAt(0)).toBe(0);
    expect(p.betaAt(3)).toBeCloseTo(0.99, 12);
    expect(p.betaAt(-1)).toBe(0); // vorher in Ruhe
    expect(p.betaAt(4)).toBeCloseTo(0.99, 12); // danach konstant
    expect(p.betaAt(1.5)).toBeCloseTo(Math.tanh((FILM_SCENE.a * 1.5) / C), 12);
  });

  it('Bordzeit-Profil: numerische Kurven stimmen mit ∫dt/γ überein', () => {
    for (const curve of ['linear', 'smooth']) {
      const T = 10;
      const p = accelerationProfileProperTime(curve, T, 0.2, 0.95);
      const betaOfT = (t) => accelerationBeta(curve, t, T, 0.2, 0.95);
      expect(p.tauEnd).toBeCloseTo(properTimeNumeric(betaOfT, T, 2000), 5);
      for (const t of [1, 4, 8.5]) {
        const tau = properTimeNumeric(betaOfT, t, 2000);
        expect(p.tAt(tau)).toBeCloseTo(t, 4);
        expect(p.betaAt(tau)).toBeCloseTo(betaOfT(t), 5);
      }
    }
  });
});

describe('Kamera und Projektion', () => {
  it('Brennweite wie szene_analysieren.py: f = (B/2)/tan(Bildfeld/2)', () => {
    expect(cam.f).toBeCloseTo(1136 / Math.tan(rad(30)), 9);
    expect([cam.cx, cam.cy]).toEqual([1114, 464]);
  });

  it('Flugrichtung bildet sich auf den Fluchtpunkt ab, r = f·tan ψ', () => {
    expect(projectRectilinear(cam, [0, 0, 1])).toEqual([1114, 464]);
    const p = projectRectilinear(cam, dir(rad(20), rad(37)));
    expect(Math.hypot(p[0] - 1114, p[1] - 464)).toBeCloseTo(cam.f * Math.tan(rad(20)), 9);
    expect(projectRectilinear(cam, dir(rad(95), 0))).toBe(null);
  });
});

describe('Belichtung eines Sterns', () => {
  it('t_b = 0 liefert exakt das bisherige Einzelbild', () => {
    const beta = 0.97;
    // gesehene Winkel innerhalb des Bildfelds (±30° waagrecht, ±13° senkrecht)
    for (const [psi, phi] of [[3, 0.5], [10, 0.2], [18, 3.0], [25, 0.05]]) {
      const n = dirSeenAt(beta, rad(psi), phi);
      const r = exposeStar(n, { betaAt: () => beta, tauMid: 1.23, exposure: 0, camera: cam });
      expect(r.steps.length).toBe(1);
      const p = projectRectilinear(cam, aberrateDirection(beta, n));
      expect(r.steps[0].x).toBe(p[0]);
      expect(r.steps[0].y).toBe(p[1]);
      expect(r.steps[0].w).toBe(beamingPointSource(dopplerFactor(beta, n[2])));
      expect(r.total).toBe(r.steps[0].w);
    }
  });

  it('t_b = 0 im ganzen Bild: genau ein Teilschritt je Stern', () => {
    const stars = generateStars(9096, STAR_SEED);
    const res = renderExposure(stars, {
      camera: cam, betaAt: () => 0.9, tauMid: 0, exposure: 0, effects: EFFECTS, lens: { enabled: false },
    });
    expect(res.stats.steps).toBe(9096);
    for (const r of res.records) expect(r.streakPx).toBe(0);
  });

  it('β = 0 und β konstant liefern Punkte, keine Streifen', () => {
    const stars = generateStars(2000, STAR_SEED);
    for (const beta of [0, 0.5, 0.99]) {
      const res = renderExposure(stars, {
        camera: cam, betaAt: () => beta, tauMid: 1, exposure: TB, effects: EFFECTS, lens: { enabled: true, fwhmPx: 2 },
      });
      expect(res.records.length).toBeGreaterThan(10);
      for (const r of res.records) {
        expect(r.streakPx).toBe(0);
        expect(r.steps).toBe(1);
      }
    }
    // nach dem Ende der Filmszene bleibt β = 0,99: ebenfalls Punkte
    const p = filmProfile();
    const n = dirSeenAt(0.99, rad(12), 1);
    expect(exposeStar(n, { betaAt: p.betaAt, tauMid: 3.5, exposure: TB, camera: cam }).streakPx).toBe(0);
  });

  it('β = 0,99, Δβ = 0,002: Stern bei ψ′ = 10° wandert um etwa 1,0° zum Fluchtpunkt hin', () => {
    const n = dirSeenAt(0.99, rad(10), 0.7);
    const r = exposeStar(n, { betaAt: linearRamp(0.99, 0.002, 0, TB), tauMid: 0, exposure: TB, camera: cam });
    const shift = deg(r.psiEnd - r.psiStart);
    expect(deg(r.psiStart)).toBeCloseTo(10, 9);
    expect(shift).toBeLessThan(0); // zum Fluchtpunkt hin
    expect(Math.abs(shift)).toBeGreaterThan(0.9);
    expect(Math.abs(shift)).toBeLessThan(1.1);

    // numerisch gegen dψ'/dβ = −γ² sin ψ' (Runge-Kutta 4. Ordnung)
    let psi = rad(10);
    const steps = 2000;
    const h = 0.002 / steps;
    for (let i = 0; i < steps; i++) {
      const b = 0.99 + i * h;
      const k1 = aberrationAngleRate(b, psi);
      const k2 = aberrationAngleRate(b + h / 2, psi + (h / 2) * k1);
      const k3 = aberrationAngleRate(b + h / 2, psi + (h / 2) * k2);
      const k4 = aberrationAngleRate(b + h, psi + h * k3);
      psi += (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
    }
    expect(r.psiEnd).toBeCloseTo(psi, 9);
    // erste Näherung γ²·sin ψ'·Δβ = 1,000°
    const g = lorentzGamma(0.99);
    expect(deg(g * g * Math.sin(rad(10)) * 0.002)).toBeCloseTo(1.0, 3);
  });

  it('Beim Beschleunigen gilt für jeden Stern: ψ′ am Ende < ψ′ am Beginn', () => {
    const stars = generateStars(9096, STAR_SEED);
    const p = filmProfile();
    let checked = 0;
    for (const tauMid of [0.01, 1, 2.98]) {
      for (let s = 0; s < stars.count; s++) {
        const n = [stars.directions[3 * s], stars.directions[3 * s + 1], stars.directions[3 * s + 2]];
        const r = exposeStar(n, { betaAt: p.betaAt, tauMid, exposure: TB, camera: cam });
        expect(r.psiEnd).toBeLessThan(r.psiStart);
        checked++;
      }
    }
    expect(checked).toBe(3 * 9096);
  });

  it('Streifenlänge wächst bei festem Δβ mit sin ψ′', () => {
    const beta = 0.9;
    const db = 1e-5;
    const g2 = lorentzGamma(beta) ** 2;
    let lastAngle = 0;
    let lastPx = 0;
    for (const psiDeg of [1, 3, 6, 10, 15, 20, 25]) {
      const n = dirSeenAt(beta, rad(psiDeg), 0.3);
      const r = exposeStar(n, { betaAt: linearRamp(beta, db, 0, TB), tauMid: 0, exposure: TB, camera: cam });
      const angle = r.psiStart - r.psiEnd;
      // Winkellänge / sin ψ' = γ²·Δβ (für kleines Δβ)
      expect(angle / Math.sin(rad(psiDeg)) / (g2 * db)).toBeCloseTo(1, 3);
      expect(angle).toBeGreaterThan(lastAngle);
      expect(r.streakPx).toBeGreaterThan(lastPx);
      lastAngle = angle;
      lastPx = r.streakPx;
    }
  });

  it('Teilschritte: Bildpunkt wandert je Schritt höchstens 1 px', () => {
    const p = filmProfile();
    const stars = generateStars(9096, STAR_SEED);
    const res = renderExposure(stars, {
      camera: cam, betaAt: p.betaAt, tauMid: 2.99, exposure: TB, effects: EFFECTS, lens: { enabled: false },
    });
    expect(res.stats.largestMovePx).toBeLessThanOrEqual(1);
    expect(res.records.some((r) => r.streakPx > 5)).toBe(true);
  });

  it('Gesamtlicht bleibt beim Aufteilen in mehr Teilschritte gleich (1 %)', () => {
    const p = filmProfile();
    let finer = 0;
    for (const psiDeg of [0.5, 5, 15, 28]) {
      const n = dirSeenAt(0.71, rad(psiDeg), 3);
      const o = { betaAt: p.betaAt, tauMid: 1, exposure: 0.2, camera: cam };
      const coarse = exposeStar(n, { ...o, maxStepPx: 1 });
      const fine = exposeStar(n, { ...o, maxStepPx: 0.05 });
      expect(fine.stepCount).toBeGreaterThanOrEqual(coarse.stepCount);
      if (fine.stepCount > 4 * coarse.stepCount) finer++;
      expect(Math.abs(fine.total / coarse.total - 1)).toBeLessThan(0.01);
      const sum = (r) => r.steps.reduce((s, x) => s + x.w, 0);
      expect(Math.abs(sum(fine) / sum(coarse) - 1)).toBeLessThan(0.01);
    }
    expect(finer).toBeGreaterThan(0);
  });
});

describe('Grenzfall β → 0 und Messung im Bild', () => {
  it('β → 0: unverändertes Sternenfeld', () => {
    const stars = generateStars(3000, STAR_SEED);
    for (let s = 0; s < stars.count; s++) {
      const n = [stars.directions[3 * s], stars.directions[3 * s + 1], stars.directions[3 * s + 2]];
      const rest = projectRectilinear(cam, n);
      // nur Sterne im Bild (weit außerhalb vergrößert die Projektion Rundungsfehler beliebig)
      if (!rest || rest[0] < 0 || rest[0] >= cam.width || rest[1] < 0 || rest[1] >= cam.height) continue;
      const r = exposeStar(n, { betaAt: (tau) => 1e-12 * (1 + tau), tauMid: 0, exposure: TB, camera: cam });
      if (!rest || !r.pStart) continue;
      expect(Math.abs(r.pStart[0] - rest[0])).toBeLessThan(1e-6);
      expect(Math.abs(r.pEnd[1] - rest[1])).toBeLessThan(1e-6);
      expect(r.total).toBeCloseTo(1, 9);
    }
  });

  it('Sehwinkel nach der Formel für ψ′ stimmt mit dem im Bild gemessenen auf 1 px überein', () => {
    for (const beta of [1e-9, 0.5, 0.9, 0.99]) {
      for (const lens of [{ enabled: false }, { enabled: true, fwhmPx: 2 }]) {
        for (const [psiRestDeg, phi] of [[8, 0.4], [20, 2.9], [27, 3.1]]) {
          // Ruhewinkel so wählen, dass der Stern im Bild liegt
          const psiRest = psiFromPsiPrime(beta, rad(psiRestDeg));
          const n = dir(psiRest, phi);
          const res = renderExposure(oneStar(n), {
            camera: cam, betaAt: () => beta, tauMid: 0, exposure: TB, effects: EFFECTS, lens,
          });
          const [x, y] = centroid(res.energy, cam.width, cam.height);
          const measured = Math.hypot(x - cam.cx, y - cam.cy);
          const psiPrime = Math.acos(aberrationCosPsi(beta, Math.cos(psiRest)));
          expect(Math.abs(measured - cam.f * Math.tan(psiPrime))).toBeLessThan(1);
        }
      }
    }
  });
});

describe('Bild: Objektiv und Tonkurve', () => {
  it('Objektiv erhält das Licht, ohne Objektiv genau ein Pixel', () => {
    const n = dir(rad(10), 1);
    for (const lens of [{ enabled: false }, { enabled: true, fwhmPx: 2 }, { enabled: true, fwhmPx: 5 }]) {
      const res = renderExposure(oneStar(n, 1), {
        camera: cam, betaAt: () => 0, tauMid: 0, exposure: TB, effects: EFFECTS, lens,
      });
      const [, , L] = centroid(res.energy, cam.width, cam.height);
      expect(L).toBeCloseTo(1, 5);
      let lit = 0;
      for (let i = 0; i < res.energy.length; i += 3) if (res.energy[i + 1] > 0) lit++;
      if (!lens.enabled) expect(lit).toBe(1);
      else expect(lit).toBeGreaterThan(4);
    }
  });

  it('Tonkurve: 0-mag-Stern bei β = 0 in einer Pixelmitte erreicht mit k = 1 gerade Weiß', () => {
    // Richtung so, dass der Bildpunkt genau in der Pixelmitte (1000,5 | 300,5) liegt
    const dx = (1000.5 - cam.cx) / cam.f;
    const dy = (300.5 - cam.cy) / cam.f;
    const v = [-dx, -dy, 1];
    const l = Math.hypot(...v);
    const n = v.map((c) => c / l);
    for (const lens of [{ enabled: false }, { enabled: true, fwhmPx: 2 }]) {
      const res = renderExposure(oneStar(n, 1, 5800), {
        camera: cam, betaAt: () => 0, tauMid: 0, exposure: TB, effects: EFFECTS, lens,
      });
      const s = toneScale(1, lens);
      const o = 3 * (300 * cam.width + 1000);
      const L = 0.2126 * res.energy[o] + 0.7152 * res.energy[o + 1] + 0.0722 * res.energy[o + 2];
      expect(L * s).toBeCloseTo(1, 4);
      expect(psfPeak(lens)).toBeLessThanOrEqual(1);
      const rgba = toneMap(res.energy, cam.width, cam.height, s);
      expect(Math.max(rgba[4 * (300 * cam.width + 1000)], rgba[4 * (300 * cam.width + 1000) + 1])).toBe(255);
    }
  });

  it('Ohne Objektiv keine Zusatzeffekte: Licht nur in den Pixeln der Bildpunkte', () => {
    const p = filmProfile();
    const stars = generateStars(9096, STAR_SEED);
    const res = renderExposure(stars, {
      camera: cam, betaAt: p.betaAt, tauMid: 2, exposure: TB, effects: EFFECTS, lens: { enabled: false },
    });
    let lit = 0;
    for (let i = 0; i < res.energy.length; i += 3) if (res.energy[i] + res.energy[i + 1] + res.energy[i + 2] > 0) lit++;
    const stepsInFrame = res.records.reduce((s, r) => s + r.steps, 0);
    expect(lit).toBeLessThanOrEqual(stepsInFrame);
  });
});

describe('Hilfsfunktionen', () => {
  it('Zeiten lesen und schreiben', () => {
    expect(parseExposureTime('1/48')).toBeCloseTo(1 / 48, 15);
    expect(parseExposureTime('0,02 s')).toBeCloseTo(0.02, 15);
    expect(parseFilmTime('00:56:54')).toBe(3414);
    expect(formatFilmTime(3416.99)).toBe('00:56:56.990');
  });

  it('Sequenz: mindestens 4 Bilder, alle Belichtungen innerhalb der Phase', () => {
    const t = sequenceTimes(3, TB, 6);
    expect(t.length).toBe(6);
    expect(t[0] - TB / 2).toBeCloseTo(0, 12);
    expect(t[5] + TB / 2).toBeCloseTo(3, 12);
  });

  it('ZIP: CRC-32 und Aufbau', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    const z = createZip([{ name: 'a.txt', data: 'hallo' }, { name: 'b.csv', data: 'x;y\n' }]);
    const dv = new DataView(z.buffer);
    expect(dv.getUint32(0, true)).toBe(0x04034b50);
    expect(dv.getUint32(z.length - 22, true)).toBe(0x06054b50);
    expect(dv.getUint16(z.length - 12, true)).toBe(2);
  });
});
