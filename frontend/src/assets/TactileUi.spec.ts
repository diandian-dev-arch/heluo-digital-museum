import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AdminActionButton from '../components/AdminActionButton.vue'
import EditorialCard from '../components/EditorialCard.vue'
import FluidButton from '../components/FluidButton.vue'
import MuseumSearchField from '../components/MuseumSearchField.vue'

describe('Moonstone Tactile shared UI contract', () => {
  it('keeps the native button API while exposing a tactile primary surface', () => {
    const wrapper = mount(FluidButton, { props: { variant: 'primary' }, slots: { default: '开始探索' } })
    const button = wrapper.get('button')

    expect(button.attributes('data-tactile-button')).toBeDefined()
    expect(button.attributes('data-tactile-variant')).toBe('primary')
    expect(button.attributes('type')).toBe('button')
    expect(wrapper.get('.fluid-button__fill').attributes('aria-hidden')).toBe('true')
  })

  it('adds a semantic leading affordance without changing search submit or clear behavior', async () => {
    const wrapper = mount(MuseumSearchField, {
      props: { modelValue: '青铜', label: '搜索文物或文章', submitLabel: '搜索', clearLabel: '清除搜索' },
    })

    expect(wrapper.get('[data-tactile-search]').attributes('data-tactile-search')).toBeDefined()
    expect(wrapper.get('[data-tactile-field]').attributes('data-tactile-field')).toBeDefined()
    expect(wrapper.get('.museum-search-field__leading').attributes('aria-hidden')).toBe('true')
    expect(wrapper.get('.museum-search-field__submit').attributes('data-tactile-button')).toBeDefined()
    expect(wrapper.get('.museum-search-field__submit').attributes('data-tactile-variant')).toBe('primary')

    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')).toHaveLength(1)

    await wrapper.get('.museum-search-field__clear').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['']])
    expect(wrapper.emitted('clear')).toHaveLength(1)
  })

  it('connects editorial cards and compact admin operations to the same material contract', () => {
    const card = mount(EditorialCard, {
      props: { to: '/explore', mediaAlt: '河洛文物' },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    const action = mount(AdminActionButton, { props: { action: 'publish' }, slots: { default: '发布' } })

    expect(card.get('[data-tactile-card]').attributes('data-tactile-card')).toBeDefined()
    expect(action.get('button').attributes('data-tactile-button')).toBeDefined()
    expect(action.get('button').attributes('data-tactile-variant')).toBe('primary')
  })

  it('keeps the tactile layer tokenized, attributed, and preference-safe', () => {
    const tokens = readFileSync(resolve(process.cwd(), 'src/assets/tokens.css'), 'utf8')
    const styles = [
      'tactile-ui.css',
      'route-admin-legacy.css',
      'route-exhibit-detail-legacy.css',
      'route-explore-legacy.css',
    ].map(path => readFileSync(resolve(process.cwd(), 'src/assets', path), 'utf8')).join('\n')

    expect(tokens).toContain('--theme-tactile-action-shadow')
    expect(tokens).toContain('--theme-tactile-card-shadow-raised')
    expect(styles).toContain('From Uiverse.io by SujitAdroja')
    expect(styles).toContain('Inputs/TimTrayler_orange-bat-25.html')
    expect(styles).toContain('Cards/alexreyes091_hard-firefox-84.html')
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)')
    expect(styles).toContain('@media (forced-colors: active)')
  })
})
