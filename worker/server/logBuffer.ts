import { maskText, safeError } from './log.js'

export const LOG_MAX_LINES = 1000
export type LogLevel = 'info' | 'warn' | 'error'
export type LogLine = { id: number; time: string; level: LogLevel; text: string }

function stringify(value: unknown): string {
  if (value instanceof Error) return safeError(value)
  if (typeof value === 'object' && value !== null) {
    const seen = new WeakSet<object>()
    try {
      return JSON.stringify(value, (_key, item: unknown) => {
        if (typeof item === 'bigint') return String(item)
        if (typeof item === 'object' && item !== null) {
          if (seen.has(item)) return '[döngü]'
          seen.add(item)
        }
        return item
      }) ?? String(value)
    } catch {
      return '[yazdırılamayan nesne]'
    }
  }
  return String(value)
}

export function createLogBuffer(max = LOG_MAX_LINES) {
  const lines: LogLine[] = []
  let nextId = 1
  return {
    push(level: LogLevel, args: unknown[]): void {
      const text = args.map(stringify).join(' ')
      if (text.includes('DeprecationWarning')) return
      if (max <= 0) return
      lines.push({ id: nextId++, time: new Date().toISOString(), level, text: maskText(text) })
      if (lines.length > max) lines.splice(0, lines.length - max)
    },
    list(options: { onlyProblems?: boolean; after?: number } = {}): LogLine[] {
      return lines.filter((line) => (!options.onlyProblems || line.level !== 'info') &&
        line.id > (options.after ?? 0))
    },
    clear(): void { lines.length = 0 },
  }
}

export type LogBuffer = ReturnType<typeof createLogBuffer>
const capturedConsoles = new WeakSet<Console>()

export function installConsoleCapture(buffer: LogBuffer): void {
  if (capturedConsoles.has(console)) return
  capturedConsoles.add(console)
  for (const [method, level] of [
    ['log', 'info'], ['info', 'info'], ['warn', 'warn'], ['error', 'error'],
  ] as const) {
    const original = console[method].bind(console)
    console[method] = (...args: unknown[]) => {
      original(...args)
      try { buffer.push(level, args) } catch { /* Günlükleme ana işlemi kesmemeli. */ }
    }
  }
}
