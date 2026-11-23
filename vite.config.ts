import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { csp } from './scripts/csp.ts';
import { structletSkillPlugin } from './scripts/structlet-skill.ts';

const browserTests = ['tests/unit/adapters/analytics.test.ts', 'tests/unit/adapters/drive/connection.test.ts'];

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  const drive = Boolean(env.VITE_GOOGLE_CLIENT_ID?.trim() && env.VITE_GOOGLE_API_KEY?.trim() && env.VITE_GOOGLE_APP_ID?.trim());
  const analytics = /^G-[A-Z0-9]{4,20}$/.test(env.VITE_GA_MEASUREMENT_ID?.trim() ?? '');
  const single = mode === 'single';
  return {
    base: './',
    plugins: [react(), structletSkillPlugin(), single ? viteSingleFile({ removeViteModuleLoader: true }) : csp({ drive, analytics })],
    build: single ? { outDir: 'dist-single', emptyOutDir: true, assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 2000 } : {},
    server: { host: '127.0.0.1', port: 5183, strictPort: true },
    preview: { host: '127.0.0.1', port: 5184, strictPort: true },
    test: {
      projects: [
        { extends: true, test: { name: 'node', environment: 'node', include: ['tests/unit/**/*.test.ts'], exclude: browserTests } },
        { extends: true, test: { name: 'browser', environment: 'jsdom', include: browserTests } },
      ],
    },
  };
});
