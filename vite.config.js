import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const maplibreDist = require.resolve('maplibre-gl/package.json').replace('package.json', 'dist/');

// MapLibre runs its tile decoding in a module worker that imports a shared
// chunk. Ship both files untouched so the worker can load them by URL.
function maplibreWorker() {
  return {
    name: 'maplibre-worker',
    generateBundle() {
      for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
        this.emitFile({ type: 'asset', fileName: `maplibre/${file}`, source: readFileSync(maplibreDist + file) });
      }
    },
  };
}

// Relative base so the built files load inside the Capacitor web view.
export default defineConfig({
  base: './',
  build: { outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 2000 },
  plugins: [maplibreWorker()],
});
