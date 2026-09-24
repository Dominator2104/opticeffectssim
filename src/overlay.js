/*
 * Erstellt mit Claude Code (KI-Werkzeug) im Auftrag von Dominik Wittkow,
 * W-Seminar Physik, CSG Ingolstadt, 24.09.2026.
 *
 * overlay.js — Cockpit-Bild über der Simulation.
 *
 * Das Bild (Standbild aus dem Film) liefert der Auftraggeber als
 * assets/cockpit.png. ES IST URHEBERRECHTLICH GESCHÜTZT: nur lokal verwenden,
 * nicht veröffentlichen. Die Datei steht deshalb in .gitignore und wird auch
 * nicht in den Build (dist/) kopiert.
 *
 * Fehlt die Datei, erscheint ein gezeichneter Platzhalter; das Programm läuft
 * in jedem Fall weiter. Über "Bild wählen…" kann das Bild auch direkt
 * ausgewählt werden (nötig z. B., wenn der Build von einem anderen Ort aus
 * geöffnet wird).
 */

/**
 * Orte, an denen nach dem Bild gesucht wird, der Reihe nach:
 *   ./assets/cockpit.png   Entwicklungsserver (npm run dev)
 *   ../assets/cockpit.png  Build, geöffnet als dist/index.html im Projektordner
 */
const CANDIDATE_URLS = ['./assets/cockpit.png', '../assets/cockpit.png'];

/**
 * Platzhalter als SVG: dunkler Rahmen mit durchsichtigem Fenster und zwei
 * Streben, dazu ein Hinweis. Stellt kein echtes Cockpit dar.
 */
function placeholderDataUrl() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <defs><mask id="m"><rect width="1600" height="900" fill="#fff"/>
    <path d="M260 120 H1340 L1500 700 H100 Z" fill="#000"/></mask></defs>
  <rect width="1600" height="900" fill="#1a1d24" mask="url(#m)"/>
  <path d="M800 120 L800 700 M520 120 L330 700 M1080 120 L1270 700" stroke="#1a1d24" stroke-width="18"/>
  <text x="800" y="800" fill="#8a93a6" font-family="sans-serif" font-size="34" text-anchor="middle">
    Platzhalter – assets/cockpit.png nicht gefunden (Bild wählen…)</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Versucht ein Bild zu laden; löst mit true/false auf, wirft nie. */
function tryLoad(img, url) {
  return new Promise((resolve) => {
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

/**
 * @param {HTMLImageElement} img  das <img>-Element über dem Canvas
 * @returns {{ setVisible(v:boolean):void, setOpacity(o:number):void, loadFile(f:File):void,
 *             status():string, image:HTMLImageElement, isVisible():boolean, opacity():number }}
 */
export function createCockpitOverlay(img) {
  let visible = false;
  let opacity = 0.9;
  let status = 'Suche assets/cockpit.png …';
  let objectUrl = null;

  (async () => {
    for (const url of CANDIDATE_URLS) {
      if (await tryLoad(img, url)) {
        status = `geladen: ${url}`;
        return;
      }
    }
    await tryLoad(img, placeholderDataUrl());
    status = 'Platzhalter (assets/cockpit.png fehlt)';
  })();

  function apply() {
    img.hidden = !visible;
    img.style.opacity = String(opacity);
  }
  apply();

  return {
    image: img,
    setVisible(v) {
      visible = v;
      apply();
    },
    setOpacity(o) {
      opacity = o;
      apply();
    },
    async loadFile(file) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(file);
      status = (await tryLoad(img, objectUrl)) ? `geladen: ${file.name}` : `Fehler beim Laden von ${file.name}`;
    },
    status: () => status,
    isVisible: () => visible,
    opacity: () => opacity,
  };
}

/**
 * Standbild als PNG: Simulation (WebGL-Canvas) + ggf. Cockpit + ggf. Beschriftung.
 * Muss direkt nach dem Rendern aufgerufen werden, weil der WebGL-Zeichenpuffer
 * danach geleert werden darf.
 *
 * Ein Bild, das per file:// geladen wurde, "verunreinigt" den Canvas
 * (Sicherheitsregel der Browser); dann wird ohne Cockpit gespeichert und das
 * gemeldet. Mit "Bild wählen…" geladene Bilder sind davon nicht betroffen.
 *
 * @returns {Promise<{blob: Blob, withoutCockpit: boolean}>}
 */
export async function composeSnapshot(glCanvas, overlay, caption) {
  const W = glCanvas.width;
  const H = glCanvas.height;
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const g = out.getContext('2d');
  g.drawImage(glCanvas, 0, 0);
  const base = g.getImageData(0, 0, W, H); // Sicherung ohne Cockpit

  let withoutCockpit = false;
  const img = overlay.image;
  if (overlay.isVisible() && img.complete && img.naturalWidth > 0) {
    // wie CSS object-fit: cover
    const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const dw = img.naturalWidth * s;
    const dh = img.naturalHeight * s;
    g.globalAlpha = overlay.opacity();
    g.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    g.globalAlpha = 1;
  }
  if (caption) drawCaption(g, caption, W, H);

  try {
    return { blob: await toBlob(out), withoutCockpit };
  } catch {
    // Canvas verunreinigt → ohne Cockpit neu zusammensetzen
    const clean = document.createElement('canvas');
    clean.width = W;
    clean.height = H;
    const c = clean.getContext('2d');
    c.putImageData(base, 0, 0);
    if (caption) drawCaption(c, caption, W, H);
    withoutCockpit = true;
    return { blob: await toBlob(clean), withoutCockpit };
  }
}

function toBlob(canvas) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG konnte nicht erzeugt werden'))), 'image/png');
    } catch (e) {
      reject(e);
    }
  });
}

function drawCaption(g, text, W, H) {
  const size = Math.max(12, Math.round(H / 55));
  g.font = `${size}px system-ui, sans-serif`;
  const pad = Math.round(size * 0.5);
  const tw = g.measureText(text).width;
  g.fillStyle = 'rgba(0, 0, 0, 0.6)';
  g.fillRect(0, H - size - 2 * pad, tw + 2 * pad, size + 2 * pad);
  g.fillStyle = '#d8dde8';
  g.textBaseline = 'middle';
  g.fillText(text, pad, H - pad - size / 2);
}
