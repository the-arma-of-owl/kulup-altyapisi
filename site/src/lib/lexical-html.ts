/**
 * Lexical RichText JSON → HTML Serializer
 * Payload CMS 3.x Lexical editor output'unu HTML string'e dönüştürür.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import hljs from 'highlight.js';

const CMS_URL = process.env.NEXT_PUBLIC_CMS_URL || 'http://127.0.0.1:3001';

interface LexicalNode {
  type: string;
  children?: LexicalNode[];
  text?: string;
  format?: number | string;
  tag?: string;
  listType?: string;
  checked?: boolean;
  url?: string;
  newTab?: boolean;
  value?: any;
  fields?: any;
  version?: number;
  direction?: string;
  indent?: number;
  language?: string;
  [k: string]: any;
}

interface LexicalRoot {
  root: LexicalNode;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function resolveMediaUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  // Proxy üzerinden geçmesi için direkt URL'yi kullan
  return url;
}

function serializeTextFormat(text: string, format: number): string {
  let result = escapeHtml(text);
  // Lexical text format bitmask:
  // 1 = bold, 2 = italic, 4 = strikethrough, 8 = underline, 16 = code, 32 = subscript, 64 = superscript
  if (format & 16) result = `<code class="inline-code">${result}</code>`;
  if (format & 1) result = `<strong>${result}</strong>`;
  if (format & 2) result = `<em>${result}</em>`;
  if (format & 4) result = `<s>${result}</s>`;
  if (format & 8) result = `<u>${result}</u>`;
  if (format & 32) result = `<sub>${result}</sub>`;
  if (format & 64) result = `<sup>${result}</sup>`;
  return result;
}

function serializeNode(node: LexicalNode): string {
  if (!node) return '';

  // Text node
  if (node.type === 'text') {
    const text = node.text || '';
    const format = typeof node.format === 'number' ? node.format : 0;
    return serializeTextFormat(text, format);
  }

  // Line break
  if (node.type === 'linebreak') {
    return '<br />';
  }

  // Tab
  if (node.type === 'tab') {
    return '&emsp;';
  }

  // Recursively serialize children
  const children = (node.children || []).map(serializeNode).join('');

  switch (node.type) {
    case 'root':
      return children;

    case 'paragraph': {
      if (!children.trim()) return '<p><br /></p>';
      // text alignment
      const align = node.format ? ` style="text-align:${node.format}"` : '';
      return `<p${align}>${children}</p>`;
    }

    case 'heading': {
      const tag = node.tag || 'h2';
      return `<${tag}>${children}</${tag}>`;
    }

    case 'list': {
      const tag = node.listType === 'number' ? 'ol' : 'ul';
      const isChecklist = node.listType === 'check';
      if (isChecklist) {
        return `<ul class="checklist">${children}</ul>`;
      }
      return `<${tag}>${children}</${tag}>`;
    }

    case 'listitem': {
      // Checklist item
      if (node.checked !== undefined) {
        const checked = node.checked ? 'checked' : '';
        return `<li class="task-item"><input type="checkbox" ${checked} disabled /> ${children}</li>`;
      }
      return `<li>${children}</li>`;
    }

    case 'quote': {
      return `<blockquote>${children}</blockquote>`;
    }

    case 'link':
    case 'autolink': {
      const url = node.fields?.url || node.url || '#';
      const target = (node.fields?.newTab || node.newTab) ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<a href="${escapeHtml(url)}"${target}>${children}</a>`;
    }

    case 'horizontalrule': {
      return '<hr />';
    }

    case 'code': {
      // Multi-line code block
      const lang = node.language || '';
      const langAttr = lang ? ` data-language="${escapeHtml(lang)}"` : '';
      const langLabel = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : '';
      return `<div class="code-block">${langLabel}<button class="copy-btn" onclick="navigator.clipboard.writeText(this.closest('.code-block').querySelector('code').innerText)">Kopyala</button><pre><code${langAttr}>${children}</code></pre></div>`;
    }

    case 'upload': {
      // Media upload block
      const value = node.value;
      if (value && typeof value === 'object') {
        const rawUrl = value.url || '';
        const url = resolveMediaUrl(rawUrl);
        const alt = value.alt || '';
        const mimeType = value.mimeType || '';
        if (!url) return '';
        if (mimeType.startsWith('video/')) {
          return `<figure><video src="${url}" controls class="prose-video"></video>${alt ? `<figcaption>${escapeHtml(alt)}</figcaption>` : ''}</figure>`;
        }
        return `<figure><img src="${url}" alt="${escapeHtml(alt)}" />${alt ? `<figcaption>${escapeHtml(alt)}</figcaption>` : ''}</figure>`;
      }
      // value is just an ID string — we can't resolve without an API call, skip
      return '';
    }

    case 'block': {
      // Custom blocks
      if (node.fields?.blockType === 'Code') {
        const lang = node.fields.language || 'plaintext';
        const langAttr = lang ? ` data-language="${escapeHtml(lang)}"` : '';
        const langLabel = lang !== 'plaintext' ? `<span class="code-lang">${escapeHtml(lang)}</span>` : '<span class="code-lang">Plain Text</span>';
        const rawCode = node.fields.code || '';
        
        let highlightedCode = escapeHtml(rawCode);
        if (lang !== 'plaintext' && hljs.getLanguage(lang)) {
          try {
            highlightedCode = hljs.highlight(rawCode, { language: lang }).value;
          } catch (e) {
            console.error('Highlight JS Error:', e);
          }
        } else if (lang !== 'plaintext') {
          // If the specific language isn't loaded, try auto-highlight
          try {
            highlightedCode = hljs.highlightAuto(rawCode).value;
          } catch (e) {}
        }
        
        // Add 'hljs' class to code to ensure theme styles are applied
        const copyOnClick = `const btn=this; navigator.clipboard.writeText(btn.closest(&quot;.code-block&quot;).querySelector(&quot;code&quot;).innerText); btn.innerHTML=&quot;<svg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='3' stroke-linecap='round' stroke-linejoin='round' style='display:inline-block;margin-right:4px;margin-bottom:1px'><polyline points='20 6 9 17 4 12'></polyline></svg>KOPYALANDI&quot;; btn.classList.add(&quot;copied&quot;); setTimeout(()=> {btn.innerHTML=&quot;KOPYALA&quot;; btn.classList.remove(&quot;copied&quot;);}, 2000)`;
        return `<div class="code-block">
          <div class="code-header">
            ${langLabel}
            <button class="copy-btn" onclick="${copyOnClick}">KOPYALA</button>
          </div>
          <pre><code class="hljs ${escapeHtml(lang)}"${langAttr}>${highlightedCode}</code></pre>
        </div>`;
      }

      if (node.fields?.blockType === 'Spoiler') {
        const content = serializeLexicalToHtml(node.fields.content);
        const eyeSlashIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mb-3 opacity-60"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path><line x1="2" y1="2" x2="22" y2="22"></line></svg>`;
        const copyOnClick = `event.stopPropagation(); const btn=this; navigator.clipboard.writeText(btn.closest(&quot;.spoiler-wrapper&quot;).querySelector(&quot;.spoiler-content&quot;).innerText); btn.innerHTML=&quot;<svg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='3' stroke-linecap='round' stroke-linejoin='round' style='display:inline-block;margin-right:4px;margin-bottom:1px'><polyline points='20 6 9 17 4 12'></polyline></svg>KOPYALANDI&quot;; btn.classList.add(&quot;copied&quot;); setTimeout(()=> {btn.innerHTML=&quot;KOPYALA&quot;; btn.classList.remove(&quot;copied&quot;);}, 2000)`;
        
        return `<div class="spoiler-wrapper" onclick="this.classList.add('revealed'); this.style.cursor='auto';">
          <div class="spoiler-overlay">
            ${eyeSlashIcon}
            <span class="tracking-wide text-sm font-bold uppercase opacity-80">Spoiler</span>
            <span class="text-xs opacity-60 mt-1">İçeriği görmek için tıklayın</span>
          </div>
          <button class="spoiler-copy-btn" onclick="${copyOnClick}">KOPYALA</button>
          <div class="spoiler-content">${content}</div>
        </div>`;
      }

      return '';
    }

    default:
      // For any unknown node type, just return children
      return children;
  }
}

export function serializeLexicalToHtml(content: LexicalRoot | null | undefined): string {
  if (!content || !content.root) return '';
  return serializeNode(content.root);
}
