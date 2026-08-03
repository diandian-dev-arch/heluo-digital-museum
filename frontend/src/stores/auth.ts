import { defineStore } from 'pinia'
import { apiGet, apiRequest } from '../lib/api'

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

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem(tokenKey) ?? '',
    user: null as CurrentUser | null,
    initialized: false,
  }),
  getters: {
    loggedIn: (state) => Boolean(state.token && state.user),
    isAdmin: (state) => state.user?.roles.includes('ADMIN') ?? false,
  },
  actions: {
    async initialize() {
      if (!this.token) {
        this.initialized = true
        return
      }
      try {
        this.user = await apiGet<CurrentUser>('/auth/me', this.token)
      } catch {
        this.clear()
      } finally {
        this.initialized = true
      }
    },
    async login(username: string, password: string) {
      const result = await apiRequest<LoginResult>('/auth/login', 'POST', { username, password })
      this.token = result.accessToken
      this.user = result.user
      localStorage.setItem(tokenKey, this.token)
    },
    async register(payload: { username: string; password: string; nickname: string; email?: string; phone?: string }) {
      await apiRequest<CurrentUser>('/auth/register', 'POST', payload)
    },
    async updateProfile(payload: { nickname: string; email?: string; phone?: string }) {
      const updated = await apiRequest<Pick<CurrentUser, 'id' | 'nickname' | 'email' | 'phone'>>('/users/me', 'PATCH', payload, this.token)
      if (this.user) {
        this.user = { ...this.user, ...updated }
      }
    },
    async logout() {
      if (this.token) {
        try {
          await apiRequest('/auth/logout', 'POST', undefined, this.token)
        } catch {
          // The local session must still be cleared when the server session already expired.
        }
      }
      this.clear()
    },
    clear() {
      this.token = ''
      this.user = null
      localStorage.removeItem(tokenKey)
    },
  },
})
