import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:7878',
      '/ws': { target: 'ws://localhost:7878', ws: true },
    },
  },
  build: {
    outDir: '../src/agent_redteam/dashboard/static',
    emptyOutDir: true,
  },
})
