import { describe, expect, it } from 'vitest'

import {
  eventForStatus,
  isReturnShipment,
  orderRefCandidates,
  resolveShiprocketBodyParams,
  shipmentAwb,
  shipmentContext,
  shipmentDeliveryId,
  shipmentOrderRef,
  shipmentPayloadPhone,
  trackingUrlFor,
} from './events'
import { verifyShiprocketWebhook } from './verify'
import { shippingWebhookUrl } from './config'

describe('verifyShiprocketWebhook', () => {
  it('accepts the exact token', () => {
    expect(verifyShiprocketWebhook('abc123TOKEN', 'abc123TOKEN')).toBe(true)
  })
  it('ignores surrounding whitespace in the header', () => {
    expect(verifyShiprocketWebhook('  abc123TOKEN \n', 'abc123TOKEN')).toBe(true)
  })
  it('rejects a wrong, missing or empty token', () => {
    expect(verifyShiprocketWebhook('nope', 'abc123TOKEN')).toBe(false)
    expect(verifyShiprocketWebhook(null, 'abc123TOKEN')).toBe(false)
    expect(verifyShiprocketWebhook('', 'abc123TOKEN')).toBe(false)
    expect(verifyShiprocketWebhook('x', '')).toBe(false)
  })
  it('does not accept a token that is merely a prefix or a longer string', () => {
    expect(verifyShiprocketWebhook('abc123', 'abc123TOKEN')).toBe(false)
    expect(verifyShiprocketWebhook('abc123TOKENextra', 'abc123TOKEN')).toBe(false)
  })
})

describe('eventForStatus', () => {
  it('maps the common statuses by name', () => {
    expect(eventForStatus('PICKED UP', 42)).toBe('shipped')
    expect(eventForStatus('Shipped', null)).toBe('shipped')
    expect(eventForStatus('IN TRANSIT', 18)).toBe('in_transit')
    expect(eventForStatus('Out For Delivery', 17)).toBe('out_for_delivery')
    expect(eventForStatus('DELIVERED', 7)).toBe('delivered')
    expect(eventForStatus('UNDELIVERED', 21)).toBe('delivery_failed')
    expect(eventForStatus('RTO INITIATED', 9)).toBe('return_initiated')
    expect(eventForStatus('RTO NDR', 40)).toBe('return_initiated')
  })
  it('is tolerant of punctuation and case', () => {
    expect(eventForStatus('out-for-delivery', null)).toBe('out_for_delivery')
    expect(eventForStatus('  in   transit ', null)).toBe('in_transit')
  })
  it('sends nothing for partial delivery, RTO delivered, cancelled or unknown statuses', () => {
    expect(eventForStatus('PARTIAL DELIVERED', 23)).toBeNull()
    expect(eventForStatus('RTO DELIVERED', 10)).toBeNull()
    expect(eventForStatus('CANCELED', 8)).toBeNull()
    expect(eventForStatus('LOST', 12)).toBeNull()
    expect(eventForStatus('Something new', 999)).toBeNull()
  })
  it('falls back to the numeric id only when there is no status text', () => {
    expect(eventForStatus(null, 7)).toBe('delivered')
    expect(eventForStatus('', 17)).toBe('out_for_delivery')
    expect(eventForStatus('LOST', 7)).toBeNull() // text wins; "LOST" must not become delivered
  })
})

describe('payload helpers', () => {
  const payload = {
    awb: '14367890123',
    courier_name: 'Delhivery',
    current_status: 'OUT FOR DELIVERY',
    current_status_id: 17,
    current_timestamp: '14 10 2026 09:15:00',
    order_id: '1001',
    etd: '2026-10-14 18:00:00',
    is_return: 0,
  }

  it('reads awb and order reference', () => {
    expect(shipmentAwb(payload)).toBe('14367890123')
    expect(shipmentOrderRef(payload)).toBe('1001')
    expect(shipmentOrderRef({ channel_order_id: 'A-7' })).toBe('A-7')
  })

  it('detects reverse (return) shipments', () => {
    expect(isReturnShipment(payload)).toBe(false)
    expect(isReturnShipment({ is_return: 1 })).toBe(true)
    expect(isReturnShipment({ is_return: '1' })).toBe(true)
  })

  it('finds a customer phone when the payload has one, including nested', () => {
    expect(shipmentPayloadPhone({ customer_phone: '98765 43210' })).toBe('98765 43210')
    expect(shipmentPayloadPhone({ shipping_address: { phone: '+91 99999 11111' } })).toBe('+91 99999 11111')
    expect(shipmentPayloadPhone(payload)).toBeNull()
  })

  it('builds a tracking link from the awb unless the payload has one', () => {
    expect(trackingUrlFor('14367890123', {})).toBe('https://shiprocket.co/tracking/14367890123')
    expect(trackingUrlFor('x', { tracking_url: 'https://track.example/x' })).toBe('https://track.example/x')
    expect(trackingUrlFor('x', { tracking_url: 'javascript:alert(1)' })).toBe('https://shiprocket.co/tracking/x')
    expect(trackingUrlFor(null, {})).toBeNull()
  })

  it('builds the template context', () => {
    const ctx = shipmentContext(payload, { customerName: 'Priya Sharma', orderRef: '1001' })
    expect(ctx.customer_name).toBe('Priya')
    expect(ctx.customer_full_name).toBe('Priya Sharma')
    expect(ctx.courier).toBe('Delhivery')
    expect(ctx.status).toBe('OUT FOR DELIVERY')
    expect(ctx.expected_delivery).toMatch(/14\s+Oct/)
    expect(ctx.tracking_url).toContain('14367890123')
  })

  it('fills missing values with "-" because Meta rejects empty parameters', () => {
    const ctx = shipmentContext({ awb: 'A1' }, { customerName: null, orderRef: null })
    expect(resolveShiprocketBodyParams(['customer_name', 'awb', 'courier'], ctx)).toEqual(['-', 'A1', '-'])
  })

  it('treats a repeated delivery as the same id, and a new scan as different', () => {
    expect(shipmentDeliveryId(payload)).toBe(shipmentDeliveryId({ ...payload }))
    expect(shipmentDeliveryId(payload)).not.toBe(
      shipmentDeliveryId({ ...payload, current_status: 'DELIVERED', current_status_id: 7 })
    )
  })

  it('lists the spellings of an order reference to look up', () => {
    expect(orderRefCandidates('#1001').sort()).toEqual(['#1001', '1001'])
    expect(orderRefCandidates('1001').sort()).toEqual(['#1001', '1001'])
    expect(orderRefCandidates(null)).toEqual([])
  })
})

describe('webhook url', () => {
  it('avoids the words Shiprocket forbids in webhook URLs', () => {
    const url = shippingWebhookUrl('0a1b2c3d4e5f60718293a4b5c6d7e8f901234567')
    expect(url).not.toMatch(/shiprocket|kartrocket|sr|kr/i)
  })
})
