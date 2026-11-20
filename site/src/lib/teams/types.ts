/**
 * Etkinlik takım modu — herkese açık takım verisi (sözleşme; backend bu biçimde döndürür).
 */
export type TeamPublic = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  coverUrl: string | null;
  memberCount: number;
  maxMembers: number;
  members: Array<{ name: string; role: 'captain' | 'member'; avatarUrl?: string | null }>;
  manifesto: string;
  /** approved = başvuran (sitede "Başvuran takımlar"), accepted = kabul edilen ("Kabul edilen takımlar"). */
  status: 'pending' | 'approved' | 'accepted' | 'rejected';
  /** Onaylı/kabul edilmiş, dolmamış ve teslim etmemiş: takımı olmayanlar katılma isteği gönderebilir. */
  seeking?: boolean;
  /** Kaptan iletişim adresi bırakmış mı (değer yalnız giriş yapmış katılımcıya verilir). */
  hasContact?: boolean;
  /** Takım sayfası tasarımı (doğrulanmamış; validateDesign ile okunur). Yalnız etkinlik listesinde, istenirse. */
  design?: unknown;
};

/**
 * Etkinlik sayfası bölümleri: kabul edilenler ayrı listelenir, başvuranlar listesinde tekrar çıkmaz.
 * CMS reddedilen/onaysız takımı zaten göndermez; yine de yalnız bu iki durum gösterilir.
 */
export function splitEventTeams(teams: TeamPublic[]): { accepted: TeamPublic[]; applied: TeamPublic[] } {
  return {
    accepted: teams.filter((team) => team.status === 'accepted'),
    applied: teams.filter((team) => team.status === 'approved'),
  };
}

/** "4 kişilik takımlar" (alt ve üst sınır aynıysa) ya da "2–5 kişilik takımlar". */
export function teamSizeLabel(limits: { min: number; max: number }): string {
  return limits.min === limits.max ? `${limits.max} kişilik takımlar` : `${limits.min}–${limits.max} kişilik takımlar`;
}
