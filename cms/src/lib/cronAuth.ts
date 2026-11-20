import { createHash, timingSafeEqual } from 'node:crypto'

export function safeEqual(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false

  const aHash = createHash('sha256').update(a).digest()
  const bHash = createHash('sha256').update(b).digest()
  return timingSafeEqual(aHash, bHash)
}

export function checkCronAuth(
  authorization: string | null | undefined,
  secret: string | undefined,
): 200 | 401 | 503 {
  if (!secret?.trim()) return 503
  return safeEqual(authorization, `Bearer ${secret}`) ? 200 : 401
}
