import { NextResponse } from 'next/server';
import { performBackupAndSend } from '@/lib/backup';
import { checkCronAuth } from '@/lib/cronAuth';

export async function GET(req: Request) {
  // Yedekleme yalnız yapılandırılmış cron sırrıyla çalışır.
  const authStatus = checkCronAuth(req.headers.get('authorization'), process.env.CRON_SECRET);
  if (authStatus === 503) {
    return NextResponse.json({ error: 'Yapılandırma eksik' }, { status: 503 });
  }
  if (authStatus === 401) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const success = await performBackupAndSend();
    if (success) {
      return NextResponse.json({ success: true, message: 'Backup sent to Telegram' });
    }
    return NextResponse.json({ error: 'Backup failed' }, { status: 500 });
  } catch (error) {
    console.error('Backup failed:', error);
    return NextResponse.json({ error: 'Backup failed' }, { status: 500 });
  }
}
