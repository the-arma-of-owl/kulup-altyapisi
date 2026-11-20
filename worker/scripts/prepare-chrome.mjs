import { createWriteStream, existsSync, mkdirSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import os from 'node:os'
import path from 'node:path'

const version = '146.0.7680.31'
const platform = process.argv.includes('--platform=win') ? 'win64' : 'linux64'
const folder = platform === 'win64' ? `win-${version}` : `linux-${version}`
const root = path.resolve('.puppeteer-cache', 'chrome', folder)
const executable = path.join(root, platform === 'win64' ? 'chrome-win64/chrome.exe' : 'chrome-linux64/chrome')
if (existsSync(executable)) {
  console.log(`Chrome hazır: ${executable}`)
  process.exit(0)
}

mkdirSync(root, { recursive: true })
const zip = path.join(os.tmpdir(), `kulup-chrome-${platform}-${process.pid}.zip`)
try {
  const url = `https://storage.googleapis.com/chrome-for-testing-public/${version}/${platform}/chrome-${platform}.zip`
  const response = await fetch(url)
  if (!response.ok || !response.body) throw new Error(`Chrome indirilemedi (${response.status})`)
  await pipeline(Readable.fromWeb(response.body), createWriteStream(zip))
  if (process.platform === 'win32') {
    execFileSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${root}' -Force`])
  } else {
    execFileSync('unzip', ['-q', zip, '-d', root])
  }
  if (!existsSync(executable)) throw new Error('Chrome arşivi açıldı ancak çalıştırılabilir dosya bulunamadı.')
  console.log(`Chrome hazır: ${executable}`)
} finally { rmSync(zip, { force: true }) }
