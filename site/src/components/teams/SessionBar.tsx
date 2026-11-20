'use client'

import React, { useEffect, useState } from 'react'
import { Loader2, LogIn, LogOut, UserRound } from 'lucide-react'
import { Link } from '@/i18n/routing'
import { logoutParticipant, takim, type Me } from '@/lib/teams/client'

/**
 * Katılımcı oturum çubuğu: girişliyken kim olduğunu ve "Çıkış yap"ı, çıkışlıyken "Giriş yap"ı gösterir.
 * Yanlış hesapla girildiyse buradan çıkıp doğru hesapla girilebilir.
 */
export default function SessionBar({
  user, onLoggedOut, onLogin, loginHref,
}: {
  user: { fullName: string; email: string } | null
  onLoggedOut: () => void
  /** Çıkışlıyken "Giriş yap": ya yerinde formu açar (onLogin) ya da bağlantıya gider (loginHref) */
  onLogin?: () => void
  loginHref?: string
}) {
  const [busy, setBusy] = useState(false)
  const base = 'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-kenar px-3.5 py-1.5 font-display text-xs font-bold shadow-sert-sm transition-[transform,box-shadow] hover:shadow-sert disabled:opacity-50'
  const ghost = `${base} bg-yuzey text-murekkep`

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-kenar bg-zemin-2 px-4 py-2.5 text-sm text-murekkep" data-testid="katilimci-oturum">
      {user ? (
        <>
          <span className="flex min-w-0 items-center gap-2 text-murekkep">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-kenar bg-limon text-murekkep"><UserRound className="h-3.5 w-3.5" aria-hidden /></span>
            <span className="min-w-0 truncate">
              <strong className="font-display font-bold">{user.fullName}</strong>
              <span className="text-soluk"> · {user.email}</span>
            </span>
          </span>
          <button
            type="button"
            className={ghost}
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await logoutParticipant()
              setBusy(false)
              onLoggedOut()
            }}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <LogOut className="h-3.5 w-3.5" aria-hidden />} Çıkış yap
          </button>
        </>
      ) : (
        <>
          <span className="text-soluk">Katılımcı hesabıyla giriş yapmadın.</span>
          {loginHref ? (
            <Link href={loginHref} className={ghost}><LogIn className="h-3.5 w-3.5" aria-hidden /> Giriş yap</Link>
          ) : (
            <button type="button" className={ghost} onClick={onLogin}><LogIn className="h-3.5 w-3.5" aria-hidden /> Giriş yap</button>
          )}
        </>
      )}
    </div>
  )
}

/**
 * Kendi oturum bilgisini çeken çubuk (takım yönetimi / jüri sayfaları). "Bu takımın üyesi değilsiniz" gibi
 * yanlış hesap durumlarında da gösterilir; çıkıştan sonra onLoggedOut ile giriş formuna dönülür.
 */
export function AutoSessionBar({ onLoggedOut, refreshKey }: { onLoggedOut: () => void; refreshKey?: unknown }) {
  const [user, setUser] = useState<Me['user'] | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    takim<Me>('me').then((r) => { if (alive) setUser(r.ok ? r.user : null) })
    return () => { alive = false }
  }, [refreshKey])
  if (!user) return null
  return <SessionBar user={user} onLoggedOut={() => { setUser(null); onLoggedOut() }} />
}
