import express, { type NextFunction, type Request, type Response } from 'express'
import path from 'node:path'
import os from 'node:os'
import { CONFIG, LOCAL_ENV } from './config.js'
import { healthResponse } from './health.js'
import { localRequestGuard } from './localSecurity.js'
import { AuthManager } from './auth.js'
import { parseSessionKey } from './sessionCrypto.js'
import { PayloadClient, PayloadError } from './payload.js'
import { WhatsAppManager } from './whatsapp.js'
import { QueueService } from './queue.js'
import { EventsService } from './events.js'
import { ApplicationsService } from './applications.js'
import { TeamRejectionsService } from './teamRejections.js'
import { FreeSendService, parseRecipientFileRequest } from './freeSend.js'
import { SendHistoryStore } from './sendHistory.js'
import { TemplatesService } from './templates.js'
import { MailService } from './mail.js'
import { safeError } from './log.js'
import { createLogBuffer, installConsoleCapture } from './logBuffer.js'
import { spaFallback } from './spa.js'
import { fillTemplate } from '../shared/templateVars.js'
import { isCertificateType } from '../shared/certificateLayout.js'
import { CertificateStore, CertificateSendService, certificateRecipients, certificateTestHandler } from './certificates.js'
import { Telemetry } from './telemetry.js'

const WORKER_VERSION = '0.3.0'
const logs = createLogBuffer()
installConsoleCapture(logs)

const argument = (name: string): string | undefined => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3)
const userData = argument('user-data-path') || path.join(os.homedir(), '.config', 'Kulüp Worker')
const renderer = argument('renderer-path') || path.resolve(process.cwd(), 'dist')
const localApiToken = process.env[LOCAL_ENV.apiToken] || ''
delete process.env[LOCAL_ENV.apiToken]
const sessionKeyValue = process.env[LOCAL_ENV.sessionKey]
delete process.env[LOCAL_ENV.sessionKey]
const sessionKey = parseSessionKey(sessionKeyValue)
if (!sessionKey) console.warn('[auth] Oturum dosyası şifrelenmeden saklanıyor.')
if (localApiToken.length < 32) {
  throw new Error(`Yerel sunucu ${LOCAL_ENV.apiToken} olmadan başlatılamaz. Kulüp Worker uygulamasını açın.`)
}
const payload = new PayloadClient()
const auth = new AuthManager(userData, payload, sessionKey)
const whatsapp = new WhatsAppManager(userData)
const templates = new TemplatesService(payload)
const mail = new MailService(payload)
const events = new EventsService(payload, templates, mail, userData)
const applications = new ApplicationsService(payload, templates, mail, userData)
const teamRejections = new TeamRejectionsService(payload, templates, mail)
const sendHistory = new SendHistoryStore(userData)
const certificates = new CertificateStore(userData)
const certificateSender = new CertificateSendService(payload, templates, mail, certificates, userData)
const queue = new QueueService(payload, whatsapp, userData)
// Özgür gönderimin WhatsApp mesajları da (kabul kararlarındaki gibi) onaylı sayılır ve otomatik gider
const freeSend = new FreeSendService(payload, mail, sendHistory, (startedAt, wa) => { if (wa) queue.approveCreatedAfter(startedAt) })
// Olaylar CMS üzerinden loglanır (Telegram + gün sonu raporu); oturum yokken kısa kuyrukta bekler.
const telemetry = new Telemetry(payload, () => auth.status().authenticated)
whatsapp.reporter = telemetry.report
queue.reporter = telemetry.report
certificateSender.reporter = telemetry.report
freeSend.reporter = telemetry.report
setInterval(() => { void telemetry.flush() }, 60_000).unref()
process.on('unhandledRejection', (reason) => {
  console.error('[worker] yakalanmamış hata (unhandledRejection):', safeError(reason))
  telemetry.report('worker_error', { path: 'unhandledRejection', message: safeError(reason) },
    { dedupeKey: `unhandled-${safeError(reason).slice(0, 80)}`, dedupeMs: 600_000 })
})
whatsapp.onConnectionChange((connected) => {
  if (connected) queue.markConnected()
  else queue.markDisconnected()
})

const app = express()
app.disable('x-powered-by')
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/') || req.path === '/api/system/logs') { next(); return }
  let errorMessage: string | undefined
  const originalJson = res.json.bind(res)
  res.json = ((body: unknown) => {
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
      errorMessage = body.error
    }
    return originalJson(body)
  }) as Response['json']
  res.on('finish', () => {
    if (res.statusCode < 400) return
    const detail = !res.locals.localSecurityRejected && res.statusCode < 500
      ? `: ${safeError(errorMessage ?? res.statusMessage ?? 'İstek reddedildi.')}` : ''
    logs.push(res.statusCode >= 500 ? 'error' : 'warn',
      [`${req.method} ${req.path} → ${res.statusCode}${detail}`])
  })
  next()
})
app.use(localRequestGuard(CONFIG.serverPort, localApiToken))
app.use((req, res, next) => {
  const emptyLogDelete = req.method === 'DELETE' && req.path === '/api/system/logs' &&
    (!req.headers['content-length'] || req.headers['content-length'] === '0') && !req.headers['transfer-encoding']
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) && req.path.startsWith('/api/') &&
      !emptyLogDelete && !req.is('application/json')) {
    res.status(415).json({ error: 'Yalnızca application/json kabul edilir.' }); return
  }
  next()
})
app.use('/api/certificates/templates/:type', express.json({ limit: '8mb' }))
app.use(express.json({ limit: '4mb' }))
const wrap = (handler: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => { Promise.resolve(handler(req, res)).catch(next) }
const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!auth.status().authenticated) { res.status(401).json({ error: 'Oturum açın.' }); return }
  next()
}
const getEvent = async (id: number) => {
  if (!Number.isInteger(id) || id <= 0) throw new PayloadError('Etkinlik geçersiz.', 400)
  return (await payload.request<import('../shared/types.js').WorkerEvent>(`/events/${id}?depth=0`)).data
}

app.get('/api/health', (_req, res) => { res.json(healthResponse()) })
app.get('/api/auth/status', (_req, res) => { res.json(auth.status()) })
app.post('/api/auth/login', wrap(async (req, res) => {
  await auth.login(String(req.body?.email || ''), String(req.body?.password || ''))
  res.json({ requiresTotp: true })
}))
app.post('/api/auth/totp', wrap(async (req, res) => {
  await auth.verifyTotp(String(req.body?.token || ''))
  res.json(auth.status())
  void telemetry.flush()
}))
app.post('/api/auth/logout', wrap(async (_req, res) => {
  await auth.logout(); res.json({ ok: true })
}))

app.use('/api', requireAuth)
app.get('/api/certificates/templates', wrap(async (_req, res) => { res.json({ docs: await certificates.list() }) }))
app.get('/api/certificates/templates/:type/image', wrap(async (req, res) => {
  if (!isCertificateType(req.params.type)) throw new PayloadError('Sertifika türü geçersiz.', 400)
  const image = await certificates.image(req.params.type)
  if (!image) throw new PayloadError('Şablon bulunamadı.', 404)
  res.type(image.format === 'jpg' ? 'image/jpeg' : 'image/png').send(image.bytes)
}))
app.put('/api/certificates/templates/:type', wrap(async (req, res) => {
  if (!isCertificateType(req.params.type)) throw new PayloadError('Sertifika türü geçersiz.', 400)
  await certificates.saveTemplate(req.params.type, req.body)
  res.json({ ok: true })
}))
app.post('/api/certificates/test', wrap(certificateTestHandler(certificates)))
app.get('/api/certificates/recipients', wrap(async (req, res) => {
  if (req.query.includeTest !== undefined && req.query.includeTest !== '0' && req.query.includeTest !== '1') throw new PayloadError('Test filtresi geçersiz.', 400)
  res.json({ docs: await certificateRecipients(payload, Number(req.query.eventId), { includeTest: req.query.includeTest === '1', history: certificateSender.history }) })
}))
app.post('/api/certificates/send', wrap(async (req, res) => {
  const startedAt = Date.now()
  const result = await certificateSender.send(req.body)
  if (req.body.whatsappTemplateId) queue.approveCreatedAfter(startedAt)
  res.json(result)
}))
app.get('/api/system/logs', (req, res) => {
  const after = Number(req.query.after)
  res.json({ lines: logs.list({ onlyProblems: req.query.level === 'problems',
    after: Number.isFinite(after) ? after : 0 }) })
})
app.delete('/api/system/logs', (_req, res) => { logs.clear(); res.json({ ok: true }) })
app.get('/api/events', wrap(async (_req, res) => { res.json(await events.events()) }))
app.get('/api/registrations', wrap(async (req, res) => {
  res.json(await events.registrations(Number(req.query.eventId)))
}))
app.get('/api/applications', wrap(async (req, res) => {
  const { kind, tab } = req.query
  if ((kind !== 'members' && kind !== 'core-team') ||
    (tab !== 'all' && tab !== 'accepted' && tab !== 'rejected')) {
    throw new PayloadError('Başvuru türü veya sekme geçersiz.', 400)
  }
  res.json({ docs: await applications.list(kind, tab) })
}))
app.post('/api/applications/notify', wrap(async (req, res) => {
  const startedAt = Date.now()
  const result = await applications.notify(req.body)
  if (req.body.whatsappTemplateId) queue.approveCreatedAfter(startedAt)
  res.json(result)
}))
// Takım modu: reddedilen takımlara elle ret maili (otomatik gitmez)
app.get('/api/team-rejections', wrap(async (req, res) => {
  res.json(await teamRejections.list(Number(req.query.eventId), req.query.decision === 'accepted' ? 'accepted' : 'rejected'))
}))
app.post('/api/team-rejections/send', wrap(async (req, res) => {
  const startedAt = Date.now()
  const result = await teamRejections.send(req.body)
  if (req.body?.whatsappTemplateId) queue.approveCreatedAfter(startedAt)
  res.json(result)
}))
app.get('/api/free-send/recipients', wrap(async (req, res) => {
  const kind = req.query.kind
  const includeTest = req.query.includeTest
  if (includeTest !== undefined && includeTest !== '0' && includeTest !== '1') throw new PayloadError('Test filtresi geçersiz.', 400)
  const common = { includeTest: includeTest === '1' }
  if (kind === 'event') {
    const eventId = Number(req.query.eventId)
    const filter = req.query.filter ?? 'all'
    if (!Number.isInteger(eventId) || eventId <= 0 || !['all', 'accepted', 'checkedIn', 'notCheckedIn'].includes(String(filter))) {
      throw new PayloadError('Etkinlik veya filtre geçersiz.', 400)
    }
    res.json({ docs: await freeSend.recipients({ kind, eventId, filter: filter as 'all' | 'accepted' | 'checkedIn' | 'notCheckedIn', ...common }) })
  } else if (kind === 'members') res.json({ docs: await freeSend.recipients({ kind, ...common }) })
  else if (kind === 'core-team') {
    if (req.query.status !== undefined && typeof req.query.status !== 'string') throw new PayloadError('Durum geçersiz.', 400)
    res.json({ docs: await freeSend.recipients({ kind, status: req.query.status as string | undefined, ...common }) })
  } else throw new PayloadError('Kaynak geçersiz.', 400)
}))
app.get('/api/free-send/history', wrap(async (_req, res) => {
  const docs = (await sendHistory.read()).map((run) => ({ ...run, recipients: run.recipients.map((recipient) => {
    const { variables: _variables, ...publicRecipient } = recipient
    const at = recipient.email?.indexOf('@') ?? -1
    return { ...publicRecipient,
      email: at > 0 ? `${recipient.email!.slice(0, 2)}***@${recipient.email!.slice(at + 1)}` : undefined,
      phone: recipient.phone ? `***${recipient.phone.slice(-2)}` : undefined,
    }
  }) }))
  res.json({ docs })
}))
app.get('/api/free-send/status', (_req, res) => { res.json(freeSend.status()) })
app.post('/api/free-send/parse-file', (req, res) => { res.json(parseRecipientFileRequest(req.body)) })
app.post('/api/free-send/send', wrap(async (req, res) => {
  res.status(202).json(await freeSend.send(req.body))
}))
app.post('/api/decisions', wrap(async (req, res) => {
  const startedAt = Date.now()
  const { eventId, ids, decision, mailTemplateId, whatsappTemplateId, allowTest, repeatConfirmed, confirmed } = req.body || {}
  if (!confirmed || !Array.isArray(ids) || !['accepted', 'rejected', 'waitlist'].includes(decision)) {
    throw new PayloadError('Karar ve önizleme onayı gerekli.', 400)
  }
  const result = await events.decide(await getEvent(Number(eventId)), ids.map(Number), decision,
    { mail: Number(mailTemplateId) || null, whatsapp: Number(whatsappTemplateId) || null },
    Boolean(allowTest), Boolean(repeatConfirmed))
  if (Number(whatsappTemplateId) > 0) queue.approveCreatedAfter(startedAt)
  res.json(result)
}))
app.get('/api/templates', wrap(async (_req, res) => { res.json(await templates.list()) }))
// Mail taslağını örnek verilerle seçilen test alıcısına gönderir
app.post('/api/templates/test-mail', wrap(async (req, res) => {
  const to = String(req.body?.recipient || '').trim()
  const subject = String(req.body?.subject || ''), html = String(req.body?.html || '')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new PayloadError('Geçerli bir test alıcısı girin.', 400)
  if (!subject.trim() || !html.trim()) throw new PayloadError('Konu ve içerik gerekli.', 400)
  const event = (await events.events())[0] ?? { id: 0, title: 'Örnek Etkinlik' }
  const context = { registration: { id: 0, event: event.id, fullName: 'Ayşe Yılmaz', email: to, status: 'pending' as const }, event }
  await mail.send(to, `[TEST] ${fillTemplate(subject, context).text}`, fillTemplate(html, context, true).text)
  res.json({ ok: true, to })
}))
app.post('/api/templates', wrap(async (req, res) => { res.json(await templates.create(req.body)) }))
app.patch('/api/templates/:id', wrap(async (req, res) => { res.json(await templates.update(Number(req.params.id), req.body)) }))
app.delete('/api/templates/:id', wrap(async (req, res) => { await templates.delete(Number(req.params.id)); res.json({ ok: true }) }))
app.get('/api/wa-templates', wrap(async (_req, res) => { res.json(await templates.listWhatsApp()) }))
app.post('/api/wa-templates', wrap(async (req, res) => { res.json(await templates.createWhatsApp(req.body)) }))
app.patch('/api/wa-templates/:id', wrap(async (req, res) => { res.json(await templates.updateWhatsApp(Number(req.params.id), req.body)) }))
app.delete('/api/wa-templates/:id', wrap(async (req, res) => { await templates.deleteWhatsApp(Number(req.params.id)); res.json({ ok: true }) }))
app.get('/api/whatsapp/status', (_req, res) => { res.json(whatsapp.status()) })
app.post('/api/whatsapp/connect', (_req, res) => { res.json(whatsapp.connect()) })
app.post('/api/whatsapp/logout', wrap(async (_req, res) => { await whatsapp.logout(); res.json(whatsapp.status()) }))
app.get('/api/queue', wrap(async (_req, res) => { res.json(await queue.list()) }))
app.post('/api/queue/send', wrap(async (req, res) => { res.json(await queue.send(req.body?.ids)) }))
app.post('/api/queue/cancel', wrap(async (req, res) => { res.json(await queue.cancel(req.body?.ids)) }))
app.get('/api/queue/job', wrap(async (_req, res) => { res.json({ job: await queue.interruptedJob() }) }))
app.post('/api/queue/job/resume', wrap(async (_req, res) => { res.json(await queue.resumeJob()) }))
app.post('/api/queue/job/discard', wrap(async (_req, res) => { res.json(await queue.discardJob()) }))
app.get('/api/queue/uncertain', wrap(async (_req, res) => { res.json(await queue.uncertainIds()) }))
app.use(express.static(renderer, { index: 'index.html' }))
app.get('/{*path}', spaFallback(renderer))
app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  const status = error instanceof PayloadError ? error.status : 500
  const message = status >= 500 ? 'İşlem tamamlanamadı.' : safeError(error)
  if (status >= 500) {
    console.error('[worker]', safeError(error))
    telemetry.report('worker_error', { path: `${req.method} ${req.path}`, message: `${status}: ${safeError(error)}` },
      { dedupeKey: `err-${req.path}-${safeError(error).slice(0, 60)}`, dedupeMs: 600_000 })
  }
  res.status(status).json({ error: message })
})

void auth.initialize().then(() => {
  queue.start()
  const server = app.listen(CONFIG.serverPort, CONFIG.serverHost, () => {
    console.info(`[worker] http://${CONFIG.serverHost}:${CONFIG.serverPort}`)
    telemetry.report('worker_started', { version: process.env.npm_package_version || WORKER_VERSION })
  })
  const stop = () => {
    server.close()
    void queue.stop().then(() => whatsapp.shutdown()).then(() => process.exit(0))
  }
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
}).catch((error) => {
  console.error('[worker] Başlatılamadı:', safeError(error))
  process.exitCode = 1
})
