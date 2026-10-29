'use client'

// Partner program page: apply, then share your link and track clients,
// commissions and payouts. Data: GET/POST/PATCH /api/partner. Not in the
// sidebar until the program is announced (NEXT_PUBLIC_PARTNER_PROGRAM).

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Check, Copy, Handshake, Loader2, MousePointerClick, Users, Wallet, BadgeIndianRupee } from 'lucide-react'

import { PageHero } from '@/components/layout/page-hero'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  COMMISSION_MONTHS,
  formatInr,
  MIN_PAYOUT,
  PARTNER_STATUS_LABELS,
  PROGRAM_POINTS,
  type PartnerStatus,
} from '@/lib/partners/program'

interface Partner {
  id: string
  code: string
  status: PartnerStatus
  name: string
  email: string | null
  phone: string | null
  company: string | null
  website: string | null
  commission_rate: number
  payout_method: string | null
  payout_details: string | null
  clicks: number
  created_at: string
}

interface Referral {
  account_id: string
  business: string
  referred_at: string
  plan: string
  paying: boolean
  earned: number
}

interface Commission {
  id: string
  account_id: string | null
  payment_amount: number | null
  rate: number | null
  amount: number
  description: string | null
  status: 'pending' | 'paid'
  created_at: string
}

interface Payout {
  id: string
  amount: number
  method: string | null
  reference: string | null
  paid_at: string
}

interface PortalData {
  partner: Partner | null
  email?: string | null
  link?: string
  earnings?: { pending: number; paid: number; total: number }
  referrals?: Referral[]
  commissions?: Commission[]
  payouts?: Payout[]
}

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

const PLAN_LABEL: Record<string, string> = {
  trial: 'Free trial',
  expired: 'Not paying',
  deleted: 'Closed',
}

function Stat({ icon: Icon, label, value, sub }: { icon: typeof Users; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="mt-1.5 text-xl font-bold tabular-nums">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  )
}

function ApplyForm({ email, onDone }: { email: string | null; onDone: () => void }) {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    company: '',
    website: '',
    pitch: '',
    payout_method: 'upi',
    payout_details: '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/partner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error ?? 'Could not send your application')
        return
      }
      toast.success('Application sent')
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-4 rounded-2xl border border-border bg-card p-5 lg:col-span-2">
        <h3 className="font-semibold">How it works</h3>
        <ol className="space-y-3 text-sm">
          {['Apply below. We review it within 2 working days.', 'Share your personal link with businesses.', ...PROGRAM_POINTS].map(
            (point, i) => (
              <li key={point} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {i + 1}
                </span>
                <span className="text-muted-foreground">{point}</span>
              </li>
            )
          )}
        </ol>
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-5 lg:col-span-3">
        <h3 className="font-semibold">Apply to become a partner</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="p-name">Your name *</Label>
            <Input id="p-name" value={form.name} onChange={set('name')} required maxLength={100} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-phone">WhatsApp number *</Label>
            <Input id="p-phone" value={form.phone} onChange={set('phone')} required maxLength={30} inputMode="tel" placeholder="+91 98765 43210" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-company">Company / agency</Label>
            <Input id="p-company" value={form.company} onChange={set('company')} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-website">Website or Instagram</Label>
            <Input id="p-website" value={form.website} onChange={set('website')} maxLength={200} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-pitch">How will you find clients? *</Label>
          <Textarea
            id="p-pitch"
            value={form.pitch}
            onChange={set('pitch')}
            required
            maxLength={1000}
            rows={3}
            placeholder="e.g. I run a digital marketing agency for D2C brands and salons in Pune"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="p-method">Get paid by</Label>
            <select
              id="p-method"
              value={form.payout_method}
              onChange={(e) => setForm((f) => ({ ...f, payout_method: e.target.value }))}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="upi">UPI</option>
              <option value="bank">Bank transfer</option>
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="p-details">{form.payout_method === 'upi' ? 'UPI ID' : 'Account name, number, IFSC'}</Label>
            <Input id="p-details" value={form.payout_details} onChange={set('payout_details')} maxLength={300} />
          </div>
        </div>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">We will email {email ?? 'you'} when you are approved.</p>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Send application
          </Button>
        </div>
      </form>
    </div>
  )
}

function PayoutDetails({ partner, onSaved }: { partner: Partner; onSaved: () => void }) {
  const [method, setMethod] = useState(partner.payout_method ?? 'upi')
  const [details, setDetails] = useState(partner.payout_details ?? '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/partner', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payout_method: method, payout_details: details }),
      })
      if (!res.ok) {
        toast.error('Could not save')
        return
      }
      toast.success('Payout details saved')
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold">Where we send your money</h3>
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
        <select
          aria-label="Payout method"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="upi">UPI</option>
          <option value="bank">Bank transfer</option>
        </select>
        <Input
          aria-label="Payout details"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          maxLength={300}
          placeholder={method === 'upi' ? 'yourname@upi' : 'Account name, number, IFSC'}
        />
        <Button variant="outline" onClick={save} disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          Save
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Payouts go out once you have {formatInr(MIN_PAYOUT)} or more to collect.
      </p>
    </section>
  )
}

function Dashboard({ data, reload }: { data: PortalData; reload: () => void }) {
  const partner = data.partner!
  const [copied, setCopied] = useState(false)
  const referrals = data.referrals ?? []
  const commissions = data.commissions ?? []
  const payouts = data.payouts ?? []
  const earnings = data.earnings ?? { pending: 0, paid: 0, total: 0 }
  const paying = referrals.filter((r) => r.paying).length

  async function copy() {
    if (!data.link) return
    try {
      await navigator.clipboard.writeText(data.link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Copy failed — select the link and copy it')
    }
  }

  const shareText = encodeURIComponent(
    `I use Repeat Grow to run WhatsApp for business: inbox, broadcasts, automations and more. Try it free: ${data.link}`
  )

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Your referral link</h3>
          <span className="text-xs text-muted-foreground">
            You earn {partner.commission_rate}% of every payment for {COMMISSION_MONTHS} months
          </span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input readOnly value={data.link ?? ''} onFocus={(e) => e.target.select()} className="font-mono text-sm" />
          <div className="flex gap-2">
            <Button onClick={copy} className="flex-1 sm:flex-none">
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <a
              href={`https://wa.me/?text=${shareText}`}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: 'outline', className: 'flex-1 sm:flex-none' })}
            >
              Share on WhatsApp
            </a>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Add <code className="rounded bg-muted px-1">?to=/pricing</code> to send people to a different page. Businesses who
          sign up within 60 days of opening your link are credited to you.
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={MousePointerClick} label="Link opens" value={partner.clicks.toLocaleString('en-IN')} />
        <Stat icon={Users} label="Sign-ups" value={String(referrals.length)} sub={`${paying} paying`} />
        <Stat icon={BadgeIndianRupee} label="To be paid" value={formatInr(earnings.pending)} />
        <Stat icon={Wallet} label="Paid to you" value={formatInr(earnings.paid)} />
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Your clients</h3>
        {referrals.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
            No sign-ups yet. Share your link to get started.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-4 py-2.5 font-medium">Business</th>
                  <th className="px-4 py-2.5 font-medium">Signed up</th>
                  <th className="px-4 py-2.5 font-medium">Plan</th>
                  <th className="px-4 py-2.5 text-right font-medium">You earned</th>
                </tr>
              </thead>
              <tbody>
                {referrals.map((r) => (
                  <tr key={r.account_id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 font-medium">{r.business}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{day(r.referred_at)}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={
                          r.paying
                            ? 'rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-400'
                            : 'rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground'
                        }
                      >
                        {PLAN_LABEL[r.plan] ?? r.plan.charAt(0).toUpperCase() + r.plan.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatInr(r.earned)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Commissions</h3>
          {commissions.length === 0 ? (
            <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
              Commission appears here when your clients pay.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
              {commissions.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate">{c.description ?? 'Commission'}</p>
                    <p className="text-xs text-muted-foreground">
                      {day(c.created_at)}
                      {c.payment_amount ? ` · ${c.rate}% of ${formatInr(c.payment_amount)}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-medium tabular-nums">{formatInr(c.amount)}</p>
                    <p className={c.status === 'paid' ? 'text-xs text-emerald-600' : 'text-xs text-amber-600'}>
                      {c.status === 'paid' ? 'Paid' : 'To be paid'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Payouts</h3>
          {payouts.length === 0 ? (
            <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">No payouts yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
              {payouts.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p>{day(p.paid_at)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[p.method, p.reference].filter(Boolean).join(' · ') || 'Sent'}
                    </p>
                  </div>
                  <p className="shrink-0 font-medium tabular-nums">{formatInr(p.amount)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <PayoutDetails partner={partner} onSaved={reload} />
    </div>
  )
}

export default function PartnerPage() {
  const [data, setData] = useState<PortalData | null>(null)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/partner', { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      setData(await res.json())
      setError(false)
    } catch {
      setError(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const status = data?.partner?.status

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHero
        icon={Handshake}
        title="Partner program"
        description="Bring businesses to Repeat Grow and earn a share of everything they pay."
        badge={
          status ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {PARTNER_STATUS_LABELS[status]}
            </span>
          ) : undefined
        }
      />

      {error ? (
        <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
          Could not load the partner program.{' '}
          <button className="text-primary underline" onClick={() => void load()}>
            Try again
          </button>
        </p>
      ) : !data ? (
        <div className="flex justify-center p-10">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : !data.partner ? (
        <ApplyForm email={data.email ?? null} onDone={() => void load()} />
      ) : status === 'pending' ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm">
          <p className="font-semibold">Thanks, {data.partner.name.split(' ')[0]}! Your application is under review.</p>
          <p className="mt-1 text-muted-foreground">
            We usually reply within 2 working days. You will get an email at {data.partner.email ?? 'your login email'}{' '}
            with your referral link as soon as you are approved.
          </p>
        </div>
      ) : status === 'rejected' ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm">
          <p className="font-semibold">Your application was not approved.</p>
          <p className="mt-1 text-muted-foreground">Write to support@repeatgrow.com if you have questions.</p>
        </div>
      ) : (
        <>
          {status === 'suspended' ? (
            <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300">
              Your partner account is paused: your link does not credit new sign-ups right now. Commission you already earned
              is still paid. Write to support@repeatgrow.com for details.
            </p>
          ) : null}
          <Dashboard data={data} reload={() => void load()} />
        </>
      )}
    </div>
  )
}
