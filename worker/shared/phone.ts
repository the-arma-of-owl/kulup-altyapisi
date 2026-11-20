export function normalizePhoneNumber(number: string): string {
  if (!number) return ''
  let cleaned = String(number).replace(/[^0-9]/g, '')
  if (cleaned.startsWith('900')) cleaned = `90${cleaned.substring(3)}`
  if (cleaned.startsWith('0')) cleaned = cleaned.substring(1)
  if (!cleaned.startsWith('90')) cleaned = `90${cleaned}`
  return cleaned
}
