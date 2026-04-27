import { onMounted, ref, watch } from 'vue'

export type DashboardTheme = 'green' | 'blue' | 'violet' | 'amber'
export type DashboardMode = 'dark' | 'light'

const THEME_STORAGE_KEY = 'metaads-dashboard-theme'
const MODE_STORAGE_KEY = 'metaads-dashboard-mode'
const theme = ref<DashboardTheme>('green')
const mode = ref<DashboardMode>('dark')
const hydrated = ref(false)

function applyAppearance(nextTheme: DashboardTheme, nextMode: DashboardMode) {
  document.documentElement.dataset.dashboardTheme = nextTheme
  document.documentElement.dataset.dashboardMode = nextMode
  document.documentElement.classList.toggle('dark', nextMode === 'dark')
}

export function useDashboardTheme() {
  onMounted(() => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY) as DashboardTheme | null
    const storedMode = window.localStorage.getItem(MODE_STORAGE_KEY) as DashboardMode | null

    if (storedTheme && ['green', 'blue', 'violet', 'amber'].includes(storedTheme)) {
      theme.value = storedTheme
    }

    if (storedMode && ['dark', 'light'].includes(storedMode)) {
      mode.value = storedMode
    }

    applyAppearance(theme.value, mode.value)
    hydrated.value = true
  })

  watch([theme, mode], ([nextTheme, nextMode]) => {
    if (!hydrated.value) {
      return
    }

    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
    window.localStorage.setItem(MODE_STORAGE_KEY, nextMode)
    applyAppearance(nextTheme, nextMode)
  })

  return {
    theme,
    mode,
    setTheme: (value: DashboardTheme) => {
      theme.value = value
    },
    setMode: (value: DashboardMode) => {
      mode.value = value
    },
    toggleMode: () => {
      mode.value = mode.value === 'dark' ? 'light' : 'dark'
    }
  }
}
