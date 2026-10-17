'use client'

// Create / edit a journey (date-based message, drip sequence or win-back).
// Reads templates, tags, segments and custom fields with the signed-in
// user's Supabase client (row-level security keeps it to this account) and
// saves through /api/journeys.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CalendarHeart, Eye, Loader2, Plus, Trash2, UserRoundPlus, Waypoints } from 'lucide-react'
import { toast } from 'sonner'

import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase/client'
import { JOURNEY_KIND_LABELS, VARIABLE_HELP, type JourneyKind } from '@/lib/journeys/core'

interface TemplateOption {
  name: string
  language: string
  status: string
  category: string | null
  body_text: string
}
interface Option {
  id: string
  name: string
}

interface StepState {
  delayValue: number
  delayUnit: 'minutes' | 'hours' | 'days'
  message_type: 'template' | 'text'
  template_key: string // "name|language"
  template_params: string[]
  text_body: string
}

export interface EditorInitial {
  id: string | null
  kind: JourneyKind
  name: string
  daily_cap: number
  config: Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  steps: Array<{
    delay_minutes: number
    message_type: 'template' | 'text'
    template_name: string | null
    template_language: string | null
    template_params: string[]
    text_body: string | null
  }>
}

const UNIT_MINUTES = { minutes: 1, hours: 60, days: 1440 } as const

function splitDelay(minutes: number): Pick<StepState, 'delayValue' | 'delayUnit'> {
  if (minutes > 0 && minutes % 1440 === 0) return { delayValue: minutes / 1440, delayUnit: 'days' }
  if (minutes > 0 && minutes % 60 === 0) return { delayValue: minutes / 60, delayUnit: 'hours' }
  return { delayValue: minutes, delayUnit: 'minutes' }
}

function toStepState(s: EditorInitial['steps'][number]): StepState {
  return {
    ...splitDelay(s.delay_minutes),
    message_type: s.message_type,
    template_key: s.template_name ? `${s.template_name}|${s.template_language || 'en_US'}` : '',
    template_params: s.template_params ?? [],
    text_body: s.text_body ?? '',
  }
}

const emptyStep = (): StepState => ({
  delayValue: 1,
  delayUnit: 'days',
  message_type: 'template',
  template_key: '',
  template_params: [],
  text_body: '',
})

export function defaultInitial(kind: JourneyKind): EditorInitial {
  const first = { delay_minutes: 0, message_type: 'template' as const, template_name: null, template_language: null, template_params: [], text_body: null }
  if (kind === 'date') {
    return {
      id: null,
      kind,
      name: 'Birthday wishes',
      daily_cap: 200,
      config: { date_source: { type: 'custom_field', field_id: '' }, offset_days: 0, send_time: '10:00', recurrence: 'yearly' },
      steps: [first],
    }
  }
  if (kind === 'drip') {
    return {
      id: null,
      kind,
      name: 'Welcome sequence',
      daily_cap: 200,
      config: { enrollment: { mode: 'tag', tag_id: '' }, exit: { on_reply: true, tag_id: null } },
      steps: [first],
    }
  }
  return {
    id: null,
    kind,
    name: 'Win back quiet customers',
    daily_cap: 100,
    config: { inactive_days: 60, cooldown_days: 90, per_run_limit: 50 },
    steps: [first],
  }
}

const field = 'border-border bg-background focus:border-primary h-9 w-full rounded-lg border px-3 text-sm outline-none'
const card = 'border-border bg-card rounded-2xl border p-5 shadow-sm'

/** Count {{1}}, {{2}}... in a template body. */
function paramCount(body: string): number {
  const nums = [...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]))
  return nums.length ? Math.max(...nums) : 0
}

export function JourneyEditor({ initial }: { initial: EditorInitial }) {
  const router = useRouter()
  const isNew = initial.id === null
  const kind = initial.kind

  const [name, setName] = useState(initial.name)
  const [dailyCap, setDailyCap] = useState(initial.daily_cap)
  const [config, setConfig] = useState(initial.config)
  const [steps, setSteps] = useState<StepState[]>(initial.steps.map(toStepState))
  const [saving, setSaving] = useState(false)

  const [templates, setTemplates] = useState<TemplateOption[]>([])
  const [tags, setTags] = useState<Option[]>([])
  const [segments, setSegments] = useState<Option[]>([])
  const [fields, setFields] = useState<Option[]>([])

  const [enrollTarget, setEnrollTarget] = useState('')
  const [enrolling, setEnrolling] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    void (async () => {
      const [t, tg, sg, cf] = await Promise.all([
        supabase.from('message_templates').select('name, language, status, category, body_text').order('name'),
        supabase.from('tags').select('id, name').order('name'),
        supabase.from('segments').select('id, name').order('name'),
        supabase.from('custom_fields').select('id, field_name').order('field_name'),
      ])
      setTemplates((t.data ?? []) as TemplateOption[])
      setTags((tg.data ?? []) as Option[])
      setSegments((sg.data ?? []) as Option[])
      setFields(((cf.data ?? []) as Array<{ id: string; field_name: string }>).map((f) => ({ id: f.id, name: f.field_name })))
    })()
  }, [])

  const templateByKey = useMemo(() => {
    const m = new Map<string, TemplateOption>()
    for (const t of templates) m.set(`${t.name}|${t.language}`, t)
    return m
  }, [templates])

  const setCfg = (patch: Record<string, unknown>) => setConfig((c) => ({ ...c, ...patch }))
  const patchStep = (i: number, patch: Partial<StepState>) =>
    setSteps((list) => list.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))

  function buildBody() {
    return {
      name,
      kind,
      daily_cap: dailyCap,
      config,
      steps: steps.map((s) => {
        const [tplName, tplLang] = s.template_key.split('|')
        return {
          delay_minutes: s.delayValue * UNIT_MINUTES[s.delayUnit],
          message_type: s.message_type,
          template_name: s.message_type === 'template' ? tplName || null : null,
          template_language: s.message_type === 'template' ? tplLang || null : null,
          template_params: s.message_type === 'template' ? s.template_params : [],
          text_body: s.message_type === 'text' ? s.text_body : null,
        }
      }),
    }
  }

  async function save() {
    setSaving(true)
    const res = await fetch(isNew ? '/api/journeys' : `/api/journeys/${initial.id}`, {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildBody()),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) return toast.error(json.error || 'Could not save')
    toast.success(isNew ? 'Journey created as a draft. Turn it on from the list.' : 'Saved')
    router.push('/journeys')
    router.refresh()
  }

  async function enrollNow() {
    if (!initial.id || !enrollTarget) return
    const [type, id] = enrollTarget.split(':')
    setEnrolling(true)
    const res = await fetch(`/api/journeys/${initial.id}/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(type === 'segment' ? { segment_id: id } : { tag_id: id }),
    })
    const json = await res.json().catch(() => ({}))
    setEnrolling(false)
    if (!res.ok) toast.error(json.error || 'Could not enroll')
    else toast.success(`${json.enrolled} added, ${json.skipped} already in or skipped`)
  }

  const KindIcon = kind === 'date' ? CalendarHeart : kind === 'drip' ? Waypoints : UserRoundPlus

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href="/journeys" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
          <ArrowLeft className="size-3.5" /> All journeys
        </Link>
        <h1 className="mt-2 flex items-center gap-2 text-xl font-bold tracking-tight">
          <KindIcon className="text-primary size-5" /> {isNew ? 'New' : 'Edit'} {JOURNEY_KIND_LABELS[kind].toLowerCase()}
        </h1>
      </div>

      <section className={card}>
        <Label className="text-xs">Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        <div className="mt-4 max-w-[220px]">
          <Label className="text-xs">Most messages per day from this journey</Label>
          <Input type="number" min={1} max={5000} value={dailyCap} onChange={(e) => setDailyCap(Number(e.target.value))} />
        </div>
      </section>

      {/* ---------------- who / when ---------------- */}
      {kind === 'date' && (
        <section className={`${card} space-y-4`}>
          <h2 className="text-sm font-bold">When to send</h2>
          <div>
            <Label className="text-xs">Which date?</Label>
            <select
              className={field}
              value={config.date_source?.type === 'contact_created' ? 'created' : (config.date_source?.field_id ?? '')}
              onChange={(e) =>
                setCfg({
                  date_source: e.target.value === 'created' ? { type: 'contact_created' } : { type: 'custom_field', field_id: e.target.value },
                })
              }
            >
              <option value="">Choose a contact field…</option>
              {fields.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
              <option value="created">Date the contact was added</option>
            </select>
            <p className="text-muted-foreground mt-1 text-xs">
              Create fields like &quot;Birthday&quot; or &quot;Renewal date&quot; under Contacts &gt; Custom fields. Dates such as 15/08/1990,
              1990-08-15 or 15 Aug are understood.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label className="text-xs">Days before (−) or after (+)</Label>
              <Input
                type="number"
                min={-365}
                max={365}
                value={config.offset_days ?? 0}
                onChange={(e) => setCfg({ offset_days: Number(e.target.value) })}
              />
              <p className="text-muted-foreground mt-1 text-xs">0 = on the day</p>
            </div>
            <div>
              <Label className="text-xs">Send at</Label>
              <Input type="time" value={config.send_time ?? '10:00'} onChange={(e) => setCfg({ send_time: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Repeats</Label>
              <select className={field} value={config.recurrence ?? 'yearly'} onChange={(e) => setCfg({ recurrence: e.target.value })}>
                <option value="yearly">Every year</option>
                <option value="once">Only once (date includes a year)</option>
              </select>
            </div>
          </div>
        </section>
      )}

      {kind === 'drip' && (
        <section className={`${card} space-y-4`}>
          <h2 className="text-sm font-bold">Who joins</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Contacts join when</Label>
              <select
                className={field}
                value={config.enrollment?.mode ?? 'manual'}
                onChange={(e) => setCfg({ enrollment: { mode: e.target.value } })}
              >
                <option value="tag">They get a tag</option>
                <option value="segment">They match a saved segment</option>
                <option value="manual">I add them by hand</option>
              </select>
            </div>
            {config.enrollment?.mode === 'tag' && (
              <div>
                <Label className="text-xs">Tag</Label>
                <select
                  className={field}
                  value={config.enrollment?.tag_id ?? ''}
                  onChange={(e) => setCfg({ enrollment: { mode: 'tag', tag_id: e.target.value } })}
                >
                  <option value="">Choose a tag…</option>
                  {tags.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {config.enrollment?.mode === 'segment' && (
              <div>
                <Label className="text-xs">Segment</Label>
                <select
                  className={field}
                  value={config.enrollment?.segment_id ?? ''}
                  onChange={(e) => setCfg({ enrollment: { mode: 'segment', segment_id: e.target.value } })}
                >
                  <option value="">Choose a segment…</option>
                  {segments.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="border-border space-y-3 rounded-xl border p-4">
            <p className="text-xs font-semibold">Stop the sequence for a contact when…</p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.exit?.on_reply !== false}
                onChange={(e) => setCfg({ exit: { ...config.exit, on_reply: e.target.checked } })}
              />
              The customer replies
            </label>
            <div className="max-w-xs">
              <Label className="text-xs">…or they get this tag</Label>
              <select
                className={field}
                value={config.exit?.tag_id ?? ''}
                onChange={(e) => setCfg({ exit: { ...config.exit, tag_id: e.target.value || null } })}
              >
                <option value="">No tag</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-muted-foreground text-xs">Anyone who replies STOP always leaves the sequence.</p>
          </div>

          {!isNew && (
            <div className="border-border rounded-xl border p-4">
              <p className="text-xs font-semibold">Add contacts now</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select className={`${field} max-w-xs`} value={enrollTarget} onChange={(e) => setEnrollTarget(e.target.value)}>
                  <option value="">Everyone in…</option>
                  {segments.map((s) => (
                    <option key={s.id} value={`segment:${s.id}`}>
                      Segment: {s.name}
                    </option>
                  ))}
                  {tags.map((t) => (
                    <option key={t.id} value={`tag:${t.id}`}>
                      Tag: {t.name}
                    </option>
                  ))}
                </select>
                <Button variant="outline" size="sm" onClick={enrollNow} disabled={!enrollTarget || enrolling}>
                  {enrolling ? <Loader2 className="size-4 animate-spin" /> : 'Add to sequence'}
                </Button>
              </div>
              <p className="text-muted-foreground mt-1 text-xs">Opted-out contacts and people already in the sequence are skipped.</p>
            </div>
          )}
        </section>
      )}

      {kind === 'winback' && (
        <section className={`${card} space-y-4`}>
          <h2 className="text-sm font-bold">Who to win back</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label className="text-xs">No messages either way for (days)</Label>
              <Input
                type="number"
                min={7}
                max={365}
                value={config.inactive_days ?? 60}
                onChange={(e) => setCfg({ inactive_days: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label className="text-xs">Do not message the same person again for (days)</Label>
              <Input
                type="number"
                min={14}
                max={365}
                value={config.cooldown_days ?? 90}
                onChange={(e) => setCfg({ cooldown_days: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label className="text-xs">New people picked per minute</Label>
              <Input
                type="number"
                min={1}
                max={500}
                value={config.per_run_limit ?? 50}
                onChange={(e) => setCfg({ per_run_limit: Number(e.target.value) })}
              />
            </div>
          </div>
          <p className="text-muted-foreground text-xs">
            If the customer writes back before the message goes out, it is cancelled. Use &quot;Preview audience&quot; on the list page
            to see how many people this would reach before you turn it on.
          </p>
        </section>
      )}

      {/* ---------------- messages ---------------- */}
      <section className={`${card} space-y-4`}>
        <h2 className="text-sm font-bold">{kind === 'drip' ? 'Messages in order' : 'Message'}</h2>
        {steps.map((s, i) => {
          const tpl = templateByKey.get(s.template_key)
          const needed = tpl ? paramCount(tpl.body_text) : s.template_params.length
          return (
            <div key={i} className="border-border space-y-3 rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold">{kind === 'drip' ? `Message ${i + 1}` : 'What to send'}</p>
                {kind === 'drip' && (
                  <div className="flex items-center gap-2 text-xs">
                    <span>{i === 0 ? 'Send after joining +' : 'Wait'}</span>
                    <Input
                      className="h-8 w-20"
                      type="number"
                      min={0}
                      value={s.delayValue}
                      onChange={(e) => patchStep(i, { delayValue: Number(e.target.value) })}
                    />
                    <select
                      className="border-border bg-background h-8 rounded-lg border px-2 text-xs"
                      value={s.delayUnit}
                      onChange={(e) => patchStep(i, { delayUnit: e.target.value as StepState['delayUnit'] })}
                    >
                      <option value="minutes">minutes</option>
                      <option value="hours">hours</option>
                      <option value="days">days</option>
                    </select>
                    {steps.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => setSteps((l) => l.filter((_, idx) => idx !== i))}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-2 text-xs">
                {(['template', 'text'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => patchStep(i, { message_type: t })}
                    className={`rounded-lg border px-3 py-1.5 font-semibold ${
                      s.message_type === t ? 'border-primary bg-primary-soft text-primary' : 'border-border text-muted-foreground'
                    }`}
                  >
                    {t === 'template' ? 'Approved template' : 'Plain text'}
                  </button>
                ))}
              </div>

              {s.message_type === 'template' ? (
                <div className="space-y-3">
                  <select
                    className={field}
                    value={s.template_key}
                    onChange={(e) => {
                      const t = templateByKey.get(e.target.value)
                      patchStep(i, {
                        template_key: e.target.value,
                        template_params: Array.from({ length: t ? paramCount(t.body_text) : 0 }, () => ''),
                      })
                    }}
                  >
                    <option value="">Choose a template…</option>
                    {templates.map((t) => (
                      <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`} disabled={t.status !== 'APPROVED'}>
                        {t.name} ({t.language}){t.status !== 'APPROVED' ? ` — ${t.status.toLowerCase()}` : ''}
                      </option>
                    ))}
                  </select>
                  {tpl && <p className="bg-muted/50 rounded-lg p-3 text-xs whitespace-pre-line">{tpl.body_text}</p>}
                  {needed > 0 &&
                    Array.from({ length: needed }, (_, n) => (
                      <div key={n}>
                        <Label className="text-xs">Value for {`{{${n + 1}}}`}</Label>
                        <Input
                          value={s.template_params[n] ?? ''}
                          maxLength={200}
                          placeholder="e.g. {{first_name}}"
                          onChange={(e) => {
                            const next = [...s.template_params]
                            while (next.length < needed) next.push('')
                            next[n] = e.target.value
                            patchStep(i, { template_params: next })
                          }}
                        />
                      </div>
                    ))}
                  <p className="text-muted-foreground text-xs">
                    Only templates Meta has approved can be picked. You can use {VARIABLE_HELP.map((v) => `{{${v}}}`).join(', ')} in the values.
                    Templates reach people any time, even outside the 24-hour window.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Textarea
                    rows={4}
                    maxLength={1024}
                    value={s.text_body}
                    onChange={(e) => patchStep(i, { text_body: e.target.value })}
                    placeholder="Hi {{first_name}}, …"
                  />
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Plain text is only delivered to people who wrote to you in the last 24 hours. For everyone else the message is
                    skipped. Use an approved template to reach people who have been quiet.
                  </p>
                </div>
              )}
            </div>
          )
        })}

        {kind === 'drip' && steps.length < 10 && (
          <Button variant="outline" size="sm" onClick={() => setSteps((l) => [...l, emptyStep()])}>
            <Plus className="size-4" /> Add a message
          </Button>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : isNew ? 'Create journey (as draft)' : 'Save changes'}
        </Button>
        <Link href="/journeys" className={buttonVariants({ variant: 'outline' })}>
          Cancel
        </Link>
        <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
          <Eye className="size-3.5" /> Turn it on from the Journeys list, where you can also preview the audience first.
        </span>
      </div>
    </div>
  )
}
