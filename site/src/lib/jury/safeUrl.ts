/** Yalnız mutlak http/https adreslerini kabul eder (javascript:, data:, göreli yol vb. → null). */
export function safeExternalUrl(url: unknown): string | null {
  if (typeof url !== 'string' || url.trim() === '') return null;
  try {
    const u = new URL(url.trim());
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}
