// ============================================================
// Carousel templates (media-card carousels, Marketing only).
//
// A carousel template is a main body bubble followed by 2–10
// horizontally-scrolling cards, each with an image or video header,
// short text and 1–2 buttons. Stored in message_templates.carousel_cards
// (migration 051). Meta rules enforced here:
//   * Marketing category; 2–10 cards;
//   * every card has the same header format and the same button types
//     in the same order (labels / URLs may differ);
//   * card text ≤ 160 characters; button label ≤ 25;
//   * no template-level header, footer or buttons.
// Docs: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/media-card-carousel-templates
// ============================================================

import type { CarouselCard, TemplateButton } from '@/types'

export const CAROUSEL_LIMITS = {
  minCards: 2,
  maxCards: 10,
  cardBodyMax: 160,
  maxButtonsPerCard: 2,
  buttonTextMax: 25,
} as const

function variableIndices(text: string): number[] {
  const set = new Set<number>()
  for (const m of text.matchAll(/\{\{(\d+)\}\}/g)) set.add(Number(m[1]))
  return [...set].sort((a, b) => a - b)
}

/** Throws a user-facing Error describing the first problem found. */
export function validateCarousel(
  cards: CarouselCard[],
  template: { category: string; header_type?: string | null; footer_text?: string | null; buttons?: TemplateButton[] | null },
): void {
  if (template.category !== 'Marketing') throw new Error('Carousel templates must be in the Marketing category.')
  if (template.header_type) throw new Error('Carousel templates can’t have a header — each card has its own image or video.')
  if (template.footer_text?.trim()) throw new Error('Carousel templates can’t have a footer.')
  if (template.buttons?.length) throw new Error('Carousel templates can’t have buttons on the main message — add them to the cards.')
  if (cards.length < CAROUSEL_LIMITS.minCards || cards.length > CAROUSEL_LIMITS.maxCards) {
    throw new Error(`A carousel needs ${CAROUSEL_LIMITS.minCards}–${CAROUSEL_LIMITS.maxCards} cards.`)
  }

  const first = cards[0]
  const layout = first.buttons.map((b) => b.type).join(',')
  cards.forEach((card, i) => {
    const n = i + 1
    if (card.header_type !== 'image' && card.header_type !== 'video') {
      throw new Error(`Card ${n}: choose an image or video.`)
    }
    if (card.header_type !== first.header_type) {
      throw new Error('Every card must use the same media type (all images or all videos).')
    }
    if (!card.media_url && !card.header_handle) throw new Error(`Card ${n}: add an image or video.`)
    if (card.media_url && !/^https:\/\//i.test(card.media_url)) {
      throw new Error(`Card ${n}: the media link must start with https://`)
    }
    const body = card.body_text?.trim() ?? ''
    if (!body) throw new Error(`Card ${n}: add the card text.`)
    if (body.length > CAROUSEL_LIMITS.cardBodyMax) {
      throw new Error(`Card ${n}: card text must be ${CAROUSEL_LIMITS.cardBodyMax} characters or fewer.`)
    }
    const vars = variableIndices(body)
    vars.forEach((v, idx) => {
      if (v !== idx + 1) throw new Error(`Card ${n}: variables must be {{1}}, {{2}}… in order.`)
    })
    if ((card.sample_values?.filter((s) => s?.trim()).length ?? 0) < vars.length) {
      throw new Error(`Card ${n}: give a value for each variable in the card text.`)
    }

    if (card.buttons.length < 1 || card.buttons.length > CAROUSEL_LIMITS.maxButtonsPerCard) {
      throw new Error(`Card ${n}: add 1 or 2 buttons.`)
    }
    if (card.buttons.map((b) => b.type).join(',') !== layout) {
      throw new Error('Every card must have the same buttons in the same order (labels and links can differ).')
    }
    card.buttons.forEach((b, j) => {
      if (b.type !== 'QUICK_REPLY' && b.type !== 'URL' && b.type !== 'PHONE_NUMBER') {
        throw new Error(`Card ${n}: carousel buttons can be quick reply, website or phone.`)
      }
      if (!b.text?.trim()) throw new Error(`Card ${n}, button ${j + 1}: add a label.`)
      if (b.text.length > CAROUSEL_LIMITS.buttonTextMax) {
        throw new Error(`Card ${n}, button ${j + 1}: labels are ${CAROUSEL_LIMITS.buttonTextMax} characters max.`)
      }
      if (b.type === 'URL') {
        if (!/^https?:\/\//i.test(b.url ?? '')) throw new Error(`Card ${n}, button ${j + 1}: add a website link.`)
        if (variableIndices(b.url).length > 0 && !b.example?.trim()) {
          throw new Error(`Card ${n}, button ${j + 1}: give an example for the link’s {{1}}.`)
        }
      }
      if (b.type === 'PHONE_NUMBER' && !/^\+?\d{6,20}$/.test(b.phone_number ?? '')) {
        throw new Error(`Card ${n}, button ${j + 1}: add a phone number with country code.`)
      }
    })
  })
}

// ---------- Template creation (POST /{waba}/message_templates) ----------

function createButton(b: TemplateButton) {
  switch (b.type) {
    case 'QUICK_REPLY':
      return { type: 'QUICK_REPLY', text: b.text }
    case 'URL':
      return { type: 'URL', text: b.text, url: b.url, ...(b.example ? { example: [b.example] } : {}) }
    case 'PHONE_NUMBER':
      return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone_number }
    default:
      throw new Error('Unsupported carousel button')
  }
}

export function buildCarouselCreateComponent(cards: CarouselCard[]) {
  return {
    type: 'CAROUSEL' as const,
    cards: cards.map((card) => {
      const vars = variableIndices(card.body_text)
      return {
        components: [
          {
            type: 'HEADER',
            format: card.header_type === 'video' ? 'VIDEO' : 'IMAGE',
            example: { header_handle: [card.header_handle ?? ''] },
          },
          {
            type: 'BODY',
            text: card.body_text,
            ...(vars.length ? { example: { body_text: [(card.sample_values ?? []).slice(0, vars.length)] } } : {}),
          },
          { type: 'BUTTONS', buttons: card.buttons.map(createButton) },
        ],
      }
    }),
  }
}

// ---------- Sending (POST /{phone}/messages, type=template) ----------

/**
 * The `carousel` send component. Card media is sent by link (the card's
 * stored public URL); card text variables and URL-button suffixes use
 * the card's saved values, so a carousel sends the same cards to
 * everyone while the main body is personalised.
 */
export function buildCarouselSendComponent(cards: CarouselCard[]) {
  return {
    type: 'carousel' as const,
    cards: cards.map((card, index) => {
      if (!card.media_url) {
        throw new Error(`Carousel card ${index + 1} has no image or video link. Edit the template and add one.`)
      }
      const media = card.header_type === 'video' ? { type: 'video', video: { link: card.media_url } } : { type: 'image', image: { link: card.media_url } }
      const components: Record<string, unknown>[] = [{ type: 'header', parameters: [media] }]
      const vars = variableIndices(card.body_text)
      if (vars.length) {
        components.push({
          type: 'body',
          parameters: (card.sample_values ?? []).slice(0, vars.length).map((text) => ({ type: 'text', text })),
        })
      }
      card.buttons.forEach((b, i) => {
        if (b.type === 'QUICK_REPLY') {
          components.push({
            type: 'button',
            sub_type: 'quick_reply',
            index: i,
            parameters: [{ type: 'payload', payload: `carousel:${index}:${b.text}`.slice(0, 256) }],
          })
        } else if (b.type === 'URL' && variableIndices(b.url).length && b.example) {
          components.push({ type: 'button', sub_type: 'url', index: i, parameters: [{ type: 'text', text: b.example }] })
        }
      })
      return { card_index: index, components }
    }),
  }
}

// ---------- Sync from Meta ----------

interface MetaCarouselCard {
  components?: {
    type?: string
    format?: string
    text?: string
    example?: { header_handle?: string[]; body_text?: string[][] }
    buttons?: { type?: string; text?: string; url?: string; phone_number?: string; example?: string[] }[]
  }[]
}

/** Turn Meta's CAROUSEL component into our cards (media links must be re-added to send). */
export function parseMetaCarousel(component: { cards?: MetaCarouselCard[] } | undefined): CarouselCard[] | null {
  if (!component?.cards?.length) return null
  return component.cards.map((card) => {
    const header = card.components?.find((c) => c.type?.toUpperCase() === 'HEADER')
    const body = card.components?.find((c) => c.type?.toUpperCase() === 'BODY')
    const buttons = card.components?.find((c) => c.type?.toUpperCase() === 'BUTTONS')
    return {
      header_type: header?.format?.toUpperCase() === 'VIDEO' ? 'video' : 'image',
      media_url: null,
      header_handle: header?.example?.header_handle?.[0] ?? null,
      body_text: body?.text ?? '',
      sample_values: body?.example?.body_text?.[0] ?? [],
      buttons: (buttons?.buttons ?? [])
        .map((b): TemplateButton | null => {
          const type = b.type?.toUpperCase()
          if (type === 'QUICK_REPLY') return { type: 'QUICK_REPLY', text: b.text ?? '' }
          if (type === 'URL') return { type: 'URL', text: b.text ?? '', url: b.url ?? '', example: b.example?.[0] }
          if (type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text ?? '', phone_number: b.phone_number ?? '' }
          return null
        })
        .filter((b): b is TemplateButton => b !== null),
    }
  })
}
