import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  test: {
    // Run both frontend (src/) and backend (middleware/, tests/) tests
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.{js,ts}'],
    environment: 'node',
  },
})
