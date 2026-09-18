import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from './auth'
import { readAppointmentDraft, saveAppointmentDraft } from './appointmentDraft'

const user = { id: 1, username: 'visitor', nickname: 'Visitor', roles: ['USER'], email: '', phone: '', status: 'ACTIVE' }
describe('session initialization', () => {
  beforeEach(() => { localStorage.clear(); localStorage.setItem('heluo.access-token', 'token'); setActivePinia(createPinia()) })
  afterEach(() => vi.unstubAllGlobals())

  it('shares one initialization request and keeps a session through network failures', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('offline'))
    vi.stubGlobal('fetch', fetch)
    const auth = useAuthStore()
    auth.user = user
    await Promise.all([auth.initialize(), auth.initialize()])
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(auth.loggedIn).toBe(true)
    expect(localStorage.getItem('heluo.access-token')).toBe('token')
    expect(auth.initialized).toBe(false)
    expect(auth.initializationError).toBeTruthy()
    fetch.mockResolvedValue(new Response(JSON.stringify({ data: user })))
    await auth.initialize()
    expect(auth.initialized).toBe(true)
    expect(auth.initializationError).toBe('')
  })

  it('clears only unauthorized sessions and retains forbidden sessions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 403 })))
    const auth = useAuthStore()
    await auth.initialize()
    expect(auth.token).toBe('token')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })))
    await auth.initialize()
    expect(auth.token).toBe('')
    expect(auth.sessionExpired).toBe(true)
  })

  it('does not restore a user after logout races a pending initialization', async () => {
    let resolve!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>(done => { resolve = done })))
    const auth = useAuthStore()
    const pending = auth.initialize()
    auth.clear()
    resolve(new Response(JSON.stringify({ data: user })))
    await pending
    expect(auth.user).toBeNull()
    expect(auth.token).toBe('')
  })

  it('ignores an old profile response after switching accounts', async () => {
    let resolve!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>(done => { resolve = done })))
    const auth = useAuthStore()
    auth.user = user
    const pending = auth.updateProfile({ nickname: 'Old account' })
    auth.clear()
    auth.token = 'second-token'
    auth.user = { ...user, id: 2 }
    resolve(new Response(JSON.stringify({ data: { ...user, nickname: 'Old account' } })))
    await pending
    expect(auth.user.id).toBe(2)
    expect(auth.user.nickname).toBe('Visitor')
  })

  it('clears private drafts immediately and keeps a new login when an old logout completes', async () => {
    let resolve!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>(done => { resolve = done })))
    const auth = useAuthStore()
    auth.user = user
    saveAppointmentDraft({ ...readAppointmentDraft().form, contactName: 'Private contact' }, null, user.id)
    const pending = auth.logout()
    expect(readAppointmentDraft(user.id).form.contactName).toBe('')
    auth.token = 'new-token'
    auth.user = { ...user, id: 3 }
    resolve(new Response(JSON.stringify({ data: null })))
    await pending
    expect(auth.token).toBe('new-token')
    expect(auth.user.id).toBe(3)
  })
})
