import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  envDir: path.resolve(__dirname, '../'),
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    proxy: {
      // Look for any request starting with /api
      '/api': {
        target: 'http://localhost:3001', // Your backend dev server
        changeOrigin: true,
        // If your backend expects "/api/auth/login", keep this.
        // If your backend expects just "/auth/login", uncomment the line below:
        // rewrite: (path) => path.replace(/^\/api/, '') 
      }
    }
  },
  build: {
    // Explicitly set the target to avoid Rolldown issues
    target: 'es2020',
    // Ensure proper asset handling
    assetsInlineLimit: 4096,
  }
})
