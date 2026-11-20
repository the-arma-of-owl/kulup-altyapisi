export function createAttemptLimiter(opts: { max: number; windowMs: number; maxKeys?: number; now?: () => number }) {
  const entries = new Map<string, { count: number; resetAt: number }>()
  const now = opts.now ?? Date.now
  const maxKeys = opts.maxKeys ?? 5000

  function isBlocked(key: string): boolean {
    const entry = entries.get(key)
    if (!entry) return false
    if (now() >= entry.resetAt) {
      entries.delete(key)
      return false
    }
    return entry.count >= opts.max
  }

  function recordFailure(key: string): void {
    if (isBlocked(key)) return
    const entry = entries.get(key)
    if (entry) {
      entry.count++
      return
    }
    if (entries.size >= maxKeys) {
      const currentTime = now()
      for (const [candidate, value] of entries) {
        if (currentTime >= value.resetAt) entries.delete(candidate)
      }
      if (entries.size >= maxKeys) entries.delete(entries.keys().next().value!)
    }
    entries.set(key, { count: 1, resetAt: now() + opts.windowMs })
  }

  return { isBlocked, recordFailure }
}
