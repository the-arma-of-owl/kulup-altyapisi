import type { Access, FieldAccess } from 'payload'
import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Access kontrolü yardımcıları — tüm collection'larda kullanılır.
 * OWASP A01: Broken Access Control karşı koruma.
 *
 * NOT: Payload'da iki farklı Access tipi var:
 * - `Access` → Collection seviyesi (read, create, update, delete)
 * - `FieldAccess` → Alan seviyesi (field.access.create, update, read)
 * Bunları karıştırma — TypeScript hatası verir.
 * İç anahtar yalnız dört başvuru formunu oluşturur ve etkinlik kayıtlarını okur.
 * Ayrıca scannerPin alanını okur; kayıt güncellemesinde yalnız { attended: true } kabul edilir.
 */

// ─── Collection-Level Access ─────────────────────────────────────────────────

// req.user yönetici (users) ya da katılımcı (participants) olabilir; katılımcının rolü yoktur → hiçbir yönetici yetkisi almaz.
type RoleUser = { roles?: string[] | null }
const rolesOf = (user: unknown): string[] => (user as RoleUser | null)?.roles ?? []

let warnedMissingInternalKey = false

export const hasInternalKey = (headers: Headers | Record<string, unknown> | undefined): boolean => {
  const expectedKey = process.env.INTERNAL_API_KEY
  if (!expectedKey) {
    if (!warnedMissingInternalKey) {
      console.warn('INTERNAL_API_KEY tanımlı değil; iç anahtarla erişim kapalı.')
      warnedMissingInternalKey = true
    }
    return false
  }
  if (!headers) return false
  const candidate = typeof headers.get === 'function'
    ? headers.get('x-internal-api-key')
    : (headers as Record<string, unknown>)['x-internal-api-key']
  if (typeof candidate !== 'string' || candidate.length === 0) return false
  const actualDigest = createHash('sha256').update(candidate).digest()
  const expectedDigest = createHash('sha256').update(expectedKey).digest()
  return timingSafeEqual(actualDigest, expectedDigest)
}

/** Sadece admin rolündeki kullanıcılar erişebilir */
export const isAdmin: Access = ({ req }) => {
  const user = req?.user;
  if (!user) return false
  return rolesOf(user).includes('admin')
}

/** Admin veya editör rolündeki kullanıcılar (Artık sadece admin) */
export const isAdminOrEditor: Access = isAdmin

/** Herhangi bir oturum açmış kullanıcı erişebilir */
export const isLoggedIn: Access = ({ req: { user } }) => {
  return Boolean(user)
}

/**
 * Kendi kaydı veya admin — collection-level update/delete için.
 */
export const isAdminOrSelf: Access = ({ req: { user }, id }) => {
  if (!user) return false
  if (rolesOf(user).includes('admin')) return true
  return user.id === id
}

/** Herkese açık okuma (public read) — statik içerik için */
export const publicRead: Access = () => true

/** Hiçbir zaman erişim yok (kapalı endpoint) */
export const neverAllow: Access = () => false

// ─── Field-Level Access ───────────────────────────────────────────────────────
// FARKLI TİP! Alan bazlı access kontrolü için bunları kullan.

/** Alan bazlı: Sadece admin */
export const fieldIsAdmin: FieldAccess = ({ req }) => {
  const user = req?.user;
  if (!user) return false
  return rolesOf(user).includes('admin')
}

/** Alan bazlı: Admin veya editör (Artık sadece admin) */
export const fieldIsAdminOrEditor: FieldAccess = fieldIsAdmin

/** Alan bazlı: Oturum açmış herhangi bir kullanıcı */
export const fieldIsLoggedIn: FieldAccess = ({ req: { user } }) => {
  return Boolean(user)
}

/** Yönetici veya kapı görevlisi (CMS'teki Kapı QR okuyucu için) */
export const isAdminOrGate: Access = ({ req }) => {
  const roles = rolesOf(req?.user)
  return Boolean(roles?.includes('admin') || roles?.includes('gate'))
}

/** Alan bazlı: admin her kaydı, kullanıcı yalnızca kendi kaydını okur (ör. kendi rolleri — kapı menüsü için) */
export const fieldIsAdminOrSelf: FieldAccess = (args) => {
  if (fieldIsAdmin(args)) return true
  const { req, doc, id } = args
  const userId = req?.user?.id
  return userId !== undefined && (doc?.id === userId || id === userId)
}

/** Okuma: admin tüm kullanıcıları, diğer hesaplar (ör. kapı görevlisi) yalnızca kendini görür — /users/me ve panel girişi için gerekli */
export const readSelfOrAdmin: Access = ({ req }) => {
  const user = req?.user
  if (!user) return false
  if (rolesOf(user).includes('admin')) return true
  return { id: { equals: user.id } }
}

/** Yönetici oturumu veya sınırlı iç anahtar */
export const isAdminOrInternal: Access = (args) =>
  isAdmin(args) || hasInternalKey(args.req?.headers as Headers | Record<string, unknown> | undefined)

/** Alan düzeyinde yönetici oturumu veya sınırlı iç anahtar */
export const fieldIsAdminOrInternal: FieldAccess = (args) =>
  fieldIsAdmin(args) || hasInternalKey(args.req?.headers as Headers | Record<string, unknown> | undefined)

/** İç anahtar yalnız başarılı kapı girişini işaretleyebilir. */
export const isAdminOrInternalCheckin: Access = (args) => {
  if (isAdmin(args)) return true
  if (!hasInternalKey(args.req?.headers as Headers | Record<string, unknown> | undefined)) return false
  const { data } = args
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return false
  const prototype = Object.getPrototypeOf(data)
  if (prototype !== Object.prototype && prototype !== null) return false
  const keys = Reflect.ownKeys(data)
  return keys.length === 1 && keys[0] === 'attended' && data.attended === true
}
