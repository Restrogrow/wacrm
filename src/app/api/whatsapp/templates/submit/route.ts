import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { TemplatePayload } from '@/lib/whatsapp/template-validators'
import {
  assertSubmittableTemplate,
  isTemplatesDryRun,
  submitNewTemplate,
  TemplateSubmitError,
} from '@/lib/whatsapp/template-submit'

/**
 * Submit a template to Meta for approval AND persist it locally.
 *
 * Auth → validate → shared pipeline (`submitNewTemplate`: fetch
 * whatsapp_config → DRY_RUN short-circuit → POST to Meta → upsert the
 * local row by (account_id, name, language)). The public API's
 * `POST /api/v1/templates` runs the same pipeline.
 *
 * When WHATSAPP_TEMPLATES_DRY_RUN=true, the Meta call is skipped and
 * the row gets a synthetic `dry-run-<uuid>` meta_template_id so
 * CI / local dev can exercise the full UI without a real Meta App.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Resolve the caller's account_id — whatsapp_config + the
    // message_templates row are account-scoped post-multi-user.
    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle()
    const accountId = profile?.account_id as string | undefined
    if (!accountId) {
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 },
      )
    }

    let payload: TemplatePayload
    try {
      payload = (await request.json()) as TemplatePayload
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
    }

    try {
      assertSubmittableTemplate(payload)
      const row = await submitNewTemplate(supabase, {
        accountId,
        userId: user.id,
        payload,
      })
      return NextResponse.json({
        success: true,
        template: row,
        dry_run: isTemplatesDryRun(),
      })
    } catch (e) {
      if (e instanceof TemplateSubmitError) {
        return NextResponse.json(
          e.metaTemplateId
            ? { error: e.message, meta_template_id: e.metaTemplateId }
            : { error: e.message },
          { status: e.status },
        )
      }
      throw e
    }
  } catch (error) {
    console.error('Error submitting template:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to submit template.',
      },
      { status: 500 },
    )
  }
}
