import { createRouter, createWebHistory, type RouterScrollBehavior } from 'vue-router'
import { useAuthStore } from '../stores/auth'
const HomeView = () => import('../views/HomeView.vue')
const ExploreView = () => import('../views/ExploreView.vue')
const ExhibitsView = () => import('../views/ExhibitsView.vue')
const AppointmentView = () => import('../views/AppointmentView.vue')
const ContentDetailView = () => import('../views/ContentDetailView.vue')
const LoginView = () => import('../views/LoginView.vue')
const ProfileView = () => import('../views/ProfileView.vue')
const AdminContentView = () => import('../views/AdminContentView.vue')
const ExhibitDetailView = () => import('../views/ExhibitDetailView.vue')
const ShopView = () => import('../views/ShopView.vue')
const AdminOperationsView = () => import('../views/AdminOperationsView.vue')

const routes = [
  { path: '/', name: 'home', component: HomeView, meta: { title: '首页' } },
  { path: '/explore', name: 'explore', component: ExploreView, meta: { title: '探索馆藏' } },
  { path: '/artifacts/:slug', name: 'artifact-detail', component: ContentDetailView, meta: { title: '文物故事' } },
  { path: '/articles/:slug', name: 'article-detail', component: ContentDetailView, meta: { title: '文化专题' } },
  { path: '/exhibits', name: 'exhibits', component: ExhibitsView, meta: { title: '数字展厅' } },
  { path: '/exhibits/:slug', name: 'exhibit-detail', component: ExhibitDetailView, meta: { title: '3D 数字展项' } },
  { path: '/appointment', name: 'appointment', component: AppointmentView, meta: { title: '预约参观' } },
  { path: '/shop', name: 'shop', component: ShopView, meta: { title: '河洛文创' } },
  { path: '/login', name: 'login', component: LoginView, meta: { title: '账户登录' } },
  { path: '/reset-password', name: 'reset-password', component: LoginView, meta: { title: '重置密码' } },
  { path: '/profile', name: 'profile', component: ProfileView, meta: { title: '个人中心', requiresAuth: true } },
  { path: '/admin', name: 'admin', component: AdminContentView, meta: { title: '内容管理', requiresAuth: true, role: 'ADMIN' } },
  { path: '/admin/operations', name: 'admin-operations', component: AdminOperationsView, meta: { title: '运营管理', requiresAuth: true, role: 'ADMIN' } },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('../views/NotFoundView.vue'), meta: { title: '页面不存在' } },
]

export const ROUTE_TRANSITION_MS = 240
export const routeScrollBehavior: RouterScrollBehavior = (to, from, savedPosition) => {
  if (savedPosition) return savedPosition
  if (to.hash) return { el: to.hash, top: 96, behavior: 'auto' }
  if (to.path === from.path) return false
  return new Promise((resolve) => {
    window.setTimeout(() => resolve({ left: 0, top: 0 }), ROUTE_TRANSITION_MS)
  })
}

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: routeScrollBehavior,
})

router.beforeEach(async (to) => {
  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth)
  const requiredRole = to.matched.find((record) => record.meta.role)?.meta.role
  if (!requiresAuth && !requiredRole) return true
  const auth = useAuthStore()
  await auth.initialize()
  if (auth.token && auth.initializationError) return true
  if (!auth.loggedIn) return { name: 'login', query: { returnTo: to.fullPath } }
  if (requiredRole && !auth.user?.roles.includes(String(requiredRole))) return { name: 'home' }
  return true
})

export default router



