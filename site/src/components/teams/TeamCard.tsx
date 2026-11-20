/**
 * Etkinlik sayfasındaki takım listesi kartı (site temasıyla; açık/koyu).
 */
import { ArrowUpRight, Crown } from 'lucide-react';
import { Link } from '@/i18n/routing';
import type { TeamPublic } from '@/lib/teams/types';
import { manifestoExcerpt } from '@/lib/teams/markdown';
import { MemberAvatar, TeamLogo } from './parts';

const MAX_AVATARS = 5;

export function TeamCard({ team, href }: { team: TeamPublic; href: string }) {
  const full = team.memberCount >= team.maxMembers;
  const pct = team.maxMembers > 0 ? Math.min(100, Math.round((team.memberCount / team.maxMembers) * 100)) : 0;
  const excerpt = manifestoExcerpt(team.manifesto, 140);
  const shown = team.members.slice(0, MAX_AVATARS);
  const extra = Math.max(0, team.memberCount - shown.length);
  const captain = team.members.find((m) => m.role === 'captain');
  const others = team.members.filter((m) => m !== captain).map((m) => m.name);

  return (
    <Link
      href={href}
      className="kart kart-hover group relative flex h-full min-w-0 flex-col gap-4 p-5 text-left [--team-card-ring:var(--k-yuzey)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ana/40"
    >
      <div className="flex items-start gap-4">
        <TeamLogo name={team.name} url={team.logoUrl} size={56} className="border border-kenar shadow-sert-sm" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-xl font-extrabold tracking-tight text-murekkep">{team.name}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span
              className={`rozet ${full ? 'bg-murekkep !text-zemin' : 'bg-ana-acik !text-ana-yazi'}`}
            >
              {team.memberCount}/{team.maxMembers} kişi{full ? ' · dolu' : ''}
            </span>
            {team.seeking ? (
              <span className="rozet bg-nane">Üye arıyor</span>
            ) : null}
            {team.status === 'pending' ? (
              <span className="rozet bg-limon">Onay bekliyor</span>
            ) : null}
          </div>
          <div
            className="mt-2.5 h-2.5 overflow-hidden rounded-full border border-kenar bg-zemin-2"
            role="meter"
            aria-label="Doluluk"
            aria-valuemin={0}
            aria-valuemax={team.maxMembers}
            aria-valuenow={team.memberCount}
          >
            <div className="h-full bg-ana" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-kenar bg-limon text-murekkep transition-transform group-hover:rotate-45" aria-hidden="true"><ArrowUpRight className="h-4 w-4" /></span>
      </div>

      {excerpt ? (
        <p className="line-clamp-3 break-words text-sm leading-relaxed text-soluk">“{excerpt}”</p>
      ) : (
        <p className="text-sm text-soluk/70">Manifesto henüz yazılmadı.</p>
      )}

      <div className="mt-auto flex items-center gap-3 border-t-2 border-dashed border-kenar/25 pt-4">
        <div className="flex -space-x-2" aria-hidden="true">
          {shown.map((m, i) => (
            <MemberAvatar key={`${m.name}-${i}`} name={m.name} url={m.avatarUrl} size={30} ring="var(--team-card-ring)" />
          ))}
          {extra > 0 ? (
            <span className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-full bg-limon text-[11px] font-black text-murekkep ring-2 ring-yuzey">
              +{extra}
            </span>
          ) : null}
        </div>
        <p className="min-w-0 flex-1 truncate text-xs font-semibold text-soluk">
          {captain ? (
            <span className="font-black text-murekkep">
              <Crown className="mr-0.5 inline h-3.5 w-3.5 -translate-y-px text-amber-500" aria-label="Kaptan" />
              {captain.name}
            </span>
          ) : null}
          {captain && others.length ? ', ' : ''}
          {others.join(', ')}
        </p>
      </div>
    </Link>
  );
}

export default TeamCard;
