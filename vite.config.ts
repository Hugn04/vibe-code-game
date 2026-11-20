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
    // three.js ~575 kB; ez-tree ~4 MB (nhúng texture cây, chỉ nạp động khi dựng rừng).
    chunkSizeWarningLimit: 4500,
    rollupOptions: {
      output: { manualChunks: { three: ['three'] } },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
