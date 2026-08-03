export type MotionFrameSubscriber = (time: number, deltaMs: number) => void

const subscribers = new Set<MotionFrameSubscriber>()
let frameId = 0
let previousTime = 0

function tick(time: number) {
  frameId = 0
  const deltaMs = previousTime ? Math.min(time - previousTime, 64) : 16.67
  previousTime = time
  subscribers.forEach((subscriber) => subscriber(time, deltaMs))
  if (subscribers.size) frameId = requestAnimationFrame(tick)
  else previousTime = 0
}

export function subscribeMotionFrame(subscriber: MotionFrameSubscriber): () => void {
  subscribers.add(subscriber)
  if (!frameId) frameId = requestAnimationFrame(tick)
  return () => {
    subscribers.delete(subscriber)
    if (!subscribers.size && frameId) {
      cancelAnimationFrame(frameId)
      frameId = 0
      previousTime = 0
    }
  }
}

export function activeMotionFrameSubscribers(): number {
  return subscribers.size
}
