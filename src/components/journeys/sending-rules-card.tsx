'use client'

// Account-wide sending rules for Journeys: quiet hours, the wait between
// two journey messages to the same person, and the daily account limit.
// API: /api/journeys/settings (admins save).

import { useEffect, useState } from 'react'
import { Loader2, Moon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCan } from '@/hooks/use-can'

interface Rules {
  timezone: string
  quiet_start: string
  quiet_end: string
  contact_cooldown_hours: number
  account_daily_cap: number
}

const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Dhaka',
  'Asia/Karachi',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'Australia/Sydney',
]

export function SendingRulesCard() {
  const canEdit = useCan('edit-settings')
  const [rules, setRules] = useState<Rules | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void fetch('/api/journeys/settings')
      .then((r) => r.json())
      .then((j) => setRules(j.settings as Rules))
      .catch(() => setRules(null))
  }, [])

  if (!rules) return null

  async function save() {
    if (!rules) return
    setSaving(true)
    const res = await fetch('/api/journeys/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rules),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) toast.error(json.error || 'Could not save')
    else toast.success('Sending rules saved')
  }

  const set = <K extends keyof Rules>(k: K, v: Rules[K]) => setRules((r) => (r ? { ...r, [k]: v } : r))
  const field = 'border-border bg-background focus:border-primary h-9 w-full rounded-lg border px-3 text-sm outline-none disabled:opacity-60'

  return (
    <section className="border-border bg-card rounded-2xl border p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-bold">
        <Moon className="text-primary size-4" /> Sending rules (apply to every journey)
      </h2>
      <p className="text-muted-foreground mt-1 text-xs">
        These keep your messages polite and protect your WhatsApp quality rating. Messages wait until the quiet hours
        end instead of being dropped.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <Label className="text-xs">Time zone</Label>
          <select className={field} disabled={!canEdit} value={rules.timezone} onChange={(e) => set('timezone', e.target.value)}>
            {(TIMEZONES.includes(rules.timezone) ? TIMEZONES : [rules.timezone, ...TIMEZONES]).map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">Quiet from</Label>
          <Input type="time" disabled={!canEdit} value={rules.quiet_start} onChange={(e) => set('quiet_start', e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Quiet until</Label>
          <Input type="time" disabled={!canEdit} value={rules.quiet_end} onChange={(e) => set('quiet_end', e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Hours between messages to one person</Label>
          <Input
            type="number"
            min={0}
            max={168}
            disabled={!canEdit}
            value={rules.contact_cooldown_hours}
            onChange={(e) => set('contact_cooldown_hours', Number(e.target.value))}
          />
        </div>
        <div>
          <Label className="text-xs">Messages per day (all journeys)</Label>
          <Input
            type="number"
            min={1}
            max={20000}
            disabled={!canEdit}
            value={rules.account_daily_cap}
            onChange={(e) => set('account_daily_cap', Number(e.target.value))}
          />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button size="sm" onClick={save} disabled={!canEdit || saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : 'Save rules'}
        </Button>
        {!canEdit && <span className="text-muted-foreground text-xs">Only admins can change these.</span>}
      </div>
    </section>
  )
}
