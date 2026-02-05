import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3333',
        changeOrigin: true,
        // Pass through headers for progress tracking
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, req, res) => {
            // Forward Content-Length for download progress
            if (proxyRes.headers['content-length']) {
              res.setHeader('Content-Length', proxyRes.headers['content-length']);
            }
          });
        }
      }
    }
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  },
  assetsInclude: ['**/*.glsl'],
  optimizeDeps: {
    include: ['three']
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      },
      output: {
        manualChunks: {
          three: ['three']
        }
      }
    }
  }
});
