'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  ExternalLink,
  Gavel,
  Loader2,
  PencilLine,
  ShieldAlert,
} from 'lucide-react';
import { type Criterion, isCompleteScoreCard, scoreError, weightedTotal } from '@/lib/jury/score';
import { safeExternalUrl } from '@/lib/jury/safeUrl';

export type JurySubmission = {
  id: string;
  teamName: string;
  title: string;
  summary: string;
  links: Array<{ label: string; url: string }>;
  myScores?: Record<string, number>;
  myComment?: string;
  conflict?: boolean;
};

type Card = { scores: Record<string, number>; comment: string };
type SaveState = { state: 'saving' } | { state: 'saved'; at: string } | { state: 'error'; message: string };

const COMMENT_MAX = 1000;

function cardFrom(sub: JurySubmission): Card {
  // Kayıtlı yorum geri yüklenir (yoksa puan yeniden kaydedilince eski yorum boşla ezilirdi)
  return { scores: { ...(sub.myScores ?? {}) }, comment: sub.myComment ?? '' };
}

function sameCard(a: Card, b: Card, criteria: Criterion[]): boolean {
  if (a.comment.trim() !== b.comment.trim()) return false;
  return criteria.every((c) => a.scores[c.id] === b.scores[c.id]);
}

function stepFor(c: Criterion): number {
  return c.max <= 10 ? 0.5 : 1;
}

function safeTotal(scores: Record<string, number>, criteria: Criterion[]): number | null {
  try {
    const t = weightedTotal(scores, criteria);
    return Number.isNaN(t) ? null : t;
  } catch {
    return null;
  }
}

/**
 * Jüri puanlama paneli. Taslaklar bellekte tutulur (teslimler arasında geçişte kaybolmaz);
 * kaydedilmemiş taslak varken sayfadan çıkış (sekme kapatma / site içi bağlantı) onay ister.
 */
export default function JuryPanel({
  event,
  submissions,
  onScore,
}: {
  event: { title: string; criteria: Criterion[] };
  submissions: JurySubmission[];
  onScore(submissionId: string, scores: Record<string, number>, comment?: string): Promise<void>;
}) {
  const criteria = event.criteria;
  const [activeId, setActiveId] = useState<string | null>(submissions[0]?.id ?? null);
  const [drafts, setDrafts] = useState<Record<string, Card>>({});
  const [baseline, setBaseline] = useState<Record<string, Card>>({});
  const [status, setStatus] = useState<Record<string, SaveState>>({});

  const baseOf = (s: JurySubmission) => baseline[s.id] ?? cardFrom(s);
  const draftOf = (s: JurySubmission) => drafts[s.id] ?? baseOf(s);
  const isDirty = (s: JurySubmission) => !s.conflict && !sameCard(draftOf(s), baseOf(s), criteria);

  const dirtyIds = useMemo(
    () =>
      submissions
        .filter((s) => !s.conflict && drafts[s.id] && !sameCard(drafts[s.id], baseline[s.id] ?? cardFrom(s), criteria))
        .map((s) => s.id),
    [submissions, drafts, baseline, criteria],
  );
  const anyDirty = dirtyIds.length > 0;

  // Kaydedilmemiş taslak varken çıkış uyarısı: sekme kapatma/yenileme + site içi bağlantılar.
  useEffect(() => {
    if (!anyDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (!window.confirm('Kaydedilmemiş puan taslağın var. Sayfadan çıkarsan kaybolacak. Devam edilsin mi?')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [anyDirty]);

  const activeIndex = Math.max(0, submissions.findIndex((s) => s.id === activeId));
  const active = submissions[activeIndex];
  const eligible = submissions.filter((s) => !s.conflict);
  const scoredCount = eligible.filter((s) => isCompleteScoreCard(baseOf(s).scores, criteria)).length;

  const setScore = (sub: JurySubmission, criterionId: string, value: number | undefined) => {
    setDrafts((prev) => {
      const cur = prev[sub.id] ?? baseline[sub.id] ?? cardFrom(sub);
      const scores = { ...cur.scores };
      if (value === undefined) delete scores[criterionId];
      else scores[criterionId] = value;
      return { ...prev, [sub.id]: { ...cur, scores } };
    });
    setStatus((prev) => {
      if (prev[sub.id]?.state !== 'error') return prev;
      const next = { ...prev };
      delete next[sub.id];
      return next;
    });
  };
  const setComment = (sub: JurySubmission, comment: string) => {
    setDrafts((prev) => {
      const cur = prev[sub.id] ?? baseline[sub.id] ?? cardFrom(sub);
      return { ...prev, [sub.id]: { ...cur, comment: comment.slice(0, COMMENT_MAX) } };
    });
  };

  const save = async (sub: JurySubmission) => {
    const card = draftOf(sub);
    if (sub.conflict || status[sub.id]?.state === 'saving') return;
    setStatus((p) => ({ ...p, [sub.id]: { state: 'saving' } }));
    try {
      const scores: Record<string, number> = {};
      for (const c of criteria) scores[c.id] = card.scores[c.id];
      const comment = card.comment.trim();
      await onScore(sub.id, scores, comment === '' ? undefined : comment);
      setBaseline((p) => ({ ...p, [sub.id]: { scores, comment: card.comment } }));
      setDrafts((p) => ({ ...p, [sub.id]: { scores, comment: card.comment } }));
      const at = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      setStatus((p) => ({ ...p, [sub.id]: { state: 'saved', at } }));
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : 'Kaydedilemedi. Tekrar dene.';
      setStatus((p) => ({ ...p, [sub.id]: { state: 'error', message } }));
    }
  };

  if (submissions.length === 0 || !active) {
    return (
      <div className="kart border-dashed px-6 py-12 text-center font-display text-base font-bold text-soluk">
        Puanlanacak teslim yok.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <span className="ust-baslik inline-flex items-center gap-1.5">
            <Gavel className="h-3.5 w-3.5" aria-hidden /> Jüri paneli
          </span>
          <h2 className="mt-1 break-words font-display text-2xl font-extrabold leading-tight tracking-tight text-murekkep sm:text-3xl">
            {event.title}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {anyDirty && (
            <span className="rozet bg-seftali py-1">
              <PencilLine className="h-3.5 w-3.5" aria-hidden /> {dirtyIds.length} taslak kaydedilmedi
            </span>
          )}
          <span className="rozet bg-limon py-1 font-mono">
            {scoredCount}/{eligible.length} puanlandı
          </span>
        </div>
      </header>
      {criteria.length === 0 && (
        <p role="status" className="mb-4 rounded-2xl border border-kenar bg-limon px-4 py-3 text-sm font-semibold text-murekkep shadow-sert-sm">
          Etkinlikte puanlama kriteri tanımlı değil; yönetim kriterleri ekleyince puanlama açılır.
        </p>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Teslim listesi: mobilde yatay kaydırma, masaüstünde dikey kenar çubuğu */}
        <nav aria-label="Teslimler" className="-mx-4 min-w-0 px-4 sm:mx-0 sm:px-0">
          <ul className="flex snap-x gap-2.5 overflow-x-auto pb-2 pr-1 pt-0.5 hide-scrollbar lg:max-h-[70vh] lg:flex-col lg:overflow-y-auto lg:overflow-x-visible lg:pb-1.5 lg:pr-1.5">
            {submissions.map((s, i) => {
              const base = baseOf(s);
              const dirty = isDirty(s);
              const done = isCompleteScoreCard(base.scores, criteria);
              const selected = s.id === active.id;
              return (
                <li key={s.id} className="w-[220px] shrink-0 snap-start lg:w-auto">
                  <button
                    type="button"
                    onClick={() => setActiveId(s.id)}
                    aria-current={selected ? 'true' : undefined}
                    className={`flex w-full items-start gap-3 rounded-2xl border border-kenar px-3.5 py-3 text-left transition-[transform,box-shadow,background-color] duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ana/40 ${
                      selected
                        ? 'bg-limon text-murekkep shadow-sert-sm'
                        : 'bg-yuzey text-murekkep hover:shadow-sert-sm'
                    }`}
                  >
                    <span className="mt-0.5 font-mono text-[11px] font-bold opacity-60">{String(i + 1).padStart(2, '0')}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-sm font-extrabold">{s.teamName}</span>
                      <span className="block truncate text-xs opacity-70">{s.title}</span>
                    </span>
                    <StatusDot conflict={!!s.conflict} dirty={dirty} done={done} />
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <SubmissionCard
          key={active.id}
          sub={active}
          criteria={criteria}
          card={draftOf(active)}
          dirty={isDirty(active)}
          saved={isCompleteScoreCard(baseOf(active).scores, criteria)}
          status={status[active.id]}
          index={activeIndex}
          total={submissions.length}
          onScore={(cid, v) => setScore(active, cid, v)}
          onComment={(t) => setComment(active, t)}
          onSave={() => save(active)}
          onPrev={() => setActiveId(submissions[Math.max(0, activeIndex - 1)].id)}
          onNext={() => setActiveId(submissions[Math.min(submissions.length - 1, activeIndex + 1)].id)}
        />
      </div>
    </div>
  );
}

function StatusDot({ conflict, dirty, done }: { conflict: boolean; dirty: boolean; done: boolean }) {
  if (conflict)
    return (
      <span title="Kendi takımın — puanlanamaz" className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-kenar bg-pembe text-murekkep">
        <ShieldAlert className="h-3.5 w-3.5" aria-label="Kendi takımın" />
      </span>
    );
  if (dirty)
    return (
      <span title="Kaydedilmemiş taslak" className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-kenar bg-seftali text-murekkep">
        <PencilLine className="h-3.5 w-3.5" aria-label="Taslak" />
      </span>
    );
  if (done)
    return (
      <span title="Puanlandı" className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-kenar bg-nane text-murekkep">
        <CheckCircle2 className="h-3.5 w-3.5" aria-label="Puanlandı" />
      </span>
    );
  return (
    <span title="Bekliyor" className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-dashed border-kenar/40 bg-yuzey text-soluk">
      <CircleDashed className="h-3.5 w-3.5" aria-label="Bekliyor" />
    </span>
  );
}

function SubmissionCard({
  sub,
  criteria,
  card,
  dirty,
  saved,
  status,
  index,
  total,
  onScore,
  onComment,
  onSave,
  onPrev,
  onNext,
}: {
  sub: JurySubmission;
  criteria: Criterion[];
  card: Card;
  dirty: boolean;
  saved: boolean;
  status?: SaveState;
  index: number;
  total: number;
  onScore(criterionId: string, value: number | undefined): void;
  onComment(text: string): void;
  onSave(): void;
  onPrev(): void;
  onNext(): void;
}) {
  const conflict = !!sub.conflict;
  const links = sub.links
    .map((l) => ({ label: l.label?.trim() || 'Bağlantı', href: safeExternalUrl(l.url) }))
    .filter((l): l is { label: string; href: string } => l.href !== null);
  const hiddenLinks = sub.links.length - links.length;
  const weightSum = criteria.reduce((a, c) => a + c.weight, 0) || 1;
  const errors = criteria.map((c) => scoreError(card.scores[c.id], c));
  const hasError = errors.some(Boolean);
  const filled = criteria.filter((c) => typeof card.scores[c.id] === 'number').length;
  const total100 = hasError ? null : safeTotal(card.scores, criteria);
  const saving = status?.state === 'saving';
  const canSave = !conflict && !saving && !hasError && filled === criteria.length && (dirty || !saved);

  let statusText: React.ReactNode = null;
  if (conflict) statusText = null;
  else if (saving)
    statusText = (
      <span className="inline-flex items-center gap-1.5 text-soluk">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Kaydediliyor…
      </span>
    );
  else if (status?.state === 'error')
    statusText = (
      <span className="inline-flex items-center gap-1.5 text-hata">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> {status.message}
      </span>
    );
  else if (dirty)
    statusText = (
      <span className="inline-flex items-center gap-1.5 text-murekkep">
        <PencilLine className="h-3.5 w-3.5" aria-hidden /> Kaydedilmemiş değişiklik
      </span>
    );
  else if (saved)
    statusText = (
      <span className="inline-flex items-center gap-1.5 text-murekkep">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Kaydedildi{status?.state === 'saved' && status.at ? ` · ${status.at}` : ''}
      </span>
    );
  else statusText = <span className="text-soluk">Henüz puanlanmadı</span>;

  return (
    <article
      aria-labelledby={`sub-${sub.id}-title`}
      className="kart min-w-0 overflow-clip"
    >
      <div className="space-y-4 p-5 sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="ust-baslik font-mono !tracking-[0.12em]">
              Teslim {index + 1}/{total} · {sub.teamName}
            </p>
            <h3 id={`sub-${sub.id}-title`} className="mt-1.5 break-words font-display text-2xl font-extrabold leading-tight tracking-tight text-murekkep sm:text-3xl">
              {sub.title}
            </h3>
          </div>
        </div>
        {sub.summary && <p className="whitespace-pre-line break-words text-sm leading-relaxed text-soluk sm:text-base">{sub.summary}</p>}
        {(links.length > 0 || hiddenLinks > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            {links.map((l, i) => (
              <a
                key={`${l.href}-${i}`}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-kenar bg-gok px-3 py-1.5 font-display text-xs font-bold text-murekkep shadow-sert-sm transition-[transform,box-shadow] duration-150 hover:shadow-sert"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{l.label}</span>
              </a>
            ))}
            {hiddenLinks > 0 && (
              <span className="text-xs text-soluk">{hiddenLinks} güvenli olmayan bağlantı gizlendi</span>
            )}
          </div>
        )}
      </div>

      {conflict && (
        <div role="alert" className="mx-5 mb-5 flex items-start gap-3 rounded-2xl border border-kenar bg-seftali p-4 text-sm text-murekkep shadow-sert-sm sm:mx-7">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p>
            <strong className="font-display font-extrabold">Çıkar çatışması:</strong> Bu teslim senin takımına ait. Tarafsızlık için puanlama bu teslimde kapalı.
          </p>
        </div>
      )}

      <fieldset disabled={conflict} className={`border-t-2 border-kenar bg-zemin ${conflict ? 'opacity-50' : ''}`}>
        <legend className="sr-only">Kriter puanları</legend>
        <ul className="divide-y-2 divide-dashed divide-kenar/15">
          {criteria.map((c, i) => {
            const value = card.scores[c.id];
            const has = typeof value === 'number' && Number.isFinite(value);
            const err = errors[i];
            const inputId = `score-${sub.id}-${c.id}`;
            const pct = Math.round((c.weight / weightSum) * 100);
            return (
              <li key={c.id} className="px-5 py-4 sm:px-7">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor={inputId} className="min-w-0">
                    <span className="block break-words font-display text-base font-extrabold text-murekkep">{c.name}</span>
                    <span className="mt-0.5 block font-mono text-[11px] font-bold text-soluk">
                      ağırlık %{pct} · en çok {c.max}
                    </span>
                  </label>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <input
                      id={inputId}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={c.max}
                      step={stepFor(c)}
                      value={has ? value : ''}
                      placeholder="—"
                      aria-invalid={err ? true : undefined}
                      aria-describedby={err ? `${inputId}-err` : undefined}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === '') return onScore(c.id, undefined);
                        const n = Number(raw);
                        if (Number.isFinite(n)) onScore(c.id, n);
                      }}
                      className={`h-12 w-20 rounded-xl border bg-yuzey px-2 text-center font-mono text-lg font-bold tabular-nums text-murekkep outline-none transition-shadow focus:shadow-sert-sm ${
                        err
                          ? 'border-hata ring-2 ring-hata/30'
                          : 'border-kenar'
                      }`}
                    />
                    <span className="font-mono text-xs font-bold text-soluk">/{c.max}</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={c.max}
                  step={stepFor(c)}
                  value={has ? Math.min(Math.max(value, 0), c.max) : 0}
                  aria-label={`${c.name} kaydırıcı`}
                  onChange={(e) => onScore(c.id, Number(e.target.value))}
                  className={`mt-3 h-2 w-full cursor-pointer accent-ana ${has ? '' : 'opacity-40'}`}
                />
                {err && (
                  <p id={`${inputId}-err`} className="mt-1 text-xs font-semibold text-hata">
                    {err}
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        <div className="border-t-2 border-dashed border-kenar/15 px-5 py-4 sm:px-7">
          <label htmlFor={`comment-${sub.id}`} className="etiket">
            Yorum <span className="font-sans text-xs font-normal text-soluk">(isteğe bağlı, takıma gösterilmeyebilir)</span>
          </label>
          <textarea
            id={`comment-${sub.id}`}
            rows={3}
            maxLength={COMMENT_MAX}
            value={card.comment}
            onChange={(e) => onComment(e.target.value)}
            className="girdi resize-y text-sm"
          />
          <p className="mt-1 text-right font-mono text-[11px] text-soluk">
            {card.comment.length}/{COMMENT_MAX}
          </p>
        </div>
      </fieldset>

      {/* Alt çubuk: mobilde ekranın altına yapışık */}
      {/* z-[52]: sitedeki robot tuvalinin (z-50) üstünde, robot sohbetinin (z-55+) altında */}
      <div className="sticky bottom-0 z-[52] border-t-2 border-kenar bg-zemin-2 px-5 py-3.5 sm:px-7">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="min-w-[4.25rem] rounded-2xl border border-kenar bg-limon px-2.5 py-1.5 text-center text-murekkep shadow-sert-sm">
              <p className="font-display text-2xl font-extrabold tabular-nums leading-none">
                {total100 === null ? '—' : total100.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
              </p>
              <p className="mt-0.5 font-mono text-[10px] font-bold opacity-70">/100</p>
            </div>
            <div className="min-w-0 flex-1">
              <div className="h-3 overflow-hidden rounded-full border border-kenar bg-yuzey" aria-hidden>
                <div className="h-full rounded-full bg-ana transition-[width]" style={{ width: `${total100 ?? 0}%` }} />
              </div>
              <p className="mt-1.5 truncate text-xs font-semibold" aria-live="polite">
                {conflict ? (
                  <span className="text-murekkep">Puanlama kapalı</span>
                ) : filled < criteria.length && !saving && status?.state !== 'error' ? (
                  <span className="text-soluk">
                    {filled}/{criteria.length} kriter · ağırlıklı toplam tüm kriterler girilince hesaplanır
                  </span>
                ) : (
                  statusText
                )}
              </p>
            </div>
          </div>
          {/* mobilde soldaki sabit sosyal medya kabarcığının (FloatingSocials) altında kalmasın */}
          <div className="flex w-full items-center gap-2 pl-8 sm:w-auto sm:pl-0">
            <button
              type="button"
              onClick={onPrev}
              disabled={index === 0}
              aria-label="Önceki teslim"
              className="dugme dugme-yuzey h-11 w-11 shrink-0 !p-0 disabled:!opacity-30"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
            {!conflict && (
              <button
                type="button"
                onClick={onSave}
                disabled={!canSave}
                className="dugme dugme-ana h-11 flex-1 px-6 disabled:!opacity-40 sm:flex-none"
              >
                {saving ? 'Kaydediliyor…' : saved && !dirty ? 'Kaydedildi' : 'Puanı kaydet'}
              </button>
            )}
            <button
              type="button"
              onClick={onNext}
              disabled={index === total - 1}
              aria-label="Sonraki teslim"
              className="dugme dugme-yuzey ml-auto h-11 w-11 shrink-0 !p-0 disabled:!opacity-30 sm:ml-0"
            >
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
