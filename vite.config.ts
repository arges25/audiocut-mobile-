import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/audiocut-mobile-/' : '/',
  server: {
    host: true,
  },
}));
