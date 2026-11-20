import { redactIps } from './obs/privacy';

export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
export const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// parse_mode HTML: kullanıcı metnindeki <, >, & kaçışsız giderse Telegram mesajı 400 ile reddeder
export function escapeTelegramHtml(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Konular (forum topic) ─────────────────────────────────────────────────────
// Süper grupta "Konular" açıksa her bildirim türü kendi konusuna gider. Konu kimliği (message_thread_id)
// Vercel ortam değişkeninden okunur; tanımlı değilse TELEGRAM_TOPIC_DEFAULT, o da yoksa genel sohbet.
export const TELEGRAM_TOPICS = ['applications', 'sends', 'security', 'errors', 'reports', 'system'] as const;
export type TelegramTopic = (typeof TELEGRAM_TOPICS)[number];
const TOPIC_ENV: Record<TelegramTopic, string> = {
  applications: 'TELEGRAM_TOPIC_APPLICATIONS', // başvuru / kayıt
  sends: 'TELEGRAM_TOPIC_SENDS',               // mail, sertifika, WhatsApp gönderimleri
  security: 'TELEGRAM_TOPIC_SECURITY',         // giriş, IP, hız sınırı, panik
  errors: 'TELEGRAM_TOPIC_ERRORS',             // kota, servis ve gizli kalan hatalar
  reports: 'TELEGRAM_TOPIC_REPORTS',           // gün sonu raporu, yedek
  system: 'TELEGRAM_TOPIC_SYSTEM',             // panel değişiklikleri, worker durumu
};

export function topicThreadId(topic: TelegramTopic | undefined): number | undefined {
  const raw = (topic && process.env[TOPIC_ENV[topic]]) || process.env.TELEGRAM_TOPIC_DEFAULT;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

/** TELEGRAM_DRY_RUN=1: hiçbir şey gönderilmez, mesaj konsola yazılır (yerel test). */
export const telegramDryRun = (): boolean => process.env.TELEGRAM_DRY_RUN === '1';

// Grup süper gruba yükseltilince chat ID değişir; Telegram yeni ID'yi migrate_to_chat_id ile bildirir.
// Bu durumda yeni ID ile bir kez yeniden denenir ve TELEGRAM_CHAT_ID'nin güncellenmesi için loglanır.
let activeChatId = TELEGRAM_CHAT_ID;

async function callTelegram(method: string, makeBody: (chatId: string) => { body: BodyInit; json: boolean }) {
  const send = async (chatId: string) => {
    const { body, json } = makeBody(chatId);
    const response = await fetch(`${TELEGRAM_API_URL}/${method}`, {
      method: 'POST',
      headers: json ? { 'Content-Type': 'application/json' } : undefined,
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const data: any = await response.json().catch((): null => null);
    return { response, data };
  };

  let { response, data } = await send(activeChatId as string);
  const migrated = data?.parameters?.migrate_to_chat_id;
  if (migrated) {
    console.error(`[Telegram] Grup süper gruba taşınmış; Vercel'de TELEGRAM_CHAT_ID=${migrated} yapılmalı (eski: ${activeChatId}).`);
    activeChatId = String(migrated);
    ({ response, data } = await send(activeChatId));
  }
  // Konu silinmişse/yanlışsa mesaj kaybolmasın: konusuz (genel sohbete) bir kez daha dene.
  if (!response.ok && /thread not found|TOPIC_(DELETED|CLOSED)/i.test(String(data?.description || ''))) {
    console.error(`[Telegram] Konu bulunamadı (${data?.description}); mesaj genel sohbete gönderiliyor. TELEGRAM_TOPIC_* değerlerini kontrol edin.`);
    const original = makeBody;
    makeBody = (chatId) => {
      const result = original(chatId);
      if (result.json && typeof result.body === 'string') {
        const parsed = JSON.parse(result.body);
        delete parsed.message_thread_id;
        return { json: true, body: JSON.stringify(parsed) };
      }
      if (result.body instanceof FormData) result.body.delete('message_thread_id');
      return result;
    };
    ({ response, data } = await send(activeChatId as string));
  }
  if (!response.ok || data?.ok === false) {
    console.error(`[Telegram] ${method} başarısız: ${response.status} ${data?.description || ''}`);
  }
  return { response, data };
}

export type TelegramSendOptions = { topic?: TelegramTopic; threadId?: number; silent?: boolean };
export type TelegramSendResult = { ok: boolean; status: number; retryAfter?: number; description?: string; skipped?: boolean };

/** Ayrıntılı sonuç döner (bildirim kutusu 429'da yeniden dener). Asla hata fırlatmaz. */
export async function telegramSend(text: string, options: TelegramSendOptions = {}): Promise<TelegramSendResult> {
  text = redactIps(text); // KVKK: hangi kod yolundan gelirse gelsin Telegram'a tam IP gitmez
  const threadId = options.threadId ?? topicThreadId(options.topic);
  if (telegramDryRun()) {
    console.info(`[Telegram DRY-RUN]${options.topic ? ` [${options.topic}${threadId ? `#${threadId}` : ''}]` : ''}\n${text}`);
    return { ok: true, status: 200, skipped: true };
  }
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('Telegram token or chat ID is missing. Skipping message.');
    return { ok: false, status: 0, skipped: true, description: 'yapılandırma eksik' };
  }
  try {
    const { response, data } = await callTelegram('sendMessage', (chatId) => ({
      json: true,
      body: JSON.stringify({
        chat_id: chatId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true },
        ...(threadId ? { message_thread_id: threadId } : {}),
        ...(options.silent ? { disable_notification: true } : {}),
      }),
    }));
    const ok = response.ok && data?.ok !== false;
    return { ok, status: response.status, retryAfter: data?.parameters?.retry_after, description: data?.description };
  } catch (error) {
    console.error('Error sending Telegram message:', error);
    return { ok: false, status: 0, description: error instanceof Error ? error.message : String(error) };
  }
}

export async function sendTelegramMessage(text: string, options: TelegramSendOptions = {}) {
  const result = await telegramSend(text, options);
  return result.ok ? { ok: true } : null;
}

/** 4096 karakter sınırı için metni satır sınırlarından böler. */
export function splitTelegramText(text: string, max = 3900): string[] {
  if (text.length <= max) return [text];
  const parts: string[] = [];
  let current = '';
  for (const line of text.split('\n')) {
    const piece = line.length > max ? line.slice(0, max - 1) + '…' : line;
    if (current && current.length + piece.length + 1 > max) { parts.push(current); current = ''; }
    current = current ? `${current}\n${piece}` : piece;
  }
  if (current) parts.push(current);
  return parts;
}

export async function sendTelegramDocument(buffer: Buffer, filename: string, caption?: string, options: TelegramSendOptions = {}) {
  if (caption) caption = redactIps(caption);
  const threadId = options.threadId ?? topicThreadId(options.topic);
  if (telegramDryRun()) {
    console.info(`[Telegram DRY-RUN] belge ${filename} (${buffer.length} bayt)${caption ? `\n${caption}` : ''}`);
    return { ok: true };
  }
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('Telegram token or chat ID is missing. Skipping document.');
    return null;
  }

  try {
    const { data } = await callTelegram('sendDocument', (chatId) => {
      const formData = new FormData();
      formData.append('chat_id', chatId);
      formData.append('document', new Blob([new Uint8Array(buffer)]), filename);
      if (caption) {
        formData.append('caption', caption);
        formData.append('parse_mode', 'HTML');
      }
      if (threadId) formData.append('message_thread_id', String(threadId));
      return { json: false, body: formData };
    });
    return data;
  } catch (error) {
    console.error('Error sending Telegram document:', error);
    return null;
  }
}

/** Gönderen bu grupta yönetici mi? TELEGRAM_ADMIN_IDS (virgüllü kullanıcı kimlikleri) tanımlıysa yalnız o liste. */
export async function isTelegramAdmin(userId: unknown): Promise<boolean> {
  const id = Number(userId);
  if (!Number.isSafeInteger(id) || id <= 0) return false;
  const allow = (process.env.TELEGRAM_ADMIN_IDS || '').split(',').map((item) => Number(item.trim())).filter((item) => item > 0);
  if (allow.length) return allow.includes(id);
  if (!TELEGRAM_BOT_TOKEN || !activeChatId) return false;
  try {
    const response = await fetch(`${TELEGRAM_API_URL}/getChatMember?chat_id=${encodeURIComponent(activeChatId)}&user_id=${id}`, {
      signal: AbortSignal.timeout(8_000),
    });
    const data = (await response.json().catch((): null => null)) as { ok?: boolean; result?: { status?: string } } | null;
    return Boolean(data?.ok && ['creator', 'administrator'].includes(String(data.result?.status)));
  } catch {
    return false;
  }
}

export async function getTelegramFileUrl(fileId: string) {
  if (!TELEGRAM_BOT_TOKEN) return null;

  try {
    const response = await fetch(`${TELEGRAM_API_URL}/getFile?file_id=${fileId}`);
    const data = (await response.json()) as any;

    if (data.ok) {
      const filePath = data.result.file_path;
      return `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;
    }
    return null;
  } catch (error) {
    console.error('Error getting Telegram file URL:', error);
    return null;
  }
}

export async function downloadTelegramFile(fileId: string) {
  const url = await getTelegramFileUrl(fileId);
  if (!url) return null;

  try {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer);
  } catch (error) {
    console.error('Error downloading Telegram file:', error);
    return null;
  }
}
