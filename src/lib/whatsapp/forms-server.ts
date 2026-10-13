// Shared helpers for the WhatsApp forms API routes (server only).

import type { SupabaseClient } from '@supabase/supabase-js'

import {
  fieldKey,
  loadFormCreds,
  publishForm,
  retireFlow,
  validateForm,
  type FormDefinition,
  type FormField,
  type FlowValidationError,
} from '@/lib/whatsapp/forms'

const TYPES = new Set(['text', 'email', 'phone', 'number', 'textarea', 'dropdown', 'date', 'optin'])

/** Parse + validate a request body into a FormDefinition. Throws on bad input. */
export function readDefinition(body: unknown): FormDefinition {
  const b = (body ?? {}) as Record<string, unknown>
  const rawFields = Array.isArray(b.fields) ? (b.fields as Record<string, unknown>[]) : []
  const used = new Set<string>()
  const fields: FormField[] = rawFields.map((f, i) => {
    const label = String(f.label ?? '').trim()
    let key = typeof f.key === 'string' && /^[a-z][a-z0-9_]{0,39}$/.test(f.key) ? f.key : fieldKey(label, i)
    while (used.has(key)) key = `${key}_${i + 1}`.slice(0, 40)
    used.add(key)
    const type = TYPES.has(String(f.type)) ? (f.type as FormField['type']) : 'text'
    return {
      key,
      label,
      type,
      required: f.required === true,
      options: type === 'dropdown' && Array.isArray(f.options) ? (f.options as unknown[]).map((o) => String(o)) : undefined,
      save_to: typeof f.save_to === 'string' && f.save_to ? f.save_to : null,
    }
  })
  const definition: FormDefinition = {
    name: String(b.name ?? '').trim(),
    title: String(b.title ?? '').trim(),
    intro: typeof b.intro === 'string' ? b.intro.trim() || null : null,
    submit_label: String(b.submit_label ?? 'Submit').trim(),
    category: typeof b.category === 'string' ? b.category : 'LEAD_GENERATION',
    fields,
  }
  validateForm(definition)
  return definition
}

export type PublishResult =
  | { ok: true; id: string; flow_id: string }
  | { ok: false; id: string; error: string; validation_errors?: FlowValidationError[] }

/** Publish the form's Flow on Meta and record the outcome on the row. */
export async function publishAndSave(
  db: SupabaseClient,
  accountId: string,
  formId: string,
  definition: FormDefinition,
): Promise<PublishResult> {
  try {
    const creds = await loadFormCreds(db, accountId)
    const { flowId } = await publishForm(creds, definition, `${definition.name} · ${formId.slice(0, 8)} · ${Date.now()}`)
    await db
      .from('whatsapp_forms')
      .update({ meta_flow_id: flowId, status: 'published', error: null, validation_errors: null, updated_at: new Date().toISOString() })
      .eq('id', formId)
    return { ok: true, id: formId, flow_id: flowId }
  } catch (err) {
    const e = err as Error & { flowId?: string; validationErrors?: FlowValidationError[] }
    // A Flow created but not publishable is useless — remove it.
    if (e.flowId) {
      try {
        await retireFlow(await loadFormCreds(db, accountId), e.flowId)
      } catch {
        // ignore
      }
    }
    await db
      .from('whatsapp_forms')
      .update({
        status: 'failed',
        error: e.message?.slice(0, 1000) ?? 'Publishing failed',
        validation_errors: e.validationErrors ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', formId)
    return { ok: false, id: formId, error: e.message, validation_errors: e.validationErrors }
  }
}
