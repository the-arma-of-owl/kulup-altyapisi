import type { AdminViewServerProps } from 'payload'
import { GateScanner } from './GateScanner'

// CMS panelinde /admin/kapi — yalnızca yönetici veya "Kapı görevlisi" hesapları.
export const GateView = ({ initPageResult }: AdminViewServerProps) => {
  const user = initPageResult.req.user as { roles?: string[] | null } | null
  if (!user?.roles?.some((role) => role === 'admin' || role === 'gate')) {
    return <div style={{ padding: 32 }}><h1>Yetkiniz yok</h1><p>Kapı okuyucusunu açmak için yönetici veya kapı görevlisi hesabıyla giriş yapın.</p></div>
  }
  return <GateScanner />
}
