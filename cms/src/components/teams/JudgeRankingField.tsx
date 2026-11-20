import type { UIFieldServerComponent } from 'payload'
import { hasVerifiedTotp } from '../../lib/requireTotp'
import { rankingForEvent } from '../../endpoints/teams'

// Etkinlik → "Ödüller ve sonuçlar": jüri puanlarından ÖNERİ sıralaması. Yalnız bilgi amaçlı; yayın yöneticinin
// "Sonuç sıralaması"nı doldurup "Sonuçlar yayında"yı işaretlemesiyle olur. DB sütunu yok (ui alanı).
export const JudgeRankingField: UIFieldServerComponent = async ({ id, data, req }) => {
  const user = req.user as { roles?: string[] | null; hasTotp?: boolean; _strategy?: string } | null
  if (!user?.roles?.includes('admin') || !hasVerifiedTotp(user)) return null
  if (!id || !data?.teamMode) return null
  let rows: Awaited<ReturnType<typeof rankingForEvent>> = []
  let error = ''
  try { rows = await rankingForEvent(req, id) } catch { error = 'Jüri puanları okunamadı (team_scores tablosu uygulanmış mı?).' }
  return (
    <div style={{ border: '1px solid var(--theme-elevation-150)', borderRadius: 8, padding: 16, margin: '12px 0' }}>
      <strong>⚖️ Jüri puanlarından öneri sıralaması</strong>
      <p style={{ opacity: 0.7, fontSize: 13, margin: '4px 0 10px' }}>
        Takım başına jüri ortalaması (100 üzerinden, kriter ağırlıklı). Yayın onayı sizde: aşağıdaki &quot;Sonuç sıralaması&quot;nı doldurun.
      </p>
      {error && <p style={{ color: 'var(--theme-error-500)' }}>{error}</p>}
      {!error && !rows.length && <p style={{ opacity: 0.7 }}>Henüz jüri puanı yok.</p>}
      {rows.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead><tr><th style={{ textAlign: 'left' }}>Sıra</th><th style={{ textAlign: 'left' }}>Takım</th><th style={{ textAlign: 'right' }}>Ortalama</th><th style={{ textAlign: 'right' }}>Jüri</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.team} style={{ borderTop: '1px solid var(--theme-elevation-100)' }}>
                <td>{row.rank}</td><td>{row.name}</td><td style={{ textAlign: 'right' }}>{row.average.toFixed(2)}</td><td style={{ textAlign: 'right' }}>{row.judges}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
