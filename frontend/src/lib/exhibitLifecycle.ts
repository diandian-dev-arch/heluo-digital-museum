export function createDisposalScope() {
  const releases = new Set<() => void>()
  let disposed = false
  return {
    add(dispose: () => void) {
      let released = false
      const release = () => {
        if (released) return
        released = true
        releases.delete(release)
        // Context loss can invalidate individual resources. Always release the rest.
        try { dispose() } catch { /* Best-effort disposal after WebGL context loss. */ }
      }
      if (disposed) release()
      else releases.add(release)
      return release
    },
    dispose() {
      disposed = true
      Array.from(releases).reverse().forEach((release) => release())
    },
  }
}

export function yieldToMainThread(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted()
    const onAbort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      reject(signal?.reason ?? new DOMException('Sampling cancelled', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, 0)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export async function runInTimeSlices(
  count: number,
  work: (index: number) => void,
  options: {
    signal?: AbortSignal
    budgetMs?: number
    maxSteps?: number
    now?: () => number
    yieldTask?: () => Promise<void>
  } = {},
): Promise<void> {
  const { signal, budgetMs = 8, maxSteps = 1024, now = () => performance.now() } = options
  const yieldTask = options.yieldTask ?? (() => yieldToMainThread(signal))
  let started = now()
  let steps = 0
  signal?.throwIfAborted()
  for (let index = 0; index < count; index += 1) {
    work(index)
    steps += 1
    if (index + 1 < count && (steps >= maxSteps || now() - started >= budgetMs)) {
      await yieldTask()
      signal?.throwIfAborted()
      started = now()
      steps = 0
    }
  }
  signal?.throwIfAborted()
}
