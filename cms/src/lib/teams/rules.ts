import { assertValidCriteria, assertValidScores, isCompleteScoreCard, ScoreValidationError, weightedTotal as sharedWeightedTotal } from './score'

/**
 * Takım modu kuralları — saf fonksiyonlar (veritabanı yok; birim testleri tests/int/teams.int.spec.ts).
 * Uçlar (endpoints/teams.ts) her yetki kararını buradan alır.
 */

/**
 * Takım durumları: taslak → onay bekliyor → onaylandı (başvuran; sitede görünür) → kabul edildi (seçilen) / reddedildi.
 * "approved" = yönetim içeriği uygun buldu, takım "Başvuran takımlar"da listelenir.
 * "accepted" = yönetim başvuranlar arasından seçti; "Kabul edilen takımlar"da listelenir, teslim ve jüri yalnız bunlar için.
 */
export type TeamStatus = 'draft' | 'pending' | 'approved' | 'accepted' | 'rejected'
export type MembershipStatus = 'pending' | 'accepted' | 'rejected' | 'left' | 'removed'
export type MembershipLite = { participant: number | string; role: 'captain' | 'member'; status: MembershipStatus }
export type TeamLite = { id: number | string; status: TeamStatus; captain: number | string; event: number | string; submission?: { submittedAt?: string | null } | null }
export type TeamSettings = {
  minMembers?: number | null
  maxMembers?: number | null
  registrationOpen?: boolean | null
  registrationDeadline?: string | null
  submissionOpen?: boolean | null
  submissionDeadline?: string | null
}
export type EventLite = {
  id: number | string
  teamMode?: boolean | null
  status?: string | null
  mode?: string | null
  teamSettings?: TeamSettings | null
  judges?: Array<number | string | { id: number | string }> | null
  judgingCriteria?: Array<{ id?: string | null; name: string; weight?: number | null; max?: number | null }> | null
}

export const idOf = (value: unknown): string =>
  value && typeof value === 'object' ? String((value as { id?: unknown }).id ?? '') : String(value ?? '')
export const sameId = (a: unknown, b: unknown): boolean => idOf(a) !== '' && idOf(a) === idOf(b)

export function memberLimits(event: EventLite): { min: number; max: number } {
  const clamp = (value: unknown, fallback: number) => {
    const n = Number(value)
    return Number.isInteger(n) && n >= 1 && n <= 20 ? n : fallback
  }
  const min = clamp(event.teamSettings?.minMembers, 2)
  const max = Math.max(min, clamp(event.teamSettings?.maxMembers, 5))
  return { min, max }
}

export const acceptedCount = (memberships: MembershipLite[]): number =>
  memberships.filter((m) => m.status === 'accepted').length

/** Herkese açık görünürlük: onaylı (başvuran) ve kabul edilen takım. Reddedilen/taslak/bekleyen gizli. */
export const isPubliclyVisible = (team: { status?: string | null }): boolean => team.status === 'approved' || team.status === 'accepted'

/** Kabul edilen (yönetimin başvuranlar arasından seçtiği) takım: teslim ve jüri değerlendirmesi yalnız bunlar için. */
export const isSelectedTeam = (team: { status?: string | null }): boolean => team.status === 'accepted'

/** Onaya gönderilen ya da onaylanan takımın adı değiştirilemez. */
export const isNameLocked = (team: { status?: string | null }): boolean =>
  team.status === 'pending' || team.status === 'approved' || team.status === 'accepted'

type RosterTeam = { status?: string | null; submission?: { submittedAt?: string | null } | null }

/**
 * Kadro kilidi: takım yönetimce kabul edildiğinde (biletler bu kadroya gider) ya da proje teslim edildiğinde kadro değişmez.
 * Onaylı ama henüz kabul edilmemiş takımda kadro serbesttir (erken onay).
 * Kilitliyken üye ayrılamaz/çıkarılamaz, yeni üye alınamaz ve takım "üye arıyor" listelenmez.
 * Değişiklik gerekirse yönetim panelden yapar.
 */
export const isRosterLocked = (team: RosterTeam): boolean => team.status === 'accepted' || Boolean(team.submission?.submittedAt)
const ROSTER_LOCKED = 'Takım kabul edildiği ya da proje teslim edildiği için kadro kilitli; değişiklik için yönetimle iletişime geçin.'

/**
 * Erken onay: yönetim takımı dolmadan onaylayabilir. Onaylı ama dolmamış takım sitede "üye arıyor" görünür
 * ve takımı olmayan katılımcılar ona katılma isteği gönderebilir (kaptan kabul eder).
 */
export const isSeekingMembers = (team: RosterTeam, accepted: number, max: number): boolean =>
  isPubliclyVisible(team) && accepted < max && !isRosterLocked(team)

/**
 * Katılma isteği gönderilebilir mi (davet koduyla ya da listeden)? Dolu takım isteklere kapalıdır;
 * biri ayrılınca yeniden açılır (sayım her istekte yeniden yapılır).
 */
export function joinRequestState(team: RosterTeam, accepted: number, max: number): { ok: true } | { ok: false; reason: string } {
  if (team.status === 'rejected') return { ok: false, reason: 'Bu takım katılma isteği almıyor.' }
  if (accepted >= max) return { ok: false, reason: 'Takım dolu; katılma isteklerine kapalı.' }
  if (isRosterLocked(team)) return { ok: false, reason: ROSTER_LOCKED }
  return { ok: true }
}

/** Onaya gönderme: en az 1 kişi (kaptan), en çok üst sınır. Alt sınır proje tesliminde aranır. */
export function approvalRequestState(team: { status?: string | null }, accepted: number, max: number): { ok: true } | { ok: false; reason: string } {
  if (team.status !== 'draft' && team.status !== 'rejected') return { ok: false, reason: 'Takım zaten onaya gönderildi.' }
  if (accepted < 1 || accepted > max) return { ok: false, reason: `Takım en çok ${max} kişi olabilir (şu an ${accepted}).` }
  return { ok: true }
}

/** Kaptan bekleyen başvuruyu kabul edebilir mi? Onaylı takım da üye alır; doluluk, ret ve kadro kilidi engeller. */
export function acceptMemberState(team: RosterTeam, accepted: number, max: number): { ok: true } | { ok: false; reason: string } {
  if (team.status === 'rejected') return { ok: false, reason: 'Reddedilen takıma üye alınamaz; önce düzeltip yeniden onaya gönderin.' }
  if (accepted >= max) return { ok: false, reason: 'Takım dolu.' }
  if (isRosterLocked(team)) return { ok: false, reason: ROSTER_LOCKED }
  return { ok: true }
}

/**
 * Takım dolunca bekleyen katılma istekleri: otomatik "reddedildi" yapılır (kişi başka takıma katılabilsin diye —
 * bekleyen istek aynı etkinlikte yeni istek/takım kurmayı engeller). Dolmadıysa boş liste.
 */
export function pendingToCloseWhenFull<T extends MembershipLite>(memberships: T[], max: number): T[] {
  return acceptedCount(memberships) >= max ? memberships.filter((m) => m.status === 'pending') : []
}

/**
 * Aynı anda iki kabul üst sınırı aşarsa hangileri fazla? Kabulden sonra güncel listeyle çağrılır.
 * Sıra: kaptan, sonra kabul zamanı (decidedAt, yoksa createdAt), eşitlikte kayıt numarası. İlk `max` kişi kalır;
 * iki istek de aynı listeyi aynı sırayla gördüğünden hep aynı kişi(ler) fazla çıkar.
 */
export function acceptOverflow<T extends MembershipLite & { id: number | string; decidedAt?: string | null; createdAt?: string | null }>(
  memberships: T[], max: number): T[] {
  const accepted = memberships.filter((m) => m.status === 'accepted')
  if (accepted.length <= max) return []
  const at = (m: T) => String(m.decidedAt ?? m.createdAt ?? '')
  return [...accepted].sort((a, b) => (a.role === 'captain' ? -1 : 0) - (b.role === 'captain' ? -1 : 0)
    || at(a).localeCompare(at(b)) || Number(a.id) - Number(b.id)).slice(max)
}

/**
 * Üye kendi isteğiyle ayrılabilir mi? Onay bekleyen/onaylı/kabul edilmiş takımlarda da serbest.
 * Kaptan ayrılamaz (önce kaptanlığı devretmeli); kabul/teslimden sonra kadro kilitlidir. Bekleyen isteği geri çekmek her zaman serbest.
 */
export function leaveState(team: RosterTeam & { captain?: unknown }, membership: MembershipLite, participantId: unknown):
  { ok: true } | { ok: false; reason: string } {
  if (membership.role === 'captain' || sameId(team.captain, participantId)) {
    return { ok: false, reason: 'Kaptan takımdan ayrılamaz. Önce kaptanlığı takımdan bir üyeye devret.' }
  }
  if (membership.status === 'pending') return { ok: true }
  if (membership.status !== 'accepted') return { ok: false, reason: 'Bu takımda üyeliğin yok.' }
  if (isRosterLocked(team)) return { ok: false, reason: ROSTER_LOCKED }
  return { ok: true }
}

/**
 * Kaptan takımı dağıtabilir mi? Yalnız kendisi kalmışsa (başka kabul edilmiş üye yokken) ve kadro kilitli değilken.
 * Başka üye varken önce onlar çıkarılır ya da kaptanlık devredilip takımdan ayrılınır.
 */
export function disbandState(team: RosterTeam & { captain?: unknown }, memberships: MembershipLite[], participantId: unknown):
  { ok: true } | { ok: false; reason: string } {
  if (!sameId(team.captain, participantId)) return { ok: false, reason: 'Takımı yalnız kaptan dağıtabilir.' }
  if (isRosterLocked(team)) return { ok: false, reason: 'Takım kabul edildiği ya da proje teslim edildiği için dağıtılamaz; yönetimle iletişime geçin.' }
  if (memberships.some((m) => m.status === 'accepted' && !sameId(m.participant, participantId))) {
    return { ok: false, reason: 'Takımda başka üyeler var. Önce onları çıkar ya da kaptanlığı devredip takımdan ayrıl.' }
  }
  return { ok: true }
}

/** Kaptan üyeyi çıkarabilir mi? Onaylı takımda da; kaptan çıkarılamaz, kabul/teslimden sonra kilitli. */
export function removeMemberState(team: RosterTeam, target: MembershipLite): { ok: true } | { ok: false; reason: string } {
  if (target.role === 'captain') return { ok: false, reason: 'Kaptan çıkarılamaz.' }
  if (target.status !== 'accepted') return { ok: false, reason: 'Yalnız üyeler çıkarılabilir.' }
  if (isRosterLocked(team)) return { ok: false, reason: ROSTER_LOCKED }
  return { ok: true }
}

/**
 * Kaptanlık devri: yeni kaptan bu takımın kabul edilmiş üyesi olmalı, kendisi zaten kaptan olmamalı.
 * Kadro kilidi (kabul/teslim sonrası) devri engellemez: kadro değişmez, yalnız roller yer değiştirir.
 */
export function captainTransferState(memberships: MembershipLite[], currentCaptain: unknown, nextCaptain: unknown):
  { ok: true } | { ok: false; reason: string } {
  if (sameId(currentCaptain, nextCaptain)) return { ok: false, reason: 'Bu kişi zaten kaptan.' }
  const target = memberships.find((m) => sameId(m.participant, nextCaptain) && m.status === 'accepted')
  if (!target) return { ok: false, reason: 'Kaptanlık yalnız takımın kabul edilmiş bir üyesine devredilebilir.' }
  return { ok: true }
}

/** Devir onayı: kaptan takım adını yazar (büyük/küçük harf ve baştaki/sondaki boşluk önemsiz). */
export const transferNameMatches = (typed: unknown, teamName: unknown): boolean =>
  typeof typed === 'string' && typeof teamName === 'string' && typed.trim().length > 0
  && typed.trim().toLocaleLowerCase('tr') === teamName.trim().toLocaleLowerCase('tr')

/** Takım sayfasını/teslimi yalnız kaptan düzenler (kaptan, takım kaydındaki kişi). */
export const canEditTeam = (team: TeamLite, participantId: unknown): boolean => sameId(team.captain, participantId)

export function teamRegistrationState(event: EventLite, now = new Date()): { ok: true } | { ok: false; reason: string } {
  if (!event.teamMode) return { ok: false, reason: 'Bu etkinlikte takım modu kapalı.' }
  if (event.status === 'completed') return { ok: false, reason: 'Etkinlik tamamlandı.' }
  if (event.teamSettings?.registrationOpen === false) return { ok: false, reason: 'Takım başvuruları kapalı.' }
  const deadline = event.teamSettings?.registrationDeadline
  if (deadline && new Date(deadline).getTime() < now.getTime()) return { ok: false, reason: 'Takım başvurusu süresi doldu.' }
  return { ok: true }
}

export function submissionState(event: EventLite, team: TeamLite, now = new Date(), accepted?: number): { ok: true } | { ok: false; reason: string } {
  if (!event.teamMode) return { ok: false, reason: 'Bu etkinlikte takım modu kapalı.' }
  if (event.status === 'completed') return { ok: false, reason: 'Etkinlik tamamlandı; proje teslimi kapalı.' }
  if (!isSelectedTeam(team)) return { ok: false, reason: 'Proje teslimi yalnız kabul edilen takımlar içindir.' }
  // Erken onaylanan takım dolmadan onaylanabilir; teslim için alt sınır burada aranır.
  if (accepted !== undefined && accepted < memberLimits(event).min) {
    return { ok: false, reason: `Proje teslimi için takım en az ${memberLimits(event).min} kişi olmalı (şu an ${accepted}).` }
  }
  if (!event.teamSettings?.submissionOpen) return { ok: false, reason: 'Proje teslimi şu an kapalı.' }
  const deadline = event.teamSettings?.submissionDeadline
  if (deadline && new Date(deadline).getTime() < now.getTime()) return { ok: false, reason: 'Teslim süresi doldu.' }
  return { ok: true }
}

export type ApplicationState = 'none' | 'applied' | 'rejected'

/**
 * Takım modu akışı: önce normal etkinlik başvurusu (aynı form ve özel sorular), sonra takım kur/katıl.
 * Başvuru, katılımcı hesabının e-postasıyla eşleştirilir (büyük/küçük harf ve boşluk yok sayılır).
 * Reddedilen başvuruyla takım kurulamaz/katılınamaz.
 */
export function applicationState(registrations: Array<{ email?: unknown; status?: unknown }>, email: string): ApplicationState {
  const target = email.trim().toLowerCase()
  const mine = registrations.filter((r) => String(r.email ?? '').trim().toLowerCase() === target)
  if (!mine.length) return 'none'
  return mine.some((r) => r.status !== 'rejected') ? 'applied' : 'rejected'
}

/** Katılımcının bu etkinlikte etkin (bekleyen veya kabul edilmiş) üyeliği var mı? */
export const hasActiveMembership = (memberships: MembershipLite[], participantId: unknown): boolean =>
  memberships.some((m) => sameId(m.participant, participantId) && (m.status === 'pending' || m.status === 'accepted'))

export const isJudge = (event: EventLite, participantId: unknown): boolean =>
  (event.judges ?? []).some((judge) => sameId(judge, participantId))

/**
 * Jüri puanı verebilir mi? Etkinliğin jürisi olmalı, takım kabul edilmiş olmalı ve jüri o takımın üyesi
 * (kabul edilmiş ya da bekleyen başvurusu) olmamalı — çıkar çatışması.
 */
export function canScore(event: EventLite, team: TeamLite, judgeId: unknown, teamMemberships: MembershipLite[]):
  { ok: true } | { ok: false; reason: string } {
  if (!isJudge(event, judgeId)) return { ok: false, reason: 'Bu etkinliğin jürisi değilsiniz.' }
  if (!sameId(team.event, event.id)) return { ok: false, reason: 'Takım bu etkinliğe ait değil.' }
  if (!isSelectedTeam(team)) return { ok: false, reason: 'Yalnız kabul edilen takımlar puanlanır.' }
  const conflict = sameId(team.captain, judgeId) || teamMemberships.some((m) => sameId(m.participant, judgeId)
    && (m.status === 'accepted' || m.status === 'pending'))
  if (conflict) return { ok: false, reason: 'Kendi takımınıza puan veremezsiniz.' }
  return { ok: true }
}

export type Criterion = { id: string; name: string; weight: number; max: number }

export function criteriaOf(event: EventLite): Criterion[] {
  return (event.judgingCriteria ?? [])
    .filter((c) => c && typeof c.name === 'string' && c.id)
    .map((c) => ({
      id: String(c.id),
      name: c.name,
      weight: Number(c.weight) > 0 ? Number(c.weight) : 1,
      max: Number.isInteger(Number(c.max)) && Number(c.max) >= 1 ? Number(c.max) : 10,
    }))
}

/**
 * Puanları doğrular (jüri paneliyle aynı kural, lib/teams/score.ts): her kriter için 0..max sonlu sayı zorunlu
 * (eksik kart kaydedilmez); kriter dışı anahtarlar atılır.
 */
export function validateScores(input: unknown, criteria: Criterion[]): { ok: true; scores: Record<string, number> } | { ok: false; reason: string } {
  if (!criteria.length) return { ok: false, reason: 'Etkinlikte puanlama kriteri tanımlı değil.' }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, reason: 'Geçersiz puan verisi.' }
  const source = input as Record<string, unknown>
  const scores: Record<string, number> = {}
  for (const c of criteria) {
    if (Object.prototype.hasOwnProperty.call(source, c.id)) scores[c.id] = source[c.id] as number
  }
  try {
    assertValidCriteria(criteria)
    assertValidScores(scores, criteria)
  } catch (error) {
    if (error instanceof ScoreValidationError) return { ok: false, reason: error.message }
    throw error
  }
  if (!isCompleteScoreCard(scores, criteria)) return { ok: false, reason: 'Tüm kriterleri puanlayın.' }
  return { ok: true, scores }
}

/** Ağırlıklı toplam 0–100 (lib/teams/score.ts; jüri paneliyle aynı). */
export const weightedTotal = (scores: Record<string, number>, criteria: Criterion[]): number => sharedWeightedTotal(scores, criteria)

/** Jüri puanlarından öneri sıralaması: takım başına jüri ortalaması, büyükten küçüğe; eşitlikte daha çok jüri önde. */
export function suggestRanking(rows: Array<{ team: string; total: number }>): Array<{ team: string; average: number; judges: number; rank: number }> {
  const byTeam = new Map<string, number[]>()
  for (const row of rows) byTeam.set(row.team, [...(byTeam.get(row.team) ?? []), row.total])
  const list = [...byTeam.entries()].map(([team, totals]) => ({
    team, judges: totals.length, average: Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 100) / 100,
  }))
  list.sort((a, b) => b.average - a.average || b.judges - a.judges || a.team.localeCompare(b.team))
  let rank = 0
  return list.map((item, index) => {
    if (index === 0 || item.average !== list[index - 1].average) rank = index + 1
    return { ...item, rank }
  })
}

/** Yayınlanmış sonuçları gösterim seçeneğine göre süzer. */
export function visibleResults<T extends { rank: number }>(results: T[], display: string | null | undefined): T[] {
  const sorted = [...results].filter((r) => Number.isFinite(r.rank)).sort((a, b) => a.rank - b.rank)
  if (display === 'first') return sorted.filter((r) => r.rank === 1)
  if (display === 'full') return sorted
  return sorted.filter((r) => r.rank <= 3)
}
