/*
 * Erstellt mit Claude Code (KI-Werkzeug) im Auftrag von Dominik Wittkow,
 * W-Seminar Physik, CSG Ingolstadt, 24.09.2026.
 *
 * Vite-Konfiguration. base: './' sorgt für relative Pfade im Build.
 *
 * Damit sich dist/index.html ohne Server (per Doppelklick, file://) öffnen
 * lässt, reicht base: './' allein nicht: Browser wie Chrome laden
 * JavaScript-Module nicht über file://. Das kleine Plugin unten schreibt
 * deshalb das gebündelte JavaScript und CSS direkt in index.html hinein.
 * Es werden keine Dateien aus dem Netz geladen; three.js ist mitgebündelt.
 */
import { defineConfig } from 'vite';

function inlineForFileProtocol() {
  return {
    name: 'inline-for-file-protocol',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const htmlFile = Object.values(bundle).find((f) => f.fileName === 'index.html');
      if (!htmlFile) return;
      let html = String(htmlFile.source);
      for (const [fileName, file] of Object.entries(bundle)) {
        if (file.type === 'chunk' && fileName.endsWith('.js')) {
          // "</script" im Code würde das <script>-Element vorzeitig beenden
          const code = file.code.replace(/<\/script/gi, '<\\/script');
          const tag = new RegExp(`<script[^>]*src="\\.?/?${escapeRegExp(fileName)}"[^>]*></script>`);
          html = html.replace(tag, () => `<script type="module">\n${code}\n</script>`);
          delete bundle[fileName];
        } else if (file.type === 'asset' && fileName.endsWith('.css')) {
          const tag = new RegExp(`<link[^>]*href="\\.?/?${escapeRegExp(fileName)}"[^>]*>`);
          html = html.replace(tag, () => `<style>\n${file.source}\n</style>`);
          delete bundle[fileName];
        }
      }
      htmlFile.source = html;
    },
  };
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default defineConfig({
  base: './',
  plugins: [inlineForFileProtocol()],
  build: {
    // alles in eine Datei, damit das Einbetten vollständig ist
    modulePreload: false,
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['tests/**/*.test.js'],
  },
});
