// ============================================================
// WhatsApp forms — simple forms published as Meta WhatsApp Flows
// (migration 052).
//
//   build:   our fields → single-screen Flow JSON (buildFlowJson)
//   publish: POST /{waba}/flows (+ /publish) → meta_flow_id
//   send:    interactive "flow" message with flow_token
//            "rgform:<form id>:<random>" so the reply maps back
//   reply:   webhook interactive.nfm_reply → response_json → saved to
//            whatsapp_form_responses and mapped onto the contact
//
// Docs: https://developers.facebook.com/docs/whatsapp/flows
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'

import { decrypt } from '@/lib/whatsapp/encryption'

const GRAPH = 'https://graph.facebook.com/v21.0'
export const FLOW_JSON_VERSION = '5.1'
export const FLOW_TOKEN_PREFIX = 'rgform'

export type FormFieldType = 'text' | 'email' | 'phone' | 'number' | 'textarea' | 'dropdown' | 'date' | 'optin'

export interface FormField {
  /** Stable key used in the Flow and in answers (a-z, 0-9, _). */
  key: string
  label: string
  type: FormFieldType
  required: boolean
  /** Dropdown choices. */
  options?: string[]
  /** Where to save the answer on the contact: 'name', 'email' or 'custom:<custom_field id>'. */
  save_to?: string | null
}

export interface FormDefinition {
  name: string
  title: string
  intro?: string | null
  submit_label: string
  category?: string
  fields: FormField[]
}

export const FORM_CATEGORIES = [
  'LEAD_GENERATION',
  'CONTACT_US',
  'CUSTOMER_SUPPORT',
  'SURVEY',
  'APPOINTMENT_BOOKING',
  'SIGN_UP',
  'OTHER',
] as const

export const FORM_LIMITS = { maxFields: 15, labelMax: 30, titleMax: 30, submitMax: 30, introMax: 1000, optionsMax: 20 } as const

/** "Full name" → "full_name"; always a valid, unique-ish component name. */
export function fieldKey(label: string, index: number): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30)
  return /^[a-z]/.test(base) ? base : `field_${index + 1}${base ? `_${base}` : ''}`.slice(0, 40)
}

/** Throws a user-facing Error for the first problem. */
export function validateForm(form: FormDefinition): void {
  if (!form.name?.trim()) throw new Error('Give the form a name.')
  if (!form.title?.trim()) throw new Error('Add a title customers will see.')
  if (form.title.length > FORM_LIMITS.titleMax) throw new Error(`Title must be ${FORM_LIMITS.titleMax} characters or fewer.`)
  if (!form.submit_label?.trim()) throw new Error('Add a label for the submit button.')
  if (form.submit_label.length > FORM_LIMITS.submitMax) throw new Error(`Button label must be ${FORM_LIMITS.submitMax} characters or fewer.`)
  if ((form.intro ?? '').length > FORM_LIMITS.introMax) throw new Error('Intro text is too long.')
  if (form.category && !(FORM_CATEGORIES as readonly string[]).includes(form.category)) throw new Error('Choose a form type.')
  if (!form.fields.length) throw new Error('Add at least one field.')
  if (form.fields.length > FORM_LIMITS.maxFields) throw new Error(`A form can have up to ${FORM_LIMITS.maxFields} fields.`)
  const keys = new Set<string>()
  form.fields.forEach((f, i) => {
    const n = i + 1
    if (!f.label?.trim()) throw new Error(`Field ${n}: add a label.`)
    if (f.label.length > FORM_LIMITS.labelMax) throw new Error(`Field ${n}: labels are ${FORM_LIMITS.labelMax} characters max.`)
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(f.key)) throw new Error(`Field ${n}: invalid key.`)
    if (keys.has(f.key)) throw new Error(`Two fields have the same key "${f.key}" — rename one of the labels.`)
    keys.add(f.key)
    if (f.type === 'dropdown') {
      const opts = (f.options ?? []).map((o) => o.trim()).filter(Boolean)
      if (opts.length < 2) throw new Error(`Field ${n}: a dropdown needs at least 2 choices.`)
      if (opts.length > FORM_LIMITS.optionsMax) throw new Error(`Field ${n}: up to ${FORM_LIMITS.optionsMax} choices.`)
    }
  })
}

function component(f: FormField): Record<string, unknown> {
  const common = { name: f.key, label: f.label, required: f.required }
  switch (f.type) {
    case 'text':
      return { type: 'TextInput', 'input-type': 'text', ...common }
    case 'email':
      return { type: 'TextInput', 'input-type': 'email', ...common }
    case 'phone':
      return { type: 'TextInput', 'input-type': 'phone', ...common }
    case 'number':
      return { type: 'TextInput', 'input-type': 'number', ...common }
    case 'textarea':
      return { type: 'TextArea', ...common }
    case 'date':
      return { type: 'DatePicker', ...common }
    case 'dropdown':
      return {
        type: 'Dropdown',
        ...common,
        'data-source': (f.options ?? [])
          .map((o) => o.trim())
          .filter(Boolean)
          .map((o, i) => ({ id: `opt_${i + 1}`, title: o.slice(0, 30) })),
      }
    case 'optin':
      return { type: 'OptIn', name: f.key, label: f.label, required: f.required }
  }
}

/** Single terminal screen: optional intro, the fields, a submit footer. */
export function buildFlowJson(form: FormDefinition): Record<string, unknown> {
  const children: Record<string, unknown>[] = []
  if (form.intro?.trim()) children.push({ type: 'TextBody', text: form.intro.trim() })
  children.push({
    type: 'Form',
    name: 'form',
    children: [
      ...form.fields.map(component),
      {
        type: 'Footer',
        label: form.submit_label.trim(),
        'on-click-action': {
          name: 'complete',
          payload: Object.fromEntries(form.fields.map((f) => [f.key, `\${form.${f.key}}`])),
        },
      },
    ],
  })
  return {
    version: FLOW_JSON_VERSION,
    screens: [
      {
        id: 'FORM_SCREEN',
        title: form.title.trim(),
        terminal: true,
        success: true,
        layout: { type: 'SingleColumnLayout', children },
      },
    ],
  }
}

/** Dropdown answers come back as option ids — turn them into the choice text. */
export function readableAnswers(fields: FormField[], raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of fields) {
    const v = raw[f.key]
    if (v === undefined || v === null || v === '') continue
    if (f.type === 'dropdown') {
      const idx = Number(String(v).replace('opt_', '')) - 1
      const opts = (f.options ?? []).map((o) => o.trim()).filter(Boolean)
      out[f.key] = opts[idx] ?? String(v)
    } else if (f.type === 'optin') {
      out[f.key] = v === true || v === 'true' ? 'Yes' : 'No'
    } else {
      out[f.key] = String(v)
    }
  }
  return out
}

// ---------- Meta API ----------

interface Creds {
  wabaId: string
  phoneNumberId: string
  accessToken: string
}

export async function loadFormCreds(db: SupabaseClient, accountId: string): Promise<Creds> {
  const { data } = await db.from('whatsapp_config').select('waba_id, phone_number_id, access_token').eq('account_id', accountId).maybeSingle()
  if (!data?.waba_id || !data.phone_number_id || !data.access_token) {
    throw new Error('Connect WhatsApp first (Settings → WhatsApp).')
  }
  return { wabaId: data.waba_id, phoneNumberId: data.phone_number_id, accessToken: decrypt(data.access_token) }
}

async function graph<T>(creds: Creds, path: string, init: { method: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${GRAPH}/${path}`, {
    method: init.method,
    headers: { Authorization: `Bearer ${creds.accessToken}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; error_user_msg?: string } }
  if (!res.ok || json.error) throw new Error(json.error?.error_user_msg || json.error?.message || `WhatsApp returned ${res.status}`)
  return json
}

export interface FlowValidationError {
  error?: string
  message?: string
}

/** Create + publish a Flow. Returns the Flow id, or throws with Meta's validation messages. */
export async function publishForm(creds: Creds, form: FormDefinition, uniqueName: string): Promise<{ flowId: string }> {
  const created = await graph<{ id: string; validation_errors?: FlowValidationError[] }>(creds, `${creds.wabaId}/flows`, {
    method: 'POST',
    body: {
      name: uniqueName.slice(0, 200),
      categories: [form.category ?? 'LEAD_GENERATION'],
      flow_json: JSON.stringify(buildFlowJson(form)),
    },
  })
  if (created.validation_errors?.length) {
    const err = new Error(created.validation_errors.map((e) => e.message ?? e.error).join(' · ')) as Error & {
      flowId?: string
      validationErrors?: FlowValidationError[]
    }
    err.flowId = created.id
    err.validationErrors = created.validation_errors
    throw err
  }
  await graph(creds, `${created.id}/publish`, { method: 'POST' })
  return { flowId: created.id }
}

/** Retire a Flow on Meta: deprecate if published, delete if still a draft. Best effort. */
export async function retireFlow(creds: Creds, flowId: string): Promise<void> {
  try {
    await graph(creds, `${flowId}/deprecate`, { method: 'POST' })
  } catch {
    try {
      await graph(creds, flowId, { method: 'DELETE' })
    } catch {
      // Already gone.
    }
  }
}

export function newFlowToken(formId: string): string {
  return `${FLOW_TOKEN_PREFIX}:${formId}:${crypto.randomUUID().slice(0, 8)}`
}

export function formIdFromToken(token: string | undefined | null): string | null {
  if (!token) return null
  const [prefix, id] = token.split(':')
  return prefix === FLOW_TOKEN_PREFIX && /^[0-9a-f-]{36}$/i.test(id ?? '') ? id : null
}

export async function sendFormMessage(
  creds: Creds,
  to: string,
  args: { flowId: string; formId: string; body: string; cta: string; header?: string },
): Promise<string | null> {
  const res = await graph<{ messages?: { id: string }[] }>(creds, `${creds.phoneNumberId}/messages`, {
    method: 'POST',
    body: {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'flow',
        ...(args.header ? { header: { type: 'text', text: args.header.slice(0, 60) } } : {}),
        body: { text: args.body.slice(0, 1024) },
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: '3',
            flow_token: newFlowToken(args.formId),
            flow_id: args.flowId,
            flow_cta: args.cta.slice(0, 30),
            flow_action: 'navigate',
            flow_action_payload: { screen: 'FORM_SCREEN' },
          },
        },
      },
    },
  })
  return res.messages?.[0]?.id ?? null
}

// ---------- Webhook: nfm_reply ----------

/** Parse Meta's response_json; null if it isn't a form reply. */
export function parseFlowReply(responseJson: string | undefined): { token: string | null; answers: Record<string, unknown> } | null {
  if (!responseJson) return null
  try {
    const data = JSON.parse(responseJson) as Record<string, unknown>
    const { flow_token, ...answers } = data
    return { token: typeof flow_token === 'string' ? flow_token : null, answers }
  } catch {
    return null
  }
}

/**
 * Save a submitted form and copy mapped answers onto the contact.
 * Returns a readable summary for the chat bubble, or null if the reply
 * isn't one of our forms.
 */
export async function handleFormReply(
  db: SupabaseClient,
  args: {
    accountId: string
    contactId: string
    conversationId: string
    messageId: string
    responseJson: string | undefined
  },
): Promise<string | null> {
  const parsed = parseFlowReply(args.responseJson)
  const formId = formIdFromToken(parsed?.token)
  if (!parsed || !formId) return null

  const { data: form } = await db
    .from('whatsapp_forms')
    .select('id, name, fields')
    .eq('id', formId)
    .eq('account_id', args.accountId)
    .maybeSingle()
  if (!form) return null
  const fields = (form.fields ?? []) as FormField[]
  const answers = readableAnswers(fields, parsed.answers)

  await db.from('whatsapp_form_responses').upsert(
    {
      account_id: args.accountId,
      form_id: form.id,
      contact_id: args.contactId,
      conversation_id: args.conversationId,
      message_id: args.messageId,
      answers,
    },
    { onConflict: 'message_id', ignoreDuplicates: true },
  )

  // Copy mapped answers onto the contact.
  const contactUpdate: Record<string, string> = {}
  for (const f of fields) {
    const value = answers[f.key]
    if (!value || !f.save_to) continue
    if (f.save_to === 'name') contactUpdate.name = value
    else if (f.save_to === 'email') contactUpdate.email = value
    else if (f.save_to.startsWith('custom:')) {
      await db
        .from('contact_custom_values')
        .upsert(
          { contact_id: args.contactId, custom_field_id: f.save_to.slice('custom:'.length), value },
          { onConflict: 'contact_id,custom_field_id' },
        )
    }
  }
  if (Object.keys(contactUpdate).length) {
    await db.from('contacts').update({ ...contactUpdate, updated_at: new Date().toISOString() }).eq('id', args.contactId)
  }

  const lines = fields.filter((f) => answers[f.key]).map((f) => `${f.label}: ${answers[f.key]}`)
  return `📝 ${form.name}\n${lines.join('\n')}`
}
