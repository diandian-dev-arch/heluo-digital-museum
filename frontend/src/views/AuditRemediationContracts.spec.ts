import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(path, 'utf8')

describe('sitewide remediation contracts', () => {
  it('keeps appointment retries idempotent and renders the API date range', () => {
    const appointment = source('src/views/AppointmentView.vue')
    const profileAppointments = source('src/components/ProfileAppointments.vue')
    expect(appointment).toContain("'Idempotency-Key'")
    expect(appointment).toContain('dateDays')
    expect(profileAppointments).toContain('/appointments/me')
  })

  it('keeps profile records server-backed and payment recovery-aware', () => {
    expect(source('src/components/ProfileAppointments.vue')).toContain('/appointments/me')
    const orders = source('src/components/ProfileOrders.vue')
    expect(orders).toContain('/orders?page=${targetPage}&size=20')
    expect(orders).toContain('/mock-payment')
    expect(orders).toContain('/orders/${orderId}')
  })

  it('separates content/product editing and confirms destructive admin actions', () => {
    const content = source('src/views/AdminContentView.vue')
    const operations = source('src/views/AdminOperationsView.vue')
    expect(content).toContain('artifactForm')
    expect(content).toContain('articleForm')
    expect(content).toContain('AdminConfirmDialog')
    expect(operations).toContain('createProductForm')
    expect(operations).toContain('editProductForm')
    expect(operations).toContain('AdminConfirmDialog')
    expect(operations).toContain('totalPages')
  })

  it('keeps content pagination, request guards and structured exhibit metadata', () => {
    expect(source('src/views/ExploreView.vue')).toContain('collectionTotalPages')
    expect(source('src/views/ContentDetailView.vue')).toContain('detailRequestId')
    const exhibit = source('src/views/ExhibitDetailView.vue')
    expect(exhibit).toContain('sourceCredit')
    expect(exhibit).toContain('collectionLocation')
    expect(exhibit).not.toContain('EXHIBIT 06')
    expect(exhibit).not.toContain('Cleveland Museum of Art · 1962.281')
  })

  it('keeps the theme contract in named token and glass entry points', () => {
    expect(source('src/assets/tokens.css')).toContain('--theme-canvas')
    expect(source('src/assets/base.css')).toContain('44px')
    expect(source('src/assets/glass.css')).toContain('[data-glass]')
    const vueFiles = ['src/App.vue', 'src/views/HomeView.vue', 'src/views/ExploreView.vue', 'src/views/ProfileView.vue']
      .map((path) => source(path))
    expect(vueFiles.filter((file) => file.includes('<main')).length).toBe(1)
  })

  it('keeps mobile account access and resumes an unauthenticated add-to-cart intent', () => {
    const app = source('src/App.vue')
    const shop = source('src/views/ShopView.vue')
    expect(app).toContain('account-label--mobile')
    expect(app).toContain('mobileAccountLabel')
    expect(shop).toContain("intent: 'add-to-cart'")
    expect(shop).toContain('productId: String(product.id)')
    expect(shop).toContain('resumePendingAdd')
    expect(shop).toContain("router.replace({ name: 'shop' })")
  })

  it('locks the five audited responsive readability fixes into source contracts', () => {
    const explore = source('src/views/ExploreView.vue')
    const exhibit = source('src/views/ExhibitDetailView.vue')
    const mainCss = source('src/assets/main.css')
    const exhibitCss = source('src/assets/route-exhibit-detail-legacy.css')
    const exploreCss = source('src/assets/explore-gallery.css')
    expect(explore).toContain('gallery-result-grid')
    expect(exploreCss).toContain('var(--theme-surface-content)')
    expect(exploreCss).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))')
    expect(exhibit).toContain('pointCloudMode')
    expect(exhibit).toContain('pointCloudTour')
    expect(exhibitCss).toContain('.app-shell:has(.immersive-exhibit) > .mobile-tab-bar')
    expect(mainCss).toContain('.booking-steps li.current')
    expect(mainCss).toContain('.date-strip::-webkit-scrollbar')
  })
})
