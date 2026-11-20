import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { Endpoint, PayloadRequest } from 'payload'
import { logEvent } from '../lib/obs/notify'
import { esc } from '../lib/obs/privacy'
import {
  advance, buildRanking, countedVoters, currentTeamId, hasConflict, liveVoteState, normalizeSession, requiredJudges, resultsDisplayFor,
  revealedRows, REVEAL_MODES, stepwiseCount, type JurySession, type RankingRow, type RevealMode, type ScoreRow,
} from '../lib/teams/jury'
import { criteriaOf, idOf, isJudge, sameId, validateScores, weightedTotal, type EventLite, type MembershipLite, type TeamLite } from '../lib/teams/rules'
import { cleanText } from '../lib/teams/validate'
import {
  body, fail, ipKey, limited, loadEvent, mediaUrl, membershipsOf, namesOf, param, prizesOf, reply, route, type Json, type Participant,
} from './teams'

/**
 * Canlı jüri oturumu uçları (/api/takim/jury/:eventId/...). Site BFF'i üzerinden; kurallar lib/teams/jury.ts.
 *  GET  live     jüri + sunucu: oturum durumu, o anki takım, "2/3 oy" ilerlemesi, kendi oyum; bitince tüm puanlar
 *  POST vote     jüri: o anki takıma oy (herkes oy verince oturum kendiliğinden ilerler)
 *  POST control  sunucu: start / next / prev / finish / reveal / reveal-next / reveal-prev / publish / reset
 *  POST stage    salon ekranı (oturumsuz, anahtarla): yalnız açılmış bilgi
 * Oturum satırı iyimser kilitle (version) güncellenir: aynı anda gelen iki "son oy" oturumu bir kez ilerletir.
 */

type EventDoc = EventLite & Json

async function loadSession(req: PayloadRequest, eventId: unknown): Promise<JurySession | null> {
  const { docs } = await req.payload.find({ collection: 'jury-sessions', where: { event: { equals: idOf(eventId) } } as never,
    limit: 1, depth: 0, overrideAccess: true, req })
  return docs[0] ? normalizeSession(docs[0] as unknown as Json) : null
}

const COLUMNS: Record<string, { column: string; json?: boolean }> = {
  status: { column: 'status' }, currentIndex: { column: 'current_index' }, revealMode: { column: 'reveal_mode' },
  revealStep: { column: 'reveal_step' }, order: { column: 'order', json: true }, judgeIds: { column: 'judge_ids', json: true },
  openedAt: { column: 'opened_at', json: true }, finalRanking: { column: 'final_ranking', json: true }, stageKey: { column: 'stage_key' },
}

/**
 * Oturumu yalnız okunduğu sürümdeyse günceller (Postgres: tek UPDATE ... WHERE version = ?). Başka bir istek araya
 * girdiyse false döner. Yerel SQLite'ta (geliştirme/test) sürüm denetimi aynı, ama atomik değil.
 */
async function casUpdate(req: PayloadRequest, session: JurySession, patch: Partial<JurySession>): Promise<boolean> {
  const pool = (req.payload.db as unknown as { pool?: { query: (text: string, params: unknown[]) => Promise<{ rowCount: number | null }> } }).pool
  if (pool && typeof pool.query === 'function') {
    const sets: string[] = []
    const params: unknown[] = []
    for (const [key, value] of Object.entries(patch)) {
      const col = COLUMNS[key]
      if (!col) continue
      params.push(col.json ? JSON.stringify(value ?? null) : value)
      sets.push(`"${col.column}" = $${params.length}${col.json ? '::jsonb' : ''}`)
    }
    params.push(session.id, session.version)
    const result = await pool.query(`UPDATE "jury_sessions" SET ${sets.join(', ')}, "version" = "version" + 1, "updated_at" = now() `
      + `WHERE "id" = $${params.length - 1} AND "version" = $${params.length}`, params)
    return (result.rowCount ?? 0) === 1
  }
  const fresh = await req.payload.findByID({ collection: 'jury-sessions', id: session.id, depth: 0, overrideAccess: true, req })
  if (Number((fresh as Json).version ?? 0) !== session.version) return false
  await req.payload.update({ collection: 'jury-sessions', id: session.id, overrideAccess: true, req,
    data: { ...patch, version: session.version + 1 } as never })
  return true
}

type Role = { judge: boolean; host: boolean }

async function access(req: PayloadRequest, me: Participant): Promise<{ event: EventDoc; session: JurySession | null; role: Role } | Response> {
  const event = await loadEvent(req, param(req, 'eventId'))
  if (!event) return fail(404, 'Etkinlik bulunamadı.')
  const session = await loadSession(req, event.id)
  const role = { judge: isJudge(event, me.id), host: Boolean(session && sameId(session.host, me.id)) }
  if (!role.judge && !role.host) return fail(403, 'Bu etkinliğin jürisi değilsiniz.')
  return { event, session, role }
}

async function teamsById(req: PayloadRequest, ids: string[]): Promise<Map<string, TeamLite & Json>> {
  if (!ids.length) return new Map()
  const { docs } = await req.payload.find({ collection: 'teams', where: { id: { in: ids } } as never, depth: 0, limit: ids.length, overrideAccess: true, req, pagination: false })
  return new Map((docs as unknown as Array<TeamLite & Json>).map((t) => [String(t.id), t]))
}

/** Takım kartı (jüri, sunucu ve salon ekranı): ad, logo, proje adı, açıklama, bağlantılar; isteğe bağlı üye adları. */
async function teamCard(req: PayloadRequest, team: TeamLite & Json, members?: string[]) {
  const sub = (team.submission ?? {}) as Json
  const links = ([['Site / demo', sub.demoUrl], ['GitHub', sub.githubUrl], ['Video', sub.videoUrl]] as const)
    .filter(([, url]) => typeof url === 'string' && url).map(([label, url]) => ({ label, url: String(url) }))
  return {
    id: String(team.id), name: String(team.name ?? ''), logoUrl: await mediaUrl(req, team.logo),
    projectName: String(sub.projectName || ''), summary: String(sub.summary ?? ''), links,
    ...(members ? { members } : {}),
  }
}

async function memberNames(req: PayloadRequest, teamIds: string[]): Promise<Map<string, string[]>> {
  if (!teamIds.length) return new Map()
  const memberships = await membershipsOf(req, { team: { in: teamIds }, status: { equals: 'accepted' } })
  const names = await namesOf(req, memberships.map((m) => m.participant))
  const out = new Map<string, string[]>()
  for (const m of memberships.sort((a, b) => (a.role === 'captain' ? -1 : b.role === 'captain' ? 1 : 0))) {
    const list = out.get(idOf(m.team)) ?? []
    list.push(names.get(idOf(m.participant))?.name || 'Üye')
    out.set(idOf(m.team), list)
  }
  return out
}

/** Takım başına çatışmalı jüriler (oturum jürisinden takımın kaptanı / üyesi / bekleyen başvurusu olanlar). */
async function conflictsFor(req: PayloadRequest, session: JurySession, teams: Map<string, TeamLite & Json>): Promise<Record<string, string[]>> {
  const ids = [...teams.keys()]
  const memberships = ids.length ? await membershipsOf(req, { team: { in: ids } }) : []
  const out: Record<string, string[]> = {}
  for (const [id, team] of teams) {
    const list = memberships.filter((m) => sameId(m.team, id)) as MembershipLite[]
    out[id] = session.judgeIds.filter((j) => hasConflict(j, team, list))
  }
  return out
}

async function scoresOf(req: PayloadRequest, where: Json): Promise<ScoreRow[]> {
  const { docs } = await req.payload.find({ collection: 'team-scores', where: where as never, depth: 0, limit: 5000, overrideAccess: true, req, pagination: false })
  return docs as unknown as ScoreRow[]
}

async function freezeRanking(req: PayloadRequest, session: JurySession): Promise<RankingRow[]> {
  const teams = await teamsById(req, session.order)
  return buildRanking(session.order, session.judgeIds, await scoresOf(req, { event: { equals: idOf(session.event) } }), await conflictsFor(req, session, teams), session.openedAt)
}

/** Sıralamayı ad, puan dökümü ile zenginleştirir (jüri ve sunucu ekranı; oturum bittikten sonra). */
async function rankingView(req: PayloadRequest, ranking: RankingRow[]) {
  const teams = await teamsById(req, ranking.map((r) => r.team))
  const judges = await namesOf(req, [...new Set(ranking.flatMap((r) => Object.keys(r.perJudge)))])
  return ranking.map((r) => ({
    rank: r.rank, teamId: r.team, teamName: String(teams.get(r.team)?.name ?? `#${r.team}`), average: r.average, judges: r.judges,
    perJudge: Object.entries(r.perJudge).map(([id, total]) => ({ name: judges.get(id)?.name || 'Jüri', total })),
  }))
}

/** Oy sonrası: gereken herkes oy verdiyse oturumu ilerletir (araya başka güncelleme girerse yeniden dener). */
async function advanceIfComplete(req: PayloadRequest, eventId: unknown, teamId: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const session = await loadSession(req, eventId)
    if (!session || currentTeamId(session) !== teamId) return
    const teams = await teamsById(req, [teamId])
    const conflicted = (await conflictsFor(req, session, teams))[teamId] ?? []
    const required = requiredJudges(session, conflicted)
    const voters = countedVoters(session, teamId, required, await scoresOf(req, { team: { equals: teamId } }))
    if (voters.length < required.length) return
    const step = advance(session)
    const patch: Partial<JurySession> = { ...step }
    if (step.status === 'finished') patch.finalRanking = await freezeRanking(req, session)
    if (await casUpdate(req, session, patch)) return
  }
}

const liveEndpoints: Endpoint[] = [
  route('get', '/jury/:eventId/live', { auth: true }, async (req, me) => {
    const ctx = await access(req, me!)
    if (ctx instanceof Response) return ctx
    const { event, session, role } = ctx
    const criteria = criteriaOf(event)
    const base = { ok: true, role, event: { id: String(event.id), title: event.title, slug: event.slug, criteria } }
    if (!session) return reply(200, { ...base, session: null })
    const meId = idOf(me!.id)
    const prizes = await prizesOf(req, event)
    const out: Json = {
      ...base,
      session: {
        status: session.status, version: session.version, index: session.currentIndex, total: session.order.length,
        revealMode: session.revealMode, revealStep: session.revealStep,
        revealCount: session.finalRanking ? stepwiseCount(session.finalRanking, prizes.length) : 0,
      },
    }
    const teamId = currentTeamId(session)
    if (teamId) {
      const teams = await teamsById(req, [teamId])
      const team = teams.get(teamId)
      const conflicted = (await conflictsFor(req, session, teams))[teamId] ?? []
      const required = requiredJudges(session, conflicted)
      const scores = await scoresOf(req, { team: { equals: teamId } })
      const voters = countedVoters(session, teamId, required, scores)
      const mine = voters.includes(meId) ? scores.find((s) => idOf(s.judge) === meId) as Json | undefined : undefined
      out.current = team ? await teamCard(req, team) : null
      out.progress = { voted: voters.length, required: required.length }
      out.me = {
        canVote: liveVoteState(session, teamId, meId, conflicted).ok, conflict: conflicted.includes(meId), voted: Boolean(mine),
        scores: mine?.scores ?? null, comment: mine?.comment ?? '',
      }
      // Kimin beklendiği yalnız sunucuya (oy değerleri hiçbir yanıtta yok)
      if (role.host) {
        const names = await namesOf(req, required.filter((j) => !voters.includes(j)))
        out.pending = [...names.values()].map((n) => n.name || 'Jüri')
      }
    }
    if (session.finalRanking && session.status !== 'voting') out.ranking = await rankingView(req, session.finalRanking)
    if (role.host) {
      const teams = await teamsById(req, session.order)
      out.host = {
        stageKey: session.stageKey ?? null,
        order: session.order.map((id, i) => ({ index: i, name: String(teams.get(id)?.name ?? `#${id}`) })),
        judges: session.judgeIds.length,
        resultsPublished: Boolean(event.resultsPublished),
      }
    }
    return reply(200, out)
  }),

  route('post', '/jury/:eventId/live/vote', { auth: true }, async (req, me) => {
    if (await limited(req, 'jury-vote', String(me!.id), 60, 60)) return fail(429, 'Çok fazla deneme. Biraz bekleyin.')
    const ctx = await access(req, me!)
    if (ctx instanceof Response) return ctx
    const { event, session } = ctx
    if (!session) return fail(409, 'Canlı oturum yok.')
    const data = await body(req)
    const teamId = idOf(data.teamId)
    const teams = await teamsById(req, teamId ? [teamId] : [])
    const team = teams.get(teamId)
    if (!team) return fail(404, 'Takım bulunamadı.')
    const conflicted = (await conflictsFor(req, session, teams))[teamId] ?? []
    const state = liveVoteState(session, teamId, idOf(me!.id), conflicted)
    if (state.ok === false) return fail(409, state.reason)
    const criteria = criteriaOf(event)
    const checked = validateScores(data.scores, criteria)
    if (checked.ok === false) return fail(400, checked.reason)
    const comment = cleanText(data.comment ?? '', 1000)
    if (comment === null) return fail(400, 'Yorum en fazla 1000 karakter olabilir.')
    const total = weightedTotal(checked.scores, criteria)
    const record = { event: event.id, team: team.id, judge: me!.id, scores: checked.scores, total, comment }
    const { docs } = await req.payload.find({ collection: 'team-scores', where: { team: { equals: team.id }, judge: { equals: me!.id } }, limit: 1, depth: 0, overrideAccess: true, req })
    if (docs[0]) await req.payload.update({ collection: 'team-scores', id: docs[0].id, overrideAccess: true, req, data: record as never })
    else {
      try {
        await req.payload.create({ collection: 'team-scores', overrideAccess: true, req, data: record as never })
      } catch (error) {
        // (takım, jüri) tekil indeksi: aynı anda iki gönderim — ikincisi güncellemeye döner
        const again = await req.payload.find({ collection: 'team-scores', where: { team: { equals: team.id }, judge: { equals: me!.id } }, limit: 1, depth: 0, overrideAccess: true, req })
        if (!again.docs[0]) throw error
        await req.payload.update({ collection: 'team-scores', id: again.docs[0].id, overrideAccess: true, req, data: record as never })
      }
    }
    await advanceIfComplete(req, event.id, teamId)
    return reply(200, { ok: true })
  }),

  route('post', '/jury/:eventId/live/control', { auth: true }, async (req, me) => {
    if (await limited(req, 'jury-control', String(me!.id), 120, 60)) return fail(429, 'Çok fazla deneme. Biraz bekleyin.')
    const ctx = await access(req, me!)
    if (ctx instanceof Response) return ctx
    const { event, session, role } = ctx
    if (!session || !role.host) return fail(403, 'Oturumu yalnız sunucu yönetir.')
    const data = await body(req)
    const action = String(data.action ?? '')
    const patch: Partial<JurySession> = {}
    const s = session

    if (action === 'start') {
      if (s.status !== 'idle') return fail(409, 'Oturum zaten başlamış. Yeniden başlatmak için önce sıfırlayın.')
      const { docs } = await req.payload.find({ collection: 'teams', where: { event: { equals: event.id }, status: { equals: 'accepted' } } as never,
        depth: 0, limit: 200, overrideAccess: true, req, pagination: false })
      // Sunum sırası: teslim sırası; teslim etmeyen kabul edilmiş takım oylamaya girmez
      const order = (docs as Json[]).filter((t) => t.submission?.submittedAt)
        .sort((a, b) => String(a.submission.submittedAt).localeCompare(String(b.submission.submittedAt))).map((t) => String(t.id))
      const judgeIds = (event.judges ?? []).map((j) => idOf(j)).filter(Boolean)
      if (!order.length) return fail(409, 'Proje teslim etmiş kabul edilmiş takım yok.')
      if (!judgeIds.length) return fail(409, 'Etkinlikte jüri tanımlı değil (CMS → Etkinlik → Takım modu → Jüri üyeleri).')
      if (!criteriaOf(event).length) return fail(409, 'Etkinlikte puanlama kriteri tanımlı değil.')
      Object.assign(patch, { status: 'voting', order, judgeIds, currentIndex: 0, openedAt: { [order[0]]: new Date().toISOString() },
        revealStep: 0, finalRanking: null, stageKey: s.stageKey || randomBytes(24).toString('base64url') })
    } else if (action === 'next') {
      if (s.status !== 'voting') return fail(409, 'Oylama sürmüyor.')
      const step = advance(s)
      Object.assign(patch, step)
      if (step.status === 'finished') patch.finalRanking = await freezeRanking(req, s)
    } else if (action === 'prev') {
      if (s.status === 'voting' && s.currentIndex > 0) Object.assign(patch, { currentIndex: s.currentIndex - 1 })
      else if (s.status === 'finished' && s.order.length) Object.assign(patch, { status: 'voting', currentIndex: s.order.length - 1, finalRanking: null })
      else return fail(409, 'Geri gidilecek takım yok.')
    } else if (action === 'finish') {
      if (s.status !== 'voting') return fail(409, 'Oylama sürmüyor.')
      Object.assign(patch, { status: 'finished', currentIndex: s.order.length, finalRanking: await freezeRanking(req, s) })
    } else if (action === 'reveal') {
      if (!['finished', 'revealing', 'done'].includes(s.status) || !s.finalRanking) return fail(409, 'Önce oylamayı bitirin.')
      const mode = String(data.mode) as RevealMode
      if (!REVEAL_MODES.includes(mode)) return fail(400, 'Geçersiz açılış biçimi.')
      Object.assign(patch, { status: s.status === 'done' ? 'done' : 'revealing', revealMode: mode, revealStep: 0 })
    } else if (action === 'reveal-next' || action === 'reveal-prev') {
      if (!['revealing', 'done'].includes(s.status) || !s.finalRanking) return fail(409, 'Açılış başlamadı.')
      const max = stepwiseCount(s.finalRanking, (await prizesOf(req, event)).length)
      const step = s.revealStep + (action === 'reveal-next' ? 1 : -1)
      if (step < 0 || step > max) return fail(409, action === 'reveal-next' ? 'Tüm sıralar açıldı.' : 'Açılmış sıra yok.')
      patch.revealStep = step
    } else if (action === 'publish') {
      if (!['finished', 'revealing'].includes(s.status) || !s.finalRanking) return fail(409, 'Önce oylamayı bitirin.')
      // Etkinliğe tek yazım (site önbelleği bir kez yenilenir); sıralama dondurulmuş haliyle
      const results = s.finalRanking.filter((r) => r.judges > 0).map((r) => ({ rank: r.rank, team: Number(r.team) || r.team, score: r.average }))
      await req.payload.update({ collection: 'events', id: event.id, overrideAccess: true, req,
        data: { results, resultsPublished: true, resultsDisplay: resultsDisplayFor(s.revealMode) } as never })
      patch.status = 'done'
    } else if (action === 'reset') {
      Object.assign(patch, { status: 'idle', order: [], judgeIds: [], currentIndex: 0, openedAt: {}, revealStep: 0, finalRanking: null, stageKey: null })
    } else {
      return fail(400, 'Geçersiz işlem.')
    }

    if (!(await casUpdate(req, s, patch))) return fail(409, 'Oturum bu sırada değişti; ekran yenileniyor, tekrar deneyin.', { code: 'stale' })
    if (['start', 'finish', 'publish', 'reset'].includes(action)) {
      await logEvent(req.payload, {
        kind: `jury_${action}`, category: 'application', topic: 'applications',
        text: `🎤 <b>Canlı jüri: ${esc(({ start: 'oturum başladı', finish: 'oylama bitti', publish: 'sonuçlar yayınlandı', reset: 'oturum sıfırlandı' } as Record<string, string>)[action] ?? action)}</b>\n🎪 ${esc(String(event.title ?? '-'))}`,
      }).catch((): undefined => undefined)
    }
    return reply(200, { ok: true })
  }),

  route('post', '/jury/:eventId/stage', {}, async (req) => {
    if (await limited(req, 'jury-stage', ipKey(req), 240, 60)) return fail(429, 'Çok fazla istek.')
    const event = await loadEvent(req, param(req, 'eventId'))
    const session = event ? await loadSession(req, event.id) : null
    const data = await body(req)
    const key = typeof data.k === 'string' ? data.k : ''
    const expected = session?.stageKey ?? ''
    const valid = Boolean(expected) && key.length === expected.length && timingSafeEqual(Buffer.from(key), Buffer.from(expected))
    if (!event || !session || !valid) return fail(404, 'Salon ekranı bulunamadı ya da linkin süresi doldu.')
    const out: Json = { ok: true, event: { title: event.title }, status: session.status, version: session.version, index: session.currentIndex, total: session.order.length }
    const teamId = currentTeamId(session)
    if (teamId) {
      const teams = await teamsById(req, [teamId])
      const team = teams.get(teamId)
      const conflicted = (await conflictsFor(req, session, teams))[teamId] ?? []
      const required = requiredJudges(session, conflicted)
      const voters = countedVoters(session, teamId, required, await scoresOf(req, { team: { equals: teamId } }))
      out.current = team ? await teamCard(req, team, (await memberNames(req, [teamId])).get(teamId) ?? []) : null
      out.progress = { voted: voters.length, required: required.length }
    }
    if ((session.status === 'revealing' || session.status === 'done') && session.finalRanking) {
      const prizes = await prizesOf(req, event)
      const rows = revealedRows(session.finalRanking, session.revealMode, session.revealStep, prizes.length)
      const teams = await teamsById(req, rows.map((r) => r.team))
      const members = await memberNames(req, rows.map((r) => r.team))
      out.reveal = {
        mode: session.revealMode, step: session.revealStep, count: stepwiseCount(session.finalRanking, prizes.length),
        rows: await Promise.all(rows.map(async (r): Promise<Json> => {
          const team = teams.get(r.team)
          const prize = prizes.find((p) => p.rank === r.rank)
          return {
            rank: r.rank, average: session.revealMode === 'full' ? r.average : null,
            team: team ? await teamCard(req, team, members.get(r.team) ?? []) : { id: r.team, name: `#${r.team}`, members: [] as string[] },
            prize: prize ? { title: prize.title, description: prize.description ?? null, imageUrl: prize.imageUrl ?? null } : null,
          }
        })),
      }
    }
    return reply(200, out)
  }),
]

export const juryLiveEndpoints: Endpoint[] = liveEndpoints

