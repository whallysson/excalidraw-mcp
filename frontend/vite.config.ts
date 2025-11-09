/**
 * Vite Configuration
 * Configures React plugin, dev server, and build settings
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react({
      // Use automatic JSX runtime
      jsxRuntime: 'automatic',
    }),
  ],

  // Development server configuration
  server: {
    port: 5173,
    host: true, // Listen on all addresses
    strictPort: true, // Fail if port is already in use
    open: false, // Don't auto-open browser
  },

  // Build configuration
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Optimize bundle size
    rollupOptions: {
      output: {
        manualChunks: {
          // Split vendor chunks for better caching
          react: ['react', 'react-dom'],
          excalidraw: ['@excalidraw/excalidraw'],
        },
      },
    },
  },

  // Path resolution
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  // Optimize dependencies
  optimizeDeps: {
    include: ['react', 'react-dom', '@excalidraw/excalidraw'],
  },
});
