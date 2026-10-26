import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The UI is loaded from disk by Electron, so asset URLs must be relative. The shared/*.cjs modules
// (colour looks, keyframes) are CommonJS because the main process uses them too.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    commonjsOptions: { include: [/node_modules/, /shared\//] },
  },
});
