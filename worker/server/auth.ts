import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { PayloadClient, PayloadError, setCookies, type CookieJar } from './payload.js'
import { decryptSession, encryptSession, isEncryptedEnvelope } from './sessionCrypto.js'

type Session = { cookies: CookieJar; userEmail: string; expiresAt: number }
type Pending = { cookies: CookieJar; userEmail: string }

export class AuthManager {
  private readonly file: string
  private session: Session | null = null
  private pending: Pending | null = null

  constructor(userData: string, private readonly payload: PayloadClient, private readonly sessionKey: Buffer | null = null) {
    this.file = path.join(userData, 'session.json')
    payload.configure(() => this.cookies(), () => { void this.clear() })
  }

  async initialize(): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 })
    try {
      const stored: unknown = JSON.parse(await readFile(this.file, 'utf8'))
      const data = (isEncryptedEnvelope(stored)
        ? this.sessionKey ? JSON.parse(decryptSession(stored, this.sessionKey)) : null
        : stored) as Session | null
      if (data && typeof data.expiresAt === 'number' && data.expiresAt > Date.now() &&
          typeof data.userEmail === 'string' && data.userEmail &&
          data.cookies && typeof data.cookies === 'object') {
        this.session = data
        if (this.sessionKey && !isEncryptedEnvelope(stored)) await this.persist()
        else await this.restrictFile(this.file)
      } else await this.clear()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') await this.clear()
    }
  }

  cookies(): CookieJar | null {
    if (this.session && this.session.expiresAt <= Date.now()) { void this.clear(); return null }
    return this.session?.cookies ?? null
  }

  status(): { authenticated: boolean; userEmail?: string; expiresAt?: number } {
    const valid = this.cookies() !== null
    return valid ? { authenticated: true, userEmail: this.session!.userEmail, expiresAt: this.session!.expiresAt }
      : { authenticated: false }
  }

  async login(email: string, password: string): Promise<void> {
    this.pending = null
    if (!email || !password) throw new PayloadError('E-posta ve parola gerekli.', 400)
    const { data, response } = await this.payload.request<{ user?: { email?: string; hasTotp?: boolean } }>(
      '/users/login', { method: 'POST', body: { email, password }, skipSessionCheck: true, cookies: {} },
    )
    const cookies = setCookies(response.headers)
    if (!data.user?.email || !Object.keys(cookies).length) throw new PayloadError('Giriş çerezi alınamadı.', 502)
    if (!data.user.hasTotp) throw new PayloadError('Önce yönetim panelinde TOTP kurun.', 403)
    this.pending = { cookies, userEmail: data.user.email }
  }

  async verifyTotp(token: string): Promise<void> {
    if (!this.pending) throw new PayloadError('Önce parolayla giriş yapın.', 400)
    if (!/^\d{6}$/.test(token)) throw new PayloadError('Altı haneli kod gerekli.', 400)
    const { data, response } = await this.payload.request<{ ok?: boolean }>('/verify-totp', {
      method: 'POST', body: { token }, cookies: this.pending.cookies, skipSessionCheck: true,
    })
    if (!data.ok) throw new PayloadError('Doğrulama kodu geçersiz.', 401)
    const cookies = { ...this.pending.cookies, ...setCookies(response.headers) }
    if (Object.keys(cookies).length < 2) throw new PayloadError('TOTP oturum çerezi alınamadı.', 502)
    const { data: me } = await this.payload.request<{ user?: { _strategy?: string; roles?: string[] } }>(
      '/users/me', { cookies, skipSessionCheck: true },
    )
    if (me.user?._strategy !== 'totp' || !me.user.roles?.includes('admin')) {
      throw new PayloadError('Doğrulanmış yönetici oturumu alınamadı.', 403)
    }
    this.session = { cookies, userEmail: this.pending.userEmail, expiresAt: Date.now() + 7200_000 }
    this.pending = null
    await this.persist()
  }

  async logout(): Promise<void> {
    if (this.session) await this.payload.request('/users/logout', { method: 'POST' }).catch(() => undefined)
    await this.clear()
  }

  async clear(): Promise<void> {
    this.session = null
    this.pending = null
    await rm(this.file, { force: true })
  }

  private async persist(): Promise<void> {
    if (!this.session) return
    const temp = `${this.file}.tmp`
    const json = JSON.stringify(this.session)
    await writeFile(temp, JSON.stringify(this.sessionKey ? encryptSession(json, this.sessionKey) : this.session), { mode: 0o600 })
    await this.restrictFile(temp)
    await rename(temp, this.file)
  }

  private async restrictFile(file: string): Promise<void> {
    try { await chmod(file, 0o600) }
    catch (error) { if (process.platform !== 'win32') throw error }
  }
}
