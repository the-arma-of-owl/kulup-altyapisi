'use client'

import { useAuth } from '@payloadcms/ui'
import Link from 'next/link'

export const GateNavLink = () => {
  const { user } = useAuth<{ roles?: string[] | null }>()
  if (!user?.roles?.some((role) => role === 'admin' || role === 'gate')) return null
  return <Link className="nav__link" href="/admin/kapi"><span className="nav__label">🎟️ Kapı QR okuyucu</span></Link>
}
