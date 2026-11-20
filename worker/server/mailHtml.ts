const blockedElements = /<\s*(script|iframe|object|form)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?(?:<\/\s*\1\s*>|$)/gi
const tagPattern = /<(?:[^>"']|"[^"]*"|'[^']*')*>/g
const attributePattern = /(\s+)([^\s=/>]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g

function urlIsUnsafe(value: string): boolean {
  const decoded = value.replace(/&#(?:x([0-9a-f]+)|([0-9]+));?|&([a-z]+);?/gi, (match, hex: string, decimal: string, named: string) => {
    if (hex || decimal) {
      const code = Number.parseInt(hex || decimal, hex ? 16 : 10)
      return code <= 0x10ffff ? String.fromCodePoint(code) : match
    }
    return ({ colon: ':', tab: '\t', newline: '\n' } as Record<string, string>)[named.toLowerCase()] ?? match
  }).replace(/[\u0000-\u0020\u007f]+/g, '')
  if (/^(?:javascript|vbscript):/i.test(decoded)) return true
  if (!/^data:/i.test(decoded)) return false
  return !/^data:image\/(?:png|jpe?g|gif|webp)(?:;base64)?,/i.test(decoded)
}

/** Serbest gönderimdeki HTML'i değişkenler doldurulmadan önce temizler. */
export function cleanEmailHtml(html: string): string {
  return html.replace(blockedElements, '').replace(tagPattern, (tag) => {
    const head = /^<\s*(\/?)\s*([a-z][\w:-]*)/i.exec(tag)
    if (!head) return tag
    const name = head[2].toLowerCase()
    if (['script', 'iframe', 'object', 'embed', 'form', 'base'].includes(name)) return ''
    if (head[1]) return tag
    const attributes = tag.slice(head[0].length, -1)
    const kept: string[] = []
    let refresh = false
    for (const match of attributes.matchAll(attributePattern)) {
      const key = match[2].toLowerCase()
      const rawValue = match[3] ?? ''
      const value = rawValue.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, (_whole, double: string, single: string) => double ?? single)
      if (name === 'meta' && key === 'http-equiv' && value.toLowerCase() === 'refresh') refresh = true
      if (/^on/i.test(key)) continue
      if (['href', 'src', 'action'].includes(key) && urlIsUnsafe(value)) continue
      kept.push(`${match[1]}${match[2]}${rawValue ? `=${rawValue}` : ''}`)
    }
    if (refresh) return ''
    return `${head[0]}${kept.join('')}${/\/\s*>$/.test(tag) ? ' /' : ''}>`
  })
}
