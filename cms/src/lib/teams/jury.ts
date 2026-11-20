import { idOf, sameId, type MembershipLite } from './rules'

/**
 * Canlı jüri oturumu — saf kurallar (yan etkisiz; tests/int/jury.int.spec.ts).
 *
 * Akış: idle → voting (sunucu başlatır; tüm jürilerde aynı takım) → finished (sıralama dondurulur, jürilere tüm puanlar
 * açılır) → revealing (salon ekranında açılış) → done (sonuç etkinliğe yazıldı). Oy yalnız o anki takıma verilir;
 * gereken jürilerin hepsi oy verince oturum kendiliğinden sıradaki takıma geçer. Oylama sırasında kimse başkasının
 * puanını görmez (yalnız "2/3 oy verildi").
 */

export type JuryStatus = 'idle' | 'voting' | 'finished' | 'revealing' | 'done'
export type RevealMode = 'full' | 'top3' | 'first' | 'stepwise'

export type JurySession = {
  id: number | string
  event: unknown
  host?: unknown
  status: JuryStatus
  order: string[]
  currentIndex: number
  judgeIds: string[]
  /** Takım kimliği → oylamanın açıldığı an; yalnız bu andan sonraki oylar sayılır (önceden verilmiş bağımsız puan sayılmaz). */
  openedAt: Record<string, string>
  version: number
  revealMode: RevealMode
  revealStep: number
  finalRanking: RankingRow[] | null
  stageKey?: string | null
}

export type ScoreRow = { team: unknown; judge: unknown; total: unknown; updatedAt?: unknown }

export type RankingRow = {
  team: string
  rank: number
  average: number
  judges: number
  /** Jüri kimliği → ağırlıklı puan (yalnız jüri/sunucuya, oturum bittikten sonra gösterilir) */
  perJudge: Record<string, number>
}

export const JURY_STATUSES: JuryStatus[] = ['idle', 'voting', 'finished', 'revealing', 'done']
export const REVEAL_MODES: RevealMode[] = ['full', 'top3', 'first', 'stepwise']

/** Oturumu normalleştirir (json alanları bozuk/boş gelebilir). */
export function normalizeSession(raw: Record<string, unknown>): JurySession {
  const list = (value: unknown) => (Array.isArray(value) ? value.map((v) => idOf(v)).filter(Boolean) : [])
  const status = JURY_STATUSES.includes(raw.status as JuryStatus) ? raw.status as JuryStatus : 'idle'
  const revealMode = REVEAL_MODES.includes(raw.revealMode as RevealMode) ? raw.revealMode as RevealMode : 'stepwise'
  const opened = raw.openedAt && typeof raw.openedAt === 'object' && !Array.isArray(raw.openedAt) ? raw.openedAt as Record<string, string> : {}
  return {
    id: raw.id as number | string,
    event: raw.event,
    host: raw.host,
    status,
    order: list(raw.order),
    currentIndex: Math.max(0, Math.trunc(Number(raw.currentIndex) || 0)),
    judgeIds: list(raw.judgeIds),
    openedAt: opened,
    version: Math.max(0, Math.trunc(Number(raw.version) || 0)),
    revealMode,
    revealStep: Math.max(0, Math.trunc(Number(raw.revealStep) || 0)),
    finalRanking: Array.isArray(raw.finalRanking) ? raw.finalRanking as RankingRow[] : null,
    stageKey: typeof raw.stageKey === 'string' ? raw.stageKey : null,
  }
}

export const currentTeamId = (s: JurySession): string | null =>
  s.status === 'voting' && s.currentIndex < s.order.length ? s.order[s.currentIndex] : null

/** Jüri bu takımın üyesi / kaptanı mı (çıkar çatışması: o takıma oy vermez ve gereken sayıdan düşülür)? */
export function hasConflict(judgeId: unknown, team: { captain?: unknown }, memberships: MembershipLite[]): boolean {
  return sameId(team.captain, judgeId) || memberships.some((m) => sameId(m.participant, judgeId) && (m.status === 'accepted' || m.status === 'pending'))
}

/** Bu takım için oy vermesi gereken jüriler (oturum başında dondurulan liste − çatışmalı jüriler). */
export const requiredJudges = (s: JurySession, conflicted: string[]): string[] =>
  s.judgeIds.filter((j) => !conflicted.includes(j))

/** Bu takım için sayılan oylar: gereken jürilerden, oylama açıldıktan sonra verilmiş (jüri başına bir). */
export function countedVoters(s: JurySession, teamId: string, required: string[], scores: ScoreRow[]): string[] {
  const opened = Date.parse(s.openedAt[teamId] ?? '')
  const voters = new Set<string>()
  for (const row of scores) {
    if (idOf(row.team) !== teamId) continue
    const judge = idOf(row.judge)
    if (!required.includes(judge)) continue
    const at = Date.parse(String(row.updatedAt ?? ''))
    if (Number.isFinite(opened) && !(at >= opened)) continue
    voters.add(judge)
  }
  return [...voters]
}

/** Oy verilebilir mi? */
export function liveVoteState(s: JurySession, teamId: string, judgeId: string, conflicted: string[]): { ok: true } | { ok: false; reason: string } {
  if (s.status !== 'voting') return { ok: false, reason: 'Şu an oylama açık değil.' }
  if (currentTeamId(s) !== teamId) return { ok: false, reason: 'Bu takımın oylaması kapandı; ekran sıradaki takıma geçti.' }
  if (!s.judgeIds.includes(judgeId)) return { ok: false, reason: 'Bu oturumun jürisi değilsiniz.' }
  if (conflicted.includes(judgeId)) return { ok: false, reason: 'Kendi takımınıza puan veremezsiniz.' }
  return { ok: true }
}

/** Sıradaki adım: bir sonraki takım ya da (sonuncuysa) oturumun bitişi. */
export function advance(s: JurySession, now = new Date()): Pick<JurySession, 'currentIndex' | 'status' | 'openedAt'> {
  const next = s.currentIndex + 1
  if (next >= s.order.length) return { currentIndex: s.order.length, status: 'finished', openedAt: s.openedAt }
  const teamId = s.order[next]
  // Geri dönülüp yeniden gelinen takımda ilk açılış anı korunur (verilmiş oylar geçerli kalır)
  return { currentIndex: next, status: 'voting', openedAt: { ...s.openedAt, [teamId]: s.openedAt[teamId] ?? now.toISOString() } }
}

/**
 * Sıralama: takım başına gereken jürilerin (oturum jürisi, çatışmasız) son puanlarının ortalaması, büyükten küçüğe.
 * Eşit ortalama aynı sırayı alır ("1, 1, 3"). Hiç oy almamış takım en sonda (ortalama 0, jüri 0).
 */
/**
 * openedAt verilirse (canlı oturum) yalnız takım ekranda açıldıktan sonra verilen oylar sayılır:
 * oturum sıfırlanınca eski oylar sıralamaya sızmaz, hiç açılmamış takımın oyu sayılmaz.
 */
export function buildRanking(order: string[], judgeIds: string[], scores: ScoreRow[], conflicts: Record<string, string[]>,
  openedAt?: Record<string, string>): RankingRow[] {
  const rows = order.map((team) => {
    const perJudge: Record<string, number> = {}
    const opened = openedAt ? Date.parse(openedAt[team] ?? '') : NaN
    for (const row of scores) {
      const judge = idOf(row.judge)
      if (idOf(row.team) !== team || !judgeIds.includes(judge) || (conflicts[team] ?? []).includes(judge)) continue
      if (openedAt && !(Date.parse(String(row.updatedAt ?? '')) >= opened)) continue
      const total = Number(row.total)
      if (Number.isFinite(total)) perJudge[judge] = total
    }
    const totals = Object.values(perJudge)
    const average = totals.length ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 100) / 100 : 0
    return { team, average, judges: totals.length, perJudge, rank: 0 }
  })
  const position = new Map(order.map((t, i) => [t, i]))
  rows.sort((a, b) => Number(b.judges > 0) - Number(a.judges > 0) || b.average - a.average || (position.get(a.team)! - position.get(b.team)!))
  rows.forEach((row, i) => {
    const prev = rows[i - 1]
    row.rank = prev && prev.average === row.average && Boolean(prev.judges) === Boolean(row.judges) ? prev.rank : i + 1
  })
  return rows
}

/** Adım adım açılışta kaç sıra açılacak: ödül sayısı (yoksa 3), takım sayısını geçmez. */
export const stepwiseCount = (ranking: RankingRow[], prizeCount: number): number =>
  Math.min(ranking.length, prizeCount > 0 ? prizeCount : 3)

/**
 * Salon ekranında görünen sıralar. Açılmamış sıra yanıtta hiç bulunmaz.
 *  - full: hepsi · top3: ilk 3 sıra · first: birinci
 *  - stepwise: ödüllü sıralar sondan başa (ör. 3. → 2. → 1.), her basışta bir tane
 */
export function revealedRows(ranking: RankingRow[], mode: RevealMode, step: number, prizeCount: number): RankingRow[] {
  if (mode === 'full') return ranking
  if (mode === 'top3') return ranking.filter((r) => r.rank <= 3)
  if (mode === 'first') return ranking.filter((r) => r.rank === 1)
  const top = ranking.slice(0, stepwiseCount(ranking, prizeCount)).reverse()
  return top.slice(0, Math.max(0, Math.min(step, top.length)))
}

/** Sonuç etkinliğe yazılırken gösterim seçeneği (adım adım → ilk 3). */
export const resultsDisplayFor = (mode: RevealMode): 'full' | 'top3' | 'first' => (mode === 'stepwise' ? 'top3' : mode)
