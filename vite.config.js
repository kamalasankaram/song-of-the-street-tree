import { defineConfig } from 'vite';

// Relative base so the built files load inside the Capacitor web view.
export default defineConfig({
  base: './',
  build: { outDir: 'dist', assetsInlineLimit: 0 },
});
