/*
 * Erstellt mit Claude Code (KI-Werkzeug) im Auftrag von Dominik Wittkow,
 * W-Seminar Physik, CSG Ingolstadt, 23.11.2026.
 *
 * urlstate.js — Einstellungen in der Adresse (URL) der Seite (keine Physik).
 * In die Adresse kommen nur Werte, die von der Vorgabe abweichen, z. B.
 *   ?beta=0,9&fov=90&cam-lens=1&star-model=camera&view=12.5,-3
 * Wer die Adresse kopiert und öffnet, sieht dieselben Einstellungen.
 */

/** Interner Schlüssel (panel.js) → Name in der Adresse. */
export function urlKey(key) {
  if (key === 'beta:input') return 'beta';
  if (key === 'radio:accmode-sim') return 'accel.mode';
  if (key.startsWith('accel:')) return `accel.${key.slice(6)}`;
  if (key.startsWith('radio:')) return key.slice(6);
  return key;
}

/** Wert → Text in der Adresse (Kontrollkästchen als 1/0). */
function encodeValue(v) {
  if (v === true) return '1';
  if (v === false) return '0';
  return String(v);
}

/** Zeichen, die in einer Abfrage erlaubt sind, lesbar lassen (Komma, Schrägstrich, Doppelpunkt). */
const enc = (s) => encodeURIComponent(s).replace(/%2C/gi, ',').replace(/%2F/gi, '/').replace(/%3A/gi, ':');

/**
 * Abfrageteil der Adresse aus den aktuellen Werten.
 * @param {object} values   aktuelle Werte {interner Schlüssel: Wert}
 * @param {object} defaults Vorgaben (gleiche Schlüssel); gleiche Werte entfallen
 * @param {{yawDeg:number, pitchDeg:number}} [view] Blickrichtung, entfällt bei (0, 0)
 * @returns {string} '' oder '?…'
 */
export function encodeSettings(values, defaults, view) {
  const parts = [];
  for (const [k, v] of Object.entries(values)) {
    if (defaults && k in defaults && defaults[k] === v) continue;
    parts.push(`${enc(urlKey(k))}=${enc(encodeValue(v))}`);
  }
  if (view) {
    const r = (x) => Math.round(x * 100) / 100;
    const y = r(view.yawDeg);
    const p = r(view.pitchDeg);
    if (y !== 0 || p !== 0) parts.push(`view=${y},${p}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

/**
 * Werte aus der Adresse lesen.
 * @param {string} search   location.search
 * @param {object} defaults Vorgaben: bestimmen die bekannten Schlüssel und den Typ (Kontrollkästchen = boolean)
 * @returns {{values: object, view: {yawDeg:number, pitchDeg:number}|null, found: boolean}}
 */
export function decodeSettings(search, defaults) {
  const params = new URLSearchParams(search);
  const byUrl = new Map(Object.keys(defaults).map((k) => [urlKey(k), k]));
  const values = {};
  let view = null;
  let found = false;
  for (const [name, raw] of params) {
    if (name === 'view') {
      const [y, p] = raw.split(',').map(Number);
      if (Number.isFinite(y) && Number.isFinite(p)) {
        view = { yawDeg: y, pitchDeg: p };
        found = true;
      }
      continue;
    }
    const k = byUrl.get(name);
    if (!k) continue; // unbekannte Parameter übergehen
    values[k] = typeof defaults[k] === 'boolean' ? raw === '1' || raw === 'true' : raw;
    found = true;
  }
  return { values, view, found };
}
