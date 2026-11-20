import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { csp } from './scripts/csp.ts';

// `vite build --mode single` produces one self-contained structlet.html that opens from
// file:// (double-click); Google Drive and Analytics are off there. The default build is a
// static site with relative paths and a Content Security Policy.
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  const drive = Boolean(env.VITE_GOOGLE_CLIENT_ID?.trim() && env.VITE_GOOGLE_API_KEY?.trim() && env.VITE_GOOGLE_APP_ID?.trim());
  const analytics = /^G-[A-Z0-9]{4,20}$/.test(env.VITE_GA_MEASUREMENT_ID?.trim() ?? '');
  const single = mode === 'single';
  return {
    base: './',
    plugins: single ? [react(), viteSingleFile({ removeViteModuleLoader: true })] : [react(), csp({ drive, analytics })],
    build: single ? { outDir: 'dist-single', emptyOutDir: true, assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 2000 } : {},
    server: { host: '127.0.0.1', port: 5183, strictPort: true },
    preview: { host: '127.0.0.1', port: 5184, strictPort: true },
    test: {
      include: ['tests/unit/**/*.test.ts'],
      environment: 'node',
    },
  };
});
