import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

/** Puppeteer'ın tarayıcı açılışı için süre: Windows'ta ilk açılış (Defender taraması) 30 sn'yi aşabiliyor. */
export const BROWSER_LAUNCH_TIMEOUT_MS = 90_000

const argument = (name: string): string | undefined =>
  process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3)

/** Paketli uygulamanın kaynak klasörü: ana süreç --resources-path ile iletir (utilityProcess'te process.resourcesPath güvenilir değil). */
export function resourcesRoot(): string | undefined {
  return argument('resources-path') || process.resourcesPath || undefined
}

const executableName = () => process.platform === 'win32' ? 'chrome-win64/chrome.exe'
  : process.platform === 'darwin' ? 'chrome-mac/Chromium.app/Contents/MacOS/Chromium' : 'chrome-linux64/chrome'

export function chromePath(): string | undefined {
  const resources = resourcesRoot()
  const packaged = Boolean(resources && existsSync(path.join(resources, '.puppeteer-cache')))
  const root = packaged
    ? path.join(resources!, '.puppeteer-cache', 'chrome')
    : path.join(process.cwd(), '.puppeteer-cache', 'chrome')
  if (existsSync(root)) {
    for (const version of readdirSync(root)) {
      const candidate = path.join(root, version, executableName())
      if (existsSync(candidate)) return candidate
    }
  }
  // Paketli uygulamada Chrome yoksa puppeteer'ın kendi indirme klasörüne düşmek sessizce başka (ya da hiç)
  // tarayıcı demek; açık hata verilir. Geliştirmede puppeteer'ın varsayılanı kullanılır (undefined).
  if (packaged || process.argv.includes('--packaged')) {
    throw new Error(`Paket içindeki Chrome bulunamadı: ${path.join(root, '<sürüm>', executableName())}. Uygulamayı yeniden kurun (antivirüs dosyayı silmiş olabilir).`)
  }
  return undefined
}
