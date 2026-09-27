import { computed, ref } from 'vue'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'heluo.theme'
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'
const storedTheme = isBrowser ? window.localStorage.getItem(STORAGE_KEY) : null
const current = ref<Theme>(storedTheme === 'dark' ? 'dark' : 'light')

function syncDocument(theme: Theme) {
  if (!isBrowser) return
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (meta) meta.content = theme === 'dark' ? '#12110f' : '#f7faf8'
}

syncDocument(current.value)

export function useTheme() {
  const isDark = computed(() => current.value === 'dark')

  function setTheme(theme: Theme) {
    current.value = theme
    if (isBrowser) window.localStorage.setItem(STORAGE_KEY, theme)
    syncDocument(theme)
    if (isBrowser) window.dispatchEvent(new CustomEvent('heluo:theme-change', { detail: theme }))
  }

  function toggle() {
    setTheme(isDark.value ? 'light' : 'dark')
  }

  return { theme: current, isDark, setTheme, toggle }
}
