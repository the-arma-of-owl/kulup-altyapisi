export function parseExtraOrigins(value?: string): string[] {
  return (value ?? '').split(',').map((item) => item.trim()).filter((item) => {
    if (!item.startsWith('https://')) return false
    try {
      return new URL(item).origin === item
    } catch {
      return false
    }
  })
}
