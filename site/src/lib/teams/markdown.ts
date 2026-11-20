/**
 * Manifesto için küçük, güvenli Markdown alt kümesi.
 *
 * Desteklenen: paragraf, satır sonu, **kalın**, *italik* / _italik_, "- " ve "1. " listeleri,
 * [metin](https://...) ve çıplak https:// bağlantıları, "# " başlık satırı (kalın paragraf olur).
 * Çıktı bir ağaçtır (HTML dizgesi DEĞİL); React ile çizilir, metin her zaman kaçışlanır.
 * Bağlantı hedefi yalnız http/https olabilir. HTML hiçbir şekilde yorumlanmaz.
 */
import { LIMITS, safeLinkUrl } from './design';

export type MdInline =
  | { t: 'text'; v: string }
  | { t: 'br' }
  | { t: 'strong'; c: MdInline[] }
  | { t: 'em'; c: MdInline[] }
  | { t: 'link'; href: string; c: MdInline[] };

export type MdBlock = { t: 'p'; c: MdInline[]; heading?: boolean } | { t: 'ul' | 'ol'; items: MdInline[][] };

const MAX_DEPTH = 4;
const ESCAPABLE = '\\`*_[](){}#+-.!>~';

function pushText(out: MdInline[], v: string) {
  if (!v) return;
  const last = out[out.length - 1];
  if (last && last.t === 'text') last.v += v;
  else out.push({ t: 'text', v });
}

const isWordChar = (ch: string | undefined) => !!ch && /[\p{L}\p{N}]/u.test(ch);

export function parseInline(src: string, depth = 0, inLink = false): MdInline[] {
  const out: MdInline[] = [];
  if (depth > MAX_DEPTH) {
    pushText(out, src);
    return out;
  }
  let i = 0;
  let buf = '';
  const flush = () => {
    pushText(out, buf);
    buf = '';
  };

  while (i < src.length) {
    const ch = src[i];

    if (ch === '\\' && i + 1 < src.length && ESCAPABLE.includes(src[i + 1])) {
      buf += src[i + 1];
      i += 2;
      continue;
    }

    if (ch === '\n') {
      flush();
      out.push({ t: 'br' });
      i++;
      continue;
    }

    // **kalın**
    if (ch === '*' && src[i + 1] === '*') {
      const end = src.indexOf('**', i + 2);
      if (end > i + 2 && src[i + 2] !== ' ') {
        flush();
        out.push({ t: 'strong', c: parseInline(src.slice(i + 2, end), depth + 1, inLink) });
        i = end + 2;
        continue;
      }
    }

    // *italik* / _italik_
    if ((ch === '*' || ch === '_') && src[i + 1] && src[i + 1] !== ' ' && src[i + 1] !== ch) {
      const okStart = ch === '*' || !isWordChar(src[i - 1]);
      let end = src.indexOf(ch, i + 1);
      while (end !== -1 && ch === '_' && isWordChar(src[end + 1])) end = src.indexOf(ch, end + 1);
      if (okStart && end > i + 1 && src[end - 1] !== ' ' && !src.slice(i + 1, end).includes('\n\n')) {
        flush();
        out.push({ t: 'em', c: parseInline(src.slice(i + 1, end), depth + 1, inLink) });
        i = end + 1;
        continue;
      }
    }

    // [metin](adres)
    if (ch === '[' && !inLink) {
      const m = /^\[([^\]\n]{1,200})\]\(([^()\s]{1,600})\)/.exec(src.slice(i));
      if (m) {
        flush();
        const href = safeLinkUrl(m[2]);
        const label = parseInline(m[1], depth + 1, true);
        if (href) out.push({ t: 'link', href, c: label });
        else {
          for (const n of label) {
            if (n.t === 'text') pushText(out, n.v);
            else out.push(n);
          }
        }
        i += m[0].length;
        continue;
      }
    }

    // çıplak https:// adresi
    if (!inLink && (ch === 'h' || ch === 'H') && !isWordChar(src[i - 1])) {
      const m = /^https?:\/\/[^\s<>()[\]]+/i.exec(src.slice(i));
      if (m) {
        const raw = m[0].replace(/[.,;:!?'"]+$/, '');
        const href = safeLinkUrl(raw);
        if (href) {
          flush();
          out.push({ t: 'link', href, c: [{ t: 'text', v: raw.replace(/^https?:\/\//i, '') }] });
          i += raw.length;
          continue;
        }
      }
    }

    buf += ch;
    i++;
  }
  flush();
  return out;
}

const UL_RE = /^\s{0,3}[-*+]\s+(.*)$/;
const OL_RE = /^\s{0,3}\d{1,3}[.)]\s+(.*)$/;
const H_RE = /^\s{0,3}#{1,6}\s+(.*)$/;

export function parseManifesto(src: string): MdBlock[] {
  const text = (typeof src === 'string' ? src : '').replace(/\r\n?/g, '\n').slice(0, LIMITS.manifestoMax);
  const lines = text.split('\n');
  const blocks: MdBlock[] = [];
  let para: string[] = [];
  let list: { t: 'ul' | 'ol'; items: string[] } | null = null;

  const endPara = () => {
    if (para.length) blocks.push({ t: 'p', c: parseInline(para.join('\n').trim()) });
    para = [];
  };
  const endList = () => {
    if (list) blocks.push({ t: list.t, items: list.items.map((it) => parseInline(it.trim())) });
    list = null;
  };

  for (const line of lines) {
    if (!line.trim()) {
      endPara();
      endList();
      continue;
    }
    const ul = UL_RE.exec(line);
    const ol = ul ? null : OL_RE.exec(line);
    if (ul || ol) {
      endPara();
      const kind = ul ? 'ul' : 'ol';
      if (list && list.t !== kind) endList();
      if (!list) list = { t: kind, items: [] };
      list.items.push((ul ?? ol)![1]);
      continue;
    }
    const h = H_RE.exec(line);
    if (h) {
      endPara();
      endList();
      blocks.push({ t: 'p', heading: true, c: parseInline(h[1].trim()) });
      continue;
    }
    if (list) {
      // girintili devam satırı → son maddeye eklenir
      if (/^\s{2,}\S/.test(line)) {
        list.items[list.items.length - 1] += '\n' + line.trim();
        continue;
      }
      endList();
    }
    para.push(line);
  }
  endPara();
  endList();
  return blocks.filter((b) => (b.t === 'p' ? b.c.length > 0 : b.items.length > 0));
}

function inlineText(nodes: MdInline[]): string {
  return nodes.map((n) => (n.t === 'text' ? n.v : n.t === 'br' ? ' ' : inlineText(n.c))).join('');
}

/** Kart için düz metin özet (Markdown işaretleri olmadan). */
export function manifestoExcerpt(src: string, max = 160): string {
  const parts: string[] = [];
  for (const b of parseManifesto(src)) {
    if (b.t === 'p') parts.push(inlineText(b.c));
    else parts.push(b.items.map((it) => '• ' + inlineText(it)).join(' '));
  }
  const s = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s.,;:!?-]+$/, '') + '…';
}
