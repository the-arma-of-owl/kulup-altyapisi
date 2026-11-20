import { getPayload } from 'payload';
import configPromise from '@payload-config';
import { escapeTelegramHtml, sendTelegramDocument, sendTelegramMessage } from '@/lib/telegram';
import { KULUP } from './kulup';

export async function performBackupAndSend() {
  try {
    const payload = await getPayload({ config: configPromise });
    const collectionsToBackup = [
      'users', 'events', 'event-registrations', 'certificates', 'members', 
      'member-applications', 'core-team-applications', 'blog-posts', 
      'gallery-albums', 'gallery', 'team-members', 'faq-categories', 
      'faq', 'contact-messages', 'achievements', 'university-guide', 'media'
    ];

    const globalsToBackup = [
      'site-settings', 'legal-docs', 'university-guide-settings'
    ];

    const backupData: Record<string, any> = {};
    // Atlanan koleksiyonlar eskiden yalnız konsola düşüyordu; artık yedek mesajında nedeniyle yazılır.
    const failures: string[] = [];

    // 1. Koleksiyonları yedekle
    for (const slug of collectionsToBackup) {
      try {
        const result = await payload.find({
          collection: slug as any,
          limit: 100000,
          depth: 1, // Depth 1 to get relations properly
        });
        backupData[slug] = result.docs;
      } catch (err) {
        console.warn(`Could not backup collection: ${slug}`, err);
        failures.push(`${slug}: ${String((err as Error)?.message ?? err).slice(0, 120)}`);
      }
    }

    // 2. Global ayarları yedekle
    backupData['globals'] = {};
    for (const slug of globalsToBackup) {
      try {
        const result = await payload.findGlobal({
          slug: slug as any,
          depth: 1,
        });
        backupData['globals'][slug] = result;
      } catch (err) {
        console.warn(`Could not backup global: ${slug}`, err);
        failures.push(`global ${slug}: ${String((err as Error)?.message ?? err).slice(0, 120)}`);
      }
    }

    const jsonString = JSON.stringify(backupData, null, 2);
    const buffer = Buffer.from(jsonString, 'utf-8');
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `${KULUP.kisaAd.toLowerCase().replace(/[^a-z0-9-]+/g, "-") || "kulup"}-backup-${dateStr}.json`;

    const failureNote = failures.length
      ? `\n\n⚠️ <b>Yedeğe ALINAMAYAN (${failures.length}):</b>\n${failures.map((item) => `• ${escapeTelegramHtml(item)}`).join('\n')}`.slice(0, 700)
      : '';
    const sent = await sendTelegramDocument(
      buffer, 
      filename, 
      `📦 <b>Manuel/Otomatik Sistem Yedeği</b>\nTarih: ${dateStr} · ${(buffer.length / 1024 / 1024).toFixed(1)} MB\n\n<i>Not: Medya dosyaları (resim/video) boyut nedeniyle yedeklenmemiştir.</i>${failureNote}`,
      { topic: 'reports' },
    );
    // Telegram belge sınırı 50 MB; gönderilemezse sessizce "başarılı" sayılmasın.
    if (!sent || (sent as { ok?: boolean }).ok === false) {
      throw new Error(`Yedek dosyası Telegram'a gönderilemedi (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
    }

    return true;
  } catch (error: any) {
    console.error('Backup error:', error);
    await sendTelegramMessage(`❌ <b>Yedekleme Hatası</b>\n<code>${escapeTelegramHtml(error.message)}</code>`, { topic: 'errors' });
    return false;
  }
}
