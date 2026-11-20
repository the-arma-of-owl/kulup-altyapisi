import { NextResponse } from 'next/server';
import { getPayload } from 'payload';
import configPromise from '@payload-config';
import { TELEGRAM_CHAT_ID, downloadTelegramFile, isTelegramAdmin, sendTelegramMessage } from '@/lib/telegram';
import { checkWebhookAuth, isRestorableCollection, isRestorableDoc } from '@/lib/telegramWebhook';

export async function POST(req: Request) {
  const auth = checkWebhookAuth(req.headers.get('x-telegram-bot-api-secret-token'), process.env.TELEGRAM_WEBHOOK_SECRET);
  if (auth === 503) return NextResponse.json({ error: 'Yapılandırma eksik' }, { status: 503 });
  if (auth === 401) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    let update: any;
    try {
      update = await req.json();
    } catch {
      return NextResponse.json({ error: 'Bad request' }, { status: 400 });
    }

    // Sadece mesaj varsa ilgilen
    if (!update || typeof update !== 'object' || !update.message) {
      return NextResponse.json({ ok: true });
    }

    const { message } = update;
    const chatId = message.chat?.id?.toString();

    // Sadece yetkili gruptan/kişiden gelenleri işle
    if (chatId !== TELEGRAM_CHAT_ID) {
      return NextResponse.json({ ok: true });
    }

    // Yanıtlar komutun yazıldığı konuya (topic) gider.
    const threadId = Number.isSafeInteger(message.message_thread_id) ? message.message_thread_id : undefined;
    const reply = (text: string) => sendTelegramMessage(text, threadId ? { threadId } : {});
    const command = String(message.text || '').trim().split(/\s+/);
    const name = (command[0] || '').replace(/@\w+$/, '').toLowerCase();

    // Geri yükleme ve acil kilit veriyi/erişimi değiştirir: yalnız grup yöneticisi (veya TELEGRAM_ADMIN_IDS).
    const needsAdmin = (message.document && message.caption?.includes('/restore')) || name === '/panik';
    if (needsAdmin && !(await isTelegramAdmin(message.from?.id))) {
      await reply('⛔ Bu komut yalnız grup yöneticileri içindir.');
      return NextResponse.json({ ok: true });
    }

    if (name === '/panik' || name === '/durum' || name === '/rapor') {
      const payload = await getPayload({ config: configPromise });
      const { getPanic, setPanic } = await import('@/lib/obs/security');
      if (name === '/panik') {
        const off = ['kapat', 'off', 'kapa'].includes((command[1] || '').toLowerCase());
        const by = `Telegram: ${message.from?.username ? '@' + message.from.username : message.from?.first_name || message.from?.id || '?'}`;
        await setPanic(payload, !off, by, off ? '' : command.slice(1).join(' ').slice(0, 200));
      } else if (name === '/durum') {
        const { getObsStore } = await import('@/lib/obs/store');
        const panic = await getPanic(payload, true);
        const store = getObsStore(payload);
        const pending = await store.pendingCount().catch(() => -1);
        await reply(`🩺 <b>Durum</b>\n🚨 Acil kilit: ${panic.active ? `<b>AÇIK</b> (${panic.by ?? '-'})` : 'kapalı'}\n🗃️ Gözlem deposu: ${store.durable ? 'Postgres (obs şeması)' : 'bellek içi — SQL uygulanmamış olabilir'}\n📬 Bekleyen bildirim: ${pending < 0 ? 'okunamadı' : pending}`);
      } else {
        await reply('📊 Rapor hazırlanıyor...');
        const { runDailyReport } = await import('@/lib/obs/dailyReport');
        const { runInBackground } = await import('@/lib/obs/notify');
        // Telegram webhook'u uzun süre bekletilirse yeniden dener; rapor yanıttan sonra hazırlanır.
        runInBackground(() => runDailyReport(payload));
      }
      return NextResponse.json({ ok: true });
    }

    // Doküman gönderildiyse ve açıklamasında /restore yazıyorsa
    if (message.document && message.caption?.includes('/restore')) {
      const fileId = message.document.file_id;
      const fileName = message.document.file_name;

      if (!fileName?.endsWith('.json')) {
        await sendTelegramMessage('Lütfen geçerli bir JSON yedek dosyası yükleyin.');
        return NextResponse.json({ ok: true });
      }

      await sendTelegramMessage('🔄 Yedek dosyası indiriliyor ve işleniyor. Bu işlem biraz sürebilir...');

      const buffer = await downloadTelegramFile(fileId);
      if (!buffer) {
        await sendTelegramMessage('❌ Dosya indirilemedi.');
        return NextResponse.json({ ok: true });
      }

      let backupData: Record<string, any[]>;
      try {
        backupData = JSON.parse(buffer.toString('utf-8'));
        if (!backupData || typeof backupData !== 'object' || Array.isArray(backupData)) {
          await sendTelegramMessage('❌ Dosya geçerli bir JSON formatında değil.');
          return NextResponse.json({ ok: true });
        }
      } catch (err) {
        await sendTelegramMessage('❌ Dosya geçerli bir JSON formatında değil.');
        return NextResponse.json({ ok: true });
      }

      const payload = await getPayload({ config: configPromise });
      
      let restoreLog = '✅ <b>Geri Yükleme Tamamlandı</b>\n\n';
      const skipped: string[] = [];

      for (const [collectionSlug, docs] of Object.entries(backupData)) {
        if (!isRestorableCollection(collectionSlug as unknown)) {
          skipped.push(collectionSlug.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40));
          continue;
        }
        if (!Array.isArray(docs)) continue;

        let added = 0;
        let updated = 0;
        let errors = 0;

        for (const doc of docs) {
          if (!isRestorableDoc(doc)) {
            errors++;
            continue;
          }
          try {
            // Check if exists
            const existing = await payload.find({
              collection: collectionSlug as any,
              where: { id: { equals: doc.id } },
              limit: 1,
              context: { restore: true },
            });

            if (existing.docs && existing.docs.length > 0) {
              await payload.update({
                collection: collectionSlug as any,
                id: doc.id,
                data: doc,
                context: { restore: true },
              });
              updated++;
            } else {
              await payload.create({
                collection: collectionSlug as any,
                data: doc,
                context: { restore: true },
              });
              added++;
            }
          } catch (err) {
            errors++;
          }
        }
        
        restoreLog += `<b>${collectionSlug}</b>: ${added} Eklendi, ${updated} Güncellendi, ${errors} Hata\n`;
      }

      if (skipped.length) restoreLog += `⛔ Atlanan: ${skipped.join(', ')}\n`;

      await sendTelegramMessage(restoreLog);
    } else if (message.text === '/yedekle') {
      await sendTelegramMessage('📦 Yedekleme işlemi başlatıldı. Veriler toplanıyor...');
      const { performBackupAndSend } = await import('@/lib/backup');
      const success = await performBackupAndSend();
      if (success) {
        await sendTelegramMessage('✅ Yedekleme başarıyla tamamlandı ve gönderildi.');
      } else {
        await sendTelegramMessage('❌ Yedekleme sırasında bir hata oluştu.');
      }
    } else if (message.text === '/ping') {
      await sendTelegramMessage('🏓 Pong! Telegram entegrasyonu aktif.');
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook failed' }, { status: 500 });
  }
}
