export const motionPresets = {
  uiSpring: { type: 'spring', stiffness: 500, damping: 42, mass: 0.9 },
  layoutSpring: { type: 'spring', stiffness: 360, damping: 34, mass: 0.85 },
  gestureSpring: { type: 'spring', stiffness: 420, damping: 38, mass: 0.9 },
  reveal: { duration: 0.34, ease: [0.22, 1, 0.36, 1] },
} as const

export type MotionPreset = keyof typeof motionPresets
export type SheetSnapPoint = 'closed' | 'medium' | 'full'
export type FeedbackState = 'idle' | 'loading' | 'success' | 'error'
