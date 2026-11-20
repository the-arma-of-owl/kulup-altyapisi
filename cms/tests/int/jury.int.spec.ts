import { describe, expect, it } from 'vitest'
import {
  advance, buildRanking, countedVoters, currentTeamId, hasConflict, liveVoteState, normalizeSession, requiredJudges, resultsDisplayFor,
  revealedRows, stepwiseCount, type JurySession,
} from '../../src/lib/teams/jury'
import { JurySessions } from '../../src/collections/JurySessions'
import { EVENT_LINKS } from '../../src/lib/eventDelete'

const t0 = '2026-10-20T10:00:00.000Z'
const session = (over: Partial<JurySession> = {}): JurySession => normalizeSession({
  id: 1, event: 29, status: 'voting', order: ['10', '11', '12'], currentIndex: 0, judgeIds: ['7', '8', '9'],
  openedAt: { 10: t0 }, version: 4, revealMode: 'stepwise', revealStep: 0, ...over,
} as never)

describe('canlı jüri: oylama', () => {
  it('bozuk alanlar güvenli varsayılana döner', () => {
    const s = normalizeSession({ id: 1, status: 'x', revealMode: 'y', order: 'z', currentIndex: -3 } as never)
    expect(s).toMatchObject({ status: 'idle', revealMode: 'stepwise', order: [], currentIndex: 0, judgeIds: [], openedAt: {} })
  })

  it('o anki takım yalnız oylamada', () => {
    expect(currentTeamId(session())).toBe('10')
    expect(currentTeamId(session({ status: 'finished' }))).toBeNull()
    expect(currentTeamId(session({ currentIndex: 3 }))).toBeNull()
  })

  it('çatışmalı jüri gereken sayıdan düşer ve oy veremez', () => {
    const team = { captain: 5 }
    expect(hasConflict('8', team, [{ participant: 8, status: 'accepted' }] as never)).toBe(true)
    expect(hasConflict('8', team, [{ participant: 8, status: 'left' }] as never)).toBe(false)
    expect(hasConflict('5', team, [])).toBe(true)
    expect(requiredJudges(session(), ['8'])).toEqual(['7', '9'])
    expect(liveVoteState(session(), '10', '8', ['8'])).toMatchObject({ ok: false })
    expect(liveVoteState(session(), '10', '7', ['8'])).toEqual({ ok: true })
  })

  it('eski takıma, oturum jürisi olmayana, oylama dışında oy yok', () => {
    expect(liveVoteState(session(), '11', '7', [])).toMatchObject({ ok: false })
    expect(liveVoteState(session(), '10', '99', [])).toMatchObject({ ok: false })
    expect(liveVoteState(session({ status: 'finished' }), '10', '7', [])).toMatchObject({ ok: false })
  })

  it('yalnız oylama açıldıktan sonraki, gereken jürilerin oyları sayılır (jüri başına bir)', () => {
    const scores = [
      { team: 10, judge: 7, total: 80, updatedAt: '2026-10-20T10:01:00.000Z' },
      { team: 10, judge: 8, total: 70, updatedAt: '2026-10-20T09:00:00.000Z' }, // önceden verilmiş bağımsız puan
      { team: 10, judge: 99, total: 10, updatedAt: '2026-10-20T10:02:00.000Z' }, // oturum jürisi değil
      { team: 11, judge: 9, total: 60, updatedAt: '2026-10-20T10:03:00.000Z' }, // başka takım
    ]
    expect(countedVoters(session(), '10', ['7', '8', '9'], scores)).toEqual(['7'])
  })

  it('ilerleme: sıradaki takım açılır, geri dönülen takımın ilk açılışı korunur, sonuncudan sonra biter', () => {
    const now = new Date('2026-10-20T10:05:00.000Z')
    expect(advance(session(), now)).toEqual({ currentIndex: 1, status: 'voting', openedAt: { 10: t0, 11: now.toISOString() } })
    const back = session({ currentIndex: 0, openedAt: { 10: t0, 11: '2026-10-20T10:04:00.000Z' } })
    expect(advance(back, now).openedAt['11']).toBe('2026-10-20T10:04:00.000Z')
    expect(advance(session({ currentIndex: 2 }), now)).toMatchObject({ status: 'finished', currentIndex: 3 })
  })
})

describe('canlı jüri: sıralama ve açılış', () => {
  const scores = [
    { team: 10, judge: 7, total: 80 }, { team: 10, judge: 8, total: 90 },
    { team: 11, judge: 7, total: 85 }, { team: 11, judge: 8, total: 85 },
    { team: 12, judge: 7, total: 60 }, { team: 12, judge: 9, total: 100 }, // 9 bu takımla çatışmalı → sayılmaz
    { team: 13, judge: 7, total: 99 }, // oturum sırasında olmayan takım
    { team: 10, judge: 42, total: 0 }, // jüriden çıkarılmış
  ]
  const ranking = buildRanking(['10', '11', '12', '14'], ['7', '8', '9'], scores, { 12: ['9'] })

  it('ortalama, eşitlik aynı sıra, oysuz takım sonda', () => {
    expect(ranking.map((r) => [r.team, r.rank, r.average, r.judges])).toEqual([
      ['10', 1, 85, 2], ['11', 1, 85, 2], ['12', 3, 60, 1], ['14', 4, 0, 0],
    ])
    expect(ranking[0].perJudge).toEqual({ 7: 80, 8: 90 })
  })

  it('canlı oturumda yalnız takım açıldıktan sonraki oylar sayılır (sıfırlama sonrası eski oy sızmaz)', () => {
    const opened = { 10: '2026-10-20T10:00:00.000Z', 11: '2026-10-20T10:05:00.000Z' }
    const rows = [
      { team: 10, judge: 7, total: 50, updatedAt: '2026-10-20T10:01:00.000Z' },
      { team: 11, judge: 7, total: 99, updatedAt: '2026-10-20T09:00:00.000Z' }, // sıfırlamadan önceki oy
      { team: 12, judge: 7, total: 80, updatedAt: '2026-10-20T10:09:00.000Z' }, // hiç açılmamış takım
    ]
    const r = buildRanking(['10', '11', '12'], ['7'], rows, {}, opened)
    expect(r.map((x) => [x.team, x.judges])).toEqual([['10', 1], ['11', 0], ['12', 0]])
  })

  it('adım adım: ödüllü sıralar sondan başa, açılmamış sıra listede yok', () => {
    expect(stepwiseCount(ranking, 0)).toBe(3)
    expect(stepwiseCount(ranking, 2)).toBe(2)
    expect(revealedRows(ranking, 'stepwise', 0, 3)).toEqual([])
    expect(revealedRows(ranking, 'stepwise', 1, 3).map((r) => r.team)).toEqual(['12'])
    expect(revealedRows(ranking, 'stepwise', 3, 3).map((r) => r.team)).toEqual(['12', '11', '10'])
    expect(revealedRows(ranking, 'stepwise', 9, 3)).toHaveLength(3)
  })

  it('diğer biçimler ve etkinliğe yazılan gösterim', () => {
    expect(revealedRows(ranking, 'first', 0, 3).map((r) => r.team)).toEqual(['10', '11'])
    expect(revealedRows(ranking, 'top3', 0, 3)).toHaveLength(3)
    expect(revealedRows(ranking, 'full', 0, 3)).toHaveLength(4)
    expect(resultsDisplayFor('stepwise')).toBe('top3')
    expect(resultsDisplayFor('full')).toBe('full')
  })

  it('koleksiyon yalnız yöneticiye açık, etkinlik silinince temizlenir', () => {
    const access = JurySessions.access!
    for (const op of ['read', 'create', 'update', 'delete'] as const) {
      expect((access[op] as (a: unknown) => unknown)({ req: { user: null } })).toBeFalsy()
    }
    expect(EVENT_LINKS.map((l) => l.collection)).toContain('jury-sessions')
  })
})
