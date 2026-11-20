export type ApplicationKind = 'members' | 'core-team'
export type ApplicationDecision = 'accepted' | 'rejected'
export type ApplicationTab = 'all' | ApplicationDecision

export type Application = {
  id: number; fullName: string; email?: string; phone?: string; department?: string;
  year?: string | number; grade?: string | number; area?: string; status: string
}

export function applicationCollection(kind: ApplicationKind): string {
  return kind === 'members' ? 'member-applications' : 'core-team-applications'
}

export function applicationStatus(kind: ApplicationKind, decision: ApplicationDecision): string {
  return decision === 'rejected' ? 'rejected' : kind === 'members' ? 'approved' : 'accepted'
}

export function applicationMatches(application: Application, kind: ApplicationKind, tab: ApplicationTab): boolean {
  return tab === 'all' || application.status === applicationStatus(kind, tab)
}

export function applicationValues(application: Application, kind: ApplicationKind): Record<string, string> {
  const name = application.fullName || ''
  return {
    adSoyad: name, ad: name.trim().split(/\s+/)[0] || '', bolum: application.department || '',
    sinif: String((kind === 'members' ? application.year : application.grade) ?? ''),
    alan: kind === 'core-team' ? application.area || '' : '',
  }
}
