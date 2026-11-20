import { KULUP } from '@/lib/kulup'

// Panel giriş ekranındaki logo: cms/public/logo.png (scripts/gorsel-uret.sh ya da kendi logon)
export function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <img src="/logo.png" alt="" width={56} height={56} style={{ borderRadius: 12 }} />
      <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>{KULUP.tamAd}</span>
    </div>
  )
}
