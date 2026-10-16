// Builds the "new demo request" notification sent to the sales inbox.

import { brandedEmailHtml, brandedEmailText, type BrandedEmailInput } from './branded'

export interface DemoRequestEmailData {
  name: string
  businessName: string
  whatsapp: string
  email: string
  teamSize: string
  useCase: string
  message: string
  sourcePage: string
}

/** wa.me needs digits only; a bare 10-digit number is treated as Indian. */
export function whatsappLink(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
  if (digits.length === 10) digits = `91${digits}`
  return `https://wa.me/${digits}`
}

export function demoRequestEmail(d: DemoRequestEmailData): {
  subject: string
  html: string
  text: string
} {
  const input: BrandedEmailInput = {
    preheader: `${d.name} from ${d.businessName} wants a demo. Reply on WhatsApp ${d.whatsapp}.`,
    eyebrow: 'New demo request',
    title: `${d.name} from ${d.businessName} wants a demo`,
    intro: 'Someone just filled in the form on repeatgrow.com/demo. Reply soon, ideally on WhatsApp.',
    rows: [
      { label: 'Name', value: d.name },
      { label: 'Business', value: d.businessName },
      { label: 'WhatsApp', value: d.whatsapp, href: whatsappLink(d.whatsapp) },
      ...(d.email ? [{ label: 'Email', value: d.email, href: `mailto:${d.email}` }] : []),
      ...(d.teamSize ? [{ label: 'Team size', value: d.teamSize }] : []),
      ...(d.useCase ? [{ label: 'Interested in', value: d.useCase }] : []),
      ...(d.sourcePage ? [{ label: 'Came from', value: d.sourcePage }] : []),
    ],
    note: d.message ? { label: 'Their message', text: d.message } : undefined,
    buttons: [
      { label: 'Reply on WhatsApp', href: whatsappLink(d.whatsapp), variant: 'primary' },
      ...(d.email ? [{ label: 'Send an email', href: `mailto:${d.email}`, variant: 'secondary' as const }] : []),
    ],
    reason:
      'You are receiving this because a visitor requested a demo on repeatgrow.com. The request is also saved in Supabase (table demo_requests).',
  }
  return {
    subject: `New demo request: ${d.businessName} (${d.name})`,
    html: brandedEmailHtml(input),
    text: brandedEmailText(input),
  }
}
