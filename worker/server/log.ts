export function maskText(text: string): string {
  return text
    .replace(/(?:Bearer\s+)[^\s]+/gi, 'Bearer [gizli]')
    .replace(/(?:re_)[A-Za-z0-9]+/g, '[gizli]')
    .replace(/(?:\+?90)?5\d{9}/g, (number) => `***${number.slice(-4)}`)
    .replace(/(payload-[\w-]+)=[^;\s]+/g, '$1=[gizli]')
    .replace(/\b([A-Za-z0-9._%+-]{1,2})[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g, '$1***@$2')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[gizli]')
}

export function safeError(error: unknown): string {
  return maskText(error instanceof Error ? error.message : String(error))
}
