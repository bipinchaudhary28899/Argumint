import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  build: {
    // Emit source maps so Lighthouse's "missing source maps" Best Practices
    // audit passes and production stack traces are debuggable.
    sourcemap: true,
  },
})