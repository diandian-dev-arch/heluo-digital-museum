import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AdminConfirmDialog from './AdminConfirmDialog.vue'

describe('admin confirmation pending focus', () => {
  it('keeps Tab and Shift+Tab inside while every action is disabled, then restores usable focus', async () => {
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()
    const wrapper = mount(AdminConfirmDialog, { props: { open: true, title: '撤回', message: '确认撤回？' }, attachTo: document.body })
    await nextTick()
    const panel = document.querySelector<HTMLElement>('.admin-confirm-dialog')!
    const cancel = panel.querySelector<HTMLElement>('[data-confirm-cancel]')!
    expect(document.activeElement).toBe(cancel)
    await wrapper.setProps({ pending: true })
    await nextTick()
    expect(document.activeElement).toBe(panel)
    for (const shiftKey of [false, true]) {
      const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, cancelable: true, bubbles: true })
      panel.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(panel)
    }
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(wrapper.emitted('cancel')).toBeUndefined()
    await wrapper.setProps({ pending: false })
    await nextTick()
    expect(document.activeElement).toBe(cancel)
    wrapper.unmount()
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })
})
