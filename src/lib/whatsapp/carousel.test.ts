import { describe, expect, it } from 'vitest'

import type { CarouselCard, MessageTemplate } from '@/types'
import { buildCarouselCreateComponent, buildCarouselSendComponent, parseMetaCarousel, validateCarousel } from './carousel'
import { buildMetaTemplatePayload } from './template-components'
import { buildSendComponents } from './template-send-builder'
import { validateTemplatePayload } from './template-validators'

function card(overrides: Partial<CarouselCard> = {}): CarouselCard {
  return {
    header_type: 'image',
    media_url: 'https://cdn.example.com/a.jpg',
    header_handle: 'h:1',
    body_text: 'Cotton kurta — ₹899',
    sample_values: [],
    buttons: [{ type: 'URL', text: 'Shop now', url: 'https://shop.example.com/kurta' }],
    ...overrides,
  }
}

const base = { category: 'Marketing', header_type: null, footer_text: null, buttons: null }

describe('validateCarousel', () => {
  it('accepts a valid 2-card carousel', () => {
    expect(() => validateCarousel([card(), card()], base)).not.toThrow()
  })

  it('needs 2–10 cards', () => {
    expect(() => validateCarousel([card()], base)).toThrow(/2–10/)
    expect(() => validateCarousel(Array.from({ length: 11 }, () => card()), base)).toThrow(/2–10/)
  })

  it('is Marketing only, with no template-level header, footer or buttons', () => {
    expect(() => validateCarousel([card(), card()], { ...base, category: 'Utility' })).toThrow(/Marketing/)
    expect(() => validateCarousel([card(), card()], { ...base, header_type: 'image' })).toThrow(/header/)
    expect(() => validateCarousel([card(), card()], { ...base, footer_text: 'Hi' })).toThrow(/footer/)
  })

  it('requires the same media type and button layout on every card', () => {
    expect(() => validateCarousel([card(), card({ header_type: 'video' })], base)).toThrow(/same media/)
    expect(() =>
      validateCarousel([card(), card({ buttons: [{ type: 'QUICK_REPLY', text: 'More' }] })], base),
    ).toThrow(/same buttons/)
  })

  it('checks card text, media and buttons', () => {
    expect(() => validateCarousel([card(), card({ body_text: '' })], base)).toThrow(/Card 2: add the card text/)
    expect(() => validateCarousel([card(), card({ body_text: 'x'.repeat(161) })], base)).toThrow(/160/)
    expect(() => validateCarousel([card({ media_url: null, header_handle: null }), card()], base)).toThrow(/Card 1: add an image/)
    expect(() => validateCarousel([card({ media_url: 'http://x.com/a.jpg' }), card()], base)).toThrow(/https/)
    expect(() =>
      validateCarousel([card({ buttons: [] }), card({ buttons: [] })], base),
    ).toThrow(/1 or 2 buttons/)
  })

  it('needs values for card text variables', () => {
    expect(() => validateCarousel([card({ body_text: 'Now {{1}}' }), card({ body_text: 'Now {{1}}' })], base)).toThrow(/value/)
    expect(() =>
      validateCarousel(
        [card({ body_text: 'Now {{1}}', sample_values: ['₹799'] }), card({ body_text: 'Now {{1}}', sample_values: ['₹699'] })],
        base,
      ),
    ).not.toThrow()
  })
})

describe('template creation payload', () => {
  it('builds BODY + CAROUSEL with handles, text and buttons', () => {
    const payload = buildMetaTemplatePayload({
      name: 'diwali_carousel',
      category: 'Marketing',
      language: 'en_US',
      body_text: 'Hi {{1}}, our Diwali picks',
      sample_values: { body: ['Priya'] },
      carousel_cards: [card(), card({ header_handle: 'h:2' })],
    })
    expect(payload.components.map((c) => c.type)).toEqual(['BODY', 'CAROUSEL'])
    const carousel = buildCarouselCreateComponent([card()])
    expect(carousel.cards[0].components[0]).toEqual({ type: 'HEADER', format: 'IMAGE', example: { header_handle: ['h:1'] } })
    expect(carousel.cards[0].components[2]).toEqual({
      type: 'BUTTONS',
      buttons: [{ type: 'URL', text: 'Shop now', url: 'https://shop.example.com/kurta' }],
    })
  })

  it('validateTemplatePayload runs the carousel rules', () => {
    expect(() =>
      validateTemplatePayload({
        name: 'x',
        category: 'Utility',
        language: 'en_US',
        body_text: 'Hello',
        carousel_cards: [card(), card()],
      }),
    ).toThrow(/Marketing/)
  })
})

describe('sending', () => {
  const template = {
    id: 't',
    user_id: 'u',
    name: 'diwali_carousel',
    category: 'Marketing',
    body_text: 'Hi {{1}}, our Diwali picks',
    carousel_cards: [
      card({ body_text: 'Kurta {{1}}', sample_values: ['₹899'], buttons: [{ type: 'QUICK_REPLY', text: 'Interested' }] }),
      card({ media_url: 'https://cdn.example.com/b.jpg', body_text: 'Saree {{1}}', sample_values: ['₹1,499'], buttons: [{ type: 'QUICK_REPLY', text: 'Interested' }] }),
    ],
    created_at: '',
  } as MessageTemplate

  it('personalises the main body and sends every card by link', () => {
    const components = buildSendComponents(template, { body: ['Priya'] })
    expect(components[0]).toEqual({ type: 'body', parameters: [{ type: 'text', text: 'Priya' }] })
    const carousel = components[1] as ReturnType<typeof buildCarouselSendComponent>
    expect(carousel.type).toBe('carousel')
    expect(carousel.cards).toHaveLength(2)
    expect(carousel.cards[1]).toMatchObject({
      card_index: 1,
      components: [
        { type: 'header', parameters: [{ type: 'image', image: { link: 'https://cdn.example.com/b.jpg' } }] },
        { type: 'body', parameters: [{ type: 'text', text: '₹1,499' }] },
        { type: 'button', sub_type: 'quick_reply', index: 0 },
      ],
    })
  })

  it('refuses to send a card without media', () => {
    expect(() => buildCarouselSendComponent([card({ media_url: null }), card()])).toThrow(/no image or video/)
  })
})

describe('parseMetaCarousel', () => {
  it('reads cards synced from Meta (media must be re-added)', () => {
    const cards = parseMetaCarousel({
      cards: [
        {
          components: [
            { type: 'HEADER', format: 'VIDEO', example: { header_handle: ['h'] } },
            { type: 'BODY', text: 'Card {{1}}', example: { body_text: [['A']] } },
            { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'More' }] },
          ],
        },
      ],
    })
    expect(cards).toEqual([
      { header_type: 'video', media_url: null, header_handle: 'h', body_text: 'Card {{1}}', sample_values: ['A'], buttons: [{ type: 'QUICK_REPLY', text: 'More' }] },
    ])
    expect(parseMetaCarousel(undefined)).toBeNull()
  })
})
