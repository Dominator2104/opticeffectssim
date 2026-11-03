/*
 * Erstellt mit Claude Code (KI-Werkzeug) im Auftrag von Dominik Wittkow,
 * W-Seminar Physik, CSG Ingolstadt, 03.11.2026.
 *
 * exposureView.js — Abschnitt "Belichtung (Filmvergleich)": Bedienelemente,
 * Anzeige des belichteten Bildes in der Hauptansicht und die Exporte
 * (Bildpaar, Sequenz, Einzelbild; je PNG + JSON + CSV, gebündelt als ZIP).
 *
 * Gerechnet wird ausschließlich mit exposure.js / physics.js; diese Datei
 * verbindet nur Oberfläche und Rechnung.
 */
import { generateStars, STAR_SEED } from './stars.js';
import {
  EXPORT_DEFAULTS,
  FILM_SCENE,
  STAR_COUNT_OPTIONS,
  starsPerSteradian,
  exposureSetup,
  renderExposure,
  toneMap,
  toneScale,
  describeLens,
  exposureMetadata,
  exposureCsv,
  sequenceTimes,
  formatFilmTime,
  parseFilmTime,
  parseExposureTime,
} from './exposure.js';
import { accelTiming, formatNumber } from './ui.js';
import { createZip } from './zip.js';

const $ = (id) => document.getElementById(id);
const num = formatNumber;

/**
 * @param {object} o
 * @param {object} o.state     zentraler Zustand (main.js)
 * @param {object} o.overlay   Cockpit-Overlay (overlay.js)
 * @param {object} o.ui        createUI()-Rückgabe (für refreshAccel)
 * @param {(shown:boolean)=>void} o.onShowChange
 */
export function createExposureView({ state, overlay, ui, onShowChange }) {
  const ex = (state.exposure = {
    show: false,
    tb: EXPORT_DEFAULTS.exposureS,
    tauMid: null, // null: kurz vor dem Ende der Beschleunigung (Belichtung endet mit ihr)
    filmStartS: FILM_SCENE.filmStartS,
    lens: true,
    fwhmPx: EXPORT_DEFAULTS.fwhmPx,
    k: EXPORT_DEFAULTS.k,
    starCount: EXPORT_DEFAULTS.starCount,
    cockpit: false,
    seqCount: 6,
  });
  const W = EXPORT_DEFAULTS.width;
  const H = EXPORT_DEFAULTS.height;
  const canvas = $('exp-canvas');
  canvas.width = W;
  canvas.height = H;
  const starCache = new Map();
  const starsFor = (count) => {
    if (!starCache.has(count)) starCache.set(count, generateStars(count, STAR_SEED));
    return starCache.get(count);
  };

  // ---- Bedienelemente ----
  $('exp-stars').innerHTML = STAR_COUNT_OPTIONS.map((c) =>
    `<option value="${c}"${c === ex.starCount ? ' selected' : ''}>${c.toLocaleString('de-DE')} Sterne` +
    ` (${num(starsPerSteradian(c), 3)} je sr)</option>`).join('');

  $('exp-show').addEventListener('change', (e) => {
    ex.show = e.target.checked;
    canvas.hidden = !ex.show;
    $('view').classList.toggle('exposure-on', ex.show);
    lastSig = '';
    onShowChange(ex.show);
  });
  $('exp-film').addEventListener('click', () => applyFilmScene());
  $('exp-tb').addEventListener('change', (e) => {
    const v = parseExposureTime(e.target.value);
    if (v >= 0 && v <= 10) ex.tb = v;
    e.target.value = tbText(ex.tb);
  });
  const tauRange = $('exp-tau');
  tauRange.addEventListener('input', () => (ex.tauMid = Number(tauRange.value)));
  $('exp-tau-num').addEventListener('change', (e) => {
    const v = Number(String(e.target.value).replace(',', '.'));
    if (Number.isFinite(v)) ex.tauMid = v;
  });
  $('exp-tau-film').addEventListener('change', (e) => {
    const v = parseFilmTime(e.target.value);
    if (Number.isFinite(v)) ex.tauMid = v - ex.filmStartS;
  });
  $('exp-tau-end').addEventListener('click', () => (ex.tauMid = null));
  $('exp-film-start').addEventListener('change', (e) => {
    const v = parseFilmTime(e.target.value);
    if (Number.isFinite(v)) ex.filmStartS = v;
    e.target.value = formatFilmTime(ex.filmStartS);
  });
  $('exp-lens').addEventListener('change', (e) => (ex.lens = e.target.checked));
  $('exp-fwhm').addEventListener('change', (e) => {
    const v = Number(String(e.target.value).replace(',', '.'));
    if (v > 0 && v <= 20) ex.fwhmPx = v;
    e.target.value = String(ex.fwhmPx);
  });
  $('exp-k').addEventListener('change', (e) => {
    const v = Number(String(e.target.value).replace(',', '.'));
    if (v > 0) ex.k = v;
    e.target.value = String(ex.k);
  });
  $('exp-stars').addEventListener('change', (e) => (ex.starCount = Number(e.target.value)));
  $('exp-cockpit').addEventListener('change', (e) => (ex.cockpit = e.target.checked));
  $('exp-seq-n').addEventListener('change', (e) => {
    ex.seqCount = Math.min(48, Math.max(4, Math.round(Number(e.target.value)) || 6));
    e.target.value = String(ex.seqCount);
  });
  for (const [id, kind] of [['exp-pair', 'pair'], ['exp-seq', 'sequence'], ['exp-single', 'single']]) {
    $(id).addEventListener('click', () => runExport(kind));
  }

  function tbText(tb) {
    const inv = 1 / tb;
    return tb > 0 && Math.abs(inv - Math.round(inv)) < 1e-9 ? `1/${Math.round(inv)}` : String(tb);
  }

  /** Vorgabe "β = 0 bei 00:56:54 bis β = 0,99 bei 00:56:57", konstante Eigenbeschleunigung. */
  function applyFilmScene() {
    const acc = state.accel;
    acc.curve = 'constant';
    acc.beta0 = FILM_SCENE.beta0;
    acc.beta1 = FILM_SCENE.beta1;
    acc.mode = 'acceleration';
    acc.a = FILM_SCENE.a;
    acc.unitS = 1;
    acc.unitName = 's';
    ex.filmStartS = FILM_SCENE.filmStartS;
    ex.tauMid = null;
    $('exp-film-start').value = formatFilmTime(ex.filmStartS);
    ui.refreshAccel(null);
  }

  // ---- Rechnung ----
  /** Einstellungen einer Belichtung (für Bild b, Sequenz und Anzeige). */
  function config(overrides = {}) {
    const acc = state.accel;
    const { T, valid } = accelTiming(acc);
    const accel = { curve: acc.curve, beta0: acc.beta0, beta1: valid ? acc.beta1 : acc.beta0, durationS: valid ? T : 0 };
    const cfg = {
      accel,
      exposure: ex.tb,
      tauMid: 0,
      filmStartS: ex.filmStartS,
      effects: {
        aberration: state.aberration,
        doppler: state.doppler,
        beaming: state.beaming,
        fullSpectrum: state.spectrum === 'full',
      },
      lens: ex.lens ? { enabled: true, fwhmPx: ex.fwhmPx } : { enabled: false },
      k: ex.k,
      starCount: ex.starCount,
      seed: STAR_SEED,
      maxStepPx: EXPORT_DEFAULTS.maxStepPx,
      ...overrides,
    };
    const tauEnd = exposureSetup(cfg).profile.tauEnd;
    if (!('tauMid' in overrides)) cfg.tauMid = ex.tauMid ?? Math.max(0, tauEnd - ex.tb / 2);
    return cfg;
  }

  function compute(cfg) {
    const setup = exposureSetup(cfg);
    const t0 = performance.now();
    const result = renderExposure(starsFor(cfg.starCount), {
      camera: setup.camera,
      betaAt: setup.betaAt,
      tauMid: cfg.tauMid,
      exposure: cfg.exposure,
      effects: cfg.effects,
      lens: cfg.lens,
      maxStepPx: cfg.maxStepPx,
    });
    result.stats.ms = performance.now() - t0;
    const rgba = toneMap(result.energy, W, H, toneScale(cfg.k, cfg.lens));
    return { cfg, setup, result, rgba };
  }

  /** Bild auf eine Zeichenfläche bringen, ggf. mit Cockpit (wie CSS object-fit: cover). */
  function paint(target, rgba, withCockpit) {
    const g = target.getContext('2d');
    g.putImageData(new ImageData(rgba, W, H), 0, 0);
    const img = overlay.image;
    if (withCockpit && img.complete && img.naturalWidth > 0) {
      const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
      const dw = img.naturalWidth * s;
      const dh = img.naturalHeight * s;
      g.globalAlpha = overlay.opacity();
      g.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
      g.globalAlpha = 1;
    }
  }

  let last = null; // letzte angezeigte Belichtung
  let lastSig = '';
  let pendingSig = '';
  let pendingSince = 0;

  /** Aus der Animationsschleife aufrufen: rechnet neu, wenn sich etwas geändert hat. */
  function update(now) {
    const cfg = config();
    const tauEnd = exposureSetup(cfg).profile.tauEnd;
    syncControls(cfg, tauEnd);
    if (!ex.show) return;
    const sig = JSON.stringify({ cfg, cockpit: ex.cockpit, opacity: overlay.opacity(), img: overlay.status() });
    if (sig === lastSig) return;
    if (sig !== pendingSig) {
      pendingSig = sig;
      pendingSince = now;
      return;
    }
    if (now - pendingSince < 120) return; // erst rechnen, wenn die Eingabe ruht
    last = compute(cfg);
    paint(canvas, last.rgba, ex.cockpit);
    lastSig = sig;
  }

  function syncControls(cfg, tauEnd) {
    const set = (id, v) => {
      const e = $(id);
      if (document.activeElement !== e && e.value !== v) e.value = v;
    };
    tauRange.min = String(Math.min(0, cfg.tauMid));
    tauRange.max = String(Math.max(tauEnd, cfg.tauMid, 0.001));
    tauRange.step = String(Math.max(1e-4, tauEnd / 3000));
    set('exp-tau', String(cfg.tauMid));
    set('exp-tau-num', String(Number(cfg.tauMid.toFixed(6))));
    set('exp-tau-film', formatFilmTime(cfg.filmStartS + cfg.tauMid));
    $('exp-fwhm').disabled = !ex.lens;
  }

  // ---- Export ----
  async function pngBytes(rgba, withCockpit) {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    paint(c, rgba, withCockpit);
    try {
      return { bytes: await canvasPng(c), cockpit: withCockpit };
    } catch {
      // Cockpit aus einem file://-Pfad "verunreinigt" die Zeichenfläche → ohne Cockpit
      paint(c, rgba, false);
      return { bytes: await canvasPng(c), cockpit: false, cockpitError: true };
    }
  }

  async function exportOne(name, cfg, extraMeta = {}) {
    const run = compute(cfg);
    const png = await pngBytes(run.rgba, ex.cockpit);
    const meta = exposureMetadata(cfg, run.setup, run.result, {
      name: `${name}.png`,
      more: {
        cockpit_overlay: png.cockpit
          ? { an: true, deckkraft: overlay.opacity(), bild: overlay.status() }
          : { an: false, ...(png.cockpitError ? { grund: 'Bild aus Dateipfad darf der Browser nicht mitspeichern („Bild wählen…“ benutzen)' } : {}) },
        software: 'Simulation „Optische Effekte nahe c“ (W-Seminar Physik, CSG Ingolstadt)',
        erstellt: new Date().toISOString(),
        ...extraMeta,
      },
    });
    return {
      run,
      files: [
        { name: `${name}.png`, data: png.bytes },
        { name: `${name}.json`, data: JSON.stringify(meta, null, 2) + '\n' },
        { name: `${name}.csv`, data: exposureCsv(run.result.records) },
      ],
    };
  }

  async function runExport(kind) {
    const status = $('exp-status');
    status.textContent = 'Rechne …';
    await new Promise((r) => setTimeout(r, 30));
    try {
      const base = config();
      const lensTag = base.lens.enabled ? 'mit-objektiv' : 'ohne-objektiv';
      const timeTag = (tau) => formatFilmTime(base.filmStartS + tau).replace(/:/g, '-');
      const files = [];
      let zipName;
      if (kind === 'pair') {
        const a = await exportOne('bild_a', { ...base, betaZero: true, tauMid: -base.exposure / 2 }, { rolle: 'Bild (a): β = 0, gleiche Kamera, Belichtung, Tonkurve, Sternenfeld' });
        const b = await exportOne('bild_b', base, { rolle: 'Bild (b): gewählter Zeitpunkt' });
        files.push(...a.files, ...b.files);
        const betaB = b.run.setup.betaAt(base.tauMid);
        files.push({ name: 'LIESMICH.txt', data: readme(base, betaB) });
        zipName = `belichtung_paar_${timeTag(base.tauMid)}_${lensTag}.zip`;
      } else if (kind === 'sequence') {
        const tauEnd = exposureSetup(base).profile.tauEnd;
        const times = sequenceTimes(tauEnd, base.exposure, ex.seqCount);
        for (let i = 0; i < times.length; i++) {
          status.textContent = `Rechne Bild ${i + 1} von ${times.length} …`;
          await new Promise((r) => setTimeout(r, 0));
          const name = `seq_${String(i + 1).padStart(2, '0')}_${timeTag(times[i])}`;
          const r = await exportOne(name, { ...base, tauMid: times[i] }, { sequenz: { bild: i + 1, von: times.length } });
          files.push(...r.files);
        }
        zipName = `belichtung_sequenz_${times.length}_${lensTag}.zip`;
      } else {
        const name = `bild_${timeTag(base.tauMid)}`;
        files.push(...(await exportOne(name, base)).files);
        zipName = `belichtung_${timeTag(base.tauMid)}_${lensTag}.zip`;
      }
      download(new Blob([createZip(files)], { type: 'application/zip' }), zipName);
      status.textContent = `${zipName} gespeichert (${files.length} Dateien).`;
    } catch (e) {
      status.textContent = `Fehler: ${e.message}`;
    }
  }

  function readme(cfg, betaB) {
    const dens = starsPerSteradian(cfg.starCount);
    return [
      'Bildpaar für szene_analysieren.py',
      '',
      `bild_a.png  β = 0 (ruhend)`,
      `bild_b.png  Bildmitte ${formatFilmTime(cfg.filmStartS + cfg.tauMid)}, β in der Bildmitte = ${betaB.toFixed(6)}`,
      '',
      'Aufruf:',
      `  python szene_analysieren.py bild_a.png bild_b.png --beta ${betaB.toFixed(4)} --bildfeld ${EXPORT_DEFAULTS.hfovDeg} --sterndichte ${dens.toFixed(1)}`,
      '',
      'Hinweise:',
      '- szene_analysieren.py richtet Bild A über Merkmale des Cockpits auf Bild B aus.',
      '  Ohne Cockpit-Overlay findet es keine Zuordnungen und bricht ab.',
      '- Sterne in Bild A zählen dort erst ab 2 Pixeln Fläche: ohne Objektiv ist ein',
      '  Stern genau 1 Pixel groß und wird nicht erkannt.',
      '- Alle Parameter stehen in bild_a.json und bild_b.json, die Sterne in den CSV-Dateien.',
      '',
    ].join('\n');
  }

  // ---- Debug-Panel ----
  function debugRows() {
    const cfg = config();
    const setup = exposureSetup(cfg);
    const tb = cfg.exposure;
    const b = (tau) => num(setup.betaAt(tau), 6);
    const lens = describeLens(cfg.lens);
    const st = last?.result.stats;
    const cam = setup.camera;
    return [
      ['Belichtung t_b', `${tbText(tb)} s = ${num(tb * 1000, 4)} ms`],
      ['  Bildmitte τ (Bordzeit)', `${num(cfg.tauMid, 6)} s`],
      ['  Filmzeit Bildmitte', formatFilmTime(cfg.filmStartS + cfg.tauMid)],
      ['  β Beginn / Mitte / Ende', `${b(cfg.tauMid - tb / 2)} / ${b(cfg.tauMid)} / ${b(cfg.tauMid + tb / 2)}`],
      ['  Dauer an Bord τ_E', `${num(setup.profile.tauEnd, 5)} s`],
      ['  Kamera f / Fluchtpunkt', `${num(cam.f, 5)} px / (${cam.cx}, ${cam.cy})`],
      ['  Bild', `${W} × ${H} px, ${cam.hfovDeg}° waagrecht, geradlinig`],
      ['  Objektiv', lens.an ? `Gauß, FWHM ${num(lens.halbwertsbreite_px, 3)} px, σ ${num(lens.sigma_px, 3)} px` : 'aus (1 Pixel je Bildpunkt)'],
      ...(lens.an ? [['  PSF', 'exp(−r²/(2σ²))/N, Fenster ±3σ'], ['  Spitzenanteil PSF', num(lens.spitzenanteil, 4)]] : []),
      ['  Tonkurve', `v = min(1, s·E), s = ${num(toneScale(cfg.k, cfg.lens), 4)} (k = ${num(cfg.k, 3)})`],
      ['  Sterne / Startwert', `${cfg.starCount.toLocaleString('de-DE')} (${num(starsPerSteradian(cfg.starCount), 3)} je sr) / ${cfg.seed}`],
      ['  Teilschritte', st ? `${st.steps.toLocaleString('de-DE')}, größte Wanderung ${num(st.largestMovePx, 3)} px` : '– (Bild nicht angezeigt)'],
      ['  Sterne im Bild', st ? st.starsInFrame.toLocaleString('de-DE') : '–'],
      ['  Rechenzeit', st ? `${st.ms.toFixed(0)} ms` : '–'],
    ];
  }

  $('exp-tb').value = tbText(ex.tb);
  $('exp-film-start').value = formatFilmTime(ex.filmStartS);
  $('exp-fwhm').value = String(ex.fwhmPx);
  $('exp-k').value = String(ex.k);
  $('exp-seq-n').value = String(ex.seqCount);

  return { update, debugRows, isShown: () => ex.show, applyFilmScene };
}

function canvasPng(c) {
  return new Promise((resolve, reject) => {
    try {
      c.toBlob(async (b) => {
        if (!b) return reject(new Error('PNG konnte nicht erzeugt werden'));
        resolve(new Uint8Array(await b.arrayBuffer()));
      }, 'image/png');
    } catch (e) {
      reject(e);
    }
  });
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 20000);
}
