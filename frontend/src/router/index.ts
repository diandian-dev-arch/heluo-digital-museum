import { createRouter, createWebHistory } from 'vue-router'
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
  { path: '/profile', name: 'profile', component: ProfileView, meta: { title: '个人中心' } },
  { path: '/admin', name: 'admin', component: AdminContentView, meta: { title: '内容管理' } },
  { path: '/admin/operations', name: 'admin-operations', component: AdminOperationsView, meta: { title: '运营管理' } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export default createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition ?? { left: 0, top: 0 }
  },
})



