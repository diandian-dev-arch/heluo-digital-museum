import { reactive, readonly } from 'vue'
import type { CursorIntent, MotionTier } from '../lib/pointerMotion'

// Pointer coordinates are read from the shared RAF loop, not from the Vue
// template. Keep this hot channel non-reactive so high-refresh pointer events
// do not schedule component updates.
const position = {
  clientX: 0,
  clientY: 0,
  velocityX: 0,
  velocityY: 0,
}

const pointer = reactive({
  visible: false,
  pressed: false,
  intent: 'idle' as CursorIntent,
  tier: 'static' as MotionTier,
})

export function usePointerMotion() {
  return {
    pointer: readonly(pointer),
    position,
    updatePosition(clientX: number, clientY: number, velocityX: number, velocityY: number) {
      Object.assign(position, { clientX, clientY, velocityX, velocityY })
    },
    setVisible(visible: boolean) { pointer.visible = visible },
    setPressed(pressed: boolean) { pointer.pressed = pressed },
    setIntent(intent: CursorIntent) { pointer.intent = intent },
    setTier(tier: MotionTier) { pointer.tier = tier },
  }
}
