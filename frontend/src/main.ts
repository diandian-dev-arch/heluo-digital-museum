import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@fontsource-variable/noto-serif-sc/wght.css'
import './assets/main.css'
import './assets/interaction.css'
import './assets/pointer-motion.css'
import App from './App.vue'
import router from './router'
import { pointerSurface } from './directives/pointerSurface'

createApp(App).use(createPinia()).use(router).directive('pointer-surface', pointerSurface).mount('#app')
