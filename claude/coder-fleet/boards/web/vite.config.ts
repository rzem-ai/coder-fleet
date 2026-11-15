import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// The board's server (src/web.ts) serves dist/ and the API from one loopback
// origin, so the built page asks for /api on its own origin. The dev page
// (scripts/web-dev.ts) sets BOARDS_WEB_DEV_API to its sandbox server's address
// and Vite proxies /api there, with Host and Origin rewritten to the server's
// own, which is all the server accepts. `vite build` ignores this.
const api = process.env.BOARDS_WEB_DEV_API;

export default defineConfig({
  base: './',
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: api ? { proxy: { '/api': { target: api, changeOrigin: true, headers: { Origin: api } } } } : {},
});
