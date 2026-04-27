import './assets/css/main.css'

import { createApp } from 'vue'
import ui from '@nuxt/ui/vue-plugin'
import { createRouter, createWebHistory } from 'vue-router'

import App from './App.vue'
import AudiencesPage from './pages/AudiencesPage.vue'
import CampaignsPage from './pages/CampaignsPage.vue'
import CreativesPage from './pages/CreativesPage.vue'
import DashboardLayout from './pages/DashboardLayout.vue'
import LoginPage from './pages/LoginPage.vue'
import OverviewPage from './pages/OverviewPage.vue'
import SettingsPage from './pages/SettingsPage.vue'
import WorkflowsPage from './pages/WorkflowsPage.vue'
import { dashboardRoutes } from './utils/dashboardRoutes'

const router = createRouter({
  history: createWebHistory('/dashboard/'),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginPage
    },
    {
      path: '/',
      component: DashboardLayout,
      children: [
        { path: '', redirect: dashboardRoutes.overview },
        { path: 'overview', name: 'overview', component: OverviewPage },
        { path: 'campaigns', name: 'campaigns', component: CampaignsPage },
        { path: 'audiences', name: 'audiences', component: AudiencesPage },
        { path: 'creatives', name: 'creatives', component: CreativesPage },
        { path: 'workflows', name: 'workflows', component: WorkflowsPage },
        { path: 'settings', name: 'settings', component: SettingsPage }
      ]
    }
  ]
})

const app = createApp(App)
app.use(router)
app.use(ui)

router.isReady().finally(() => {
  app.mount('#app')
})
