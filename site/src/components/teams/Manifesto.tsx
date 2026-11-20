/**
 * Manifesto çizici: lib/teams/markdown.ts ağacını React elemanlarına çevirir.
 * HTML dizgesi üretilmez, dangerouslySetInnerHTML yok; tüm metin React tarafından kaçışlanır.
 */
import { createElement, type ReactNode } from 'react';
import { parseManifesto, type MdInline } from '@/lib/teams/markdown';

function renderInline(nodes: MdInline[], linkColor: string | undefined, key = ''): ReactNode[] {
  return nodes.map((n, i) => {
    const k = `${key}${i}`;
    switch (n.t) {
      case 'text':
        return n.v;
      case 'br':
        return createElement('br', { key: k });
      case 'strong':
        return createElement('strong', { key: k, className: 'font-extrabold' }, renderInline(n.c, linkColor, k + '-'));
      case 'em':
        return createElement('em', { key: k, className: 'italic pr-[0.12em]' }, renderInline(n.c, linkColor, k + '-'));
      case 'link':
        return createElement(
          'a',
          {
            key: k,
            href: n.href,
            target: '_blank',
            rel: 'noopener noreferrer nofollow ugc',
            className: 'font-semibold underline decoration-2 underline-offset-2 break-words hover:opacity-80',
            style: linkColor ? { color: linkColor } : undefined,
          },
          renderInline(n.c, linkColor, k + '-'),
        );
    }
  });
}

export function Manifesto({ source, linkColor, className }: { source: string; linkColor?: string; className?: string }) {
  const blocks = parseManifesto(source);
  if (!blocks.length) return null;
  return createElement(
    'div',
    { className: `space-y-3 break-words text-[15px] leading-relaxed ${className ?? ''}` },
    blocks.map((b, i) => {
      if (b.t === 'p') {
        return createElement('p', { key: i, className: b.heading ? 'text-lg font-extrabold' : undefined }, renderInline(b.c, linkColor));
      }
      return createElement(
        b.t,
        { key: i, className: `${b.t === 'ul' ? 'list-disc' : 'list-decimal'} space-y-1 pl-5` },
        b.items.map((it, j) => createElement('li', { key: j }, renderInline(it, linkColor, `${i}-${j}-`))),
      );
    }),
  );
}
