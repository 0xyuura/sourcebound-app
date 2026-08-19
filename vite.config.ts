import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Served from https://0xyuura.github.io/sourcebound-app/, so assets need the
  // repository name as their base path.
  base: '/sourcebound-app/',
  plugins: [react()],
  server: {
    // The headless browser used for QA writes .gstack/*.jsonl inside the
    // project, which would otherwise trigger a reload on every command.
    watch: { ignored: ['**/.gstack/**'] },
  },
})
