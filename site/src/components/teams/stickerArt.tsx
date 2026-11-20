/**
 * Sitenin kendi sticker çizimleri (64×64). Kimlikler lib/teams/design.ts → STICKERS ile birebir.
 * Kullanıcı SVG yükleyemez; yalnız bu set kullanılır.
 */
import type { ReactNode } from 'react';
import { stickerLabel, type StickerId } from '@/lib/teams/design';

const ink = '#1f2937';

const ART: Record<StickerId, ReactNode> = {
  kalp: (
    <>
      <path d="M32 55C11 41 6 29 6 20 6 12 12 6 20 6c6 0 10 4 12 8 2-4 6-8 12-8 8 0 14 6 14 14 0 9-5 21-26 35Z" fill="#ff4d8d" stroke="#c2185b" strokeWidth="2.5" />
    </>
  ),
  yildiz: (
    <>
      <polygon points="32,6 38.5,24.1 57.5,24.6 42.5,36.4 47.7,54.7 32,44 16.3,54.7 21.5,36.4 6.5,24.6 25.5,24.1" fill="#ffc93c" stroke="#d99a00" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="26" cy="30" r="2.2" fill={ink} />
      <circle cx="38" cy="30" r="2.2" fill={ink} />
      <path d="M28 36q4 3 8 0" stroke={ink} strokeWidth="2" fill="none" strokeLinecap="round" />
    </>
  ),
  roket: (
    <g transform="rotate(35 32 32)">
      <path d="M26 46q6 16 12 0Z" fill="#ff9f1c" />
      <path d="M29 46q3 9 6 0Z" fill="#ffe066" />
      <path d="M22 32 13 45h9ZM42 32l9 13h-9Z" fill="#ef4444" stroke="#b91c1c" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M32 5c10 8 12 22 10 39H22c-2-17 0-31 10-39Z" fill="#eef2f7" stroke="#64748b" strokeWidth="2" />
      <circle cx="32" cy="23" r="5.5" fill="#3aa0ff" stroke="#1d4ed8" strokeWidth="2" />
      <rect x="24" y="42" width="16" height="4" rx="1.5" fill="#64748b" />
    </g>
  ),
  kod: (
    <>
      <rect x="5" y="9" width="54" height="46" rx="10" fill="#1e293b" stroke="#0f172a" strokeWidth="2" />
      <path d="M23 22 13 32l10 10M41 22l10 10-10 10M35 18l-6 28" stroke="#38bdf8" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  bug: (
    <>
      <path d="M20 26 9 20M18 38H6M20 48 9 55M44 26l11-6M46 38h12M44 48l11 7M28 12l-5-7M36 12l5-7" stroke={ink} strokeWidth="2.5" strokeLinecap="round" />
      <ellipse cx="32" cy="39" rx="15" ry="18" fill="#22c55e" stroke="#15803d" strokeWidth="2.5" />
      <circle cx="32" cy="18" r="8" fill="#15803d" />
      <path d="M32 22v34" stroke="#15803d" strokeWidth="2.5" />
      <circle cx="25" cy="34" r="3" fill="#14532d" />
      <circle cx="39" cy="44" r="3" fill="#14532d" />
      <circle cx="28" cy="16" r="1.8" fill="#fff" />
      <circle cx="36" cy="16" r="1.8" fill="#fff" />
    </>
  ),
  kahve: (
    <>
      <path d="M22 6q-3 4 0 8t0 8M31 4q-3 4 0 8t0 8M40 6q-3 4 0 8t0 8" stroke="#94a3b8" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M46 30h4a8 8 0 0 1 0 16h-5" stroke="#b45309" strokeWidth="4" fill="none" />
      <path d="M12 26h36v18a12 12 0 0 1-12 12H24a12 12 0 0 1-12-12Z" fill="#f59e0b" stroke="#b45309" strokeWidth="2.5" />
      <ellipse cx="30" cy="27" rx="17" ry="3.5" fill="#6b3a1f" />
      <path d="M24 40q6 5 12 0" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </>
  ),
  kupa: (
    <>
      <path d="M17 14H9v6a10 10 0 0 0 10 10M47 14h8v6a10 10 0 0 1-10 10" stroke="#d97706" strokeWidth="4" fill="none" />
      <path d="M17 8h30v14a15 15 0 0 1-30 0Z" fill="#fbbf24" stroke="#d97706" strokeWidth="2.5" />
      <rect x="28" y="36" width="8" height="9" fill="#d97706" />
      <rect x="19" y="45" width="26" height="10" rx="2.5" fill="#92400e" />
      <polygon points="32,13 34,18 39,18.5 35,21.5 36.5,26.5 32,23.5 27.5,26.5 29,21.5 25,18.5 30,18" fill="#fff7d6" />
    </>
  ),
  ates: (
    <>
      <path d="M32 59c-14 0-20-10-20-20 0-12 10-16 10-28 8 6 12 12 11 20 4-3 6-8 5-12 8 6 14 14 14 22 0 10-8 18-20 18Z" fill="#f97316" stroke="#c2410c" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M32 58c-7 0-10-5-10-10 0-6 6-9 7-15 5 5 13 8 13 15 0 6-5 10-10 10Z" fill="#fde047" />
    </>
  ),
  robot: (
    <>
      <path d="M32 14V7" stroke="#475569" strokeWidth="3" />
      <circle cx="32" cy="6" r="3.5" fill="#ef4444" />
      <rect x="6" y="28" width="6" height="12" rx="2" fill="#475569" />
      <rect x="52" y="28" width="6" height="12" rx="2" fill="#475569" />
      <rect x="11" y="14" width="42" height="38" rx="10" fill="#60a5fa" stroke="#1d4ed8" strokeWidth="2.5" />
      <rect x="17" y="22" width="30" height="16" rx="6" fill="#0f172a" />
      <circle cx="25" cy="30" r="4" fill="#5eead4" />
      <circle cx="39" cy="30" r="4" fill="#5eead4" />
      <path d="M24 45h16" stroke="#1e3a8a" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  simsek: (
    <polygon points="37,4 13,36 29,36 24,60 51,26 35,26 41,4" fill="#facc15" stroke="#ca8a04" strokeWidth="2.5" strokeLinejoin="round" />
  ),
  isilti: (
    <>
      <path d="M26 6c2 14 6 18 20 20-14 2-18 6-20 20-2-14-6-18-20-20 14-2 18-6 20-20Z" fill="#a78bfa" stroke="#7c3aed" strokeWidth="2" strokeLinejoin="round" />
      <path d="M48 36c1 7 3 9 10 10-7 1-9 3-10 10-1-7-3-9-10-10 7-1 9-3 10-10Z" fill="#f0abfc" stroke="#c026d3" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="50" cy="12" r="3" fill="#fde68a" />
    </>
  ),
  tac: (
    <>
      <path d="M8 46 11 16l13 15 8-20 8 20 13-15 3 30Z" fill="#fbbf24" stroke="#b45309" strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="8" y="45" width="48" height="9" rx="2" fill="#f59e0b" stroke="#b45309" strokeWidth="2.5" />
      <circle cx="20" cy="49.5" r="2.5" fill="#ef4444" />
      <circle cx="32" cy="49.5" r="2.5" fill="#3b82f6" />
      <circle cx="44" cy="49.5" r="2.5" fill="#22c55e" />
    </>
  ),
  oyun: (
    <>
      <path d="M17 18h30a11 11 0 0 1 11 13l-3 15a6 6 0 0 1-10 3l-6-7H25l-6 7a6 6 0 0 1-10-3L6 31a11 11 0 0 1 11-13Z" fill="#8b5cf6" stroke="#5b21b6" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M20 25v12M14 31h12" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
      <circle cx="44" cy="27" r="3" fill="#facc15" />
      <circle cx="50" cy="33" r="3" fill="#f472b6" />
      <circle cx="38" cy="33" r="3" fill="#34d399" />
    </>
  ),
  laptop: (
    <>
      <rect x="11" y="12" width="42" height="30" rx="3" fill="#334155" stroke="#1e293b" strokeWidth="2" />
      <rect x="14.5" y="15.5" width="35" height="23" rx="1.5" fill="#0ea5e9" />
      <path d="M19 21h12M19 26h20M23 31h10" stroke="#e0f2fe" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M4 44h56l-5 8H9Z" fill="#94a3b8" stroke="#475569" strokeWidth="2" strokeLinejoin="round" />
    </>
  ),
  terminal: (
    <>
      <rect x="5" y="9" width="54" height="46" rx="7" fill="#0f172a" stroke="#334155" strokeWidth="2" />
      <path d="M5 19h54" stroke="#334155" strokeWidth="2" />
      <circle cx="12" cy="14" r="2" fill="#f87171" />
      <circle cx="18" cy="14" r="2" fill="#fbbf24" />
      <circle cx="24" cy="14" r="2" fill="#4ade80" />
      <path d="m14 29 8 6-8 6M27 43h14" stroke="#4ade80" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  ampul: (
    <>
      <path d="M32 3v5M8 26h5M51 26h5M15 9l4 4M49 9l-4 4" stroke="#facc15" strokeWidth="3" strokeLinecap="round" />
      <path d="M32 10a16 16 0 0 0-9 29v5h18v-5a16 16 0 0 0-9-29Z" fill="#fde047" stroke="#ca8a04" strokeWidth="2.5" />
      <path d="M28 30q4 5 8 0" stroke="#ca8a04" strokeWidth="2" fill="none" />
      <rect x="23" y="44" width="18" height="10" rx="3" fill="#94a3b8" stroke="#475569" strokeWidth="2" />
      <path d="M24 49h16" stroke="#475569" strokeWidth="2" />
    </>
  ),
  ordek: (
    <>
      <path d="M8 40c0-10 10-12 19-8-3-14 5-22 14-20 9 2 11 13 5 19 10 0 13 8 9 16-4 8-14 10-25 10C17 57 8 51 8 40Z" fill="#facc15" stroke="#ca8a04" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M48 18l11 2-10 5Z" fill="#fb923c" stroke="#c2410c" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="42" cy="19" r="2.8" fill={ink} />
      <path d="M22 40q8 8 18 0" stroke="#ca8a04" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </>
  ),
  pizza: (
    <>
      <path d="M32 59 9 15q23-10 46 0Z" fill="#fcd34d" stroke="#d97706" strokeWidth="2" strokeLinejoin="round" />
      <path d="M9 15q23-10 46 0" stroke="#b45309" strokeWidth="6" fill="none" strokeLinecap="round" />
      <circle cx="26" cy="24" r="4.5" fill="#dc2626" />
      <circle cx="39" cy="27" r="4" fill="#dc2626" />
      <circle cx="31" cy="40" r="4" fill="#dc2626" />
      <circle cx="20" cy="18" r="1.5" fill="#16a34a" />
      <circle cx="37" cy="36" r="1.5" fill="#16a34a" />
    </>
  ),
  git: (
    <>
      <rect x="5" y="5" width="54" height="54" rx="12" fill="#f05133" />
      <path d="M22 16v32M42 26c0 12-20 8-20 18" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="22" cy="16" r="5" fill="#f05133" stroke="#fff" strokeWidth="3.5" />
      <circle cx="22" cy="48" r="5" fill="#f05133" stroke="#fff" strokeWidth="3.5" />
      <circle cx="42" cy="21" r="5" fill="#f05133" stroke="#fff" strokeWidth="3.5" />
    </>
  ),
  gezegen: (
    <g>
      <ellipse cx="32" cy="32" rx="28" ry="8" fill="none" stroke="#f472b6" strokeWidth="4" transform="rotate(-20 32 32)" />
      <circle cx="32" cy="32" r="16" fill="#60a5fa" stroke="#1d4ed8" strokeWidth="2.5" />
      <path d="M21 26q8-4 17 2M22 37q7 3 18-2" stroke="#bfdbfe" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M4 32a28 8 0 0 0 56 0" fill="none" stroke="#f472b6" strokeWidth="4" transform="rotate(-20 32 32)" />
      <circle cx="52" cy="10" r="2.5" fill="#fde68a" />
    </g>
  ),
  disli: (
    <g fill="#64748b" stroke="#334155" strokeWidth="2">
      {[0, 45, 90, 135].map((a) => (
        <rect key={a} x="27" y="4" width="10" height="56" rx="2.5" transform={`rotate(${a} 32 32)`} />
      ))}
      <circle cx="32" cy="32" r="19" />
      <circle cx="32" cy="32" r="7" fill="#e2e8f0" />
    </g>
  ),
  gulucuk: (
    <>
      <circle cx="32" cy="32" r="26" fill="#facc15" stroke="#ca8a04" strokeWidth="2.5" />
      <path d="M20 26q3-5 6 0M38 26q3-5 6 0" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M18 36q14 16 28 0Z" fill={ink} />
      <path d="M24 44q8 5 16 0" fill="#f87171" />
      <circle cx="15" cy="34" r="3.5" fill="#fb7185" opacity=".6" />
      <circle cx="49" cy="34" r="3.5" fill="#fb7185" opacity=".6" />
    </>
  ),
  yuz: (
    <>
      <text x="32" y="40" textAnchor="middle" fontFamily="ui-sans-serif, system-ui, sans-serif" fontWeight="900" fontStyle="italic" fontSize="27" fill="#ef4444" stroke="#991b1b" strokeWidth="1">100</text>
      <path d="M9 47q23-5 46 0M13 53q19-4 38 0" stroke="#ef4444" strokeWidth="3.5" fill="none" strokeLinecap="round" />
    </>
  ),
  gg: (
    <>
      <path d="M10 10h44a6 6 0 0 1 6 6v24a6 6 0 0 1-6 6H28l-12 10v-10h-6a6 6 0 0 1-6-6V16a6 6 0 0 1 6-6Z" fill="#22d3ee" stroke="#0e7490" strokeWidth="2.5" strokeLinejoin="round" />
      <text x="32" y="37" textAnchor="middle" fontFamily="ui-sans-serif, system-ui, sans-serif" fontWeight="900" fontSize="22" fill="#fff" stroke="#0e7490" strokeWidth="1">GG</text>
    </>
  ),
};

/** Sticker çizimi. Beyaz kenarla "çıkartma" görünümü verilir (gölge/parıltı yok). */
export function StickerArt({ id, className, decorative = false }: { id: StickerId; className?: string; decorative?: boolean }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : stickerLabel(id)}
      focusable="false"
      style={{
        overflow: 'visible',
        filter: 'drop-shadow(1.5px 0 0 #fff) drop-shadow(-1.5px 0 0 #fff) drop-shadow(0 1.5px 0 #fff) drop-shadow(0 -1.5px 0 #fff)',
      }}
    >
      {ART[id]}
    </svg>
  );
}
