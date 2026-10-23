import { describe, expect, it } from 'vitest'

import { explainProductSendFailure } from './meta-diagnose'

describe('explainProductSendFailure', () => {
  const cat = '1795207241689061'

  it('says when the sending number is not in the saved account', () => {
    expect(
      explainProductSendFailure(cat, ['TEST-001'], { phoneInWaba: false, connectedCatalogIds: [cat], found: [{ retailer_id: 'TEST-001', review_status: 'approved' }] }),
    ).toMatch(/not in the WhatsApp Business Account/)
  })

  it('says when the catalog is not connected to the WABA', () => {
    expect(explainProductSendFailure(cat, ['TEST-001'], { connectedCatalogIds: [], found: null })).toMatch(/No catalog is connected/)
    expect(explainProductSendFailure(cat, ['TEST-001'], { connectedCatalogIds: ['999'], found: null })).toMatch(/isn't connected.*999/)
  })

  it('names products Meta cannot find', () => {
    const msg = explainProductSendFailure(cat, ['TEST-001', 'TEST-003'], {
      connectedCatalogIds: [cat],
      found: [{ retailer_id: 'TEST-001', review_status: 'approved' }],
    })
    expect(msg).toMatch(/can't find TEST-003/)
    expect(msg).not.toMatch(/TEST-001/)
  })

  it('names products Meta has not approved', () => {
    const msg = explainProductSendFailure(cat, ['TEST-001'], {
      connectedCatalogIds: [cat],
      found: [{ retailer_id: 'TEST-001', review_status: 'pending' }],
    })
    expect(msg).toMatch(/hasn't approved TEST-001 \(pending\)/)
  })

  it('returns null when everything looks fine or Meta said nothing', () => {
    expect(explainProductSendFailure(cat, ['TEST-001'], { connectedCatalogIds: [cat], found: [{ retailer_id: 'TEST-001', review_status: 'approved' }] })).toBeNull()
    expect(explainProductSendFailure(cat, ['TEST-001'], { connectedCatalogIds: null, found: null })).toBeNull()
  })
})
