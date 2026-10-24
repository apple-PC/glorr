import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// glorr 客户端构建配置
// - 开发:vite(5173) 通过 /ws 代理到本地服务端(8080)
// - 生产:构建到 dist/client,由服务端静态托管或 GitHub Pages 托管
export default defineConfig({
  root: 'src/client',
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@client': fileURLToPath(new URL('./src/client', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
    },
  },
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./src/client/index.html', import.meta.url)),
        admin: fileURLToPath(new URL('./src/client/admin/index.html', import.meta.url)),
        account: fileURLToPath(new URL('./src/client/account/index.html', import.meta.url)),
      },
    },
  },
});
