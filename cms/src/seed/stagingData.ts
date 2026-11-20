import type { CoreTeamApplication, EmailTemplate, Event, EventRegistration, MemberApplication, WhatsappTemplate } from '../payload-types'

export type EventKey = 'etkinlik-1' | 'etkinlik-2'
type EventSeed = Pick<Event, 'title' | 'mode' | 'status' | 'registrationStage' | 'date' | 'location' | 'scannerActive' | 'gateFieldDefinitions'> & { key: EventKey }
type RegistrationSeed = Pick<EventRegistration, 'fullName' | 'email' | 'phone' | 'status' | 'attended' | 'certificateType' | 'kvkkApproved' | 'privacyPolicyApproved'> & { event: EventKey }
type MemberSeed = Pick<MemberApplication, 'fullName' | 'email' | 'phone' | 'status' | 'kvkkApproved' | 'privacyPolicyApproved'>
type CoreSeed = Pick<CoreTeamApplication, 'fullName' | 'email' | 'phone' | 'status' | 'kvkkApproved' | 'privacyPolicyApproved'>
type EmailSeed = Pick<EmailTemplate, 'name' | 'purpose' | 'subject' | 'html' | 'isActive'>
type WhatsAppSeed = Pick<WhatsappTemplate, 'name' | 'message'> & { purpose: EmailTemplate['purpose'] }

const purposes: EmailTemplate['purpose'][] = [
  'event-accepted', 'event-rejected', 'event-waitlist', 'gate-welcome', 'general',
  'member-application-received', 'event-registration-received', 'coreteam-application-received',
]

function person(n: number) {
  const nn = String(n).padStart(2, '0')
  return {
    fullName: `Deneme Kişi ${nn}`,
    email: `kisi${nn}@example.invalid`,
    phone: `+90500000${String(n).padStart(4, '0')}`,
  }
}

export function buildStagingSeed(): {
  events: EventSeed[]
  registrations: RegistrationSeed[]
  memberApplications: MemberSeed[]
  coreTeamApplications: CoreSeed[]
  emailTemplates: EmailSeed[]
  whatsAppTemplates: WhatsAppSeed[]
} {
  return {
    events: [
      { key: 'etkinlik-1', title: '[STAGING] Yazılım Atölyesi', mode: 'test', status: 'active', registrationStage: 'open', date: '2027-01-15T10:00:00.000Z', location: 'Deneme Salonu', scannerActive: true, gateFieldDefinitions: [{ key: 'masa', label: 'Masa numarası', required: true }] },
      { key: 'etkinlik-2', title: '[STAGING] Teknoloji Buluşması', mode: 'test', status: 'completed', registrationStage: 'closed', date: '2027-01-20T10:00:00.000Z', location: 'Deneme Salonu', scannerActive: false, gateFieldDefinitions: [] },
    ],
    registrations: Array.from({ length: 20 }, (_, i): RegistrationSeed => ({
      ...person(i + 1), event: i < 10 ? 'etkinlik-1' : 'etkinlik-2',
      status: (['pending', 'accepted', 'rejected', 'waitlist'] as const)[i % 4],
      attended: i % 5 === 0, certificateType: 'participation',
      kvkkApproved: true, privacyPolicyApproved: true,
    })),
    memberApplications: Array.from({ length: 10 }, (_, i): MemberSeed => ({
      ...person(i + 21), status: (['pending', 'approved', 'rejected'] as const)[i % 3],
      kvkkApproved: true, privacyPolicyApproved: true,
    })),
    coreTeamApplications: Array.from({ length: 10 }, (_, i): CoreSeed => ({
      ...person(i + 31), status: (['new', 'reviewing', 'interview', 'accepted', 'rejected'] as const)[i % 5],
      kvkkApproved: true, privacyPolicyApproved: true,
    })),
    emailTemplates: purposes.map((purpose): EmailSeed => ({
      name: `[STAGING] ${purpose}`, purpose, subject: `[STAGING] ${purpose}`,
      html: '<p>Merhaba {{adSoyad}}, bu bir staging denemesidir.</p>', isActive: false,
    })),
    whatsAppTemplates: purposes.map((purpose): WhatsAppSeed => ({
      purpose, name: `[STAGING] ${purpose}`, message: 'Merhaba {{adSoyad}}, bu bir staging denemesidir.',
    })),
  }
}
