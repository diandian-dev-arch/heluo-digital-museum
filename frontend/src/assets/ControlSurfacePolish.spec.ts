import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(resolve(process.cwd(), 'src/assets/control-surface-polish.css'), 'utf8')
const explore = readFileSync(resolve(process.cwd(), 'src/views/ExploreView.vue'), 'utf8')
const appointment = readFileSync(resolve(process.cwd(), 'src/views/AppointmentView.vue'), 'utf8')
const adminContent = readFileSync(resolve(process.cwd(), 'src/views/AdminContentView.vue'), 'utf8')
const adminOperations = readFileSync(resolve(process.cwd(), 'src/views/AdminOperationsView.vue'), 'utf8')

describe('control surface polish contract', () => {
  it('keeps search focus on the outer control and removes nested input shadows', () => {
    expect(styles).toContain('.museum-search-field__control:focus-within')
    expect(styles).toMatch(/\[data-tactile-search\][^{}]*input:focus[\s\S]*?box-shadow:\s*none\s*!important/)
    expect(styles).toContain('.museum-search-field__control.has-clear')
  })

  it('renders the Explore themes as semantic links to published categories', () => {
    expect(explore).toContain('class="gallery-themes__links"')
    expect(explore).toContain('v-for="category in categories"')
    expect(explore).toContain("query: { category: category.code }")
    expect(explore).toContain("hash: '#collection-title'")
    expect(explore).not.toContain('collection-theme-path__compass')
  })

  it('gives the dark Explore theme path a coordinated ink, jade, and bronze palette', () => {
    expect(styles).toContain('--theme-path-paper: oklch(.205 .018 154)')
    expect(styles).toContain('--theme-path-ink: oklch(.9 .026 84)')
    expect(styles).toContain('--theme-path-jade: oklch(.76 .078 162)')
    expect(styles).toContain('--theme-path-bronze: oklch(.74 .095 76)')
    expect(styles).toContain('border-color: oklch(.62 .065 76 / .62) !important')
    expect(styles).toMatch(/html\[data-theme='dark'\][\s\S]*?\.collection-theme-path::after\s*\{\s*border-color:\s*oklch\(\.78 \.055 78 \/ \.2\)/)
    expect(styles).toMatch(/html\[data-theme='dark'\][\s\S]*?\.collection-theme-path__river\s*\{[\s\S]*?brightness\(\.84\)[\s\S]*?saturate\(\.9\)/)
    expect(styles).toMatch(/html\[data-theme='dark'\][\s\S]*?\.collection-theme-path__mountains\s*\{[\s\S]*?opacity:\s*\.29/)
    expect(styles).toMatch(/html\[data-theme='dark'\][\s\S]*?\.collection-theme-path__bamboo\s*\{[\s\S]*?opacity:\s*\.21/)
  })

  it('keeps booking information semantic and the venue image attributable', () => {
    expect(appointment).toContain('class="appointment-summary"')
    expect(appointment).toContain('class="appointment-venue"')
    expect(appointment).toContain('<figcaption>{{ workbenchCopy.concept }}</figcaption>')
    expect(existsSync(resolve(process.cwd(), 'public/media/editorial/museum-exterior-watercolor.webp'))).toBe(true)
    expect(appointment).not.toContain('booking-site-plan')
    expect(appointment).not.toContain('booking-ticket-divider')
  })

  it('keeps accessible visitor controls and the original booking boundaries', () => {
    expect(appointment).toContain('class="visitor-stepper__input"')
    expect(appointment).toContain('const minimumVisitorCount = 1')
    expect(appointment).toContain('const maximumVisitorCount = 30')
    expect(appointment).toContain(':aria-label="pageCopy.decreaseVisitors"')
    expect(appointment).toContain(':aria-label="pageCopy.increaseVisitors"')
    expect(appointment).toContain('@blur="normalizeVisitorCount"')
  })

  it('inherits the shared theme without decorative ticket assets or local colors', () => {
    const bookingStyles = readFileSync(resolve(process.cwd(), 'src/assets/appointment-workbench.css'), 'utf8')
    expect(bookingStyles).toContain('var(--theme-surface-canvas)')
    expect(bookingStyles).toContain('var(--theme-primary-surface)')
    expect(bookingStyles).toContain('var(--font-body)')
    expect(bookingStyles).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(bookingStyles).not.toContain('backdrop-filter')
    expect(bookingStyles).toContain('@media (prefers-reduced-motion: reduce)')
    expect(bookingStyles).toContain('@media (forced-colors: active)')
    expect(appointment).not.toContain('/media/appointment-ticket/')
  })

  it('separates admin navigation from labeled filter fields', () => {
    expect(adminContent).toContain('class="admin-filter-field admin-filter-field--search"')
    expect(adminOperations).toContain('class="admin-toolbar admin-toolbar--operations"')
    expect(adminOperations).toContain('class="admin-filter-field__label"')
    expect(styles).toContain('.admin-toolbar--operations .admin-tabs')
    expect(styles).toContain('.admin-filter-field select')
    expect(styles).toContain('.admin-filter-field:not(.admin-filter-field--search)::after')
  })

  it('keeps mobile shop rows on one framed surface', () => {
    expect(styles).toMatch(/@media \(max-width: 760px\)[\s\S]*?\.product-grid article \.product-copy\s*\{[\s\S]*?border-radius:\s*0\s*!important;[\s\S]*?background:\s*transparent\s*!important;[\s\S]*?box-shadow:\s*none\s*!important;/)
  })

  it('keeps preference and forced-color fallbacks for the new controls', () => {
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)')
    expect(styles).toContain('@media (prefers-reduced-transparency: reduce), (prefers-contrast: more)')
    expect(styles).toContain('@media (forced-colors: active)')
    expect(styles).toContain('.booking-site-plan__icon')
    expect(styles).toContain('stroke: CanvasText;')
  })
})
