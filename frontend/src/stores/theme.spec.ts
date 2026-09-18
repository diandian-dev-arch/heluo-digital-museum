import { afterEach, describe, expect, it } from 'vitest'
import { useTheme } from './theme'

describe('theme store', () => {
  afterEach(() => {
    useTheme().setTheme('light')
    window.localStorage.removeItem('heluo.theme')
  })

  it('persists the selected theme and synchronizes the document contract', () => {
    const theme = useTheme()
    theme.setTheme('dark')

    expect(theme.theme.value).toBe('dark')
    expect(theme.isDark.value).toBe(true)
    expect(window.localStorage.getItem('heluo.theme')).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('toggles back to light without changing the shared storage key', () => {
    const theme = useTheme()
    theme.setTheme('dark')
    theme.toggle()

    expect(theme.theme.value).toBe('light')
    expect(theme.isDark.value).toBe(false)
    expect(window.localStorage.getItem('heluo.theme')).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})
