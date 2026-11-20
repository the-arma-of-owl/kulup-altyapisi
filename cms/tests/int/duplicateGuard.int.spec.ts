import { describe, expect, it, vi } from 'vitest'
import { isDuplicate, normalizePhone, rejectDuplicateSubmission } from '../../src/lib/duplicateGuard'

describe('tekrar başvuru engeli', () => {
  it('telefon biçimleri aynı numaraya indirgenir', () => {
    for (const value of ['05320000000', '+90 532 000 00 00', '905320000000', '532-000-0000']) {
      expect(normalizePhone(value)).toBe('5320000000')
    }
  })

  it('e-posta (büyük/küçük harf) veya telefon eşleşmesi tekrar sayılır', () => {
    const existing = [{ email: 'Ada@Example.invalid', phone: '0533 000 00 01' }]
    expect(isDuplicate({ email: 'ada@example.invalid', phone: '05550000000' }, existing)).toBe(true)
    expect(isDuplicate({ email: 'baska@example.invalid', phone: '+905330000001' }, existing)).toBe(true)
    expect(isDuplicate({ email: 'baska@example.invalid', phone: '05550000000' }, existing)).toBe(false)
    expect(isDuplicate({ email: '', phone: '' }, [{ email: '', phone: '' }])).toBe(false)
    // Türkçe yerel ayar tuzağı: büyük I, küçük ı'ya dönmemeli
    expect(isDuplicate({ email: 'SALIH@EXAMPLE.INVALID' }, [{ email: 'salih@example.invalid' }])).toBe(true)
  })

  const run = async (user: unknown, docs: unknown[], data: Record<string, unknown>, checkPhone?: boolean) => {
    const find = vi.fn(async () => ({ docs }))
    const hook = rejectDuplicateSubmission({ collection: 'event-registrations', message: 'tekrar', checkPhone })
    return { result: hook({ data, operation: 'create', req: { user, payload: { find } } } as never), find }
  }

  it('siteden gelen tekrar kayıt 409 ile reddedilir; farklı kişi geçer', async () => {
    const dup = await run(null, [{ email: 'a@b.invalid', phone: '' }], { event: 24, email: 'A@b.invalid', phone: '05550000001' })
    await expect(dup.result).rejects.toMatchObject({ status: 409, message: 'tekrar' })
    const ok = await run(null, [{ email: 'a@b.invalid', phone: '' }], { event: 24, email: 'c@d.invalid', phone: '05550000002' })
    await expect(ok.result).resolves.toMatchObject({ email: 'c@d.invalid' })
  })

  it('panelden yönetici eklerken denetlenmez', async () => {
    const admin = await run({ id: 1 }, [{ email: 'a@b.invalid' }], { event: 24, email: 'a@b.invalid' })
    await expect(admin.result).resolves.toBeTruthy()
    expect(admin.find).not.toHaveBeenCalled()
  })

  it('telefon denetimi kapalıyken aynı telefon geçer, aynı e-posta yine reddedilir', async () => {
    const existing = [{ email: 'a@b.invalid', phone: '05320000000' }]
    expect(isDuplicate({ email: 'c@d.invalid', phone: '+90 532 000 00 00' }, existing, false)).toBe(false)
    const ok = await run(null, existing, { event: 24, email: 'c@d.invalid', phone: '05320000000' }, false)
    await expect(ok.result).resolves.toMatchObject({ email: 'c@d.invalid' })
    const dup = await run(null, existing, { event: 24, email: 'A@b.invalid', phone: '05550000009' }, false)
    await expect(dup.result).rejects.toMatchObject({ status: 409 })
  })
})
