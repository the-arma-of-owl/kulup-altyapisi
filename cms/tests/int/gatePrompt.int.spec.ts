import { describe, expect, it } from 'vitest'
import { GATE_FIELD_DESCRIPTION, GATE_FIELD_EXAMPLE } from '../../src/components/gate/gatePrompt'
import { wheelValues } from '../../src/components/gate/gateUi'
import { validateGateFields } from '../../src/endpoints/gateCheckin'

describe('kapı alanı JSON istemi', () => {
  it('örnekteki her alan sunucu doğrulamasından geçer ve tekerlek değerleri üretir', () => {
    expect(GATE_FIELD_EXAMPLE).toHaveLength(2)
    for (const definition of GATE_FIELD_EXAMPLE) {
      const values = wheelValues(definition)
      expect(values?.length).toBeGreaterThan(0)
      expect(validateGateFields([definition], { [definition.key]: values![0] }))
        .toEqual({ ok: true, fields: { [definition.key]: values![0] } })
    }
  })

  it('açıklama örnek JSON ve şablon anahtarı içerir, bağlantı veya adres içermez', () => {
    expect(GATE_FIELD_DESCRIPTION).toContain(JSON.stringify(GATE_FIELD_EXAMPLE))
    expect(GATE_FIELD_DESCRIPTION).toContain('{{')
    expect(GATE_FIELD_DESCRIPTION).toContain('Yapay zekâya kopyalayın:')
    expect(GATE_FIELD_DESCRIPTION).not.toMatch(/http|@/i)
  })
})
