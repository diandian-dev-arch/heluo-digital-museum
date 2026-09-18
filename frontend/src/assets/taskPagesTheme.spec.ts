/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const css = read('src/assets/task-pages.css')
const entry = read('src/main.ts')
const login = read('src/views/LoginView.vue')
const routeOwners = [
  'src/views/AppointmentView.vue',
  'src/views/LoginView.vue',
  'src/views/ProfileView.vue',
  'src/views/AdminContentView.vue',
  'src/views/AdminOperationsView.vue',
]

describe('task page theme contract', () => {
  it('loads only with the task routes instead of the public home bundle', () => {
    expect(entry).not.toContain("import './assets/task-pages.css'")
    for (const path of routeOwners) expect(read(path)).toContain("import '../assets/task-pages.css'")
    const appointment = read('src/views/AppointmentView.vue')
    expect(appointment.indexOf("import '../assets/control-surface-polish.css'"))
      .toBeGreaterThan(appointment.indexOf("import '../assets/task-pages.css'"))
  })

  it('scopes account access separately from the existing profile workspace', () => {
    expect(login).toContain('<section class="auth-page task-auth-page">')
    expect(css).toContain('.task-auth-page .auth-panel')
    expect(css).toContain('.profile-page .profile-account-panel')
    expect(css).toContain('html #app .task-auth-page .auth-panel[data-glass="dark"]')
  })

  it('uses the four semantic surfaces across booking, account and admin pages', () => {
    for (const token of [
      '--theme-surface-canvas',
      '--theme-surface-section',
      '--theme-surface-content',
      '--theme-surface-control',
    ]) expect(css).toContain(token)
    expect(css).toMatch(/\.appointment-form :where\(input, textarea\)[\s\S]*?min-height: var\(--theme-control-min\)/)
    expect(css).toMatch(/\.task-auth-page \.auth-panel :where\(input, textarea, select\)[\s\S]*?background: var\(--theme-surface-control\) !important/)
    expect(css).toMatch(/\.admin-list-filters :where\(input, select\)[\s\S]*?min-height: var\(--theme-control-min\)/)
  })

  it('keeps focus and accessibility fallbacks explicit', () => {
    expect(css).toContain('box-shadow: var(--theme-focus-ring)')
    expect(css).toContain('@media (prefers-reduced-transparency: reduce), (prefers-contrast: more)')
    expect(css).toContain('@media (forced-colors: active)')
  })

  it('keeps the admin workbench quiet and dense', () => {
    expect(css).toContain('.admin-main::before { display: none; }')
    expect(css).toMatch(/\.admin-workspace \.dashboard-summary article \{ min-height: 88px;/)
    expect(css).toMatch(/\.admin-list--operations article:hover \{ background: var\(--theme-surface-control-hover\); box-shadow: none; transform: none;/)
    expect(css).toContain('html #app .admin-workspace .admin-sidebar[data-glass="dark"]')
    expect(css).toContain('html #app .admin-workspace .admin-create :where(input, textarea, select, .el-select__wrapper)')
    expect(css).toContain('html #app .admin-workspace .admin-insights[data-glass="light"] > article')
  })

  it('gives the light admin workbench its own readable navigation and control contract', () => {
    expect(read('src/components/AdminShell.vue')).toContain(":data-glass=\"isDark ? 'dark' : 'light'\"")
    expect(css).toContain('html:not([data-theme="dark"]) #app .admin-workspace .admin-sidebar[data-glass="light"]')
    expect(css).toContain('background: linear-gradient(135deg, #176451, #0e4c40)')
    expect(css).toContain('.admin-workspace .admin-actions .admin-action-button { min-height: 44px;')
    expect(css).toContain('outline: 2px solid #438675')
  })
})
