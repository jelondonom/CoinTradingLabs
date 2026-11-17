import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// En desarrollo Vite hace de proxy, igual que Caddy en staging y producción:
// el navegador siempre habla con un solo origen.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/ws/account': { target: 'ws://localhost:3000', ws: true },
      '/ws/market': { target: 'ws://localhost:3001', ws: true },
    },
  },
});
