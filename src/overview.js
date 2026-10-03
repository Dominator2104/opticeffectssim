/*
 * Erstellt mit Claude Code (KI-Werkzeug) im Auftrag von Dominik Wittkow,
 * W-Seminar Physik, CSG Ingolstadt, 24.09.2026.
 *
 * overview.js — Reiter "Übersicht": Diagramme über β und Tabellen mit
 * eintragbaren Werten. Alle Zahlen kommen aus physics.js bzw. blackbody.js;
 * hier steht nur, WAS dargestellt wird.
 */
import {
  dopplerFactor,
  dopplerFactorForward,
  dopplerFactorBackward,
  dopplerFactorFromPrime,
  aberrationPsi,
  psiPrimeOfSideStar,
  psiFromPsiPrime,
  beamingPointSource,
  beamingExtended,
  terrellRotationAngle,
  terrellLengthFactor,
  apparentTemperature,
  shiftedWavelength,
  nakedEyeVisibleCount,
  NAKED_EYE_LIMIT_MAG,
  deg,
  rad,
} from './physics.js';
import { blackbodyColor, createVisibleLuminanceLookup } from './blackbody.js';
import { createLineChart, renderLegend, decadeTicks, CHART } from './charts.js';
import {
  BETA_MAX,
  GAMMA_POINTS,
  formatNumber,
  drawGammaChart,
  drawBetaTimeChart,
  curveName,
} from './ui.js';

const $ = (id) => document.getElementById(id);
const num = formatNumber;
const BETAS = GAMMA_POINTS.map(([b]) => b); // dicht bei β → 1
const BETA_TICKS = [0, 0.2, 0.4, 0.6, 0.8, 1];
const betaFmt = (x) => (x === 0 ? '0' : x.toFixed(1).replace('.', ','));
const [BLUE, ORANGE, AQUA] = CHART.series;

function chartFor(id) {
  const canvas = $(id);
  return createLineChart(canvas, canvas.parentElement.querySelector('.chart-tip'));
}

/* ------------------------------------------------------------------------- */
/* Tabellen mit eintragbaren Zeilen                                          */
/* ------------------------------------------------------------------------- */

/**
 * @param {HTMLElement} container
 * @param {{ inputs: {label:string, step:number}[], outputs: {label:string, compute:(vals:number[], beta:number)=>string|Node}[],
 *           rows: number[][], newRow: number[] }} spec
 */
function createEditableTable(container, spec) {
  const table = document.createElement('table');
  table.className = 'data';
  const head = document.createElement('tr');
  for (const c of spec.inputs) head.append(th(c.label, 'in'));
  for (const c of spec.outputs) head.append(th(c.label));
  head.append(th(''));
  const thead = document.createElement('thead');
  thead.append(head);
  const tbody = document.createElement('tbody');
  table.append(thead, tbody);

  const add = document.createElement('button');
  add.type = 'button';
  add.textContent = '+ Zeile';
  const actions = document.createElement('div');
  actions.className = 'table-actions';
  actions.append(add);
  container.replaceChildren(table, actions);

  let beta = 0;
  const rows = [];

  function addRow(values) {
    const tr = document.createElement('tr');
    const inputs = spec.inputs.map((c, i) => {
      const td = document.createElement('td');
      td.className = 'in';
      const input = document.createElement('input');
      input.type = 'number';
      input.step = String(c.step);
      input.value = String(values[i]);
      input.setAttribute('aria-label', c.label);
      input.addEventListener('input', () => computeRow(row));
      td.append(input);
      tr.append(td);
      return input;
    });
    const outs = spec.outputs.map(() => {
      const td = document.createElement('td');
      tr.append(td);
      return td;
    });
    const del = document.createElement('td');
    del.className = 'act';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '×';
    btn.title = 'Zeile entfernen';
    btn.addEventListener('click', () => {
      rows.splice(rows.indexOf(row), 1);
      tr.remove();
    });
    del.append(btn);
    tr.append(del);
    tbody.append(tr);
    const row = { inputs, outs };
    rows.push(row);
    computeRow(row);
  }

  function computeRow(row) {
    const vals = row.inputs.map((i) => Number(String(i.value).replace(',', '.')));
    spec.outputs.forEach((c, k) => {
      const v = vals.every(Number.isFinite) ? c.compute(vals, beta) : '–';
      if (typeof v === 'string') {
        if (row.outs[k].textContent !== v) row.outs[k].textContent = v;
      } else {
        row.outs[k].replaceChildren(v);
      }
    });
  }

  add.addEventListener('click', () => addRow(spec.newRow));
  for (const r of spec.rows) addRow(r);

  return {
    update(b) {
      beta = b;
      rows.forEach(computeRow);
    },
  };
}

function th(text, cls) {
  const el = document.createElement('th');
  el.textContent = text;
  if (cls) el.className = cls;
  return el;
}

const degText = (x) => `${num(x, 4)}°`;
const pctText = (x) => `${num(100 * x, 3)} %`;

/** Bereich einer Wellenlänge (Grenzen 380 und 780 nm wie im Auftrag). */
function band(nm) {
  if (nm < 380) return 'UV';
  if (nm > 780) return 'IR';
  return 'sichtbar';
}

/** Farbfeld: Farbe eines Schwarzkörpers der Temperatur T, wie das Auge sie sähe. */
function swatch(T) {
  const c = blackbodyColor(T);
  const enc = (v) => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
  const el = document.createElement('span');
  el.className = 'swatch';
  el.style.background = `rgb(${enc(c.r)}, ${enc(c.g)}, ${enc(c.b)})`;
  el.title = `Farbe eines Schwarzkörpers mit ${Math.round(T)} K`;
  return el;
}

function createTables() {
  // Aberration: ψ in S → ψ', Verschiebung, Himmelsanteil des Kegels bis ψ
  const aberration = createEditableTable($('table-aberration'), {
    inputs: [{ label: 'ψ in S [°]', step: 1 }],
    outputs: [
      { label: "ψ′ gesehen [°]", compute: ([p], b) => degText(deg(aberrationPsi(b, rad(p)))) },
      { label: "Verschiebung ψ − ψ′ [°]", compute: ([p], b) => degText(p - deg(aberrationPsi(b, rad(p)))) },
      // Kegel bis ψ: Raumwinkel 2π(1 − cos ψ), Anteil an 4π = (1 − cos ψ)/2
      { label: 'Kegel bis ψ: Himmelsanteil in S', compute: ([p]) => pctText((1 - Math.cos(rad(p))) / 2) },
      { label: "… erscheint auf (in S′)", compute: ([p], b) => pctText((1 - Math.cos(aberrationPsi(b, rad(p)))) / 2) },
    ],
    rows: [[0], [30], [60], [90], [120], [150], [180]],
    newRow: [45],
  });

  // Terrell: gesehener Winkel ψ' → ψ in S, Drehwinkel, scheinbare Verkürzung
  const terrell = createEditableTable($('table-terrell'), {
    inputs: [{ label: "ψ′ im Sichtfeld [°]", step: 1 }],
    outputs: [
      { label: 'ψ in S [°]', compute: ([p], b) => degText(deg(psiFromPsiPrime(b, rad(p)))) },
      { label: "Drehwinkel α = ψ − ψ′ [°]", compute: ([p], b) => degText(deg(terrellRotationAngle(b, rad(p)))) },
      { label: 'scheinbare Verkürzung 1/D', compute: ([p], b) => num(terrellLengthFactor(b, rad(p)), 4) },
    ],
    rows: [[30], [60], [90], [120], [150]],
    newRow: [45],
  });

  // Doppler: gesehener Winkel ψ', Wellenlänge λ, Temperatur T → D, λ', T'
  const Dat = (p, b) => dopplerFactorFromPrime(b, Math.cos(rad(p)));
  const doppler = createEditableTable($('table-doppler'), {
    inputs: [
      { label: "ψ′ gesehen [°]", step: 1 },
      { label: 'λ [nm]', step: 1 },
      { label: 'T [K]', step: 100 },
    ],
    outputs: [
      { label: 'ψ in S [°]', compute: ([p], b) => degText(deg(psiFromPsiPrime(b, rad(p)))) },
      { label: 'D = λ′/λ', compute: ([p], b) => num(Dat(p, b), 4) },
      { label: "λ′ = λ·D [nm]", compute: ([p, l], b) => num(shiftedWavelength(l, Dat(p, b)), 4) },
      { label: "λ′ liegt im", compute: ([p, l], b) => band(shiftedWavelength(l, Dat(p, b))) },
      { label: "T′ = T/D [K]", compute: ([p, , T], b) => num(apparentTemperature(T, Dat(p, b)), 4) },
      { label: "Farbe bei T′", compute: ([p, , T], b) => (T > 0 ? swatch(apparentTemperature(T, Dat(p, b))) : '–') },
    ],
    rows: [
      [0, 550, 5800],
      [30, 550, 5800],
      [60, 550, 5800],
      [90, 550, 5800],
      [120, 550, 5800],
      [180, 550, 5800],
    ],
    newRow: [45, 656.3, 5800],
  });

  return [aberration, terrell, doppler];
}

/* ------------------------------------------------------------------------- */
/* Übersicht                                                                 */
/* ------------------------------------------------------------------------- */

export function createOverview() {
  const charts = {
    gamma: chartFor('ov-gamma'),
    doppler: chartFor('ov-doppler'),
    angle: chartFor('ov-angle'),
    beaming: chartFor('ov-beaming'),
    stars: chartFor('ov-stars'),
    betaT: chartFor('ov-beta-t'),
  };
  const tables = createTables();
  const Y = createVisibleLuminanceLookup();

  renderLegend($('ov-doppler-legend'), [
    { label: 'nach vorn (ψ = 0°)', color: BLUE },
    { label: 'quer in S (ψ = 90°)', color: ORANGE },
    { label: 'nach hinten (ψ = 180°)', color: AQUA },
  ]);
  renderLegend($('ov-beaming-legend'), [
    { label: 'D⁻² Punkt (Sterne)', color: BLUE },
    { label: 'D⁻⁴ Fläche (Körper)', color: ORANGE },
  ]);
  renderLegend($('ov-stars-legend'), [
    { label: 'sichtbar', color: BLUE },
    { label: 'nicht sichtbar', color: ORANGE },
  ]);

  // Kurven, die nur von β abhängen, einmal berechnen
  const dopplerSeries = [
    { points: BETAS.map((b) => [b, dopplerFactorForward(b)]), color: BLUE },
    { points: BETAS.map((b) => [b, dopplerFactor(b, 0)]), color: ORANGE },
    { points: BETAS.map((b) => [b, dopplerFactorBackward(b)]), color: AQUA },
  ];
  const angleSeries = [{ points: BETAS.map((b) => [b, deg(psiPrimeOfSideStar(b))]), color: BLUE }];
  const beamingSeries = [
    { points: BETAS.map((b) => [b, beamingPointSource(dopplerFactorForward(b))]), color: BLUE },
    { points: BETAS.map((b) => [b, beamingExtended(dopplerFactorForward(b))]), color: ORANGE },
  ];

  // Sichtbare Sterne: hängt vom Sternfeld ab → bei neuem Sternfeld neu rechnen
  let starsCache = null;
  function starSeries(stars) {
    if (starsCache && starsCache.stars === stars) return starsCache;
    const stride = Math.max(1, Math.ceil(stars.count / 20000)); // höchstens 20 000 Sterne auswerten
    const betas = BETAS.filter((_, i) => i % 3 === 0).concat([BETA_MAX]);
    const counts = betas.map((b) => nakedEyeVisibleCount(stars, b, Y, stride));
    starsCache = {
      stars,
      stride,
      visible: betas.map((b, i) => [b, counts[i].visible]),
      invisible: betas.map((b, i) => [b, counts[i].invisible]),
    };
    $('ov-stars-note').textContent =
      `Sternfeld der Simulation (${stars.count.toLocaleString('de-DE')} Sterne, in Ruhe alle ≤ ${String(NAKED_EYE_LIMIT_MAG).replace('.', ',')} mag` +
      (stride > 1 ? `; ausgewertet jeder ${stride}. Stern, hochgerechnet` : '') +
      '). Doppler und Beaming im sichtbaren Licht berücksichtigt. Schwächere Sterne, die vorn heller würden, ' +
      'sind im Sternfeld nicht enthalten.';
    return starsCache;
  }
  const interp = (pts, x) => {
    for (let i = 1; i < pts.length; i++) {
      if (x <= pts[i][0]) {
        const [x0, y0] = pts[i - 1];
        const [x1, y1] = pts[i];
        return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
      }
    }
    return pts[pts.length - 1][1];
  };

  let lastBeta = NaN;

  /** Einmal pro Bild aufrufen, solange die Übersicht sichtbar ist. */
  function update(state, stars) {
    const beta = state.beta;
    const bClamp = (x) => Math.min(BETA_MAX, Math.max(0, x));

    drawGammaChart(charts.gamma, state);

    charts.doppler.draw({
      xMin: 0, xMax: 1, yMin: 0.01, yMax: 100, logY: true,
      xTicks: BETA_TICKS, yTicks: decadeTicks(0.01, 100), xFormat: betaFmt,
      yFormat: (y) => num(y, 1),
      series: dopplerSeries,
      markers: [
        { x: beta, y: dopplerFactorForward(beta), color: BLUE },
        { x: beta, y: dopplerFactor(beta, 0), color: ORANGE },
        { x: beta, y: dopplerFactorBackward(beta), color: AQUA },
      ],
      hover: (x) => {
        const b = bClamp(x);
        return {
          title: `β = ${num(b, 3)}`,
          rows: [
            { y: dopplerFactorForward(b), color: BLUE, text: `vorn D = ${num(dopplerFactorForward(b), 4)}` },
            { y: dopplerFactor(b, 0), color: ORANGE, text: `quer D = ${num(dopplerFactor(b, 0), 4)}` },
            { y: dopplerFactorBackward(b), color: AQUA, text: `hinten D = ${num(dopplerFactorBackward(b), 4)}` },
          ],
        };
      },
    });

    charts.angle.draw({
      xMin: 0, xMax: 1, yMin: 0, yMax: 90,
      xTicks: BETA_TICKS, yTicks: [0, 30, 60, 90], xFormat: betaFmt, yFormat: (y) => `${y}°`,
      series: angleSeries,
      markers: [{ x: beta, y: deg(psiPrimeOfSideStar(beta)), color: BLUE }],
      hover: (x) => {
        const b = bClamp(x);
        return { title: `β = ${num(b, 3)}`, rows: [{ y: deg(psiPrimeOfSideStar(b)), color: BLUE, text: `ψ′ = arccos β = ${num(deg(psiPrimeOfSideStar(b)), 4)}°` }] };
      },
    });

    charts.beaming.draw({
      xMin: 0, xMax: 1, yMin: 1, yMax: 1e7, logY: true,
      xTicks: BETA_TICKS, yTicks: decadeTicks(1, 1e7), xFormat: betaFmt,
      yFormat: (y) => (y < 1e4 ? String(y) : `10${['⁴', '⁵', '⁶', '⁷'][Math.round(Math.log10(y)) - 4]}`),
      series: beamingSeries,
      markers: [
        { x: beta, y: beamingPointSource(dopplerFactorForward(beta)), color: BLUE },
        { x: beta, y: beamingExtended(dopplerFactorForward(beta)), color: ORANGE },
      ],
      hover: (x) => {
        const D = dopplerFactorForward(bClamp(x));
        return {
          title: `β = ${num(bClamp(x), 3)}`,
          rows: [
            { y: beamingPointSource(D), color: BLUE, text: `D⁻² = ${num(beamingPointSource(D), 4)}` },
            { y: beamingExtended(D), color: ORANGE, text: `D⁻⁴ = ${num(beamingExtended(D), 4)}` },
          ],
        };
      },
    });

    const sc = starSeries(stars);
    const n = stars.count;
    charts.stars.draw({
      xMin: 0, xMax: 1, yMin: 0, yMax: n,
      xTicks: BETA_TICKS, yTicks: [0, n / 4, n / 2, (3 * n) / 4, n], xFormat: betaFmt,
      yFormat: (y) => Math.round(y).toLocaleString('de-DE'),
      series: [
        { points: sc.visible, color: BLUE },
        { points: sc.invisible, color: ORANGE },
      ],
      markers: [
        { x: beta, y: interp(sc.visible, beta), color: BLUE },
        { x: beta, y: interp(sc.invisible, beta), color: ORANGE },
      ],
      hover: (x) => {
        const b = bClamp(x);
        const v = interp(sc.visible, b);
        return {
          title: `β = ${num(b, 3)}`,
          rows: [
            { y: v, color: BLUE, text: `sichtbar ≈ ${Math.round(v).toLocaleString('de-DE')} (${num((100 * v) / n, 3)} %)` },
            { y: n - v, color: ORANGE, text: `nicht sichtbar ≈ ${Math.round(n - v).toLocaleString('de-DE')}` },
          ],
        };
      },
    });

    const fig = $('ov-beta-t-figure');
    fig.hidden = !state.accel.active;
    if (state.accel.active) {
      fig.querySelector('.curve-name').textContent = curveName(state.accel.curve);
      drawBetaTimeChart(charts.betaT, state);
    }

    if (beta !== lastBeta) {
      lastBeta = beta;
      for (const t of tables) t.update(beta);
    }
  }

  return { update };
}
