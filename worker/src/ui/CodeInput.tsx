import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from 'react'

// Altı kutulu doğrulama kodu girişi: rakam yazınca sonraki kutuya geçer, boş kutuda Backspace
// öncekine döner, oklarla gezilir, kodun tamamı herhangi bir kutuya yapıştırılabilir ve
// kod tamamlanınca onComplete çağrılır.
export function CodeInput({ value, onChange, onComplete, label, disabled = false, length = 6 }: {
  value: string; onChange: (value: string) => void; onComplete?: (value: string) => void
  label: string; disabled?: boolean; length?: number
}) {
  const boxes = useRef<Array<HTMLInputElement | null>>([])
  const completedFor = useRef('')
  const digits = Array.from({ length }, (_, index) => value[index] ?? '')

  useEffect(() => { boxes.current[0]?.focus() }, [])
  useEffect(() => {
    if (value.length === length && completedFor.current !== value) {
      completedFor.current = value
      onComplete?.(value)
    }
    if (value.length < length) completedFor.current = ''
  }, [value, length, onComplete])

  const focusBox = (index: number) => {
    const target = boxes.current[Math.min(Math.max(index, 0), length - 1)]
    target?.focus()
    target?.select()
  }
  const write = (start: number, incoming: string) => {
    const clean = incoming.replace(/\D/g, '')
    if (!clean) return
    const next = digits.slice()
    let cursor = start
    for (const digit of clean) {
      if (cursor >= length) break
      next[cursor++] = digit
    }
    onChange(next.join('').slice(0, length))
    focusBox(cursor)
  }
  const onKeyDown = (index: number) => (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace') {
      event.preventDefault()
      const next = digits.slice()
      if (next[index]) { next[index] = ''; onChange(next.join('')); return }
      if (index > 0) { next[index - 1] = ''; onChange(next.join('')); focusBox(index - 1) }
    } else if (event.key === 'ArrowLeft') { event.preventDefault(); focusBox(index - 1) }
    else if (event.key === 'ArrowRight') { event.preventDefault(); focusBox(index + 1) }
  }
  const onPaste = (index: number) => (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault()
    write(index, event.clipboardData.getData('text'))
  }

  return <div className="code-field">
    <span id="code-input-label">{label}</span>
    <div className="code-input" role="group" aria-labelledby="code-input-label">
      {digits.map((digit, index) => <input key={index} ref={(el) => { boxes.current[index] = el }}
        className="code-input__box" aria-label={`${index + 1}. hane`} inputMode="numeric" maxLength={1}
        autoComplete={index === 0 ? 'one-time-code' : 'off'} disabled={disabled} value={digit}
        onChange={(event) => write(index, event.target.value)} onFocus={(event) => event.target.select()}
        onKeyDown={onKeyDown(index)} onPaste={onPaste(index)} />)}
    </div>
  </div>
}
