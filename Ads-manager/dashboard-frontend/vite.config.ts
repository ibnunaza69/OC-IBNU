import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import ui from '@nuxt/ui/vite'

export default defineConfig({
  root: __dirname,
  base: '/dashboard/',
  plugins: [
    vue(),
    ui({
      provider: 'none',
      icon: {
        mode: 'css'
      },
      ui: {
        colors: {
          primary: 'green',
          neutral: 'zinc'
        }
      }
    })
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  build: {
    outDir: resolve(__dirname, '../dashboard-dist'),
    emptyOutDir: true,
    sourcemap: false
  }
})
