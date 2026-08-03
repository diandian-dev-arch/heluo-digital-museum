import { reactive, readonly } from 'vue'
import type { CursorIntent, MotionTier } from '../lib/pointerMotion'

const pointer = reactive({
  clientX: 0,
  clientY: 0,
  velocityX: 0,
  velocityY: 0,
  visible: false,
  pressed: false,
  intent: 'idle' as CursorIntent,
  tier: 'static' as MotionTier,
})

export function usePointerMotion() {
  return {
    pointer: readonly(pointer),
    updatePosition(clientX: number, clientY: number, velocityX: number, velocityY: number) {
      Object.assign(pointer, { clientX, clientY, velocityX, velocityY })
    },
    setVisible(visible: boolean) { pointer.visible = visible },
    setPressed(pressed: boolean) { pointer.pressed = pressed },
    setIntent(intent: CursorIntent) { pointer.intent = intent },
    setTier(tier: MotionTier) { pointer.tier = tier },
  }
}
