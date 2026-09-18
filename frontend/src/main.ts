import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './assets/tokens.css'
import './assets/base.css'
import './assets/glass.css'
import './assets/main.css'
import './assets/interaction.css'
import './assets/pointer-motion.css'
import './assets/moonhall-light.css'
import './assets/tactile-ui.css'
import './assets/light-ui-material-depth.css'
import './assets/mobile-performance.css'
import './assets/theme-controls.css'
import App from './App.vue'
import router from './router'
import { pointerSurface } from './directives/pointerSurface'
import { applyDevicePerformanceTier } from './lib/devicePerformance'

const performanceTier = applyDevicePerformanceTier()
const mountApplication = () => {
  createApp(App).use(createPinia()).use(router).directive('pointer-surface', pointerSurface).mount('#app')
}

if (performanceTier === 'constrained') {
  window.setTimeout(mountApplication, 0)
} else {
  mountApplication()
}
