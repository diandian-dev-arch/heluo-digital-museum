import { beforeEach, expect, it } from 'vitest'
import { adoptAppointmentDraft, clearAppointmentDraft, readAppointmentDraft, saveAppointmentDraft } from './appointmentDraft'

beforeEach(clearAppointmentDraft)

it('retains a guest draft for login, then restricts it to that account', () => {
  saveAppointmentDraft({ ...readAppointmentDraft().form, contactName: 'Guest contact' }, null)
  adoptAppointmentDraft(1)
  expect(readAppointmentDraft(1).form.contactName).toBe('Guest contact')
  expect(readAppointmentDraft(2).form.contactName).toBe('')
  expect(readAppointmentDraft().form.contactName).toBe('')
  adoptAppointmentDraft(2)
  expect(readAppointmentDraft(2).form.contactName).toBe('')
})

it('preserves an uncertain booking for the same account after reauthentication', () => {
  saveAppointmentDraft({ ...readAppointmentDraft().form, contactName: 'Owner' }, 'same-booking', 1)
  adoptAppointmentDraft(1)
  expect(readAppointmentDraft(1).creationKey).toBe('same-booking')
})
