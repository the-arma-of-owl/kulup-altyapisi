import { useRef, useState, type ChangeEvent, type RefObject } from 'react'

// Mail HTML düzenleyici: kod ve görsel görünüm, araç çubuğu ve imleçte değişken ekleme.
// Görsel çerçeve yalnız moda geçerken yüklenir; bağlantı adresi araç çubuğundan alınır.

const wrapDocument = (html: string) => /<html[\s>]/i.test(html)
  ? html
  : `<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`

const keepFocus = (event: React.MouseEvent) => event.preventDefault()

/** "www.x.com", "https://https://x.com" gibi girişleri düzeltir; geçersizse null döner. */
export function normalizeLink(input: string): string | null {
  let url = input.trim()
  if (/^\{\{[a-zA-Z]+\}\}$/.test(url) || /^mailto:[^\s]+$/.test(url)) return url
  url = url.replace(/^(https?:\/\/)+/i, (match) => match.slice(0, match.indexOf('//') + 2))
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  try { const parsed = new URL(url); return parsed.hostname.includes('.') ? parsed.href : null } catch { return null }
}

export function VariableButtons({ variables, onInsert }: { variables: readonly string[]; onInsert: (key: string) => void }) {
  return <div className="variable-insert">
    <span>Değişken ekle</span>
    {variables.map((key) => <button key={key} type="button" onMouseDown={keepFocus} onClick={() => onInsert(key)}>{`{{${key}}}`}</button>)}
  </div>
}

/** Düz metin alanına (konu, WhatsApp metni) imleç konumunda değişken ekler. */
export function insertAtCursor(ref: RefObject<HTMLInputElement | HTMLTextAreaElement | null>, value: string,
  onChange: (value: string) => void, key: string) {
  const el = ref.current
  const token = `{{${key}}}`
  const start = el?.selectionStart ?? value.length
  const end = el?.selectionEnd ?? start
  onChange(`${value.slice(0, start)}${token}${value.slice(end)}`)
  requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + token.length, start + token.length) })
}

export function EmailHtmlEditor({ html, onChange, variables }: {
  html: string; onChange: (html: string) => void; variables: readonly string[]
}) {
  const [mode, setMode] = useState<'code' | 'visual'>('code')
  const [seed, setSeed] = useState('')
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [importError, setImportError] = useState('')
  const codeRef = useRef<HTMLTextAreaElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const rangeRef = useRef<Range | null>(null)
  const htmlRef = useRef(html)
  htmlRef.current = html

  const doc = () => frameRef.current?.contentDocument ?? null
  const sync = () => {
    const body = doc()?.body
    if (!body) return
    const current = htmlRef.current
    onChange(/<body[^>]*>[\s\S]*<\/body>/i.test(current)
      ? current.replace(/(<body[^>]*>)[\s\S]*(<\/body>)/i, (_m, open: string, close: string) => `${open}${body.innerHTML}${close}`)
      : body.innerHTML)
  }
  const remember = () => {
    const selection = doc()?.getSelection()
    if (selection?.rangeCount) rangeRef.current = selection.getRangeAt(0).cloneRange()
  }
  const restore = () => {
    const selection = doc()?.getSelection()
    if (!selection || !rangeRef.current) return
    selection.removeAllRanges()
    selection.addRange(rangeRef.current)
  }
  const init = () => {
    const body = doc()?.body
    if (!body) return
    body.setAttribute('contenteditable', 'true')
    body.setAttribute('spellcheck', 'true')
    for (const name of ['keyup', 'mouseup', 'input']) body.addEventListener(name, remember)
    body.addEventListener('input', sync)
    rangeRef.current = null
  }
  const command = (name: string, value?: string) => {
    frameRef.current?.contentWindow?.focus()
    restore()
    doc()?.execCommand(name, false, value)
    remember()
    sync()
  }
  const insertVariable = (key: string) => {
    if (mode === 'visual') { command('insertText', `{{${key}}}`); return }
    insertAtCursor(codeRef, html, onChange, key)
  }
  const toVisual = () => { setSeed(html); setMode('visual') }
  const toCode = () => { if (mode === 'visual') sync(); setMode('code'); setLinkOpen(false) }
  const addLink = () => {
    const url = normalizeLink(linkUrl)
    if (url) command('createLink', url)
    setLinkOpen(false); setLinkUrl('')
  }
  const importHtml = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!/\.html?$/i.test(file.name)) { setImportError('Yalnız HTML dosyası seçin.'); return }
    if (file.size > 1024 * 1024) { setImportError('HTML dosyası 1 MB sınırını aşıyor.'); return }
    try {
      const content = await file.text()
      if (new TextEncoder().encode(content).length > 1024 * 1024) { setImportError('HTML dosyası 1 MB sınırını aşıyor.'); return }
      setImportError('')
      onChange(content)
      setMode('code')
    } catch { setImportError('HTML dosyası okunamadı.') }
  }

  return <div className="html-editor">
    <label>HTML dosyası içe aktar <input type="file" accept=".html,.htm" onChange={(event) => void importHtml(event)} /></label>
    {importError && <p className="warning" role="alert">{importError}</p>}
    <div className="mode-tabs">
      <button type="button" className={mode === 'code' ? 'active' : ''} onClick={toCode}>&lt;/&gt; HTML</button>
      <button type="button" className={mode === 'visual' ? 'active' : ''} disabled={!html.trim()} onClick={toVisual}>👁 Görsel editör</button>
    </div>
    <VariableButtons variables={variables} onInsert={insertVariable} />
    {mode === 'code'
      ? <textarea ref={codeRef} className="code-editor" rows={14} spellCheck={false} value={html} onChange={(e) => onChange(e.target.value)} placeholder="<div>…</div>" />
      : <>
        <div className="visual-toolbar" role="toolbar" aria-label="Görsel metin düzenleme">
          <button type="button" aria-label="Kalın" title="Kalın" onMouseDown={keepFocus} onClick={() => command('bold')}><b>B</b></button>
          <button type="button" aria-label="İtalik" title="İtalik" onMouseDown={keepFocus} onClick={() => command('italic')}><i>I</i></button>
          <button type="button" aria-label="Altı çizili" title="Altı çizili" onMouseDown={keepFocus} onClick={() => command('underline')}><u>U</u></button>
          <span className="toolbar-divider" />
          <button type="button" aria-label="Sola hizala" title="Sola hizala" onMouseDown={keepFocus} onClick={() => command('justifyLeft')}>⯇</button>
          <button type="button" aria-label="Ortala" title="Ortala" onMouseDown={keepFocus} onClick={() => command('justifyCenter')}>≡</button>
          <button type="button" aria-label="Sağa hizala" title="Sağa hizala" onMouseDown={keepFocus} onClick={() => command('justifyRight')}>⯈</button>
          <span className="toolbar-divider" />
          <button type="button" aria-label="Bağlantı ekle" title="Seçili metne bağlantı ekle" onMouseDown={keepFocus} onClick={() => setLinkOpen((open) => !open)}>🔗</button>
          {linkOpen && <span className="link-input">
            <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink() } }} placeholder="ornek.com veya {{biletLinki}}" aria-label="Bağlantı adresi" />
            <button type="button" onMouseDown={keepFocus} onClick={addLink}>Ekle</button>
          </span>}
        </div>
        <iframe ref={frameRef} className="visual-editor" title="Görsel mail düzenleyici" sandbox="allow-same-origin"
          srcDoc={wrapDocument(seed)} onLoad={init} onBlur={sync} />
      </>}
  </div>
}
