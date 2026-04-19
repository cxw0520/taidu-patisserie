import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
    },
    resolve: {
      alias: {
        '@': '/src'
      }
    },
    base: mode === 'production' ? '/taidu-patisserie/' : '/', // ✅ 關鍵修正
    build: {
      sourcemap: false,
      chunkSizeWarningLimit: 1000
    }
  };
});