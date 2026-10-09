import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { generateFlowFromPrompt, resolveNewTags } from '@/lib/flows/ai-generate'

/**
 * POST /api/flows/ai — { prompt } → generate a flow with AI and save it
 * as a DRAFT for the caller's account. The user reviews it in the
 * builder before activating; nothing goes live from here.
 */

const MAX_PROMPT_LENGTH = 4000

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .single()
  const accountId = profile?.account_id as string | undefined
  if (!accountId) {
    return NextResponse.json(
      { error: 'Your profile is not linked to an account.' },
      { status: 403 },
    )
  }

  const body = (await request.json().catch(() => null)) as { prompt?: string } | null
  const prompt = body?.prompt?.trim() ?? ''
  if (!prompt) {
    return NextResponse.json({ error: 'Describe the flow you want.' }, { status: 400 })
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return NextResponse.json(
      { error: `Description is too long (max ${MAX_PROMPT_LENGTH} characters).` },
      { status: 400 },
    )
  }

  // Account tags so the AI can wire set_tag nodes to real tag ids.
  const { data: tags } = await supabase.from('tags').select('id, name').order('name')

  const result = await generateFlowFromPrompt(prompt, tags ?? [])
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, issues: result.issues ?? [] },
      { status: 422 },
    )
  }
  const { flow } = result.generated

  const admin = supabaseAdmin()

  // Create any tags the AI asked for, then point set_tag nodes at them.
  let resolvedNodes
  try {
    resolvedNodes = await resolveNewTags(result.generated, async (names) => {
      const { data, error } = await admin
        .from('tags')
        .insert(names.map((name) => ({ name, user_id: user.id, account_id: accountId })))
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
  const { data: created, error: flowErr } = await admin
    .from('flows')
    .insert({
      user_id: user.id,
      account_id: accountId,
      name: flow.name,
      description: flow.description,
      status: 'draft',
      trigger_type: flow.trigger_type,
      trigger_config: flow.trigger_config,
      entry_node_id: flow.entry_node_id,
    })
    .select()
    .single()
  if (flowErr || !created) {
    return NextResponse.json(
      { error: flowErr?.message ?? 'flow insert failed' },
      { status: 500 },
    )
  }

  const { error: nodesErr } = await admin.from('flow_nodes').insert(
    resolvedNodes.map((n) => ({
      flow_id: created.id,
      node_key: n.node_key,
      node_type: n.node_type,
      config: n.config,
    })),
  )
  if (nodesErr) {
    // Don't leave an empty draft behind.
    await admin.from('flows').delete().eq('id', created.id)
    return NextResponse.json({ error: nodesErr.message }, { status: 500 })
  }

  return NextResponse.json({ flow: created }, { status: 201 })
}
