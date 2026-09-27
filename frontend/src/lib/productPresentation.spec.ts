import { describe, expect, it } from 'vitest'
import { fallbackProductCover, resolveProductPresentation } from './productPresentation'

describe('product presentation fallbacks', () => {
  it('fills blank catalog fields from a stable product slug', () => {
    const product = resolveProductPresentation({
      slug: 'river-map-notebook',
      name: '河图纹笔记本',
      summary: '',
      coverImageUrl: '',
    })

    expect(product.summary).toContain('河洛图纹')
    expect(product.coverImageUrl).toBe('/media/products/river-map-notebook.webp')
  })

  it('supports legacy cart items that only carry a product name', () => {
    expect(fallbackProductCover({ name: '河洛水系丝巾' }))
      .toBe('/media/products/heluo-silk-scarf.webp')
  })

  it('preserves an administrator-provided cover', () => {
    const product = resolveProductPresentation({
      slug: 'river-line-teacup-set',
      coverImageUrl: '/uploads/custom-cup.webp',
    })

    expect(product.coverImageUrl).toBe('/uploads/custom-cup.webp')
  })

  it('keeps validation products presentable when the API has no media fields', () => {
    const product = resolveProductPresentation({
      slug: 'a2-product-46519022',
      name: '验收商品2 9022',
      summary: '',
      coverImageUrl: '',
    })

    expect(product.summary).toBeTruthy()
    expect(product.coverImageUrl).toBe('/media/editorial/shop-object-studio.webp')
  })
})
