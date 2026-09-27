const RECOVERY_KEY = 'heluo.exhibit-runtime-recovery'
const RECOVERY_MAX_AGE_MS = 2 * 60 * 1000

function currentPath() {
  return window.location.pathname + window.location.search + window.location.hash
}

export function reloadExhibitRuntime() {
  try {
    window.sessionStorage.setItem(RECOVERY_KEY, JSON.stringify({ path: currentPath(), requestedAt: Date.now() }))
  } catch { /* Reload still clears failed imports when session storage is unavailable. */ }
  // Native import failures are cached for this document, including failed dependencies.
  // Reload this frame so PocketBay also preserves the actual exhibit route.
  window.location.reload()
}

export function consumeExhibitRuntimeRecovery(): boolean {
  try {
    const saved = window.sessionStorage.getItem(RECOVERY_KEY)
    window.sessionStorage.removeItem(RECOVERY_KEY)
    if (!saved) return false
    const recovery: unknown = JSON.parse(saved)
    if (!recovery || typeof recovery !== 'object' || !('path' in recovery) || !('requestedAt' in recovery)) return false
    if (recovery.path !== currentPath() || typeof recovery.requestedAt !== 'number') return false
    const age = Date.now() - recovery.requestedAt
    return age >= 0 && age <= RECOVERY_MAX_AGE_MS
  } catch {
    return false
  }
}
