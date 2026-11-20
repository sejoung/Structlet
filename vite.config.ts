import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build --mode single` produces one self-contained structlet.html that
// opens from file:// (double-click). The default build is a static site with
// relative paths, so it works at a domain root or under any sub-path.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [react(), viteSingleFile({ removeViteModuleLoader: true })] : [react()],
  build: mode === 'single' ? { outDir: 'dist-single', emptyOutDir: true, assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 2000 } : {},
  server: { port: 5183, strictPort: true },
  preview: { port: 5184, strictPort: true },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
}));
