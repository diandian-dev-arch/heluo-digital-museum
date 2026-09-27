export interface AppointmentForm {
  slotId: number
  visitorCount: number
  contactName: string
  contactPhone: string
  contactEmail: string
  notes: string
}

interface AppointmentDraft { form: AppointmentForm; creationKey: string | null; ownerId: number | null }
let draft: AppointmentDraft | undefined

export function readAppointmentDraft(ownerId: number | null = null): AppointmentDraft {
  return draft && (draft.ownerId === null || draft.ownerId === ownerId) ? { ...draft, form: { ...draft.form } } : {
    form: { slotId: 0, visitorCount: 1, contactName: '', contactPhone: '', contactEmail: '', notes: '' },
    creationKey: null,
    ownerId,
  }
}

export function saveAppointmentDraft(form: AppointmentForm, creationKey: string | null, ownerId: number | null = null) {
  draft = { form: { ...form }, creationKey, ownerId }
}

export function adoptAppointmentDraft(ownerId: number) {
  if (draft?.ownerId != null && draft.ownerId !== ownerId) clearAppointmentDraft()
  if (draft) draft.ownerId = ownerId
}

export function clearAppointmentDraft() { draft = undefined }
