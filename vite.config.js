import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the built site works from any folder or static host.
  base: './',
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
