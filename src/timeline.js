/*
 * Erstellt mit Claude Code (KI-Werkzeug) im Auftrag von Dominik Wittkow,
 * W-Seminar Physik, CSG Ingolstadt, 24.11.2026.
 *
 * timeline.js — Zeitablauf eines Videos (keine Physik, reine Funktionen,
 * getestet in tests/timeline.test.js): Welche Bordzeit τ gehört zur
 * Videozeit w?
 *
 * Ablauf „Beschleunigungsphase“:
 *   Vorlauf  (β₀ konstant)      τ wächst mit dem Zeitmaßstab s₀
 *   Phase                        τ wächst mit s₀
 *   Nachlauf (β₁ konstant)       Zeitraffer: Der Maßstab geht in der Übergangszeit
 *                                sanft von s₀ auf s₁ und bleibt dann bei s₁.
 *
 * Der Übergang ist logarithmisch: ln s(u) = ln s₀ + (ln s₁ − ln s₀)·g(u/T),
 * g(x) = 3x² − 2x³ (glatter Anfang und glattes Ende). So wird jede
 * Größenordnung des Zeitraffers gleich lange gezeigt – bei linearer
 * Überblendung sprünge der Maßstab sofort um viele Zehnerpotenzen.
 */

const smoothstep = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** Zeitmaßstab (Bordzeit je Videosekunde) u Sekunden nach Beginn des Nachlaufs. */
export function timeLapseScale(u, s0, s1, ramp) {
  if (!(ramp > 0)) return u < 0 ? s0 : s1;
  return Math.exp(Math.log(s0) + (Math.log(s1) - Math.log(s0)) * smoothstep(u / ramp));
}

/**
 * Bordzeit, die u Sekunden Video im Nachlauf zeigen: ∫₀ᵘ s(u') du'.
 * Übergang mit der Simpsonregel (256 Teilintervalle), danach exakt s₁·(u − T).
 */
export function timeLapseProperTime(u, s0, s1, ramp) {
  if (!(u > 0)) return 0;
  if (!(ramp > 0)) return s1 * u;
  const a = Math.min(u, ramp);
  const n = 256;
  const h = a / n;
  let sum = timeLapseScale(0, s0, s1, ramp) + timeLapseScale(a, s0, s1, ramp);
  for (let i = 1; i < n; i++) sum += (i % 2 ? 4 : 2) * timeLapseScale(i * h, s0, s1, ramp);
  return (sum * h) / 3 + (u > ramp ? s1 * (u - ramp) : 0);
}

/**
 * Bordzeit seit Videobeginn zur Videozeit w (Ablauf „Beschleunigungsphase“).
 * @param {number} w           Videozeit in s
 * @param {object} o
 * @param {number} o.pre       Vorlauf in Videosekunden
 * @param {number} o.phaseTau  Dauer der Phase in Bordzeit (s)
 * @param {number} o.scale     Zeitmaßstab s₀ für Vorlauf und Phase
 * @param {number} o.postScale Zeitraffer s₁ im Nachlauf (= scale: kein Zeitraffer)
 * @param {number} o.ramp      Übergangszeit in Videosekunden (0: Sprung)
 */
export function videoProperTime(w, { pre, phaseTau, scale, postScale = scale, ramp = 0 }) {
  const phaseEnd = pre + phaseTau / scale; // Videozeit am Ende der Phase
  if (w <= phaseEnd) return w * scale;
  return pre * scale + phaseTau + timeLapseProperTime(w - phaseEnd, scale, postScale, ramp);
}
