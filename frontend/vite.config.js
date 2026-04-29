import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Or 'localhost' to restrict, but '0.0.0.0' allows LAN
    // Optional: Specify a specific port if 5173 is taken
    // port: 3000, 
    // Optional: Disable HTTPS warning if you are using a self-signed cert
    // https: false,
  }
})
