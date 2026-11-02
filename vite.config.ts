import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages 项目站点部署在 /deep-space-globe/ 子路径下；
// 开发服务器仍使用根路径，便于本地访问。
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/deep-space-globe/' : '/',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
  },
  preview: {
    port: 4173,
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1600,
  },
}))
