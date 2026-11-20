import { kulupHostuMu } from './kulup';

type OriginInput = {
  origin: string | null;
  referer: string | null;
  host: string | null;
  forwardedHost: string | null;
  siteUrl: string | undefined;
  production: boolean;
};

export function isAllowedChatOrigin(input: OriginInput): boolean {
  if (!input.production) return true;
  const source = input.origin && input.origin !== 'null' ? input.origin : input.referer;
  if (!source) return false;

  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;

  const hostname = url.hostname.toLowerCase();
  if (kulupHostuMu(hostname)) return true;
  if (input.siteUrl) {
    try {
      if (hostname === new URL(input.siteUrl).hostname.toLowerCase()) return true;
    } catch {
      // Invalid site setting does not grant access.
    }
  }
  const host = url.host.toLowerCase();
  return (input.host !== null && host === input.host.toLowerCase()) ||
    (input.forwardedHost !== null && host === input.forwardedHost.toLowerCase());
}

export function turnstileDecision(secret: string | undefined, nodeEnv: string | undefined): 'skip' | 'verify' | 'reject' {
  if (nodeEnv === 'development') return 'skip';
  if (!secret || secret === 'XXXX') return nodeEnv === 'production' ? 'reject' : 'skip';
  return 'verify';
}

export function sanitizeHistory(history: unknown): { role: 'user' | 'bot'; content: string }[] {
  if (!Array.isArray(history)) return [];
  return history
    .filter(h => h && typeof h === 'object' && (h.role === 'user' || h.role === 'bot') && typeof h.content === 'string')
    .slice(-5)
    .map(h => ({ role: h.role, content: h.content.substring(0, 1000) }));
}

export function escapeTelegramHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
