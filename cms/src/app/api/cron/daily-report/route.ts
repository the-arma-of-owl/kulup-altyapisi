import { NextResponse } from 'next/server';
import { getPayload } from 'payload';
import configPromise from '@payload-config';
import { checkCronAuth } from '@/lib/cronAuth';
import { runDailyReport } from '@/lib/obs/dailyReport';
import { logEvent } from '@/lib/obs/notify';

// Gün sonu raporu + gözlem tablolarının temizliği (KVKK saklama süreleri) + bekleyen bildirimler.
// Vercel Hobby: cron günde bir kez ve saat hassasiyetinde çalışır (20:30 UTC → TR 23:00–23:59 arası).
export const maxDuration = 60;

export async function GET(req: Request) {
  const authStatus = checkCronAuth(req.headers.get('authorization'), process.env.CRON_SECRET);
  if (authStatus === 503) return NextResponse.json({ error: 'Yapılandırma eksik' }, { status: 503 });
  if (authStatus === 401) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // ?dry=1: Telegram'a göndermeden metni döner (elle kontrol için; yine CRON_SECRET gerekir).
  const dryRun = new URL(req.url).searchParams.get('dry') === '1';
  let payload;
  try {
    payload = await getPayload({ config: configPromise });
    const result = await runDailyReport(payload, { dryRun });
    return NextResponse.json({ success: true, sent: result.sent, cleanup: result.cleanup, flushed: result.flushed, ...(dryRun ? { text: result.text } : {}) });
  } catch (error) {
    console.error('Daily report failed:', error);
    if (payload) {
      await logEvent(payload, {
        kind: 'report_failed', category: 'report', topic: 'errors', level: 'error',
        text: `💥 <b>Gün sonu raporu oluşturulamadı</b>\n⚠️ ${String((error as Error)?.message ?? error).slice(0, 300).replace(/[<>&]/g, '')}`,
      });
    }
    return NextResponse.json({ error: 'Report failed' }, { status: 500 });
  }
}
