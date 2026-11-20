import type { RequestHandler } from 'express'

export function spaFallback(renderer: string): RequestHandler {
  return (_req, res) => { res.sendFile('index.html', { root: renderer }) }
}
