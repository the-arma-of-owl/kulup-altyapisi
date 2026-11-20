export type LogLine = { id: number; time: string; level: 'info' | 'warn' | 'error'; text: string }

const levelLabels: Record<LogLine['level'], string> = {
  info: 'BİLGİ', warn: 'UYARI', error: 'HATA',
}

const clock = new Intl.DateTimeFormat('tr-TR', {
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

export function formatLine(line: LogLine): string {
  const time = new Date(line.time)
  return `${Number.isNaN(time.getTime()) ? line.time : clock.format(time)} [${levelLabels[line.level]}] ${line.text}`
}

export function mergeLines(prev: LogLine[], next: LogLine[], max: number): LogLine[] {
  if (max <= 0) return []
  const byId = new Map<number, LogLine>()
  for (const line of [...prev, ...next]) byId.set(line.id, line)
  return [...byId.values()].sort((a, b) => a.id - b.id).slice(-max)
}
