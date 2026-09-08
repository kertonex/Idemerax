/// <reference types="vitest/config" />

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    globals: true,

    // Collect frontend test coverage without enforcing a minimum threshold.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'cobertura'],
    },
  },
});
