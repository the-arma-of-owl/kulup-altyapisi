'use client'

/** Tarayıcı → site BFF (/api/takim/*). Kimlik çerezle (HttpOnly) gider; token istemcide hiç yok. */

export type ApiResult<T = Record<string, unknown>> = ({ ok: true } & T) | { ok: false; error: string; code?: string; status: number }

/** humanToken: Turnstile jetonu (hesap açma ve takım kurma isteklerinde zorunlu) */
export async function takim<T = Record<string, unknown>>(path: string, body?: unknown, humanToken?: string | null): Promise<ApiResult<T>> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (humanToken) headers['x-turnstile-token'] = humanToken
    const response = await fetch(`/api/takim/${path}`, body === undefined
      ? { method: 'GET', cache: 'no-store', credentials: 'same-origin' }
      : { method: 'POST', headers, body: JSON.stringify(body), credentials: 'same-origin' })
    const data = await response.json().catch(() => ({}))
    if (response.ok && data?.ok !== false) return { ok: true, ...(data as T) }
    return { ok: false, error: typeof data?.error === 'string' ? data.error : 'İşlem başarısız.', code: data?.code, status: response.status }
  } catch {
    return { ok: false, error: 'Bağlantı hatası. İnternetinizi kontrol edin.', status: 0 }
  }
}

export async function uploadTeamImage(teamId: string, kind: 'logo' | 'cover' | 'gif', file: File): Promise<{ id: string; url: string }> {
  if (file.size > 4 * 1024 * 1024) throw new Error('Dosya en fazla 4 MB olabilir.')
  const form = new FormData()
  form.append('kind', kind)
  form.append('file', file)
  const response = await fetch(`/api/takim/teams/${teamId}/upload`, { method: 'POST', body: form, credentials: 'same-origin' })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data?.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Yükleme başarısız.')
  return { id: String(data.id), url: String(data.url) }
}

export type Me = {
  user: { id: string; email: string; fullName: string }
  teams: Array<{ membershipStatus: 'pending' | 'accepted'; role: 'captain' | 'member'; team: { id: string; name: string; slug: string; status: string }; event: { id: string; title: string; slug: string } }>
  judgeEvents: Array<{ id: string; title: string; slug: string }>
}

/** Takım modu akışı: hesabın e-postasıyla bu etkinliğe başvuru yapılmış mı? */
export type ApplicationStatus = { application: 'none' | 'applied' | 'rejected'; email: string }

/** Çıkış: BFF çerezi siler (CMS oturumu da kapatılır). Hata olsa da istemci çıkmış sayılır. */
export async function logoutParticipant(): Promise<void> {
  await takim('auth/logout', {})
}
