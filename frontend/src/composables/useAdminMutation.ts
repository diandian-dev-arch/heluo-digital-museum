import { ref } from 'vue'

export function useAdminMutation() {
  const pendingKeys = ref<string[]>([])
  const isPending = (key: string) => pendingKeys.value.includes(key)
  async function run<T>(key: string, task: () => Promise<T>): Promise<T | undefined> {
    if (isPending(key)) return undefined
    pendingKeys.value = [...pendingKeys.value, key]
    try {
      return await task()
    } finally {
      pendingKeys.value = pendingKeys.value.filter((item) => item !== key)
    }
  }
  return { pendingKeys, isPending, run }
}
