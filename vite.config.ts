import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // host: true → mở được từ điện thoại cùng mạng Wi-Fi (http://<IP-máy-tính>:5173)
  server: { port: 5173, open: false, host: true },
  preview: { port: 4173, host: true },
  build: {
    target: 'es2022',
    sourcemap: true,
    // Riêng three.js đã ~550 kB (đã tách chunk riêng, cache lâu dài).
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: { manualChunks: { three: ['three'] } },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
