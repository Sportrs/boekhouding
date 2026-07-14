import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// De frontend leeft in src/client. In dev proxyt Vite /api door naar de
// Express-server op poort 3000. In productie serveert Express de build uit dist/client.
export default defineConfig({
  root: 'src/client',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
});
