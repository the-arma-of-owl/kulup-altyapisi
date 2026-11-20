import { app, BrowserWindow, dialog, safeStorage, utilityProcess, type UtilityProcess, shell, session } from 'electron'
import { randomBytes } from 'node:crypto'
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { CONFIG, LOCAL_ENV, LOCAL_SESSION_COOKIE } from '../server/config.js'
import { KULUP } from '../shared/kulup.js'

app.setName('Kulüp Worker')
// ABT gibi: staging CMS'e bağlıyken ayrı veri klasörü; canlı oturum çerezi, gönderim geçmişi ve WhatsApp
// profili staging ile karışmaz.
if (!CONFIG.isLiveCms) app.setPath('userData', `${app.getPath('userData')} (staging)`)
let window: BrowserWindow | null = null
let server: UtilityProcess | null = null
let quitting = false
// Yalnız geliştirmede (paketlenmemiş): uçtan uca test betiklerinin yerel API'yi kullanabilmesi için anahtar dışarıdan verilebilir.
const devApiToken = !app.isPackaged ? process.env.BYT_WORKER_DEV_API_TOKEN : undefined
const localApiToken = devApiToken && devApiToken.length >= 32 ? devApiToken : randomBytes(32).toString('base64url')
const localOrigin = `http://${CONFIG.serverHost}:${CONFIG.serverPort}`
const lock = app.requestSingleInstanceLock()
if (!lock) app.quit()

const restrictKeyFile = async (file: string): Promise<void> => {
  try { await chmod(file, 0o600) }
  catch (error) { if (process.platform !== 'win32') throw error }
}

const loadSessionKey = async (): Promise<Buffer | null> => {
  try {
    if (!safeStorage.isEncryptionAvailable() ||
        (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')) return null
  } catch { return null }

  const keyFile = path.join(app.getPath('userData'), 'session.key')
  try {
    const encoded = safeStorage.decryptString(await readFile(keyFile))
    const key = Buffer.from(encoded, 'base64')
    if (key.length === 32 && key.toString('base64') === encoded) {
      await restrictKeyFile(keyFile)
      return key
    }
    console.warn('[electron] Oturum anahtarı geçersiz; yeniden giriş gerekecek.')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[electron] Oturum anahtarı çözülemedi; yeniden giriş gerekecek.')
    }
  }

  try {
    await mkdir(path.dirname(keyFile), { recursive: true, mode: 0o700 })
    const key = randomBytes(32)
    const temporary = `${keyFile}.tmp`
    await writeFile(temporary, safeStorage.encryptString(key.toString('base64')), { mode: 0o600 })
    await restrictKeyFile(temporary)
    await rename(temporary, keyFile)
    return key
  } catch {
    console.warn('[electron] Oturum anahtarı kaydedilemedi; oturum dosyası şifrelenmeyecek.')
    return null
  }
}

const portOpen = (): Promise<boolean> => new Promise((resolve) => {
  const socket = net.createConnection({ host: CONFIG.serverHost, port: CONFIG.serverPort })
  socket.setTimeout(300)
  socket.once('connect', () => { socket.destroy(); resolve(true) })
  socket.once('timeout', () => { socket.destroy(); resolve(false) })
  socket.once('error', () => resolve(false))
})

const start = async () => {
  if (await portOpen()) throw new Error('4100 portu başka bir uygulamada kullanılıyor.')
  const root = app.getAppPath()
  const sessionKey = await loadSessionKey()
  const forkEnv = { ...process.env }
  delete forkEnv[LOCAL_ENV.sessionKey]
  if (sessionKey) forkEnv[LOCAL_ENV.sessionKey] = sessionKey.toString('base64')
  server = utilityProcess.fork(path.join(root, 'dist-server', 'index.cjs'), [
    `--user-data-path=${app.getPath('userData')}`,
    `--renderer-path=${path.join(root, 'dist')}`,
    // Paketli Chrome'un yeri; utilityProcess'te process.resourcesPath'e güvenilmez
    `--resources-path=${process.resourcesPath}`,
    ...(app.isPackaged ? ['--packaged'] : []),
  ], { cwd: app.isPackaged ? path.dirname(root) : root,
    env: { ...forkEnv, [LOCAL_ENV.apiToken]: localApiToken },
    serviceName: 'Kulup Worker Local Server', stdio: 'pipe' })
  server.stdout?.on('data', (data: Buffer) => process.stdout.write(data))
  server.stderr?.on('data', (data: Buffer) => process.stderr.write(data))
  server.once('exit', () => { server = null; if (!quitting) window?.close() })
  const until = Date.now() + 20_000
  while (Date.now() < until) {
    if (await portOpen()) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('Yerel sunucu zamanında açılamadı.')
}

if (lock) app.whenReady().then(async () => {
  try {
    await start()
    await session.defaultSession.cookies.set({
      url: localOrigin, name: LOCAL_SESSION_COOKIE, value: localApiToken,
      path: '/', httpOnly: true, sameSite: 'strict',
    })
    window = new BrowserWindow({
      title: CONFIG.isLiveCms ? `${KULUP.kisaAd} Worker` : `${KULUP.kisaAd} Worker — STAGING`, width: 1250, height: 800, minWidth: 1000, minHeight: 650,
      icon: path.join(app.getAppPath(), 'assets', 'icon.png'),
      backgroundColor: '#0e0f16',
      // autoplayPolicy: açılış videosunun sesi kullanıcı tıklamadan çalabilsin (ABT ile aynı)
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, autoplayPolicy: 'no-user-gesture-required' },
    })
    // Yalnızca CMS kapı okuyucusu bağlantısı sistem tarayıcısında açılır; başka pencere açılmaz.
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (url === `${KULUP.adresler.cms.replace(/\/+$/, '')}/admin/kapi`) void shell.openExternal(url)
      return { action: 'deny' }
    })
    await window.loadURL(localOrigin)
    window.once('closed', () => { window = null; server?.kill(); server = null })
    if (process.argv.includes('--smoke-test')) window.close()
  } catch (error) {
    server?.kill()
    await dialog.showMessageBox({ type: 'error', title: 'Kulüp Worker başlatılamadı',
      message: error instanceof Error ? error.message : String(error) })
    app.quit()
  }
})
app.on('second-instance', () => { window?.focus() })
app.on('before-quit', () => { quitting = true; server?.kill(); server = null })
app.on('window-all-closed', () => app.quit())
