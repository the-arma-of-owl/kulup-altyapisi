export type Page<T> = { docs: T[]; totalDocs: number; hasNextPage?: boolean; nextPage?: number | null }
export type WorkerEvent = {
  id: number; title: string; date?: string; location?: string; locationLink?: string;
  mode?: string; status?: string; capacity?: number; scannerActive?: boolean; teamMode?: boolean
}
export type Registration = {
  id: number; event: number | WorkerEvent; fullName: string; email?: string; phone?: string;
  ticketToken?: string; status: 'pending' | 'accepted' | 'rejected' | 'waitlist';
  attended?: boolean; applicationStage?: string; isTest?: boolean; createdAt?: string
  checkedInAt?: string; gateFields?: Record<string, string> | null
}
export type EmailTemplate = {
  id: number; name: string; purpose: string; subject: string; html: string;
  whatsappText?: string; isActive?: boolean; relatedEvent?: number | WorkerEvent | null; updatedAt?: string
}
export type QueueItem = {
  id: number; to: string; message: string; mediaUrl?: string; status: string;
  source: 'gate' | 'decision' | 'bulk' | 'system'; attempts: number; createdAt: string
}
export type QueueListItem = {
  id: number; to: string; source: QueueItem['source']; createdAt: string;
  preview: string; hasMedia: boolean; autoSend: boolean; uncertain: boolean
}
export type WhatsAppTemplate = { id: number; name: string; message: string; updatedAt?: string }
export type Recipient = {
  id: string; name: string; email?: string; phone?: string; isTest: boolean;
  variables: Record<string, string | number>; relatedEvent?: number
}
export type FreeSendSource =
  | { kind: 'event'; eventId: number; filter: 'all' | 'accepted' | 'checkedIn' | 'notCheckedIn'; includeTest?: boolean }
  | { kind: 'members'; includeTest?: boolean }
  | { kind: 'core-team'; status?: string; includeTest?: boolean }
export type FreeSendRequest = {
  confirmed: true; confirmCount: number; allowTest?: boolean; label: string;
  channels: { mail?: boolean; whatsapp?: boolean };
  mail?: { subject: string; html: string }; whatsapp?: { message: string };
  target: { source: FreeSendSource; ids: string[] }
    | { file: { text: string; format: 'json' | 'csv' }; rows?: number[] }
    | { retryRunId: string }
    /** Karışık liste (CMS + dosya + elle eklenen + geçmişten getirilen); sunucu her satırı yeniden doğrular. */
    | { list: Recipient[] }
}
export type FreeSendStatus = { running: boolean; runId?: string; total?: number; done?: number }
export type HistoryRecipient = Recipient & {
  status: 'sent' | 'failed'; error?: string;
  mail?: 'sent' | 'failed' | 'skipped'; whatsapp?: 'queued' | 'failed' | 'skipped'
}
export type SendHistoryRun = { id: string; createdAt: string; label: string; recipients: HistoryRecipient[] }
