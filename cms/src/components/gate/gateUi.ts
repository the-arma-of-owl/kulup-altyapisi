export type GateFieldDefinition = {
  key: string
  label?: string
  required?: boolean
  min?: number
  max?: number
  options?: string[]
}

const titles: Record<string, string> = {
  ok: 'Giriş onaylandı',
  already_in: 'Zaten içeride',
  not_accepted: 'Kabul edilmemiş',
  not_found: 'Bilet bulunamadı',
  missing_fields: 'Eksik bilgi',
  invalid_value: 'Eksik bilgi',
}

export const resultTitle = (code: string, fallbackError = ''): string =>
  titles[code] || fallbackError

export const formatCheckinTime = (iso: string | null | undefined): string => {
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('tr-TR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul',
  }).format(date)
}

export const shouldSkipDuplicate = (lastSeen: Map<string, number>, token: string, now: number, windowMs = 10_000): boolean => {
  const last = lastSeen.get(token)
  if (last !== undefined && now - last < windowMs) return true
  lastSeen.set(token, now)
  return false
}

export const pushRecent = <T>(list: T[], item: T, max = 8): T[] => [item, ...list].slice(0, max)

export const wheelValues = (def: Pick<GateFieldDefinition, 'options' | 'min' | 'max'>): string[] | null => {
  if (Array.isArray(def.options)) return def.options.length > 0 ? def.options : null
  const { min, max } = def
  if (min === undefined || max === undefined || !Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max < min || max - min >= 500) return null
  return Array.from({ length: max - min + 1 }, (_, index) => String(min + index))
}

export const templateMatchesFields = (message: string, keys: string[]): boolean =>
  [...message.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].some((match) => keys.includes(match[1].trim()))
