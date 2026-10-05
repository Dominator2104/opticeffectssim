/*
 * Erstellt mit Claude Code (KI-Werkzeug) im Auftrag von Dominik Wittkow,
 * W-Seminar Physik, CSG Ingolstadt, 24.09.2026.
 *
 * charts.js — einfache Liniendiagramme auf <canvas> (keine Physik).
 *
 * Gestaltung nach festen Regeln: 2-px-Linien, zurückhaltende Haarlinien als
 * Gitter, Marker beim aktuellen Wert (r = 5 px mit Ring in der Flächenfarbe),
 * Fadenkreuz und Tooltip beim Überfahren mit der Maus. Die Linienfarben sind
 * mit dem Farbprüfskript der Diagramm-Richtlinien geprüft (Helligkeitsband,
 * Unterscheidbarkeit auch bei Farbsehschwäche, Kontrast ≥ 3:1 auf #151922).
 */

export const CHART = {
  surface: '#151922',
  grid: '#262c3a',
  axisText: '#8a93a6',
  crosshair: '#5a6378',
  // feste Reihenfolge: 1. Blau, 2. Orange, 3. Türkis
  series: ['#3987e5', '#d95926', '#199e70'],
};

/**
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement|null} tip  Element für den Tooltip (innerhalb der <figure>)
 */
export function createLineChart(canvas, tip) {
  let hoverX = null;
  let geom = null;
  // Neu zeichnen nur, wenn sich Schlüssel (opts.key), Maus oder Größe ändern
  let lastKey;
  let lastSize = '';
  let hoverDirty = true;

  canvas.addEventListener('pointermove', (e) => {
    if (!geom) return;
    const rect = canvas.getBoundingClientRect();
    const frac = (e.clientX - rect.left - geom.pad.l) / (geom.w - geom.pad.l - geom.pad.r);
    hoverX = frac < 0 || frac > 1 ? null : geom.xMin + frac * (geom.xMax - geom.xMin);
    hoverDirty = true;
  });
  canvas.addEventListener('pointerleave', () => {
    hoverX = null;
    hoverDirty = true;
  });

  /**
   * opts: {
   *   xMin, xMax, yMin, yMax, logY?, xTicks, yTicks, xFormat(x), yFormat(y),
   *   series: [{ points: [[x, y], …], color, label }],
   *   markers?: [{ x, y, color }],
   *   hover?: (x) => ({ title, rows: [{ label, y, color, text }] }),
   *   key?: Wert, der sich ändert, wenn neu gezeichnet werden muss (z. B. β)
   * }
   */
  function draw(opts) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    const size = `${w}x${h}x${dpr}`;
    if (opts.key !== undefined && opts.key === lastKey && !hoverDirty && size === lastSize) return;
    lastKey = opts.key;
    lastSize = size;
    hoverDirty = false;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = CHART.surface;
    g.fillRect(0, 0, w, h);

    const pad = { l: 40, r: 10, t: 8, b: 20 };
    const ty = opts.logY ? (y) => Math.log10(Math.max(y, 1e-300)) : (y) => y;
    const y0 = ty(opts.yMin);
    const y1 = ty(opts.yMax);
    const X = (x) => pad.l + ((x - opts.xMin) / (opts.xMax - opts.xMin)) * (w - pad.l - pad.r);
    const Y = (y) => h - pad.b - ((ty(y) - y0) / (y1 - y0)) * (h - pad.t - pad.b);
    geom = { pad, w, h, xMin: opts.xMin, xMax: opts.xMax };

    // Gitter und Achsenbeschriftung
    g.font = '10px system-ui, sans-serif';
    g.fillStyle = CHART.axisText;
    g.strokeStyle = CHART.grid;
    g.lineWidth = 1;
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (const y of opts.yTicks) {
      const py = Math.round(Y(y)) + 0.5;
      g.beginPath(); g.moveTo(pad.l, py); g.lineTo(w - pad.r, py); g.stroke();
      g.fillText(opts.yFormat(y), pad.l - 4, py);
    }
    g.textBaseline = 'top';
    opts.xTicks.forEach((x, i) => {
      const px = Math.round(X(x)) + 0.5;
      g.beginPath(); g.moveTo(px, pad.t); g.lineTo(px, h - pad.b); g.stroke();
      // erste Beschriftung linksbündig, letzte rechtsbündig, damit nichts abgeschnitten wird
      g.textAlign = i === 0 ? 'left' : i === opts.xTicks.length - 1 ? 'right' : 'center';
      g.fillText(opts.xFormat(x), px, h - pad.b + 4);
    });

    // Kurven: 2 px, runde Verbindungen, auf die Zeichenfläche beschnitten
    g.save();
    g.beginPath();
    g.rect(pad.l, pad.t - 4, w - pad.l - pad.r, h - pad.t - pad.b + 8);
    g.clip();
    g.lineWidth = 2;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    for (const s of opts.series) {
      g.strokeStyle = s.color;
      g.beginPath();
      s.points.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
      g.stroke();
    }
    g.restore();

    // Fadenkreuz und Tooltip
    if (hoverX !== null && opts.hover && tip) {
      const info = opts.hover(hoverX);
      const px = X(hoverX);
      g.strokeStyle = CHART.crosshair;
      g.beginPath(); g.moveTo(px, pad.t); g.lineTo(px, h - pad.b); g.stroke();
      for (const r of info.rows) {
        if (Number.isFinite(r.y)) drawDot(g, px, Y(Math.min(Math.max(r.y, opts.yMin), opts.yMax)), 4, r.color);
      }
      tip.hidden = false;
      tip.replaceChildren();
      const head = document.createElement('div');
      head.textContent = info.title;
      tip.append(head);
      for (const r of info.rows) {
        const line = document.createElement('div');
        const key = document.createElement('span');
        key.className = 'key';
        key.style.cssText = `display:inline-block;width:10px;height:2px;margin-right:5px;vertical-align:middle;background:${r.color}`;
        line.append(key, document.createTextNode(r.text));
        tip.append(line);
      }
      const left = px + 10 + tip.offsetWidth > w ? px - 10 - tip.offsetWidth : px + 10;
      tip.style.left = `${left + canvas.offsetLeft}px`;
      tip.style.top = `${canvas.offsetTop + pad.t + 4}px`;
    } else if (tip) {
      tip.hidden = true;
    }

    // Marker beim aktuellen Wert
    for (const m of opts.markers || []) {
      if (Number.isFinite(m.y) && m.y >= opts.yMin && m.y <= opts.yMax) drawDot(g, X(m.x), Y(m.y), 5, m.color);
    }
  }

  return { draw };
}

function drawDot(g, x, y, r, color) {
  g.fillStyle = CHART.surface;
  g.beginPath(); g.arc(x, y, r + 2, 0, 2 * Math.PI); g.fill();
  g.fillStyle = color;
  g.beginPath(); g.arc(x, y, r, 0, 2 * Math.PI); g.fill();
}

/** Legende über einem Diagramm: kurze Linie in Serienfarbe + Text in Textfarbe. */
export function renderLegend(el, items) {
  el.replaceChildren(
    ...items.map(({ label, color }) => {
      const span = document.createElement('span');
      const key = document.createElement('span');
      key.className = 'key';
      key.style.background = color;
      span.append(key, document.createTextNode(label));
      return span;
    }),
  );
}

/** Zehnerpotenzen zwischen lo und hi als Teilstriche einer logarithmischen Achse. */
export function decadeTicks(lo, hi) {
  const ticks = [];
  for (let e = Math.ceil(Math.log10(lo)); e <= Math.floor(Math.log10(hi)); e++) ticks.push(10 ** e);
  return ticks;
}
