'use client'

import { useAuth } from '@payloadcms/ui'
import Link from 'next/link'

export const StatsNavLink = () => {
  const { user } = useAuth<{ roles?: string[] | null }>()
  if (!user?.roles?.includes('admin')) return null
  return <Link className="nav__link" href="/admin/istatistikler"><span className="nav__label">📊 İstatistikler</span></Link>
}
