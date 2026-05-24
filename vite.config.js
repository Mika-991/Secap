import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // If deploying to a GitHub Pages subfolder, set base to your repo name:
  // base: '/your-repo-name/',
})
