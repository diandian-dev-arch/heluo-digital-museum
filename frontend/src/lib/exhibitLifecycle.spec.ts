import { describe, expect, it, vi } from 'vitest'
import { createDisposalScope, runInTimeSlices, yieldToMainThread } from './exhibitLifecycle'

describe('exhibit runtime lifecycle', () => {
  it('disposes resources once, in reverse order, even if a disposer fails', () => {
    const scope = createDisposalScope()
    const calls: number[] = []
    scope.add(() => calls.push(1))
    const release = scope.add(() => { calls.push(2); throw new Error('already lost') })
    scope.add(() => calls.push(3))
    release()
    scope.dispose()
    scope.dispose()
    expect(calls).toEqual([2, 3, 1])
    scope.add(() => calls.push(4))
    expect(calls).toEqual([2, 3, 1, 4])
  })

  it('yields at a bounded work count even when the clock has low precision', async () => {
    const work = vi.fn()
    const yieldTask = vi.fn(async () => undefined)
    await runInTimeSlices(10, work, { maxSteps: 3, now: () => 0, yieldTask })
    expect(work).toHaveBeenCalledTimes(10)
    expect(yieldTask).toHaveBeenCalledTimes(3)
    expect(work.mock.calls.map(([index]) => index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('stops sampling when cancelled while yielding', async () => {
    const controller = new AbortController()
    const work = vi.fn()
    await expect(runInTimeSlices(100, work, {
      signal: controller.signal,
      maxSteps: 4,
      yieldTask: async () => { controller.abort() },
    })).rejects.toMatchObject({ name: 'AbortError' })
    expect(work).toHaveBeenCalledTimes(4)
  })

  it('cancels a pending main-thread yield immediately', async () => {
    const controller = new AbortController()
    const pending = yieldToMainThread(controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})
