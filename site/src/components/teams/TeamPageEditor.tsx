'use client';
/* eslint-disable @next/next/no-img-element -- yüklenen GIF/görseller farklı alan adlarından gelebilir */
/**
 * Kaptanın takım sayfası düzenleyicisi (canlı önizlemeli).
 *
 * - Sahnedeki sticker/GIF'ler pointer events ile sürüklenir (fare + dokunmatik), tutamaçlarla
 *   döndürülür/boyutlanır. Klavye: Tab ile seç, oklar taşır (Shift ×5), +/- boyut, R / Shift+R
 *   döndür, Delete sil, Esc bırak.
 * - Kaydederken tasarım validateDesign'dan geçer (sunucu da aynısını yapmalı).
 */
import { useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import {
  ArrowUp, Bold, Check, ImagePlus, Italic, Link2, List, Loader2, RotateCcw, RotateCw, Trash2, Upload, X,
} from 'lucide-react';
import type { TeamPublic } from '@/lib/teams/types';
import {
  DESIGN_PRESETS, LAYOUTS, LIMITS, PATTERNS, STICKERS, deriveTheme, newUid, normalizeHex, patternBackground,
  readableOn, safeMediaUrl, stickerLabel, validateDesign,
  type PatternId, type PlacedGif, type PlacedSticker, type StickerId, type TeamPageDesign,
} from '@/lib/teams/design';
import { StickerArt } from './stickerArt';
import { TeamPageView, placedStyle } from './TeamPage';

export type TeamPageEditorProps = {
  team: TeamPublic;
  initialDesign: TeamPageDesign;
  onSave(design: TeamPageDesign): Promise<void>;
  onUploadGif(file: File): Promise<{ url: string }>;
  onUploadImage(kind: 'logo' | 'cover', file: File): Promise<{ url: string }>;
  /** Takımın kayıtlı logo/kapak görselini kaldırır (yalnız tasarımdaki adres değil) */
  onClearImage(kind: 'logo' | 'cover'): Promise<void>;
};

type Kind = 'sticker' | 'gif';
type Sel = { kind: Kind; uid: string } | null;
type Tab = 'sablon' | 'renk' | 'sticker' | 'gif' | 'metin' | 'gorsel';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'sablon', label: 'Şablon' },
  { id: 'renk', label: 'Renk & desen' },
  { id: 'sticker', label: 'Sticker' },
  { id: 'gif', label: 'GIF' },
  { id: 'metin', label: 'Manifesto' },
  { id: 'gorsel', label: 'Logo & kapak' },
];

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const round2 = (v: number) => Math.round(v * 100) / 100;
const wrapAngle = (a: number) => {
  let r = Math.round(a) % 360;
  if (r > 180) r -= 360;
  if (r < -180) r += 360;
  return r;
};

type Placed = PlacedSticker | PlacedGif;

// ─── Küçük form parçaları ────────────────────────────────────────────────────

const panelCls = 'rounded-kutu border border-kenar bg-yuzey p-4 text-murekkep shadow-sert';
const labelCls = 'font-display text-xs font-extrabold uppercase tracking-[0.14em] text-soluk';
const btnCls =
  'inline-flex items-center justify-center gap-1.5 rounded-full border border-kenar bg-yuzey px-3 py-1.5 font-display text-sm font-bold text-murekkep shadow-sert-sm transition-[transform,box-shadow] hover:shadow-sert active:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ana disabled:pointer-events-none disabled:opacity-40';
const primaryCls = 'dugme dugme-ana';

function ColorField({ label, value, onChange }: { label: string; value: string; onChange(v: string): void }) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  const invalid = draft !== null && !normalizeHex(draft);
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className={labelCls}>{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} seçici`}
          value={value}
          onChange={(e) => { setDraft(null); onChange(e.target.value); }}
          className="h-11 w-12 shrink-0 cursor-pointer rounded-xl border border-kenar bg-yuzey p-0.5"
        />
        <input
          id={id}
          type="text"
          inputMode="text"
          spellCheck={false}
          maxLength={7}
          value={shown}
          aria-invalid={invalid || undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            const hex = normalizeHex(e.target.value);
            if (hex) onChange(hex);
          }}
          onBlur={() => setDraft(null)}
          className={`girdi !rounded-xl !px-3 !py-2 font-mono text-sm uppercase ${invalid ? '!border-hata' : ''}`}
        />
      </div>
      {invalid ? <p className="text-xs font-semibold text-hata">#RRGGBB biçiminde bir renk yazın.</p> : null}
    </div>
  );
}

function RangeField({ label, value, min, max, step = 1, format, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; format?: (v: number) => string; onChange(v: number): void;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className={labelCls}>{label}</label>
        <span className="font-mono text-xs font-bold text-murekkep">{format ? format(value) : value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--kulup-ana,#7c3aed)]"
      />
    </div>
  );
}

// ─── Düzenlenebilir sahne ────────────────────────────────────────────────────

type Drag = {
  mode: 'move' | 'rotate' | 'resize';
  kind: Kind;
  uid: string;
  startX: number;
  startY: number;
  orig: Placed;
  rect: DOMRect;
  origDist: number;
};

function EditableStage({
  design, selected, onSelect, onChangeItem, onRemove, onFront,
}: {
  design: TeamPageDesign;
  selected: Sel;
  onSelect(sel: Sel): void;
  onChangeItem(kind: Kind, uid: string, patch: Partial<Placed>): void;
  onRemove(kind: Kind, uid: string): void;
  onFront(kind: Kind, uid: string): void;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  const begin = (e: ReactPointerEvent, mode: Drag['mode'], kind: Kind, item: Placed) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const layer = layerRef.current;
    if (!layer) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = layer.getBoundingClientRect();
    const cx = rect.left + (item.x / 100) * rect.width;
    const cy = rect.top + (item.y / 100) * rect.height;
    drag.current = {
      mode, kind, uid: item.uid, startX: e.clientX, startY: e.clientY, orig: item, rect,
      origDist: Math.max(8, Math.hypot(e.clientX - cx, e.clientY - cy)),
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onSelect({ kind, uid: item.uid });
  };

  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const { rect, orig } = d;
    if (d.mode === 'move') {
      onChangeItem(d.kind, d.uid, {
        x: round2(clamp(orig.x + ((e.clientX - d.startX) / rect.width) * 100, 0, 100)),
        y: round2(clamp(orig.y + ((e.clientY - d.startY) / rect.height) * 100, 0, 100)),
      });
      return;
    }
    const cx = rect.left + (orig.x / 100) * rect.width;
    const cy = rect.top + (orig.y / 100) * rect.height;
    if (d.mode === 'rotate') {
      const deg = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90;
      onChangeItem(d.kind, d.uid, { rotation: wrapAngle(deg) });
    } else {
      const lim = d.kind === 'sticker' ? LIMITS.stickerSize : LIMITS.gifSize;
      const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
      onChangeItem(d.kind, d.uid, { size: round2(clamp((orig.size * dist) / d.origDist, lim.min, lim.max)) });
    }
  };

  const end = (e: ReactPointerEvent) => {
    if (!drag.current) return;
    drag.current = null;
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  };

  const onKey = (e: KeyboardEvent, kind: Kind, item: Placed) => {
    const step = e.shiftKey ? 5 : 1;
    const lim = kind === 'sticker' ? LIMITS.stickerSize : LIMITS.gifSize;
    let patch: Partial<Placed> | null = null;
    switch (e.key) {
      case 'ArrowLeft': patch = { x: clamp(item.x - step, 0, 100) }; break;
      case 'ArrowRight': patch = { x: clamp(item.x + step, 0, 100) }; break;
      case 'ArrowUp': patch = { y: clamp(item.y - step, 0, 100) }; break;
      case 'ArrowDown': patch = { y: clamp(item.y + step, 0, 100) }; break;
      case '+': case '=': patch = { size: clamp(item.size + step, lim.min, lim.max) }; break;
      case '-': case '_': patch = { size: clamp(item.size - step, lim.min, lim.max) }; break;
      case 'r': case 'R': patch = { rotation: wrapAngle(item.rotation + (e.shiftKey ? -15 : 15)) }; break;
      case 'Delete': case 'Backspace':
        e.preventDefault();
        onRemove(kind, item.uid);
        layerRef.current?.focus();
        return;
      case 'Escape':
        onSelect(null);
        (e.currentTarget as HTMLElement).blur();
        return;
      default:
        return;
    }
    e.preventDefault();
    onChangeItem(kind, item.uid, patch);
  };

  const handleCls = 'absolute z-10 flex h-8 w-8 items-center justify-center touch-none';
  const dot = 'block rounded-full border border-kenar bg-limon shadow-sert-sm';

  const renderItem = (kind: Kind, item: Placed, body: ReactNode, label: string) => {
    const isSel = selected?.kind === kind && selected.uid === item.uid;
    return (
      <div
        key={item.uid}
        role="button"
        tabIndex={0}
        aria-pressed={isSel}
        aria-label={`${label} — konum ${Math.round(item.x)}, ${Math.round(item.y)}; boyut ${Math.round(item.size)}; açı ${item.rotation}°`}
        className={`absolute cursor-grab touch-none select-none outline-none active:cursor-grabbing ${kind === 'sticker' ? 'aspect-square' : ''}`}
        style={placedStyle(item)}
        onPointerDown={(e) => begin(e, 'move', kind, item)}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onFocus={() => onSelect({ kind, uid: item.uid })}
        onKeyDown={(e) => onKey(e, kind, item)}
      >
        {body}
        {isSel ? (
          <>
            <span aria-hidden="true" className="pointer-events-none absolute -inset-1.5 rounded-lg border border-dashed border-kenar shadow-[0_0_0_2px_#ffffff]" />
            {/* döndürme tutamacı */}
            <span
              aria-hidden="true"
              className={`${handleCls} -top-10 left-1/2 -translate-x-1/2 cursor-alias`}
              onPointerDown={(e) => begin(e, 'rotate', kind, item)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
            >
              <span className={`${dot} h-4 w-4`} />
              <span className="pointer-events-none absolute left-1/2 top-[26px] h-3 w-0.5 -translate-x-1/2 bg-murekkep" />
            </span>
            {/* boyut tutamacı */}
            <span
              aria-hidden="true"
              className={`${handleCls} -bottom-5 -right-5 cursor-nwse-resize`}
              onPointerDown={(e) => begin(e, 'resize', kind, item)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
            >
              <span className="block h-4 w-4 rounded-[4px] border border-kenar bg-limon shadow-sert-sm" />
            </span>
            {/* sil / öne al */}
            <span className="absolute -left-4 -top-4 z-10 flex gap-1" style={{ transform: `rotate(${-item.rotation}deg)` }}>
              <button
                type="button"
                tabIndex={-1}
                aria-label={`${label} sil`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onRemove(kind, item.uid); }}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-kenar bg-pembe text-murekkep shadow-sert-sm"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                tabIndex={-1}
                aria-label={`${label} öne al`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onFront(kind, item.uid); }}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-kenar bg-yuzey text-murekkep shadow-sert-sm"
              >
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </button>
            </span>
          </>
        ) : null}
      </div>
    );
  };

  return (
    <div
      ref={layerRef}
      tabIndex={-1}
      role="group"
      aria-label="Sahne: sticker ve GIF'leri sürükleyin. Klavye: Tab ile seçin, oklarla taşıyın, + / - boyut, R döndür, Delete sil."
      className="absolute inset-0 outline-none"
      onPointerDown={(e) => { if (e.target === e.currentTarget) onSelect(null); }}
    >
      {design.gifs.map((g) => {
        const src = safeMediaUrl(g.url, { allowBlob: true });
        if (!src) return null;
        return renderItem(
          'gif', g,
          <img src={src} alt={g.alt || 'Takım GIF’i'} draggable={false} className="pointer-events-none block w-full rounded-xl ring-2 ring-white/80" />,
          `GIF${g.alt ? ` (${g.alt})` : ''}`,
        );
      })}
      {design.stickers.map((s) =>
        renderItem('sticker', s, <StickerArt id={s.sticker} decorative className="pointer-events-none h-full w-full" />, `Sticker: ${stickerLabel(s.sticker)}`),
      )}
    </div>
  );
}

// ─── Editör ──────────────────────────────────────────────────────────────────

export function TeamPageEditor({ team: savedTeam, initialDesign, onSave, onUploadGif, onUploadImage, onClearImage }: TeamPageEditorProps) {
  // Kaldırılan logo/kapak, takım yeniden yüklenene kadar eski kayıttan geri gelmesin
  const [cleared, setCleared] = useState<{ logo?: boolean; cover?: boolean }>({});
  const team = useMemo(() => ({
    ...savedTeam,
    logoUrl: cleared.logo ? null : savedTeam.logoUrl,
    coverUrl: cleared.cover ? null : savedTeam.coverUrl,
  }), [savedTeam, cleared]);
  const [design, setDesign] = useState<TeamPageDesign>(() => validateDesign(initialDesign));
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(validateDesign(initialDesign)));
  const [selected, setSelected] = useState<Sel>(null);
  const [tab, setTab] = useState<Tab>('sablon');
  const [saving, setSaving] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle');
  const [busy, setBusy] = useState<null | 'gif' | 'logo' | 'cover'>(null);
  const [notice, setNotice] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const gifInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const manifestoId = useId();
  const tabsId = useId();

  const dirty = JSON.stringify(design) !== savedJson;
  const theme = deriveTheme(design);
  const manifesto = design.manifesto ?? team.manifesto ?? '';

  const update = (fn: (d: TeamPageDesign) => TeamPageDesign) => {
    setDesign((d) => fn(d));
    setSaving((s) => (s === 'ok' || s === 'error' ? 'idle' : s));
  };

  const changeItem = (kind: Kind, uid: string, patch: Partial<Placed>) =>
    update((d) =>
      kind === 'sticker'
        ? { ...d, stickers: d.stickers.map((s) => (s.uid === uid ? ({ ...s, ...patch } as PlacedSticker) : s)) }
        : { ...d, gifs: d.gifs.map((g) => (g.uid === uid ? ({ ...g, ...patch } as PlacedGif) : g)) },
    );
  const removeItem = (kind: Kind, uid: string) => {
    update((d) => (kind === 'sticker' ? { ...d, stickers: d.stickers.filter((s) => s.uid !== uid) } : { ...d, gifs: d.gifs.filter((g) => g.uid !== uid) }));
    setSelected(null);
  };
  const toFront = (kind: Kind, uid: string) =>
    update((d) => {
      if (kind === 'sticker') {
        const it = d.stickers.find((s) => s.uid === uid);
        return it ? { ...d, stickers: [...d.stickers.filter((s) => s.uid !== uid), it] } : d;
      }
      const it = d.gifs.find((g) => g.uid === uid);
      return it ? { ...d, gifs: [...d.gifs.filter((g) => g.uid !== uid), it] } : d;
    });

  const select = (sel: Sel) => {
    setSelected(sel);
    if (sel) setTab(sel.kind);
  };

  const addSticker = (id: StickerId) => {
    if (design.stickers.length >= LIMITS.maxStickers) {
      setNotice({ kind: 'error', text: `En fazla ${LIMITS.maxStickers} sticker eklenebilir.` });
      return;
    }
    const n = design.stickers.length;
    const uid = newUid('s', [...design.stickers, ...design.gifs]);
    const item: PlacedSticker = {
      uid, sticker: id,
      x: 18 + ((n * 17) % 66), y: 30 + ((n * 23) % 45),
      size: LIMITS.stickerSize.default, rotation: ((n % 5) - 2) * 8,
    };
    update((d) => ({ ...d, stickers: [...d.stickers, item] }));
    setSelected({ kind: 'sticker', uid });
    setNotice({ kind: 'info', text: `${stickerLabel(id)} eklendi. Sahnede sürükleyerek konumlandırın.` });
  };

  // Hem tasarımdaki adres hem takımın kayıtlı görseli kaldırılır; yoksa kayıttaki görsel geri gelir
  const clearImage = async (kind: 'logo' | 'cover') => {
    setNotice(null);
    setBusy(kind);
    try {
      await onClearImage(kind);
      update((d) => ({ ...d, [kind === 'logo' ? 'logoUrl' : 'coverUrl']: null }));
      setCleared((c) => ({ ...c, [kind]: true }));
      setNotice({ kind: 'info', text: kind === 'logo' ? 'Logo kaldırıldı.' : 'Kapak kaldırıldı.' });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error && error.message ? error.message : 'Kaldırılamadı. Tekrar deneyin.' });
    } finally {
      setBusy(null);
    }
  };

  const pickFile = async (kind: 'gif' | 'logo' | 'cover', file: File | undefined) => {
    if (!file) return;
    setNotice(null);
    if (kind === 'gif') {
      if (!/^image\/(gif|webp)$/.test(file.type)) return setNotice({ kind: 'error', text: 'Yalnız animasyonlu GIF veya WebP yüklenebilir.' });
      if (file.size > LIMITS.maxGifBytes) return setNotice({ kind: 'error', text: `GIF en fazla ${LIMITS.maxGifBytes / 1024 / 1024} MB olabilir.` });
      if (design.gifs.length >= LIMITS.maxGifs) return setNotice({ kind: 'error', text: `En fazla ${LIMITS.maxGifs} GIF eklenebilir.` });
    } else {
      if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return setNotice({ kind: 'error', text: 'PNG, JPG, WEBP ya da GIF seçin.' });
      const maxBytes = kind === 'logo' ? LIMITS.maxLogoBytes : LIMITS.maxCoverBytes;
      if (file.size > maxBytes) return setNotice({ kind: 'error', text: `${kind === 'logo' ? 'Logo' : 'Kapak'} en fazla ${maxBytes / 1024 / 1024} MB olabilir.` });
    }
    setBusy(kind);
    try {
      const { url } = kind === 'gif' ? await onUploadGif(file) : await onUploadImage(kind, file);
      if (!safeMediaUrl(url, { allowBlob: true })) throw new Error('Geçersiz adres');
      if (kind === 'gif') {
        const uid = newUid('g', [...design.stickers, ...design.gifs]);
        const gif: PlacedGif = { uid, url, alt: '', x: 50, y: 50, size: LIMITS.gifSize.default, rotation: 0 };
        update((d) => (d.gifs.length >= LIMITS.maxGifs ? d : { ...d, gifs: [...d.gifs, gif] }));
        setSelected({ kind: 'gif', uid });
        setNotice({ kind: 'info', text: 'GIF eklendi. Kısa bir açıklama (alt metin) yazmayı unutmayın.' });
      } else {
        update((d) => ({ ...d, [kind === 'logo' ? 'logoUrl' : 'coverUrl']: url }));
        setCleared((c) => ({ ...c, [kind]: false }));
        setNotice({ kind: 'info', text: kind === 'logo' ? 'Logo güncellendi.' : 'Kapak güncellendi.' });
      }
    } catch (error) {
      // Sunucunun ret nedeni (boyut, imza, kare sayısı…) kullanıcıya gösterilir.
      const message = error instanceof Error && error.message && error.message !== 'Geçersiz adres' ? error.message : 'Yükleme başarısız oldu. Tekrar deneyin.';
      setNotice({ kind: 'error', text: message });
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    const clean = validateDesign(design);
    setSaving('saving');
    try {
      await onSave(clean);
      setDesign(clean);
      setSavedJson(JSON.stringify(clean));
      setSaving('ok');
    } catch {
      setSaving('error');
    }
  };

  const setManifesto = (v: string) => update((d) => ({ ...d, manifesto: v.slice(0, LIMITS.manifestoMax) }));

  const format = (kind: 'bold' | 'italic' | 'list' | 'link') => {
    const ta = textRef.current;
    if (!ta) return;
    const { selectionStart: a, selectionEnd: b } = ta;
    const v = manifesto;
    const sel = v.slice(a, b);
    let next = v;
    let caretA = a;
    let caretB = b;
    if (kind === 'bold' || kind === 'italic') {
      const m = kind === 'bold' ? '**' : '*';
      const inner = sel || (kind === 'bold' ? 'kalın metin' : 'italik metin');
      next = v.slice(0, a) + m + inner + m + v.slice(b);
      caretA = a + m.length;
      caretB = caretA + inner.length;
    } else if (kind === 'list') {
      const start = v.lastIndexOf('\n', a - 1) + 1;
      const block = v.slice(start, b) || 'madde';
      const listed = block.split('\n').map((l) => (l.startsWith('- ') ? l : `- ${l}`)).join('\n');
      next = v.slice(0, start) + listed + v.slice(Math.max(b, start));
      caretA = start;
      caretB = start + listed.length;
    } else {
      const text = sel || 'bağlantı metni';
      const ins = `[${text}](https://)`;
      next = v.slice(0, a) + ins + v.slice(b);
      caretA = a + text.length + 3;
      caretB = caretA + 8;
    }
    setManifesto(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(caretA, caretB);
    });
  };

  const selSticker = selected?.kind === 'sticker' ? design.stickers.find((s) => s.uid === selected.uid) : undefined;
  const selGif = selected?.kind === 'gif' ? design.gifs.find((g) => g.uid === selected.uid) : undefined;

  const itemControls = (kind: Kind, item: Placed, label: string) => {
    const lim = kind === 'sticker' ? LIMITS.stickerSize : LIMITS.gifSize;
    return (
      <div className={`${panelCls} space-y-3`}>
        <div className="flex items-center justify-between gap-2">
          <p className="truncate font-display text-sm font-extrabold text-murekkep">Seçili: {label}</p>
          <button type="button" className={btnCls} onClick={() => setSelected(null)}>Bırak</button>
        </div>
        <RangeField label="Boyut" value={item.size} min={lim.min} max={lim.max} step={0.5} format={(v) => `%${Math.round(v)}`} onChange={(v) => changeItem(kind, item.uid, { size: v })} />
        <RangeField label="Açı" value={item.rotation} min={-180} max={180} format={(v) => `${v}°`} onChange={(v) => changeItem(kind, item.uid, { rotation: v })} />
        <div className="grid grid-cols-2 gap-2">
          <RangeField label="Yatay" value={item.x} min={0} max={100} step={0.5} format={(v) => `%${Math.round(v)}`} onChange={(v) => changeItem(kind, item.uid, { x: v })} />
          <RangeField label="Dikey" value={item.y} min={0} max={100} step={0.5} format={(v) => `%${Math.round(v)}`} onChange={(v) => changeItem(kind, item.uid, { y: v })} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnCls} onClick={() => changeItem(kind, item.uid, { rotation: wrapAngle(item.rotation - 15) })} aria-label="15 derece sola döndür"><RotateCcw className="h-4 w-4" aria-hidden="true" /></button>
          <button type="button" className={btnCls} onClick={() => changeItem(kind, item.uid, { rotation: wrapAngle(item.rotation + 15) })} aria-label="15 derece sağa döndür"><RotateCw className="h-4 w-4" aria-hidden="true" /></button>
          <button type="button" className={btnCls} onClick={() => toFront(kind, item.uid)}><ArrowUp className="h-4 w-4" aria-hidden="true" /> Öne al</button>
          <button type="button" className={`${btnCls} !bg-pembe !text-murekkep`} onClick={() => removeItem(kind, item.uid)}><Trash2 className="h-4 w-4" aria-hidden="true" /> Sil</button>
        </div>
      </div>
    );
  };

  const tabPanel = (() => {
    switch (tab) {
      case 'sablon':
        return (
          <div className="space-y-5">
            <fieldset className="space-y-2">
              <legend className={labelCls}>Yerleşim</legend>
              <div className="grid grid-cols-2 gap-2">
                {LAYOUTS.map((l) => (
                  <label key={l.id} className={`cursor-pointer rounded-2xl border p-3 text-sm transition has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ana ${design.layout === l.id ? 'border-kenar bg-ana-acik shadow-sert-sm' : 'border-kenar/25 hover:border-kenar'}`}>
                    <input type="radio" name={`${tabsId}-layout`} value={l.id} checked={design.layout === l.id} onChange={() => update((d) => ({ ...d, layout: l.id }))} className="sr-only" />
                    <span className="block font-display font-extrabold text-murekkep">{l.label}</span>
                    <span className="block text-xs text-soluk">{l.hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="space-y-2">
              <p className={labelCls}>Hazır temalar</p>
              <div className="grid grid-cols-2 gap-2">
                {DESIGN_PRESETS.map((p) => {
                  const bgImg = patternBackground(p.pattern);
                  const active = design.colors.background === p.colors.background && design.colors.accent === p.colors.accent && design.pattern.id === p.pattern.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => update((d) => ({ ...d, colors: { ...p.colors }, pattern: { ...p.pattern } }))}
                      className={`flex h-16 items-end justify-between rounded-xl p-2.5 text-left text-xs font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ana ${active ? 'border border-kenar shadow-sert ring-2 ring-ana ring-offset-2 ring-offset-yuzey' : 'border border-kenar/25 hover:border-kenar'}`}
                      style={{ backgroundColor: p.colors.background, backgroundImage: bgImg ?? undefined, color: readableOn(p.colors.background) }}
                    >
                      <span>{p.label}</span>
                      <span className="h-4 w-4 rounded-full ring-2 ring-white/70" style={{ background: p.colors.accent }} aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      case 'renk':
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <ColorField label="Arka plan" value={design.colors.background} onChange={(v) => update((d) => ({ ...d, colors: { ...d.colors, background: v } }))} />
              <ColorField label="Vurgu" value={design.colors.accent} onChange={(v) => update((d) => ({ ...d, colors: { ...d.colors, accent: v } }))} />
            </div>
            <p className="rounded-2xl border border-kenar bg-gok p-3 text-xs leading-relaxed text-murekkep">
              Metin rengi arka plana göre otomatik seçilir ({theme.isDark ? 'açık' : 'koyu'} metin). Vurgu rengi okunmayacak kadar
              soluksa kendiliğinden koyulaştırılır/açılır.
            </p>
            <fieldset className="space-y-2">
              <legend className={labelCls}>Arka plan deseni</legend>
              <div className="grid grid-cols-3 gap-2">
                {PATTERNS.map((p) => {
                  const img = patternBackground({ ...design.pattern, id: p.id as PatternId, opacity: 0.3 });
                  const active = design.pattern.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => update((d) => ({ ...d, pattern: { ...d.pattern, id: p.id as PatternId } }))}
                      className={`flex h-16 items-end rounded-xl p-2 text-[11px] font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ana ${active ? 'border border-kenar shadow-sert ring-2 ring-ana ring-offset-2 ring-offset-yuzey' : 'border border-kenar/25 hover:border-kenar'}`}
                      style={{ backgroundColor: design.colors.background, backgroundImage: img ?? undefined, color: theme.text }}
                    >
                      <span className="rounded-md px-1.5 py-0.5" style={{ background: theme.surface, color: theme.surfaceText }}>{p.label}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
            {design.pattern.id !== 'none' ? (
              <div className="space-y-4">
                <ColorField label="Desen rengi" value={design.pattern.color} onChange={(v) => update((d) => ({ ...d, pattern: { ...d.pattern, color: v } }))} />
                <RangeField label="Opaklık" value={design.pattern.opacity} min={LIMITS.patternOpacity.min} max={LIMITS.patternOpacity.max} step={0.01} format={(v) => `%${Math.round(v * 100)}`} onChange={(v) => update((d) => ({ ...d, pattern: { ...d.pattern, opacity: v } }))} />
                <RangeField label="Desen boyutu" value={design.pattern.size} min={LIMITS.patternSize.min} max={LIMITS.patternSize.max} step={2} format={(v) => `${v} px`} onChange={(v) => update((d) => ({ ...d, pattern: { ...d.pattern, size: v } }))} />
              </div>
            ) : null}
          </div>
        );
      case 'sticker':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className={labelCls}>Sticker ekle</p>
              <span className="rozet bg-limon font-mono">{design.stickers.length}/{LIMITS.maxStickers}</span>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {STICKERS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  title={s.label}
                  aria-label={`${s.label} ekle`}
                  disabled={design.stickers.length >= LIMITS.maxStickers}
                  onClick={() => addSticker(s.id)}
                  className="flex aspect-square items-center justify-center rounded-xl border border-transparent bg-zemin-2 p-1.5 transition hover:border-kenar hover:bg-limon focus-visible:outline focus-visible:outline-2 focus-visible:outline-ana disabled:opacity-40"
                >
                  <StickerArt id={s.id} decorative className="h-full w-full" />
                </button>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-soluk">
              Sahnede sürükleyin; üstteki tutamaçla döndürün, köşedekiyle büyütün. Klavye: Tab ile seçin, oklar taşır (Shift ile hızlı),
              + / − boyut, R döndür, Delete siler.
            </p>
            {selSticker ? itemControls('sticker', selSticker, stickerLabel(selSticker.sticker)) : null}
          </div>
        );
      case 'gif':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className={labelCls}>GIF’ler</p>
              <span className="rozet bg-limon font-mono">{design.gifs.length}/{LIMITS.maxGifs}</span>
            </div>
            <button type="button" className={`${btnCls} w-full`} disabled={busy !== null || design.gifs.length >= LIMITS.maxGifs} onClick={() => gifInput.current?.click()}>
              {busy === 'gif' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
              GIF yükle (en fazla {LIMITS.maxGifBytes / 1024 / 1024} MB)
            </button>
            <ul className="space-y-2">
              {design.gifs.map((g, i) => {
                const src = safeMediaUrl(g.url, { allowBlob: true });
                return (
                  <li key={g.uid} className={`flex items-start gap-3 rounded-2xl border p-2 ${selected?.uid === g.uid ? 'border-kenar bg-ana-acik shadow-sert-sm' : 'border-kenar/25'}`}>
                    <button type="button" onClick={() => setSelected({ kind: 'gif', uid: g.uid })} className="shrink-0 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-ana" aria-label={`GIF ${i + 1} seç`}>
                      {src ? <img src={src} alt="" className="h-14 w-14 rounded-lg border border-kenar object-cover" /> : null}
                    </button>
                    <div className="min-w-0 flex-1 space-y-1">
                      <label htmlFor={`${tabsId}-alt-${g.uid}`} className={labelCls}>Alt metin</label>
                      <input
                        id={`${tabsId}-alt-${g.uid}`}
                        type="text"
                        maxLength={LIMITS.gifAltMax}
                        placeholder="Örn. dans eden kedi"
                        value={g.alt}
                        onChange={(e) => changeItem('gif', g.uid, { alt: e.target.value })}
                        className="girdi !rounded-xl !px-2.5 !py-1.5 text-sm"
                      />
                    </div>
                    <button type="button" className={`${btnCls} !px-2`} aria-label={`GIF ${i + 1} sil`} onClick={() => removeItem('gif', g.uid)}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                  </li>
                );
              })}
            </ul>
            {selGif ? itemControls('gif', selGif, selGif.alt || 'GIF') : null}
          </div>
        );
      case 'metin':
        return (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor={manifestoId} className={labelCls}>Manifesto</label>
              <span className={`font-mono text-xs font-bold ${manifesto.length > LIMITS.manifestoMax * 0.9 ? 'text-hata' : 'text-soluk'}`}>
                {manifesto.length}/{LIMITS.manifestoMax}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5" role="toolbar" aria-label="Biçimlendirme">
              <button type="button" className={btnCls} onClick={() => format('bold')} aria-label="Kalın"><Bold className="h-4 w-4" aria-hidden="true" /></button>
              <button type="button" className={btnCls} onClick={() => format('italic')} aria-label="İtalik"><Italic className="h-4 w-4" aria-hidden="true" /></button>
              <button type="button" className={btnCls} onClick={() => format('list')} aria-label="Liste"><List className="h-4 w-4" aria-hidden="true" /></button>
              <button type="button" className={btnCls} onClick={() => format('link')} aria-label="Bağlantı"><Link2 className="h-4 w-4" aria-hidden="true" /></button>
            </div>
            <textarea
              id={manifestoId}
              ref={textRef}
              rows={10}
              maxLength={LIMITS.manifestoMax}
              value={manifesto}
              onChange={(e) => setManifesto(e.target.value)}
              className="girdi resize-y !p-3 font-mono text-sm leading-relaxed"
            />
            <p className="text-xs leading-relaxed text-soluk">
              **kalın**, *italik*, “- ” ile liste, [metin](https://adres) ile bağlantı. HTML desteklenmez.
            </p>
          </div>
        );
      case 'gorsel':
        return (
          <div className="space-y-4">
            {(['logo', 'cover'] as const).map((k) => {
              const cur = k === 'logo' ? design.logoUrl ?? team.logoUrl : design.coverUrl ?? team.coverUrl;
              const src = safeMediaUrl(cur, { allowBlob: true });
              return (
                <div key={k} className="space-y-2">
                  <p className={labelCls}>{k === 'logo' ? 'Logo (kare)' : 'Kapak (2:1)'}</p>
                  <div className="flex items-center gap-3">
                    <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-kenar bg-zemin-2 ${k === 'logo' ? 'h-16 w-16' : 'h-16 w-32'}`}>
                      {src ? <img src={src} alt={k === 'logo' ? 'Mevcut logo' : 'Mevcut kapak'} className="h-full w-full object-cover" /> : <ImagePlus className="h-6 w-6 text-soluk" aria-hidden="true" />}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={btnCls} disabled={busy !== null} onClick={() => (k === 'logo' ? logoInput : coverInput).current?.click()}>
                        {busy === k ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />} Yükle
                      </button>
                      {cur ? (
                        <button type="button" className={btnCls} disabled={busy !== null} onClick={() => void clearImage(k)}>Kaldır</button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-soluk">PNG, JPG, WEBP veya GIF; logo en fazla {LIMITS.maxLogoBytes / 1024 / 1024} MB, kapak en fazla {LIMITS.maxCoverBytes / 1024 / 1024} MB.</p>
          </div>
        );
    }
  })();

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-2">
        <div className="flex items-center justify-between px-1">
          <p className={labelCls}>Canlı önizleme</p>
          <p className="text-xs text-soluk">Ziyaretçiler sayfayı böyle görür</p>
        </div>
        <TeamPageView
          team={team}
          design={design}
          stageOverlay={
            <EditableStage design={design} selected={selected} onSelect={select} onChangeItem={changeItem} onRemove={removeItem} onFront={toFront} />
          }
        />
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:flex lg:max-h-[calc(100dvh-7rem)] lg:flex-col lg:space-y-0 lg:gap-4" aria-label="Takım sayfası düzenleyicisi">
        <div className={`${panelCls} space-y-4 lg:min-h-0 lg:overflow-y-auto`}>
          <div role="tablist" aria-label="Düzenleme bölümleri" className="grid grid-cols-3 gap-1 rounded-2xl border border-kenar bg-zemin-2 p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                id={`${tabsId}-tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                aria-controls={`${tabsId}-panel`}
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => setTab(t.id)}
                onKeyDown={(e) => {
                  const i = TABS.findIndex((x) => x.id === tab);
                  const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i - 1 + TABS.length) % TABS.length : -1;
                  if (next >= 0) {
                    e.preventDefault();
                    setTab(TABS[next].id);
                    document.getElementById(`${tabsId}-tab-${TABS[next].id}`)?.focus();
                  }
                }}
                className={`rounded-xl px-2 py-2 font-display text-xs font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-ana ${tab === t.id ? 'bg-ana text-white shadow-sert-sm' : 'text-soluk hover:text-murekkep'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-tab-${tab}`}>
            {tabPanel}
          </div>
          <p aria-live="polite" className={`min-h-5 text-xs font-semibold ${notice?.kind === 'error' ? 'text-hata' : 'text-soluk'}`}>
            {notice?.text ?? ''}
          </p>
        </div>

        <div className={`${panelCls} flex shrink-0 flex-wrap items-center gap-3`}>
          <button type="button" className={primaryCls} disabled={!dirty || saving === 'saving'} onClick={save}>
            {saving === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
            Kaydet
          </button>
          <button
            type="button"
            className={btnCls}
            disabled={!dirty}
            onClick={() => { setDesign(JSON.parse(savedJson) as TeamPageDesign); setSelected(null); }}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Son kayda dön
          </button>
          <p aria-live="polite" className="text-xs font-semibold text-soluk">
            {saving === 'ok' ? 'Kaydedildi.' : saving === 'error' ? <span className="text-hata">Kaydedilemedi, tekrar deneyin.</span> : dirty ? 'Kaydedilmemiş değişiklik var.' : ''}
          </p>
        </div>
      </aside>

      <input ref={gifInput} type="file" accept="image/gif,image/webp" className="hidden" onChange={(e) => { void pickFile('gif', e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => { void pickFile('logo', e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={coverInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => { void pickFile('cover', e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}

export default TeamPageEditor;
