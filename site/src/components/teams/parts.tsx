/* eslint-disable @next/next/no-img-element -- kullanıcı yüklemeleri (R2/CMS) farklı alan adlarından gelebilir */
import { safeMediaUrl } from '@/lib/teams/design';

const AVATAR_COLORS = ['#7c3aed', '#be185d', '#047857', '#7c3aed', '#b45309', '#0e7490', '#b91c1c', '#4338ca'];

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const s = (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '');
  return (s || '?').toLocaleUpperCase('tr-TR');
}

function colorFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function MemberAvatar({ name, url, size = 36, ring }: { name: string; url?: string | null; size?: number; ring?: string }) {
  const safe = safeMediaUrl(url, { allowBlob: true });
  const style = { width: size, height: size, boxShadow: ring ? `0 0 0 2px ${ring}` : undefined };
  if (safe) {
    return <img src={safe} alt="" loading="lazy" decoding="async" className="shrink-0 rounded-full object-cover" style={style} />;
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 select-none items-center justify-center rounded-full font-black text-white"
      style={{ ...style, background: colorFor(name), fontSize: Math.round(size * 0.38) }}
    >
      {initials(name)}
    </span>
  );
}

/** Takım logosu; yoksa baş harfli renkli kare. */
export function TeamLogo({ name, url, size, className = '', style }: { name: string; url: string | null; size: number; className?: string; style?: React.CSSProperties }) {
  const safe = safeMediaUrl(url, { allowBlob: true });
  const base = `shrink-0 overflow-hidden rounded-2xl ${className}`;
  if (safe) {
    return <img src={safe} alt={`${name} logosu`} className={`${base} bg-white object-cover`} style={{ width: size, height: size, ...style }} />;
  }
  return (
    <span
      role="img"
      aria-label={`${name} logosu`}
      className={`${base} inline-flex items-center justify-center font-black text-white`}
      style={{ width: size, height: size, background: colorFor(name), fontSize: Math.round(size * 0.36), ...style }}
    >
      {initials(name)}
    </span>
  );
}
