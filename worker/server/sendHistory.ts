import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { HistoryRecipient, SendHistoryRun } from '../shared/types.js'
import { safeError } from './log.js'

export type { HistoryRecipient, SendHistoryRun } from '../shared/types.js'

export class SendHistoryStore {
  private readonly file: string
  private pending: Promise<void> = Promise.resolve()

  constructor(userDataPath: string) { this.file = path.join(userDataPath, 'send-history.json') }

  async read(): Promise<SendHistoryRun[]> {
    let contents: string
    try { contents = await readFile(this.file, 'utf8') }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
    try {
      const parsed: unknown = JSON.parse(contents)
      return Array.isArray(parsed) ? parsed.slice(0, 20) as SendHistoryRun[] : []
    } catch (error) {
      if (error instanceof SyntaxError) return []
      throw error
    }
  }

  async append(runId: string, label: string, recipient: HistoryRecipient): Promise<void> {
    const update = async () => {
      const runs = await this.read()
      const safeRecipient = { ...recipient, error: recipient.error ? safeError(recipient.error).slice(0, 300) : undefined }
      const existing = runs.find((run) => run.id === runId)
      if (existing) {
        existing.recipients = [...existing.recipients.filter(({ id }) => id !== recipient.id), safeRecipient].slice(-5000)
      } else {
        runs.unshift({ id: runId, createdAt: new Date().toISOString(), label: label.slice(0, 120), recipients: [safeRecipient] })
      }
      await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 })
      const temporary = `${this.file}.${randomUUID()}.tmp`
      try {
        await writeFile(temporary, JSON.stringify(runs.slice(0, 20)), { mode: 0o600, flag: 'wx' })
        await chmod(temporary, 0o600)
        await rename(temporary, this.file)
        await chmod(this.file, 0o600)
      } catch (error) {
        await rm(temporary, { force: true })
        throw error
      }
    }
    const result = this.pending.then(update)
    this.pending = result.catch(() => undefined)
    await result
  }

  async failedRecipients(runId: string): Promise<HistoryRecipient[]> {
    return (await this.read()).find((run) => run.id === runId)?.recipients.filter((item) => item.status === 'failed') ?? []
  }
}
