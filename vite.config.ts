import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'url'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@assistant-ui/react-ag-ui/runtime': fileURLToPath(new URL('node_modules/@assistant-ui/react-ag-ui/dist/runtime', import.meta.url)),
    },
  },
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
