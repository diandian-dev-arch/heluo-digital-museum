/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

const firstVisitFiles = [
  'src/App.vue',
  'src/components/FluidButton.vue',
  'src/views/HomeView.vue',
  'src/views/AppointmentView.vue',
  'src/views/LoginView.vue',
  'src/views/ProfileView.vue',
]

describe('first-visit route runtime contract', () => {
  it('keeps motion-v out of the shared shell and audited first-visit routes', () => {
    for (const path of firstVisitFiles) {
      const source = read(path)
      expect(source, path).not.toContain("from 'motion-v'")
      expect(source, path).not.toMatch(/<\/?motion(?:\.|\b)/)
    }
  })

  it('keeps the route shell stable while preserving Suspense loading', () => {
    const app = read('src/App.vue')
    const mainCss = read('src/assets/main.css')
    expect(app).toContain('<div class="route-frame">')
    expect(app).toContain(':class="shellRouteClass"')
    expect(mainCss).not.toContain('.app-shell:has(')
    expect(app).toContain('<RouterView v-slot="{ Component }"><Suspense>')
    expect(app).toContain('<template #fallback><LoadingSkeleton')
    expect(app).not.toContain('AnimatePresence')
    expect(app).toContain('<component :is="Component" :key="route.path" />')
    expect(app).not.toMatch(/offsetParent|getComputedStyle/)
  })

  it('opens the collection directly without deferred decorative discovery stages', () => {
    const explore = read('src/views/ExploreView.vue')
    expect(explore).not.toContain('firstVisitStage')
    expect(explore).not.toContain('PointerDotField')
    expect(explore).toContain('<MuseumSearchField')
    expect(explore).toContain('class="collection-loading gallery-skeleton"')
    expect(explore).toContain(":loading=\"index < 3 ? 'eager' : 'lazy'\"")
  })

  it('does not force a root-style read after coarse-pointer policy is known', () => {
    const pointerMotion = read('src/lib/pointerMotion.ts')
    expect(pointerMotion).toContain('const tierAlreadyStatic = !finePointer || !hover')
    expect(pointerMotion).toMatch(/const rootFontSize = tierAlreadyStatic \|\| deviceMagnified[\s\S]*\? 16[\s\S]*getComputedStyle/)
  })

  it('loads the home GSAP reveal only for the full performance and motion tiers', () => {
    const home = read('src/views/HomeView.vue')
    expect(home).toContain("const gsapModule = await import('gsap').catch(() => undefined)")
    expect(home).not.toContain("from 'gsap'")
    expect(home).toContain("dataset.performanceTier === 'full'")
    expect(home).toContain("dataset.motionTier === 'full'")
    expect(home).toContain("matchMedia('(prefers-reduced-motion: reduce)')")
  })

  it('yields once before mounting the constrained-device application shell', () => {
    const main = read('src/main.ts')
    expect(main).toContain('const performanceTier = applyDevicePerformanceTier()')
    expect(main).toContain("if (performanceTier === 'constrained')")
    expect(main).toContain('window.setTimeout(mountApplication, 0)')
    expect(main).toMatch(/else \{\s*mountApplication\(\)\s*\}/)
  })

  it('defers the appointment bottom sheet until the mobile form is opened', () => {
    const appointment = read('src/views/AppointmentView.vue')
    expect(appointment).toContain("defineAsyncComponent(() => import('../components/BottomSheet.vue'))")
    expect(appointment).not.toContain("import BottomSheet from '../components/BottomSheet.vue'")
    expect(appointment).toContain('<BottomSheet v-if="mobileSummaryOpen"')
  })

  it('uses the same bounded calendar on desktop and mobile', () => {
    const appointment = read('src/views/AppointmentView.vue')
    expect(appointment).toContain("window.matchMedia('(max-width: 760px)')")
    expect(appointment).toContain('class="appointment-dates" role="group"')
    expect(appointment).toContain('v-for="day in dateDays"')
    expect(appointment).toContain(':disabled="formLocked || !day.available"')
    expect(appointment).not.toContain('class="date-strip"')
    expect(appointment).not.toContain('<option v-for="day in dateDays"')
  })

  it('shares contact fields and preserves the mobile booking gate', () => {
    const appointment = read('src/views/AppointmentView.vue')
    const fields = read('src/components/AppointmentContactFields.vue')
    expect(appointment).toContain('v-if="!mobileDatePicker" class="appointment-details"')
    expect(appointment).toContain(':disabled="!selectedSlot || Boolean(message)"')
    expect(appointment).toContain('panel-class="appointment-bottom-sheet appointment-refined-sheet"')
    expect(appointment.match(/<AppointmentContactFields /g)).toHaveLength(2)
    for (const autocomplete of ['name', 'tel', 'email']) expect(fields).toContain(`autocomplete="${autocomplete}"`)
    expect(fields).toContain('required')
    expect(fields).toContain('aria-invalid')
    expect(fields).toContain('aria-describedby')
  })

  it('mounts profile histories only when their below-fold sentinel enters the viewport', () => {
    const profile = read('src/views/ProfileView.vue')
    expect(profile).toContain("defineAsyncComponent(() => import('../components/ProfileAppointments.vue'))")
    expect(profile).toContain("defineAsyncComponent(() => import('../components/ProfileOrders.vue'))")
    expect(profile).toContain('new IntersectionObserver')
    expect(profile).toContain('v-if="!recordsReady"')
    expect(profile).toContain('<template v-else><ProfileAppointments')
  })

  it('uses native press feedback without weakening button semantics', () => {
    const button = read('src/components/FluidButton.vue')
    const tactileCss = read('src/assets/tactile-ui.css')
    const taskCss = read('src/assets/task-pages.css')
    expect(button).toContain('<button')
    expect(button).toContain(':disabled="disabled || loading"')
    expect(button).toContain(':aria-busy="loading"')
    expect(tactileCss).toContain('.fluid-button[data-tactile-button]:active:not(:disabled)')
    expect(taskCss).toContain('.slot-list button:active:not(:disabled)')
    expect(tactileCss).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.fluid-button\[data-tactile-button\]:active:not\(:disabled\)[\s\S]*transform: none/)
    expect(taskCss).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.slot-list button:active:not\(:disabled\)[\s\S]*transform: none/)
  })
})
