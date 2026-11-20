import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import express from 'express'
import type { Request, Response } from 'express'
import { spaFallback } from '../server/spa.js'

test('SPA fallback serves index from a dotted AppImage mount path', async (t) => {
  const mount = await mkdtemp(path.join(os.tmpdir(), '.mount_test123'))
  const renderer = path.join(mount, 'renderer')
  await mkdir(renderer)
  await writeFile(path.join(renderer, 'index.html'), '<h1>Kulüp test</h1>')
  const app = express()
  app.get('/{*path}', spaFallback(renderer))
  const server = createServer(app)
  let listening = false
  try {
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', () => {
          server.off('error', reject)
          resolve()
        })
      })
      listening = true
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EPERM') throw error
      t.diagnostic('Sandbox localhost soketini engelledi; rota işleyicisi doğrudan doğrulandı.')
      let sentFile = ''
      let sentRoot = ''
      spaFallback(renderer)({} as Request, {
        sendFile(file: string, options: { root: string }) {
          sentFile = file
          sentRoot = options.root
        },
      } as Response, () => undefined)
      assert.equal(sentFile, 'index.html')
      assert.equal(sentRoot, renderer)
      assert.equal(await readFile(path.join(sentRoot, sentFile), 'utf8'), '<h1>Kulüp test</h1>')
      return
    }
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    const response = await fetch(`http://127.0.0.1:${address.port}/kararlar/5`)
    assert.equal(response.status, 200)
    assert.equal(await response.text(), '<h1>Kulüp test</h1>')
  } finally {
    if (listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    await rm(mount, { recursive: true, force: true })
  }
})
