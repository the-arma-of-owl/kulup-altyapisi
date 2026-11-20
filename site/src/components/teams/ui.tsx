'use client'

import React from 'react'

// Takım modu ekranlarının ortak form parçaları (sitenin kayıt formuyla aynı görünüm).

export const inputClass = 'girdi'

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="block font-display text-sm font-bold text-murekkep">{label}</span>
      {children}
      {hint && <span className="block text-xs text-soluk">{hint}</span>}
    </label>
  )
}

export function Button({ children, variant = 'primary', ref, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger'; ref?: React.Ref<HTMLButtonElement> }) {
  const styles = {
    primary: 'dugme-ana',
    ghost: 'dugme-yuzey',
    danger: 'bg-pembe !text-murekkep',
  }[variant]
  return (
    <button ref={ref} {...props} className={`dugme disabled:cursor-not-allowed ${styles} ${props.className ?? ''}`}>
      {children}
    </button>
  )
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'error' | 'success' | 'warning' | 'alert'; children: React.ReactNode }) {
  const styles = {
    info: 'bg-gok shadow-sert-sm',
    error: 'bg-pembe shadow-sert-sm',
    success: 'bg-nane shadow-sert-sm',
    warning: 'bg-limon shadow-sert-sm',
    // Gözden kaçmaması gereken uyarı (onay ≠ kabul): dolu sarı, koyu yazı, iki temada da aynı
    alert: 'bg-limon font-semibold shadow-sert',
  }[kind]
  return <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-2xl border border-kenar px-4 py-3 text-sm leading-relaxed text-murekkep ${styles}`}>{children}</div>
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`kart p-5 sm:p-7 ${className}`}>{children}</div>
}

export const statusLabel: Record<string, string> = {
  draft: 'Taslak · henüz gönderilmedi', pending: 'Kontrol ediliyor', approved: 'Başvuru alındı · sonuç bekleniyor', accepted: 'Kabul edildi 🎉', rejected: 'Reddedildi',
}

const VITRIN_ACK_KEY = 'kulup:vitrin-okundu'
const VITRIN_ACK_EVERY_MS = 2 * 24 * 60 * 60 * 1000

/**
 * "Vitrin ≠ kabul" hatırlatması: takımı kontrol edilen ya da vitrinde olan katılımcıya sayfanın altında küçük bir
 * uyarı kartı çıkar. "Okudum, anladım" onayı yalnız bu tarayıcıda tutulur ve 2 gün sonra yeniden sorulur.
 */
export function VitrinNoticeDialog({ show }: { show: boolean }) {
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => {
    if (!show) { setOpen(false); return }
    let last = 0
    try { last = Number(window.localStorage.getItem(VITRIN_ACK_KEY)) || 0 } catch { /* depolama kapalı: her açılışta sor */ }
    setOpen(Date.now() - last >= VITRIN_ACK_EVERY_MS)
  }, [show])
  if (!open) return null
  const ack = () => {
    try { window.localStorage.setItem(VITRIN_ACK_KEY, String(Date.now())) } catch { /* yok say */ }
    setOpen(false)
  }
  return (
    <div role="status" className="fixed inset-x-4 bottom-4 z-[60] mx-auto max-w-md rounded-2xl border border-kenar bg-limon p-4 text-sm leading-relaxed text-murekkep shadow-sert-lg">
      <p>
        Takımın <strong>&quot;Başvuran takımlar&quot;</strong> arasında görünüyorsa bu <strong>başvurunun alındığı</strong> anlamına
        gelir, <strong>kabul edildiğin</strong> değil.
      </p>
      <p className="mt-2">
        Katılacak takımları yönetim seçer. Kabul edilirseniz <strong>mail</strong> gelir ve takımınız
        <strong> &quot;Kabul edilen takımlar&quot;</strong> bölümüne geçer.
      </p>
      <button type="button" onClick={ack} className="mt-3 inline-flex items-center rounded-full border border-kenar bg-murekkep px-4 py-2 font-display text-xs font-bold text-white transition-transform ">
        Okudum, anladım
      </button>
    </div>
  )
}

/**
 * Uygulama içi onay penceresi (tarayıcı confirm() yerine). Esc ve arka plana tıklama vazgeçer;
 * açılınca odak "Vazgeç" düğmesindedir (yanlışlıkla Enter'la onay verilmesin).
 */
export function ConfirmDialog({ open, title, children, confirmLabel, busy = false, onConfirm, onCancel }: {
  open: boolean; title: string; children: React.ReactNode; confirmLabel: string; busy?: boolean
  onConfirm: () => void; onCancel: () => void
}) {
  const cancelRef = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 px-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel() }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="onay-baslik" aria-describedby="onay-metin"
        className="w-full max-w-md space-y-4 rounded-kutu border border-kenar bg-yuzey p-6 text-murekkep shadow-sert-lg">
        <h2 id="onay-baslik" className="font-display text-xl font-extrabold">{title}</h2>
        <div id="onay-metin" className="text-sm leading-relaxed text-soluk">{children}</div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button ref={cancelRef} variant="ghost" disabled={busy} onClick={onCancel}>Vazgeç</Button>
          <Button variant="danger" disabled={busy} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  )
}
