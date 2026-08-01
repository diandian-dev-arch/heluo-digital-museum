import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import PagePlaceholderView from '../views/PagePlaceholderView.vue'
import ExploreView from '../views/ExploreView.vue'
import ExhibitsView from '../views/ExhibitsView.vue'

const routes = [
  { path: '/', name: 'home', component: HomeView },
  { path: '/explore', name: 'explore', component: ExploreView },
  { path: '/exhibits', name: 'exhibits', component: ExhibitsView },
  { path: '/appointment', name: 'appointment', component: PagePlaceholderView, meta: { title: '预约参观', description: '登录后选择时段、填写联系人信息并提交预约。' } },
  { path: '/shop', name: 'shop', component: PagePlaceholderView, meta: { title: '河洛文创', description: '浏览原创文创、维护购物车并完成模拟支付。' } },
  { path: '/login', name: 'login', component: PagePlaceholderView, meta: { title: '登录', description: '用户名和密码登录；密码找回使用已绑定邮箱。' } },
  { path: '/admin', name: 'admin', component: PagePlaceholderView, meta: { title: '管理后台', description: '后台路由将在认证和角色校验接入后开放。' } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export default createRouter({
  history: createWebHistory(),
  routes,
})


