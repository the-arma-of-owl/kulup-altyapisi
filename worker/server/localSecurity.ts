import { createHash, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { LOCAL_SESSION_COOKIE } from './config.js'

export const allowedHosts = (port: number): Set<string> =>
  new Set([`127.0.0.1:${port}`, `localhost:${port}`])

export const allowedOrigins = (port: number): Set<string> =>
  new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`])

export const readCookie = (header: string | undefined, name: string): string | null => {
  if (!header) return null
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator <= 0 || part.slice(0, separator).trim() !== name) continue
    return part.slice(separator + 1).trim()
  }
  return null
}

const digest = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest()

export const tokensMatch = (provided: string | null, expected: string): boolean =>
  Boolean(provided && expected) && timingSafeEqual(digest(provided!), digest(expected))

export type LocalRequestCheck =
  | { ok: true }
  | { ok: false; status: 401 | 403 | 421; error: string }

export const checkLocalRequest = (
  headers: { host?: string; origin?: string; cookie?: string },
  options: { port: number; token: string; requireToken: boolean },
): LocalRequestCheck => {
  if (!headers.host || !allowedHosts(options.port).has(headers.host.toLowerCase())) {
    return { ok: false, status: 421, error: 'Bu adres yerel sunucuya ait değil.' }
  }
  if (options.requireToken && headers.origin !== undefined &&
      !allowedOrigins(options.port).has(headers.origin.toLowerCase())) {
    return { ok: false, status: 403, error: 'Bu istek Kulüp Worker penceresinden gelmedi.' }
  }
  if (options.requireToken && !tokensMatch(readCookie(headers.cookie, LOCAL_SESSION_COOKIE), options.token)) {
    return { ok: false, status: 401, error: 'Yerel oturum doğrulanamadı. Kulüp Worker penceresini yeniden açın.' }
  }
  return { ok: true }
}

export const localRequestGuard = (port: number, token: string) =>
  (request: Request, response: Response, next: NextFunction): void => {
    // Express yolları büyük/küçük harf duyarsız eşler; /API/... da API sayılmalı.
    const requestPath = request.path.toLowerCase()
    const isApi = requestPath === '/api' || requestPath.startsWith('/api/')
    const result = checkLocalRequest(request.headers, { port, token, requireToken: isApi })
    if (result.ok) { next(); return }
    response.locals.localSecurityRejected = true
    response.status(result.status).json({ error: result.error })
  }
