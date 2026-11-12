/*
 * Erstellt mit Claude Code (KI-Werkzeug) im Auftrag von Dominik Wittkow,
 * W-Seminar Physik, CSG Ingolstadt, 12.11.2026.
 *
 * video.js — Video schreiben (Bild für Bild, nicht in Echtzeit mitgeschnitten).
 *
 * Kodiert wird mit WebCodecs im Browser; mediabunny (MPL-2.0) verpackt die
 * Bilder in MP4 (H.264, AV1) bzw. WebM (VP9). Jedes Bild bekommt genau den
 * Zeitstempel k / Bildrate, auch wenn seine Berechnung länger dauert.
 */
import { Output, Mp4OutputFormat, WebMOutputFormat, BufferTarget, CanvasSource, canEncodeVideo } from 'mediabunny';

/** Wählbare Codecs mit Behälterformat. */
export const VIDEO_CODECS = {
  avc: { label: 'H.264', container: 'mp4' },
  vp9: { label: 'VP9', container: 'webm' },
  av1: { label: 'AV1', container: 'mp4' },
};

/** Kann der Browser überhaupt Videos kodieren (WebCodecs)? */
export function webCodecsAvailable() {
  return typeof window !== 'undefined' && typeof window.VideoEncoder === 'function';
}

/**
 * Codecs, die der Browser für diese Größe und Bitrate kodieren kann.
 * @returns {Promise<string[]>}
 */
export async function supportedCodecs(width, height, bitrate, frameRate) {
  if (!webCodecsAvailable()) return [];
  const out = [];
  for (const codec of Object.keys(VIDEO_CODECS)) {
    try {
      if (await canEncodeVideo(codec, { width, height, bitrate, frameRate })) out.push(codec);
    } catch {
      /* nicht unterstützt */
    }
  }
  return out;
}

/**
 * Seitenlängen für den Encoder: H.264, VP9 und AV1 mit 4:2:0-Farbunterabtastung
 * brauchen gerade Seitenlängen; ungerade werden um 1 Pixel verlängert.
 */
export function encoderSize({ width, height }) {
  return { width: width + (width % 2), height: height + (height % 2) };
}

/**
 * Schreiber für ein Video aus einer Zeichenfläche (canvas): Für jedes Bild die
 * Zeichenfläche füllen und add(k) aufrufen.
 */
export async function createVideoWriter(canvas, { codec, fps, bitrate, keyFrameInterval }) {
  const container = VIDEO_CODECS[codec].container;
  const output = new Output({
    format: container === 'webm' ? new WebMOutputFormat() : new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new BufferTarget(),
  });
  const source = new CanvasSource(canvas, { codec, bitrate, keyFrameInterval });
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();
  const mime = container === 'webm' ? 'video/webm' : 'video/mp4';
  return {
    container,
    async add(index) {
      await source.add(index / fps, 1 / fps);
    },
    async finish() {
      await output.finalize();
      return new Blob([output.target.buffer], { type: mime });
    },
    async cancel() {
      try {
        await output.cancel();
      } catch {
        /* schon beendet */
      }
    },
  };
}
