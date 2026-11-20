/* eslint-disable @next/next/no-img-element -- kullanıcı yüklemeleri farklı alan adlarından gelebilir */
/**
 * Takımın herkese açık sayfası.
 *
 * Yerleşim: üstte sabit 2:1 oranlı "sahne" (kapak + sticker/GIF kolajı; öğeler yüzde ile
 * konumlanır, böylece her genişlikte aynı kompozisyon görünür ve metni asla örtmez),
 * altında başlık ve metin panelleri. Renkler deriveTheme ile okunurluk garantili türetilir.
 * Kapsayıcı sorguları (@container) kullanılır: editörün dar önizlemesinde de doğru dizilir.
 */
import type { CSSProperties, ReactNode } from 'react';
import { Crown, Users } from 'lucide-react';
import type { TeamPublic } from '@/lib/teams/types';
import {
  deriveTheme, patternBackground, readableOn, safeMediaUrl, mixHex,
  type TeamPageDesign, type TeamTheme,
} from '@/lib/teams/design';
import { StickerArt } from './stickerArt';
import { Manifesto } from './Manifesto';
import { MemberAvatar, TeamLogo } from './parts';

export type TeamPageProps = { team: TeamPublic; design: TeamPageDesign };

/** Sahnedeki bir öğenin konum/boyut/dönme stili (yüzde tabanlı). */
export function placedStyle(item: { x: number; y: number; size: number; rotation: number }): CSSProperties {
  return {
    left: `${item.x}%`,
    top: `${item.y}%`,
    width: `${item.size}%`,
    transform: `translate(-50%, -50%) rotate(${item.rotation}deg)`,
  };
}

export function StageItems({ design }: { design: TeamPageDesign }) {
  return (
    <>
      {design.gifs.map((g) => {
        const src = safeMediaUrl(g.url, { allowBlob: true });
        if (!src) return null;
        return (
          <img
            key={g.uid}
            src={src}
            alt={g.alt || 'Takım GIF’i'}
            loading="lazy"
            decoding="async"
            className="pointer-events-none absolute rounded-xl ring-2 ring-white/80"
            style={placedStyle(g)}
          />
        );
      })}
      {design.stickers.map((s) => (
        <div key={s.uid} className="pointer-events-none absolute aspect-square" style={placedStyle(s)}>
          <StickerArt id={s.sticker} className="h-full w-full" />
        </div>
      ))}
    </>
  );
}

export function TeamStage({
  team, design, theme, overlay, className = '',
}: { team: TeamPublic; design: TeamPageDesign; theme: TeamTheme; overlay?: ReactNode; className?: string }) {
  const cover = safeMediaUrl(design.coverUrl ?? team.coverUrl, { allowBlob: true });
  const pattern = patternBackground(design.pattern);
  // Boş sahne (kapak/sticker/GIF yok, editör dışı) ince bir şerit olur; doluyken her genişlikte sabit 2:1
  const empty = !overlay && !cover && design.stickers.length === 0 && design.gifs.length === 0;
  return (
    <div
      className={`relative ${empty ? 'aspect-[4/1] @3xl:aspect-[6/1]' : 'aspect-[2/1]'} w-full overflow-hidden rounded-[22px] ${className}`}
      style={{
        // Düz renk zemin (gradyan ışıma yok); desen seçildiyse üstünde
        backgroundColor: mixHex(theme.bg, theme.accent, 0.35),
        backgroundImage: pattern ?? undefined,
        boxShadow: `inset 0 0 0 1px ${theme.border}`,
      }}
    >
      {cover ? (
        <img src={cover} alt={`${team.name} kapak görseli`} className="absolute inset-0 h-full w-full object-cover" />
      ) : null}
      {overlay ?? <StageItems design={design} />}
    </div>
  );
}

function StatusBadge({ status }: { status: TeamPublic['status'] }) {
  // Durum renkleri sitenin vurgu tokenlarından (nane: kabul, limon: bekliyor, pembe: ret); takım temasından bağımsız
  const renk = status === 'accepted' ? 'bg-nane' : status === 'pending' || status === 'approved' ? 'bg-limon' : 'bg-pembe';
  return (
    <span className={`inline-flex items-center rounded-full border border-kenar px-3 py-0.5 text-xs font-bold text-murekkep ${renk}`}>
      {status === 'accepted' ? 'Kabul edildi' : status === 'approved' ? 'Başvuran takım · sonuç bekleniyor' : status === 'pending' ? 'Onay bekliyor' : 'Reddedildi'}
    </span>
  );
}

export function TeamPageView({ team, design, stageOverlay }: TeamPageProps & { stageOverlay?: ReactNode }) {
  const theme = deriveTheme(design);
  const pattern = patternBackground(design.pattern);
  const manifesto = (design.manifesto ?? team.manifesto ?? '').trim();
  const logo = design.logoUrl ?? team.logoUrl;
  const centered = design.layout === 'merkez';
  const full = team.memberCount >= team.maxMembers;
  const panel: CSSProperties = { background: theme.surface, color: theme.surfaceText, boxShadow: `0 0 0 1px ${theme.border}` };
  const captainBg = theme.surfaceAccent;

  const membersPanel = (
    <section aria-labelledby={`uyeler-${team.id}`} className="rounded-[22px] p-5 @md:p-6" style={panel}>
      <h2 id={`uyeler-${team.id}`} className="mb-4 flex items-center gap-2 font-display text-xs font-extrabold uppercase tracking-[0.2em]" style={{ color: theme.surfaceMuted }}>
        <Users className="h-4 w-4" aria-hidden="true" /> Üyeler
      </h2>
      <ul className={centered ? 'flex flex-wrap justify-center gap-3' : 'space-y-3'}>
        {team.members.map((m, i) => (
          <li
            key={`${m.name}-${i}`}
            className={`flex min-w-0 items-center gap-3 ${centered ? 'rounded-full py-1 pl-1 pr-4' : ''}`}
            style={centered ? { boxShadow: `0 0 0 1px ${theme.border}` } : undefined}
          >
            <MemberAvatar name={m.name} url={m.avatarUrl} size={centered ? 32 : 40} />
            <span className="min-w-0 truncate font-semibold">{m.name}</span>
            {m.role === 'captain' ? (
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider"
                style={{ background: captainBg, color: readableOn(captainBg) }}
              >
                <Crown className="h-3 w-3" aria-hidden="true" /> Kaptan
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <article
      className="@container relative overflow-hidden rounded-[28px] p-3 @md:p-5"
      style={{
        backgroundColor: theme.bg,
        backgroundImage: pattern ?? undefined,
        color: theme.text,
        boxShadow: `0 0 0 1px ${theme.border}`,
      }}
    >
      <TeamStage team={team} design={design} theme={theme} overlay={stageOverlay} />

      <header
        className={`relative flex gap-4 px-2 pb-5 pt-5 @md:px-4 ${centered ? 'flex-col items-center text-center' : 'flex-col @md:flex-row @md:items-end'}`}
      >
        <TeamLogo
          name={team.name}
          url={logo}
          size={88}
          className={centered ? '-mt-16 @md:-mt-20' : '-mt-14 @md:-mt-16'}
          style={{ boxShadow: `0 0 0 4px ${theme.bg}` }}
        />
        <div className="min-w-0 flex-1 space-y-2">
          <h1 className="break-words font-display text-3xl font-extrabold leading-[1.05] tracking-tight @md:text-4xl @3xl:text-5xl">{team.name}</h1>
          <div className={`flex flex-wrap items-center gap-2 ${centered ? 'justify-center' : ''}`}>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-display text-xs font-bold"
              style={{ background: theme.accent, color: theme.onAccent }}
            >
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              {team.memberCount}/{team.maxMembers} kişi{full ? ' · dolu' : ''}
            </span>
            <StatusBadge status={team.status} />
          </div>
        </div>
      </header>

      <div className={centered ? 'mx-auto max-w-2xl space-y-4' : 'grid gap-4 @3xl:grid-cols-[minmax(0,1fr)_300px]'}>
        <section aria-labelledby={`manifesto-${team.id}`} className="rounded-[22px] p-5 @md:p-7" style={panel}>
          <h2 id={`manifesto-${team.id}`} className="mb-3 font-display text-xs font-extrabold uppercase tracking-[0.2em]" style={{ color: theme.surfaceMuted }}>
            Manifesto
          </h2>
          {manifesto ? (
            <Manifesto source={manifesto} linkColor={theme.surfaceAccent} className={centered ? 'text-left' : ''} />
          ) : (
            <p className="italic" style={{ color: theme.surfaceMuted }}>Takım henüz manifestosunu yazmadı.</p>
          )}
        </section>
        {membersPanel}
      </div>
    </article>
  );
}

export function TeamPage({ team, design }: TeamPageProps) {
  return <TeamPageView team={team} design={design} />;
}

export default TeamPage;
