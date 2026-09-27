import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PlainTextLinks from './PlainTextLinks.vue'

describe('PlainTextLinks', () => {
  it('links a public source while preserving surrounding prose and punctuation', () => {
    const text = '原件：https://www.clevelandart.org/art/1962.281。模型：https://sketchfab.com/models/example。'
    const wrapper = mount(PlainTextLinks, { props: { text } })
    expect(wrapper.text()).toBe(text)
    const links = wrapper.findAll('a')
    expect(links.map(link => link.attributes('href'))).toEqual([
      'https://www.clevelandart.org/art/1962.281', 'https://sketchfab.com/models/example',
    ])
    expect(links.every(link => link.attributes('rel') === 'noopener noreferrer')).toBe(true)
  })

  it('renders HTML and unsafe protocols as text and does not expose credential URLs as links', () => {
    const text = '<img src=x onerror=alert(1)> javascript:alert(1) data:text/html,hi https://user:password@example.test/'
    const wrapper = mount(PlainTextLinks, { props: { text } })
    expect(wrapper.text()).toBe(text)
    expect(wrapper.findAll('img,a,script')).toHaveLength(0)
  })

  it('updates the displayed source when the detail changes without losing text', async () => {
    const wrapper = mount(PlainTextLinks, { props: { text: '没有外链的观察说明。' } })
    expect(wrapper.text()).toBe('没有外链的观察说明。')
    await wrapper.setProps({ text: '来源 https://example.test/source.' })
    expect(wrapper.get('a').attributes('href')).toBe('https://example.test/source')
    expect(wrapper.text()).toBe('来源 https://example.test/source.')
  })
})
