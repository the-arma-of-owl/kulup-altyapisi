'use client'

import React, { useCallback, useRef } from 'react'
import type { TurnstileInstance } from '@marsidev/react-turnstile'
import HumanCheck from '@/components/ui/HumanCheck'

const WAIT_MS = 10_000

/**
 * Hesap açma / takım kurma için Turnstile jetonu. Kutucuk çoğu kişide görünmeden geçer; `take()` hazır jetonu
 * (gerekirse en fazla 10 sn bekleyerek) verir ve kutuyu bir sonraki istek için yeniler — jeton tek kullanımlık.
 */
export function useHuman(className = 'mt-2') {
  const ref = useRef<TurnstileInstance>(null)
  const token = useRef<string | null>(null)
  const waiters = useRef<Array<(t: string) => void>>([])

  const onSuccess = useCallback((t: string) => {
    token.current = t
    for (const resolve of waiters.current.splice(0)) resolve(t)
  }, [])
  const onExpire = useCallback(() => { token.current = null }, [])

  const take = useCallback(async (): Promise<string | null> => {
    const ready = token.current ?? await new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => {
        waiters.current = waiters.current.filter((w) => w !== done)
        resolve(null)
      }, WAIT_MS)
      const done = (t: string) => { clearTimeout(timer); resolve(t) }
      waiters.current.push(done)
    })
    token.current = null
    ref.current?.reset()
    return ready
  }, [])

  const element = <HumanCheck ref={ref} onSuccess={onSuccess} onExpire={onExpire} onError={onExpire} className={className} />
  return { element, take }
}
