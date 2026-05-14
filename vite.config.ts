import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    proxy: {
      '/api/agent': {
        target: 'http://130.110.8.177:8086',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/agent/, ''),
      },
    },
  },
})
