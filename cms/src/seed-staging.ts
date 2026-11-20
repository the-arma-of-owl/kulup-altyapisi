import { assertStagingTarget, peopleSeedBlockers } from './seed/stagingGuard'
import { buildStagingSeed } from './seed/stagingData'

// Kullanım: BYT_STAGING=1 STAGING_DATABASE_HOSTS=<host> ile --yes-staging --db-host=<host> verin.
// Supabase için ayrıca STAGING_DATABASE_PROJECTS=<ref> ve --db-project=<ref> verin.
assertStagingTarget(process.env, process.argv)
// CMS yapılandırması Postgres bağdaştırıcısını yalnız production modunda seçer.
if (process.env.NODE_ENV !== 'production') {
  throw new Error('Staging Postgres hedefi için NODE_ENV=production gerekli')
}

async function main(): Promise<void> {
  // Config yalnız guard geçtikten sonra yüklenir.
  const [{ getPayload }, { default: config }] = await Promise.all([
    import('payload'), import('./payload.config'),
  ])
  const payload = await getPayload({ config })
  const existing = await payload.find({
    collection: 'events', where: { title: { like: '[STAGING]' } }, limit: 1, depth: 0,
  })
  if (existing.totalDocs > 0) {
    console.log('Staging verisi zaten seed\'lenmiş; işlem atlandı.')
    return
  }

  // Events.image zorunludur. Var olan medyadan birini kullan; yoksa hiçbir kayıt oluşturma.
  const media = await payload.find({ collection: 'media', limit: 1, depth: 0 })
  const image = media.docs[0]?.id
  if (!image) throw new Error('Staging etkinlikleri için mevcut medya kaydı gerekli')

  const seed = buildStagingSeed()
  const eventIds = new Map<(typeof seed.events)[number]['key'], number>()
  for (const { key, ...event } of seed.events) {
    // Test modu kayıt hook'unda isTest açar; tamamlanmış canlı etkinlik diğer aktif etkinliklere dokunmaz.
    const created = await payload.create({
      collection: 'events', data: { ...event, mode: 'live', status: 'completed', registrationStage: 'closed', image },
      overrideAccess: true,
    })
    eventIds.set(key, created.id)
  }

  for (const template of seed.emailTemplates) {
    const found = await payload.find({
      collection: 'email-templates', where: { purpose: { equals: template.purpose } }, limit: 1, depth: 0,
    })
    if (found.totalDocs === 0) {
      await payload.create({ collection: 'email-templates', data: template, overrideAccess: true })
    }
  }
  for (const { purpose: _purpose, ...template } of seed.whatsAppTemplates) {
    const found = await payload.find({
      collection: 'whatsapp-templates', where: { name: { equals: template.name } }, limit: 1, depth: 0,
    })
    if (found.totalDocs === 0) {
      await payload.create({ collection: 'whatsapp-templates', data: template, overrideAccess: true })
    }
  }

  const blockers = peopleSeedBlockers(process.env)
  if (blockers.length > 0) {
    console.log(`Kişi verisi atlandı: ${blockers.join(', ')}`)
    return
  }

  for (const { event, ...registration } of seed.registrations) {
    const eventId = eventIds.get(event)
    if (eventId === undefined) throw new Error('Staging kayıt etkinliği bulunamadı')
    await payload.create({
      collection: 'event-registrations', data: { ...registration, event: eventId }, overrideAccess: true,
    })
  }
  for (const application of seed.memberApplications) {
    await payload.create({ collection: 'member-applications', data: application, overrideAccess: true })
  }
  for (const application of seed.coreTeamApplications) {
    await payload.create({ collection: 'core-team-applications', data: application, overrideAccess: true })
  }
  console.log('Etkinlikler, şablonlar, kayıtlar ve başvurular oluşturuldu.')
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Staging seed başarısız')
  process.exitCode = 1
})
