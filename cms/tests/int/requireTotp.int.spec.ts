import { describe, expect, it } from 'vitest'
import type { Access } from 'payload'
import { NextRequest } from 'next/server'
import { hasVerifiedTotp, requireTotp, withTotpAccess } from '../../src/lib/requireTotp'
import { config, proxy } from '../../src/proxy'

type TestUser = { hasTotp: boolean; _strategy?: string } | null
const argsFor = (user: TestUser): Parameters<Access>[0] =>
  ({ req: { user } }) as unknown as Parameters<Access>[0]

const withoutTotp = { hasTotp: false }
const withoutVerification = { hasTotp: true, _strategy: 'local-jwt' }
const verified = { hasTotp: true, _strategy: 'totp' }

describe('TOTP access wrapper', () => {
  it('requires setup and verification for signed-in users when no inner rule exists', async () => {
    const access = requireTotp()
    expect(await access(argsFor(null))).toBe(false)
    expect(await access(argsFor(withoutTotp))).toBe(false)
    expect(await access(argsFor(withoutVerification))).toBe(false)
    expect(await access(argsFor(verified))).toBe(true)
    expect(hasVerifiedTotp(verified)).toBe(true)
  })

  it('preserves anonymous and verified-user inner rules', async () => {
    const allow = requireTotp(() => true)
    expect(await allow(argsFor(null))).toBe(true)
    expect(await allow(argsFor(withoutTotp))).toBe(false)
    expect(await allow(argsFor(withoutVerification))).toBe(false)
    expect(await allow(argsFor(verified))).toBe(true)
    expect(await requireTotp(() => false)(argsFor(verified))).toBe(false)
  })

  it('applies the same rule to collection create access', async () => {
    const collection = withTotpAccess({ slug: 'x', fields: [], access: { create: () => true } })
    expect(await collection.access!.create!(argsFor(null))).toBe(true)
    expect(await collection.access!.create!(argsFor(withoutTotp))).toBe(false)
    expect(await collection.access!.create!(argsFor(verified))).toBe(true)
  })
})

describe('admin pathname proxy', () => {
  it('forwards the pathname as a request header, including verification and setup pages', () => {
    for (const pathname of ['/admin', '/admin/verify-totp', '/admin/setup-totp']) {
      const response = proxy(new NextRequest(`http://localhost${pathname}`))
      expect(response.headers.get('x-middleware-request-x-pathname')).toBe(pathname)
      expect(response.headers.get('x-middleware-override-headers')).toContain('x-pathname')
    }
  })

  it('matches both the admin root and nested admin pages', () => {
    expect(config.matcher).toContain('/admin')
    expect(config.matcher).toContain('/admin/:path*')
  })
})
