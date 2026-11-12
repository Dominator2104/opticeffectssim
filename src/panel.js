/*
 * Erstellt mit Claude Code (KI-Werkzeug) im Auftrag von Dominik Wittkow,
 * W-Seminar Physik, CSG Ingolstadt, 12.11.2026.
 *
 * panel.js — allgemeine Bedienung der Seitenleiste (keine Physik):
 *   - einklappbare Abschnitte, Zustand wird gemerkt
 *   - alle Einstellungen im Browser speichern und beim nächsten Öffnen wiederherstellen
 *   - Tastenkürzel und Hilfe-Fenster
 *   - schmale Bildschirme: Einstellungen als ausklappbare Leiste
 */

const $ = (id) => document.getElementById(id);
const STORE_KEY = 'opticeffectssim.settings.v1';
const SECTIONS_KEY = 'opticeffectssim.sections.v1';

/** localStorage kann fehlen oder gesperrt sein (privates Fenster): nie werfen. */
function load(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}
function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Speichern nicht möglich – Programm läuft trotzdem */
  }
}

/** Bedienelemente der Seitenleiste, deren Wert gespeichert wird (in Dokumentreihenfolge). */
function persistentControls() {
  const panel = $('panel');
  return [...panel.querySelectorAll('input, select')].filter((el) => {
    if (el.type === 'file' || el.type === 'button' || (el.type === 'range' && el.closest('.beta-control'))) return false;
    return !!keyOf(el);
  });
}

/** Schlüssel eines Bedienelements: id, sonst Instanz + data-k (β- und Beschleunigungsregler), Radios über den Namen. */
function keyOf(el) {
  if (el.type === 'radio') return el.name ? `radio:${el.name}` : null;
  if (el.id) return el.id;
  const box = el.closest('[data-instance="sim"]');
  if (box && el.dataset.k) return `${box.classList.contains('accel-control') ? 'accel' : 'beta'}:${el.dataset.k}`;
  return null;
}

function snapshot() {
  const out = {};
  for (const el of persistentControls()) {
    const k = keyOf(el);
    if (el.type === 'radio') {
      if (el.checked) out[k] = el.value;
    } else if (el.type === 'checkbox') {
      out[k] = el.checked;
    } else {
      out[k] = el.value;
    }
  }
  return out;
}

/** Gespeicherte Werte setzen und die üblichen Ereignisse auslösen, damit der Zustand folgt. */
function restore(values) {
  if (!values) return;
  const fire = (el) => {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  for (const el of persistentControls()) {
    const k = keyOf(el);
    if (!(k in values)) continue;
    const v = values[k];
    if (el.type === 'radio') {
      if (el.value === v && !el.checked) {
        el.checked = true;
        fire(el);
      }
    } else if (el.type === 'checkbox') {
      if (el.checked !== v) {
        el.checked = v;
        fire(el);
      }
    } else if (el.tagName === 'SELECT') {
      if ([...el.options].some((o) => o.value === v) && el.value !== v) {
        el.value = v;
        fire(el);
      }
    } else if (el.value !== v) {
      el.value = v;
      fire(el);
    }
  }
}

/**
 * @param {object} o
 * @param {object} o.state
 * @param {object} o.actions  { playPause(), toggle3d(), frontView(), exportPng(), openVideo(), present() }
 */
export function setupPanel({ state, actions }) {
  // ---- Abschnitte ----
  const sections = [...document.querySelectorAll('#panel details.sec')];
  const open = load(SECTIONS_KEY) || {};
  for (const d of sections) {
    if (d.id in open) d.open = open[d.id];
    d.addEventListener('toggle', () => {
      open[d.id] = d.open;
      save(SECTIONS_KEY, open);
    });
  }

  // ---- Einstellungen speichern ----
  restore(load(STORE_KEY));
  let timer = 0;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => save(STORE_KEY, snapshot()), 400);
  };
  $('panel').addEventListener('change', schedule);
  $('panel').addEventListener('input', schedule);
  window.addEventListener('pagehide', () => save(STORE_KEY, snapshot()));

  // ---- schmale Bildschirme: Einstellungen als ausklappbare Leiste ----
  const setDrawer = (on) => {
    document.body.classList.toggle('panel-open', on);
    $('panel-backdrop').hidden = !on;
    $('panel-toggle').setAttribute('aria-expanded', String(on));
  };
  $('panel-toggle').addEventListener('click', () => setDrawer(!document.body.classList.contains('panel-open')));
  $('panel-fab').addEventListener('click', () => setDrawer(true));
  $('panel-close').addEventListener('click', () => setDrawer(false));
  $('panel-backdrop').addEventListener('click', () => setDrawer(false));

  // ---- Hilfe ----
  const help = $('help-dialog');
  const showHelp = () => (help.open ? help.close() : help.showModal?.());
  $('help-btn').addEventListener('click', showHelp);

  // ---- Tastenkürzel ----
  const clickToggle = (id) => {
    const el = $(id);
    el.checked = !el.checked;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (state.presenting && (e.key === ' ' || e.key === 'Escape')) return; // regelt der Präsentationsmodus
    switch (e.key) {
      case ' ':
        e.preventDefault();
        actions.playPause();
        break;
      case '3':
        clickToggle('mode3d');
        break;
      case 'f':
      case 'F':
        actions.frontView();
        break;
      case 'l':
      case 'L':
        clickToggle('cam-lens');
        break;
      case 'b':
      case 'B':
        clickToggle('blur-on');
        break;
      case 'h':
      case 'H':
        clickToggle('hud-on');
        break;
      case 'e':
      case 'E':
        actions.exportPng();
        break;
      case 'v':
      case 'V':
        actions.openVideo();
        break;
      case 'p':
      case 'P':
        actions.present();
        break;
      case 'd':
      case 'D':
        $('sec-debug').open = !$('sec-debug').open;
        if ($('sec-debug').open) $('sec-debug').scrollIntoView({ block: 'nearest' });
        break;
      case '?':
        showHelp();
        break;
      case 'Escape':
        setDrawer(false);
        break;
      default:
        return;
    }
  });

  return {
    /** Gespeicherte Einstellungen löschen und neu laden. */
    resetAll() {
      try {
        localStorage.removeItem(STORE_KEY);
        localStorage.removeItem(SECTIONS_KEY);
      } catch {
        /* egal */
      }
      location.reload();
    },
    setDrawer,
  };
}
