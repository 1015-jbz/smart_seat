import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 龙芯/远程桌面浏览器访问必须显式绑定 0.0.0.0，否则只监听 127.0.0.1
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,   // 5173 被占就自动 +1
    open: false,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
})
