import { defineConfig } from 'vite';

// Base is set to './' so the built app works when served from any sub-path
// (e.g. GitHub Pages project sites) as well as from the domain root.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
  server: {
    host: true,
    port: 5173,
  },
});
