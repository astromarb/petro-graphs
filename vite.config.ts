import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [react(), tailwindcss()],

  // Vite options for Tauri: use a consistent port and expose to the Tauri host
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
  },

  envPrefix: ['VITE_', 'TAURI_ENV_*'],

  build: {
    // WebView2 on Windows supports modern JS; no need to target old browsers
    target: 'chrome105',
    minify: process.env.TAURI_ENV_DEBUG ? false : 'esbuild',
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    rolldownOptions: {
      output: {
        // Split large vendor libraries into separate cacheable chunks
        manualChunks(id) {
          if (id.includes('/fabric/'))       return 'vendor-fabric';
          if (id.includes('/katex/'))           return 'vendor-katex';
          if (id.includes('/jspdf/'))        return 'vendor-pdf';
          if (id.includes('/react-dom/') || (id.includes('/react/') && !id.includes('/react-dom/'))) return 'vendor-react';
          if (id.includes('/zustand/') || id.includes('/immer/')) return 'vendor-state';
        },
      },
    },
  },
})
