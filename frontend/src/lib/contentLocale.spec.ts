import { describe, expect, it } from 'vitest'
import { localizedContent } from './contentLocale'

describe('database-backed content translations', () => {
  it('selects English fields independently and preserves identity and source', () => {
    const item = { slug: 'test', title: '中文标题', summary: '中文摘要', titleEn: ' English title ', summaryEn: null }
    expect(localizedContent(item, 'en-US')).toEqual({ ...item, title: 'English title' })
    expect(localizedContent(item, 'zh-CN')).toBe(item)
    expect(item.title).toBe('中文标题')
  })
  it('supports old responses and blank translations without empty cards', () => {
    const item = { title: '标题', summary: '摘要' }
    expect(localizedContent(item, 'en-US')).toEqual(item)
    expect(localizedContent({ ...item, titleEn: ' ', summaryEn: 'English summary' }, 'en-US'))
      .toMatchObject({ title: '标题', summary: 'English summary' })
  })
})
