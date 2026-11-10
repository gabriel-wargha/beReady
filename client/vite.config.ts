import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // The browser only ever talks to this address. Vite forwards /api to the Express server,
    // so in development the app is same-origin, just like in production.
    proxy: { '/api': 'http://localhost:3001' },
  },
});
