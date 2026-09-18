import { defineStore } from 'pinia'
import { ApiRequestError, apiGet, apiRequest, resetUnauthorizedState } from '../lib/api'
import { clearAppointmentDraft, adoptAppointmentDraft } from './appointmentDraft'

export interface CurrentUser {
  id: number
  username: string
  nickname: string
  email: string
  phone: string
  status: string
  roles: string[]
}

interface LoginResult {
  accessToken: string
  expiresAt: string
  user: CurrentUser
}

const tokenKey = 'heluo.access-token'
const initializations = new WeakMap<object, Promise<void>>()

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem(tokenKey) ?? '',
    user: null as CurrentUser | null,
    initialized: false,
    initializationError: '',
    sessionExpired: false,
    sessionRevision: 0,
  }),
  getters: {
    loggedIn: (state) => Boolean(state.token && state.user),
    isAdmin: (state) => state.user?.roles.includes('ADMIN') ?? false,
  },
  actions: {
    async initialize() {
      if (this.initialized) return
      const pending = initializations.get(this)
      if (pending) return pending
      if (!this.token) {
        this.initialized = true
        return
      }
      const token = this.token
      this.initializationError = ''
      const initialization = (async () => {
        try {
          const user = await apiGet<CurrentUser>('/auth/me', token)
          if (this.token !== token) return
          this.user = user
          this.initialized = true
        } catch (reason) {
          if (this.token !== token) return
          if (reason instanceof ApiRequestError && reason.status === 401) this.expireSession(token)
          else this.initializationError = reason instanceof Error ? reason.message : '账户暂时无法加载，请重试。'
        } finally {
          initializations.delete(this)
        }
      })()
      initializations.set(this, initialization)
      return initialization
    },
    async login(username: string, password: string) {
      const revision = ++this.sessionRevision
      const result = await apiRequest<LoginResult>('/auth/login', 'POST', { username, password })
      if (revision !== this.sessionRevision) return
      adoptAppointmentDraft(result.user.id)
      this.token = result.accessToken
      this.user = result.user
      this.initialized = true
      this.initializationError = ''
      this.sessionExpired = false
      resetUnauthorizedState()
      localStorage.setItem(tokenKey, this.token)
    },
    async register(payload: { username: string; password: string; nickname: string; email?: string; phone?: string }) {
      await apiRequest<CurrentUser>('/auth/register', 'POST', payload)
    },
    async updateProfile(payload: { nickname: string; email?: string; phone?: string }) {
      const token = this.token
      const revision = this.sessionRevision
      const updated = await apiRequest<Pick<CurrentUser, 'id' | 'nickname' | 'email' | 'phone'>>('/users/me', 'PATCH', payload, token)
      if (this.token === token && this.sessionRevision === revision && this.user?.id === updated.id) {
        this.user = { ...this.user, ...updated }
      }
    },
    async logout() {
      const token = this.token
      this.clear()
      if (token) {
        try {
          await apiRequest('/auth/logout', 'POST', undefined, token)
        } catch {
          // The local session must still be cleared when the server session already expired.
        }
      }
    },
    clear(preserveDraft = false) {
      this.sessionRevision++
      if (!preserveDraft) clearAppointmentDraft()
      this.token = ''
      this.user = null
      this.initialized = true
      this.initializationError = ''
      localStorage.removeItem(tokenKey)
    },
    expireSession(token: string) {
      if (this.token !== token) return
      this.clear(true)
      this.sessionExpired = true
    },
  },
})

/** Only accept an in-app path; absolute URLs and protocol-relative URLs are rejected. */
export function safeReturnTo(value: unknown, fallback = '/profile'): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback
  return value
}
