import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'src/renderer',
  build: {
    outDir: '../../dist/renderer',
  },
  server: {
    port: 7544,
    host: '127.0.0.1',
    strictPort: true,
  },
});
