export interface ProductPresentationSource {
  slug?: string
  name?: string
  summary?: string | null
  coverImageUrl?: string | null
}

interface ProductFallback {
  summary: string
  coverImageUrl: string
}

const productFallbacks: Record<string, ProductFallback> = {
  'river-line-teacup-set': {
    summary: '让日常饮茶也保留一段关于河流的想象。',
    coverImageUrl: '/media/products/river-line-teacup-set.webp',
  },
  'heluo-silk-scarf': {
    summary: '以河流的流线和深墨绿为灵感的原创概念丝巾。',
    coverImageUrl: '/media/products/heluo-silk-scarf.webp',
  },
  'river-map-notebook': {
    summary: '把河洛图纹带进每天的记录与灵感。',
    coverImageUrl: '/media/products/river-map-notebook.webp',
  },
}

const productSlugByName: Record<string, string> = {
  '河流纹茶杯套装': 'river-line-teacup-set',
  '河洛水系丝巾': 'heluo-silk-scarf',
  '河图纹笔记本': 'river-map-notebook',
}

function productFallback(source: ProductPresentationSource): ProductFallback | undefined {
  const slug = source.slug?.trim() || (source.name ? productSlugByName[source.name] : undefined)
  return slug ? productFallbacks[slug] : undefined
}

export function fallbackProductCover(source: ProductPresentationSource): string {
  return productFallback(source)?.coverImageUrl ?? ''
}

export function resolveProductPresentation<T extends ProductPresentationSource>(source: T): T & {
  summary: string
  coverImageUrl: string
} {
  const fallback = productFallback(source)
  return {
    ...source,
    summary: source.summary?.trim() || fallback?.summary || '',
    coverImageUrl: source.coverImageUrl?.trim() || fallback?.coverImageUrl || '',
  }
}
