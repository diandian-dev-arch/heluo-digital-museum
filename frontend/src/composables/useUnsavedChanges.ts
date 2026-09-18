import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue'
import { matchedRouteKey, onBeforeRouteLeave } from 'vue-router'

export function useUnsavedChanges(options: {
  value: () => unknown
  dirty?: () => boolean
  save: () => Promise<boolean>
  discard: () => void
  blocked?: () => boolean
}) {
  const baseline = ref(JSON.stringify(options.value()))
  const dirty = computed(() => options.dirty ? options.dirty() : JSON.stringify(options.value()) !== baseline.value)
  const open = ref(false)
  const pending = ref(false)
  let resolveDecision: ((leave: boolean) => void) | undefined

  function markClean() { baseline.value = JSON.stringify(options.value()) }
  function canLeave(): Promise<boolean> {
    if (options.blocked?.() || pending.value || resolveDecision) return Promise.resolve(false)
    if (!dirty.value) return Promise.resolve(true)
    open.value = true
    return new Promise(resolve => { resolveDecision = resolve })
  }
  async function attempt(action: () => void | Promise<void>) {
    if (await canLeave()) await action()
  }
  async function decide(choice: 'save' | 'discard' | 'continue') {
    if (!resolveDecision || pending.value) return
    pending.value = true
    try {
      if (choice === 'save' && !await options.save()) return
      if (choice === 'discard') options.discard()
      if (choice !== 'continue') markClean()
      open.value = false
      const resolve = resolveDecision
      resolveDecision = undefined
      resolve(choice !== 'continue')
    } finally {
      pending.value = false
    }
  }
  function beforeUnload(event: BeforeUnloadEvent) {
    if (!dirty.value && !options.blocked?.()) return
    event.preventDefault()
    event.returnValue = ''
  }
  if (inject(matchedRouteKey, null)) onBeforeRouteLeave(canLeave)
  onMounted(() => window.addEventListener('beforeunload', beforeUnload))
  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', beforeUnload)
    resolveDecision?.(false)
    resolveDecision = undefined
  })
  return { dirty, open, pending, markClean, attempt, decide }
}
