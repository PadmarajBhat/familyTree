import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/familyTree/',
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts', 'd3'],
          jspdf: ['jspdf'],
          html2canvas: ['html2canvas'],
          utils: ['date-fns', 'uuid'],
          gapi: ['gapi-script'],
        },
      },
      onwarn(warning, warn) {
        if (warning.code === 'EVAL' && warning.id?.includes('gapi-script')) {
          return;
        }
        warn(warning);
      },
    },
  },
})
