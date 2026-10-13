import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/whatsapp/encryption', () => ({ decrypt: (s: string) => s }))

import {
  buildFlowJson,
  fieldKey,
  formIdFromToken,
  handleFormReply,
  newFlowToken,
  parseFlowReply,
  readableAnswers,
  validateForm,
  type FormDefinition,
  type FormField,
} from './forms'
import { readDefinition } from './forms-server'

const FORM_ID = '11111111-2222-3333-4444-555555555555'

const fields: FormField[] = [
  { key: 'full_name', label: 'Full name', type: 'text', required: true, save_to: 'name' },
  { key: 'email', label: 'Email', type: 'email', required: false, save_to: 'email' },
  { key: 'budget', label: 'Budget', type: 'dropdown', required: false, options: ['Under ₹10k', '₹10k–50k'], save_to: 'custom:cf1' },
  { key: 'consent', label: 'Send me offers', type: 'optin', required: false },
]

const form: FormDefinition = { name: 'Lead form', title: 'Get a quote', intro: 'Tell us a little', submit_label: 'Send', fields }

describe('buildFlowJson', () => {
  it('builds one terminal screen with the fields and a complete action', () => {
    const json = buildFlowJson(form) as {
      version: string
      screens: { id: string; terminal: boolean; layout: { children: Record<string, unknown>[] } }[]
    }
    expect(json.version).toBe('5.1')
    const screen = json.screens[0]
    expect(screen).toMatchObject({ id: 'FORM_SCREEN', terminal: true })
    expect(screen.layout.children[0]).toEqual({ type: 'TextBody', text: 'Tell us a little' })
    const formNode = screen.layout.children[1] as { type: string; children: Record<string, unknown>[] }
    expect(formNode.type).toBe('Form')
    expect(formNode.children[0]).toEqual({ type: 'TextInput', 'input-type': 'text', name: 'full_name', label: 'Full name', required: true })
    expect(formNode.children[2]).toMatchObject({
      type: 'Dropdown',
      'data-source': [
        { id: 'opt_1', title: 'Under ₹10k' },
        { id: 'opt_2', title: '₹10k–50k' },
      ],
    })
    const footer = formNode.children.at(-1) as { type: string; 'on-click-action': { name: string; payload: Record<string, string> } }
    expect(footer.type).toBe('Footer')
    expect(footer['on-click-action'].name).toBe('complete')
    expect(footer['on-click-action'].payload.full_name).toBe('${form.full_name}')
  })
})

describe('validateForm', () => {
  it('accepts a good form', () => expect(() => validateForm(form)).not.toThrow())
  it('rejects missing title, empty fields and short dropdowns', () => {
    expect(() => validateForm({ ...form, title: '' })).toThrow(/title/)
    expect(() => validateForm({ ...form, fields: [] })).toThrow(/at least one field/)
    expect(() => validateForm({ ...form, fields: [{ ...fields[2], options: ['Only one'] }] })).toThrow(/2 choices/)
    expect(() => validateForm({ ...form, fields: [fields[0], fields[0]] })).toThrow(/same key/)
  })
})

describe('field keys and definitions', () => {
  it('derives safe keys from labels', () => {
    expect(fieldKey('Full name', 0)).toBe('full_name')
    expect(fieldKey('123 Budget?', 2)).toMatch(/^field_3/)
  })

  it('readDefinition fills keys, de-duplicates and validates', () => {
    const def = readDefinition({
      name: 'X',
      title: 'Y',
      submit_label: 'Go',
      fields: [
        { label: 'Name', type: 'text' },
        { label: 'Name', type: 'bogus' },
      ],
    })
    expect(def.fields.map((f) => f.key)).toEqual(['name', 'name_2'])
    expect(def.fields[1].type).toBe('text')
  })
})

describe('replies', () => {
  it('round-trips the flow token', () => {
    expect(formIdFromToken(newFlowToken(FORM_ID))).toBe(FORM_ID)
    expect(formIdFromToken('other:abc')).toBeNull()
  })

  it('turns dropdown ids and opt-ins into readable answers', () => {
    expect(readableAnswers(fields, { full_name: 'Asha', budget: 'opt_2', consent: true, email: '' })).toEqual({
      full_name: 'Asha',
      budget: '₹10k–50k',
      consent: 'Yes',
    })
  })

  it('parses response_json and strips the token', () => {
    expect(parseFlowReply(JSON.stringify({ flow_token: 't', a: 1 }))).toEqual({ token: 't', answers: { a: 1 } })
    expect(parseFlowReply('not json')).toBeNull()
  })

  it('saves the response, updates the contact and returns a summary', async () => {
    const writes: { table: string; op: string; row: Record<string, unknown> }[] = []
    const db = {
      from(table: string) {
        const b: Record<string, unknown> = {
          select: () => b,
          eq: () => b,
          maybeSingle: async () => ({ data: { id: FORM_ID, name: 'Lead form', fields } }),
          upsert: async (row: Record<string, unknown>) => {
            writes.push({ table, op: 'upsert', row })
            return { error: null }
          },
          update: (row: Record<string, unknown>) => {
            writes.push({ table, op: 'update', row })
            return b
          },
          then: (r: (v: unknown) => void) => r({ error: null }),
        }
        return b
      },
    } as unknown as SupabaseClient

    const summary = await handleFormReply(db, {
      accountId: 'acc',
      contactId: 'ct',
      conversationId: 'cv',
      messageId: 'wamid.1',
      responseJson: JSON.stringify({ flow_token: newFlowToken(FORM_ID), full_name: 'Asha Rao', email: 'a@x.in', budget: 'opt_1' }),
    })

    expect(summary).toBe('📝 Lead form\nFull name: Asha Rao\nEmail: a@x.in\nBudget: Under ₹10k')
    expect(writes.find((w) => w.table === 'whatsapp_form_responses')?.row).toMatchObject({
      form_id: FORM_ID,
      contact_id: 'ct',
      answers: { full_name: 'Asha Rao', email: 'a@x.in', budget: 'Under ₹10k' },
    })
    expect(writes.find((w) => w.table === 'contact_custom_values')?.row).toMatchObject({ custom_field_id: 'cf1', value: 'Under ₹10k' })
    expect(writes.find((w) => w.table === 'contacts')?.row).toMatchObject({ name: 'Asha Rao', email: 'a@x.in' })
  })

  it('ignores flow replies that aren’t our forms', async () => {
    const db = {} as SupabaseClient
    expect(
      await handleFormReply(db, { accountId: 'a', contactId: 'c', conversationId: 'v', messageId: 'm', responseJson: JSON.stringify({ flow_token: 'x' }) }),
    ).toBeNull()
  })
})
