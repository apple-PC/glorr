import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// 重写后的构建入口:florr/ 为唯一源码根(分层见 REWRITE.md)
// 旧 src/ 暂时保留作参照,A 阶段线上验证通过后再删除。
const ROOT = fileURLToPath(new URL('./florr', import.meta.url));
export default defineConfig({
  root: ROOT,
  resolve: {
    alias: {
      '@': ROOT,
    },
  },
  server: { port: 5173 },
  build: {
    outDir: fileURLToPath(new URL('./dist/client', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./florr/index.html', import.meta.url)),
        admin: fileURLToPath(new URL('./florr/admin/index.html', import.meta.url)),
        account: fileURLToPath(new URL('./florr/account/index.html', import.meta.url)),
      },
    },
  },
});
