import type { EmailTemplate, Page, WhatsAppTemplate } from '../shared/types.js'
import { PayloadClient, PayloadError } from './payload.js'

// Otomatik "başvurunuz alındı" mailleri ayrı ekranda yönetilir; Şablonlar listesinde görünmez.
export const AUTO_PURPOSES = ['member-application-received', 'event-registration-received', 'coreteam-application-received']

export class TemplatesService {
  constructor(private readonly payload: PayloadClient) {}

  // ─── Mail şablonları (email-templates) ───
  async list(): Promise<EmailTemplate[]> {
    const { data } = await this.payload.request<Page<EmailTemplate>>('/email-templates?limit=500&depth=0&sort=name')
    return data.docs
  }

  async mail(id: number): Promise<EmailTemplate> {
    return (await this.payload.request<EmailTemplate>(`/email-templates/${id}?depth=0`)).data
  }

  async create(data: Partial<EmailTemplate>): Promise<EmailTemplate> {
    this.validateMail(data, true)
    // Serbest şablonlar "genel" amaçla kaydedilir; hangi kararda kullanılacağı gönderimde seçilir.
    const body = { purpose: 'general', isActive: true, ...data }
    return (await this.payload.request<{ doc: EmailTemplate }>('/email-templates', { method: 'POST', body })).data.doc
  }

  async update(id: number, data: Partial<EmailTemplate>): Promise<EmailTemplate> {
    this.validateMail(data, false)
    return (await this.payload.request<{ doc: EmailTemplate }>(`/email-templates/${id}`, { method: 'PATCH', body: data })).data.doc
  }

  async delete(id: number): Promise<void> {
    await this.payload.request(`/email-templates/${id}`, { method: 'DELETE' })
  }

  // ─── WhatsApp şablonları (whatsapp-templates) ───
  async listWhatsApp(): Promise<WhatsAppTemplate[]> {
    const { data } = await this.payload.request<Page<WhatsAppTemplate>>('/whatsapp-templates?limit=500&depth=0&sort=name')
    return data.docs
  }

  async whatsApp(id: number): Promise<WhatsAppTemplate> {
    return (await this.payload.request<WhatsAppTemplate>(`/whatsapp-templates/${id}?depth=0`)).data
  }

  async createWhatsApp(data: Partial<WhatsAppTemplate>): Promise<WhatsAppTemplate> {
    this.validateWhatsApp(data, true)
    return (await this.payload.request<{ doc: WhatsAppTemplate }>('/whatsapp-templates', { method: 'POST', body: { name: data.name, message: data.message } })).data.doc
  }

  async updateWhatsApp(id: number, data: Partial<WhatsAppTemplate>): Promise<WhatsAppTemplate> {
    this.validateWhatsApp(data, false)
    return (await this.payload.request<{ doc: WhatsAppTemplate }>(`/whatsapp-templates/${id}`, { method: 'PATCH', body: { name: data.name, message: data.message } })).data.doc
  }

  async deleteWhatsApp(id: number): Promise<void> {
    await this.payload.request(`/whatsapp-templates/${id}`, { method: 'DELETE' })
  }

  private validateMail(data: Partial<EmailTemplate>, full: boolean): void {
    if ((full || 'name' in data) && !data.name?.trim()) throw new PayloadError('Şablon adı gerekli.', 400)
    if ((full || 'subject' in data) && !data.subject?.trim()) throw new PayloadError('Mail konusu gerekli.', 400)
    if ((full || 'html' in data) && !data.html?.trim()) throw new PayloadError('Mail içeriği gerekli.', 400)
  }

  private validateWhatsApp(data: Partial<WhatsAppTemplate>, full: boolean): void {
    if ((full || 'name' in data) && !data.name?.trim()) throw new PayloadError('Şablon adı gerekli.', 400)
    if ((full || 'message' in data) && !data.message?.trim()) throw new PayloadError('Mesaj metni gerekli.', 400)
  }
}
