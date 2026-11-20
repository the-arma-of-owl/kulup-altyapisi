/* eslint-disable @next/next/no-img-element -- ödül görselleri CMS/CDN adresinden gelir */
/**
 * Etkinlik detayının sağ sütunu: detay kartı (+ kayıt düğmesi), ödüller ve takımlar.
 * Kalın kenarlı kartlar, sert gölge; başlık renkli şerit.
 */
import type { ReactNode } from 'react';
import { ArrowUpRight, Calendar, Clock, ExternalLink, MapPin, Users, UsersRound } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { teamSizeLabel, type TeamPublic } from '@/lib/teams/types';
import { TeamLogo } from '@/components/teams/parts';
import { PrizeIcon } from './EventPrizes';
import { medalTone, normalizePrizes, type Prize } from './prizeStyles';

const TZ = 'Europe/Istanbul';
const SIDEBAR_TEAM_LIMIT = 8;

export function SidebarCard({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="kart overflow-hidden">
      <h2 className="border-b-2 border-kenar bg-zemin-2 px-6 py-3.5 font-display text-lg font-extrabold tracking-tight text-murekkep">{title}</h2>
      <div className="p-6">{children}</div>
    </section>
  );
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-kenar bg-ana-acik text-ana-yazi">{icon}</span>
      <div className="min-w-0">
        <p className="font-display text-[11px] font-extrabold uppercase tracking-[0.15em] text-soluk">{label}</p>
        <div className="mt-0.5 break-words text-sm font-bold text-murekkep">{children}</div>
      </div>
    </div>
  );
}

function formatDay(value: string) {
  return new Date(value).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long', timeZone: TZ });
}

function formatTime(value: string) {
  const time = new Date(value).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  return time === '00:00' ? null : time;
}

export type SidebarAction =
  | { kind: 'anchor'; href: string; label: string }
  | { kind: 'external'; href: string; label: string }
  | { kind: 'disabled'; label: string };

export function EventDetailsCard({
  event,
  action,
  teamLimits,
}: {
  event: { id: string | number; date?: string; endDate?: string; location?: string; locationLink?: string; capacity?: number | null };
  action: SidebarAction;
  teamLimits?: { min: number; max: number } | null;
}) {
  const startTime = event.date ? formatTime(event.date) : null;
  const endTime = event.endDate ? formatTime(event.endDate) : null;
  const sameDay =
    event.date && event.endDate && new Date(event.date).toLocaleDateString('tr-TR', { timeZone: TZ }) === new Date(event.endDate).toLocaleDateString('tr-TR', { timeZone: TZ });

  return (
    <SidebarCard title="Etkinlik Detayları">
      <div className="space-y-4">
        {event.date && (
          <Row icon={<Calendar className="h-4 w-4" />} label="Tarih">
            {formatDay(event.date)}
            {startTime && <span className="block font-semibold text-soluk">{startTime}{sameDay && endTime ? ` – ${endTime}` : ''}</span>}
          </Row>
        )}
        {event.endDate && !sameDay && (
          <Row icon={<Clock className="h-4 w-4" />} label="Bitiş">
            {formatDay(event.endDate)}
            {endTime && <span className="block font-semibold text-soluk">{endTime}</span>}
          </Row>
        )}
        {event.location && (
          <Row icon={<MapPin className="h-4 w-4" />} label="Konum">
            {event.locationLink ? (
              <a href={event.locationLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 decoration-2 underline-offset-2 hover:text-ana-yazi hover:underline">
                {event.location} <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            ) : (
              event.location
            )}
          </Row>
        )}
        {teamLimits && (
          <Row icon={<UsersRound className="h-4 w-4" />} label="Takım">
            {teamSizeLabel(teamLimits)}
          </Row>
        )}
        {event.capacity && (
          <Row icon={<Users className="h-4 w-4" />} label="Kontenjan">
            {event.capacity} kişi
          </Row>
        )}
      </div>

      <div className="mt-6 border-t-2 border-dashed border-kenar/25 pt-6">
        {action.kind === 'disabled' ? (
          <span className="block w-full rounded-full border border-dashed border-kenar/50 bg-zemin-2 py-3 text-center font-display text-sm font-bold text-soluk">
            {action.label}
          </span>
        ) : action.kind === 'external' ? (
          <a
            href={action.href}
            target="_blank"
            rel="noopener noreferrer"
            data-track-cta="harici-kayit"
            data-entity-type="event"
            data-entity-id={event.id}
            className="dugme dugme-ana dugme-buyuk w-full"
          >
            {action.label} <ArrowUpRight className="h-4 w-4" aria-hidden />
          </a>
        ) : (
          <a
            href={action.href}
            className="dugme dugme-ana dugme-buyuk w-full"
          >
            {action.label}
          </a>
        )}
      </div>
    </SidebarCard>
  );
}

function prizeImage(url: string | undefined): string | null {
  if (!url) return null;
  return /^https:\/\//.test(url) || /^\/(?!\/)/.test(url) ? url : null;
}

export function SidebarPrizes({ prizes, heading }: { prizes: Prize[]; heading: string }) {
  const list = normalizePrizes(prizes);
  if (list.length === 0) return null;
  return (
    <SidebarCard title={heading}>
      <ol className="space-y-3">
        {list.map((p) => {
          const tone = medalTone(p.rank);
          const image = prizeImage(p.imageUrl);
          return (
            <li key={`${p.rank}-${p.title}`} className={`flex items-start gap-3 rounded-2xl p-3 shadow-sert-sm ${tone.card}`}>
              {image ? (
                <span className="relative shrink-0">
                  <img src={image} alt={p.imageAlt || p.title} loading="lazy" decoding="async"
                    className="h-16 w-16 rounded-xl border border-kenar bg-white object-cover" />
                  <span className={`absolute -bottom-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full ${tone.medal}`}>
                    <PrizeIcon rank={p.rank} className="h-3.5 w-3.5" />
                  </span>
                </span>
              ) : (
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone.medal}`}>
                  <PrizeIcon rank={p.rank} className="h-5 w-5" />
                </span>
              )}
              <div className="min-w-0">
                <p className={`font-display text-[11px] font-extrabold uppercase tracking-[0.15em] ${tone.accent}`}>{tone.label}</p>
                <p className="break-words font-display font-extrabold leading-tight">{p.title}</p>
                {p.description && <p className="mt-1 text-xs leading-relaxed opacity-80">{p.description}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </SidebarCard>
  );
}

export function SidebarTeams({ accepted, applied, eventSlug }: { accepted: TeamPublic[]; applied: TeamPublic[]; eventSlug: string }) {
  const all = [...accepted, ...applied];
  const shown = all.slice(0, SIDEBAR_TEAM_LIMIT);
  return (
    <SidebarCard title={`Takımlar${all.length ? ` (${all.length})` : ''}`}>
      {all.length === 0 ? (
        <p className="text-sm font-semibold text-soluk">Henüz yayımlanan takım yok.</p>
      ) : (
        <>
          <ul className="space-y-1">
            {shown.map((team) => (
              <li key={team.id}>
                <Link
                  href={`/etkinlikler/${eventSlug}/takimlar/${team.slug}`}
                  className="group -mx-2 flex items-center gap-3 rounded-2xl border border-transparent px-2 py-2 transition-colors hover:border-kenar hover:bg-zemin-2"
                >
                  <TeamLogo name={team.name} url={team.logoUrl} size={36} className="border border-kenar" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-sm font-extrabold text-murekkep">{team.name}</p>
                    <p className="text-xs font-semibold text-soluk">
                      {team.memberCount}/{team.maxMembers} kişi
                      {team.status === 'accepted' ? <span className="font-bold text-murekkep"> · <span className="rounded-full bg-nane px-1.5 text-murekkep">kabul edildi</span></span> : null}
                      {team.seeking ? <span className="font-bold text-ana-yazi"> · üye arıyor</span> : null}
                    </p>
                  </div>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-soluk transition-transform group-hover:text-murekkep" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          {all.length > shown.length && (
            <a href="#takimlar-baslik" className="dugme dugme-yuzey mt-4 w-full py-2">
              Tüm takımlar ({all.length}) ↓
            </a>
          )}
        </>
      )}
    </SidebarCard>
  );
}
