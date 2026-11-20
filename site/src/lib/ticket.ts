export type TicketView = {
  ticket: { fullName: string; department?: string; ticketToken: string; attended: boolean }
  event: { title: string; date: string; location?: string; locationLink?: string }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function isValidTicketToken(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(token)
}

export function buildTicketUrl(cmsUrl: string, token: string): string {
  const params = new URLSearchParams({
    'where[ticketToken][equals]': token,
    depth: '1',
    limit: '1',
  })
  return `${cmsUrl.replace(/\/+$/, '')}/api/event-registrations?${params.toString()}`
}

function safeLocationLink(value: unknown): value is string {
  if (typeof value !== 'string' || (!value.startsWith('http://') && !value.startsWith('https://'))) return false
  try {
    const protocol = new URL(value).protocol
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

export function pickTicketView(doc: unknown, token: string): TicketView | null {
  if (!isPlainObject(doc) || doc.status !== 'accepted' || doc.ticketToken !== token ||
      typeof doc.fullName !== 'string' || !isPlainObject(doc.event) ||
      typeof doc.event.title !== 'string' || typeof doc.event.date !== 'string') return null

  return {
    ticket: {
      fullName: doc.fullName,
      ...(typeof doc.department === 'string' ? { department: doc.department } : {}),
      ticketToken: token,
      attended: doc.attended === true,
    },
    event: {
      title: doc.event.title,
      date: doc.event.date,
      ...(typeof doc.event.location === 'string' ? { location: doc.event.location } : {}),
      ...(safeLocationLink(doc.event.locationLink) ? { locationLink: doc.event.locationLink } : {}),
    },
  }
}

export async function fetchTicketView(
  token: unknown,
  deps: { fetcher: typeof fetch; cmsUrl: string; internalKey: string | undefined },
): Promise<TicketView | null> {
  if (!isValidTicketToken(token) || !deps.internalKey) return null

  try {
    const res = await deps.fetcher(buildTicketUrl(deps.cmsUrl, token), {
      headers: { 'x-internal-api-key': deps.internalKey },
      next: { revalidate: 0 },
    } as RequestInit & { next: { revalidate: number } })
    if (!res.ok) {
      console.error('Ticket fetch error', res.status)
      return null
    }
    const data: unknown = await res.json()
    if (!isPlainObject(data) || !Array.isArray(data.docs) || data.docs.length === 0) return null
    return pickTicketView(data.docs[0], token)
  } catch (error) {
    console.error('Ticket fetch error', error instanceof Error ? error.name : 'UnknownError')
    return null
  }
}
