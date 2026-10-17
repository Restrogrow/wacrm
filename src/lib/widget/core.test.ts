import { describe, expect, it } from 'vitest'

import {
  buildWidgetWaLink,
  DEFAULT_WIDGET,
  PUBLIC_ID_RE,
  sanitizeWidgetConfig,
  toPublicConfig,
  widgetSnippet,
  type WidgetConfig,
} from './core'
import { widgetScript } from './script'
import { generatePublicId } from './server'

const valid: WidgetConfig = { ...DEFAULT_WIDGET, enabled: true, phone: '919876543210' }

describe('sanitizeWidgetConfig', () => {
  it('accepts a good config and normalises the phone', () => {
    const r = sanitizeWidgetConfig({ ...valid, phone: '+91 98765 43210', color: '#087a4a' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.phone).toBe('919876543210')
      expect(r.value.color).toBe('#087A4A')
    }
  })

  it('requires a number before the widget can be turned on', () => {
    expect(sanitizeWidgetConfig({ ...valid, phone: '' }).ok).toBe(false)
    expect(sanitizeWidgetConfig({ ...valid, enabled: false, phone: '' }).ok).toBe(true)
  })

  it('rejects an invalid phone or colour', () => {
    expect(sanitizeWidgetConfig({ ...valid, phone: 'abc' }).ok).toBe(false)
    expect(sanitizeWidgetConfig({ ...valid, phone: '12345' }).ok).toBe(false)
    expect(sanitizeWidgetConfig({ ...valid, color: 'red' }).ok).toBe(false)
    expect(sanitizeWidgetConfig({ ...valid, color: 'url(javascript:alert(1))' }).ok).toBe(false)
    expect(sanitizeWidgetConfig({ ...valid, color: '#12345' }).ok).toBe(false)
  })

  it('caps and cleans text, strips control characters, drops unknown keys', () => {
    const r = sanitizeWidgetConfig({
      ...valid,
      greeting: `Hi\u0000 there ${'x'.repeat(500)}`,
      button_label: 'L'.repeat(100),
      prefill_message: 'p'.repeat(1000),
      account_id: 'evil',
      id: 'evil',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.greeting.length).toBeLessThanOrEqual(200)
      expect(r.value.greeting).not.toContain('\u0000')
      expect(r.value.button_label.length).toBeLessThanOrEqual(40)
      expect(r.value.prefill_message.length).toBeLessThanOrEqual(300)
      expect(Object.keys(r.value).sort()).toEqual(Object.keys(DEFAULT_WIDGET).sort())
    }
  })

  it('falls back to defaults for missing/odd input and sides', () => {
    const r = sanitizeWidgetConfig({ enabled: false, position: 'top', button_label: 5 })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.position).toBe('right')
      expect(r.value.button_label).toBe(DEFAULT_WIDGET.button_label)
    }
    expect(sanitizeWidgetConfig(null).ok).toBe(true)
    expect(sanitizeWidgetConfig('nope').ok).toBe(true)
  })
})

describe('toPublicConfig — only non-sensitive fields reach visitors', () => {
  it('returns just {enabled:false} when off or without a number', () => {
    expect(toPublicConfig(null, null)).toEqual({ enabled: false })
    expect(toPublicConfig({ ...valid, enabled: false }, null)).toEqual({ enabled: false })
    expect(toPublicConfig({ ...valid, phone: '' }, null)).toEqual({ enabled: false })
  })

  it('exposes only the display fields', () => {
    const row = { ...valid, account_id: 'secret-account', id: 'secret-id', public_id: 'pid' } as WidgetConfig
    const pub = toPublicConfig(row, true)
    expect(Object.keys(pub).sort()).toEqual(
      ['collectName', 'color', 'enabled', 'greeting', 'label', 'number', 'offlineText', 'open', 'position', 'prefill'].sort(),
    )
    expect(JSON.stringify(pub)).not.toContain('secret')
  })

  it('reports open/offline only when hours-aware', () => {
    expect(toPublicConfig({ ...valid, hours_aware: false }, false).open).toBeNull()
    expect(toPublicConfig({ ...valid, hours_aware: true }, false).open).toBe(false)
    expect(toPublicConfig({ ...valid, hours_aware: true }, true).open).toBe(true)
  })
})

describe('buildWidgetWaLink', () => {
  it('builds a wa.me link with the encoded pre-filled text', () => {
    expect(buildWidgetWaLink('919876543210', 'Hi there')).toBe('https://wa.me/919876543210?text=Hi%20there')
  })

  it('appends the visitor name and cleans it', () => {
    const link = buildWidgetWaLink('919876543210', 'Hello', '  Asha\r\n Rao ')!
    expect(decodeURIComponent(link.split('text=')[1])).toBe('Hello\n\nName: Asha Rao')
  })

  it('caps the name and the prefill length', () => {
    const link = buildWidgetWaLink('919876543210', 'p'.repeat(1000), 'n'.repeat(500))!
    const text = decodeURIComponent(link.split('text=')[1])
    expect(text.length).toBeLessThan(400)
  })

  it('omits text when there is nothing to say and rejects bad numbers', () => {
    expect(buildWidgetWaLink('919876543210', '')).toBe('https://wa.me/919876543210')
    expect(buildWidgetWaLink('abc', 'hi')).toBeNull()
    expect(buildWidgetWaLink('', 'hi')).toBeNull()
  })

  it('cannot be tricked into another host by the text', () => {
    const link = buildWidgetWaLink('919876543210', '/@evil.com?x=1&y=2#frag')!
    expect(new URL(link).host).toBe('wa.me')
    expect(new URL(link).searchParams.get('text')).toBe('/@evil.com?x=1&y=2#frag')
  })
})

describe('public ids and snippet', () => {
  it('generates ids that match the public pattern', () => {
    for (let i = 0; i < 30; i++) expect(PUBLIC_ID_RE.test(generatePublicId())).toBe(true)
    expect(generatePublicId()).not.toBe(generatePublicId())
  })

  it('rejects ids that could break out of the script', () => {
    expect(PUBLIC_ID_RE.test('abc')).toBe(false)
    expect(PUBLIC_ID_RE.test('abcdefghij";alert(1);//')).toBe(false)
    expect(PUBLIC_ID_RE.test('abcdefghij/../x')).toBe(false)
  })

  it('writes the one-line snippet', () => {
    expect(widgetSnippet('https://repeatgrow.com/', 'AbCdEfGhIjKlMnOp')).toBe(
      '<script src="https://repeatgrow.com/widget/AbCdEfGhIjKlMnOp.js" async></script>',
    )
  })
})

describe('widgetScript', () => {
  it('refuses a malformed id', () => {
    expect(widgetScript('x')).toBeNull()
    expect(widgetScript('abcdefghij";alert(1);//')).toBeNull()
  })

  it('is valid JavaScript with the id embedded exactly once as a string', () => {
    const id = 'AbCdEfGhIjKlMnOp'
    const src = widgetScript(id)!
    expect(() => new Function(src)).not.toThrow()
    expect(src).toContain(`var ID="${id}";`)
    expect(src).not.toContain('${')
  })

  it('never injects config as HTML and only talks to our two endpoints', () => {
    const src = widgetScript('AbCdEfGhIjKlMnOp')!
    expect(src).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/)
    expect(src).toContain('/api/widget/')
    expect(src).not.toMatch(/localStorage|sessionStorage|document\.cookie/)
  })
})
