import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import {
  editFlowWithPrompt,
  resolveNewTags,
  type EditableFlow,
} from '@/lib/flows/ai-generate'

/**
 * POST /api/flows/[id]/ai — { prompt, current } → AI-edited flow.
 *
 * Does NOT save the flow: it returns the updated trigger + nodes and
 * the editor drops them into its unsaved state, so the user sees the
 * change on the canvas, can undo it, and persists with the normal Save.
 * `current` is the editor's live (possibly unsaved) state, so edits
 * build on what the user is looking at, not the last saved version.
 *
 * Tags the AI asks for are created here, since the editor needs real
 * tag ids.
 */

const MAX_PROMPT_LENGTH = 2000
const MAX_NODES = 80

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // RLS scopes this to the caller's account.
  const { data: flow } = await supabase
    .from('flows')
    .select('id, account_id')
    .eq('id', id)
    .maybeSingle()
  if (!flow) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = (await request.json().catch(() => null)) as
    | { prompt?: string; current?: EditableFlow }
    | null
  const prompt = body?.prompt?.trim() ?? ''
  const current = body?.current
  if (!prompt) {
    return NextResponse.json({ error: 'Describe the change you want.' }, { status: 400 })
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return NextResponse.json(
      { error: `Request is too long (max ${MAX_PROMPT_LENGTH} characters).` },
      { status: 400 },
    )
  }
  if (!current || !Array.isArray(current.nodes)) {
    return NextResponse.json({ error: 'Missing current flow.' }, { status: 400 })
  }
  if (current.nodes.length > MAX_NODES) {
    return NextResponse.json(
      { error: `This flow is too large for AI editing (max ${MAX_NODES} steps).` },
      { status: 400 },
    )
  }

  const { data: tags } = await supabase.from('tags').select('id, name').order('name')

  const result = await editFlowWithPrompt(current, prompt, tags ?? [])
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, issues: result.issues ?? [] },
      { status: 422 },
    )
  }

  const admin = supabaseAdmin()
  let nodes
  try {
    nodes = await resolveNewTags(result.generated, async (names) => {
      const { data, error } = await admin
        .from('tags')
        .insert(names.map((name) => ({ name, user_id: user.id, account_id: flow.account_id })))
        .select('id, name')
      if (error || !data) throw new Error(error?.message ?? 'tag insert failed')
      return data
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'tag insert failed' },
      { status: 500 },
    )
  }

  return NextResponse.json({
    flow: result.generated.flow,
    nodes,
    new_tags: result.generated.new_tags,
  })
}
