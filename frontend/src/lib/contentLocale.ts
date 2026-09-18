export interface BilingualContent {
  title: string
  summary: string
  titleEn?: string | null
  summaryEn?: string | null
}

export function localizedContent<T extends BilingualContent>(item: T, locale: string): T {
  if (locale !== 'en-US') return item
  return {
    ...item,
    title: item.titleEn?.trim() || item.title,
    summary: item.summaryEn?.trim() || item.summary,
  }
}
