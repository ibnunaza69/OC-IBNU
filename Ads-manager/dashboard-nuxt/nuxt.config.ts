export default defineNuxtConfig({
  ssr: false,
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  app: {
    baseURL: '/dashboard/',
    buildAssetsDir: 'assets/'
  },
  nitro: {
    preset: 'static'
  }
});

