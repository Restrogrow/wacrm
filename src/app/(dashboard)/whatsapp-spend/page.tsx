'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  HelpCircle,
  Loader2,
  MessageSquare,
  RefreshCw,
  ShieldAlert,
  Wallet,
  XCircle,
} from 'lucide-react'

import { EmptyState } from '@/components/dashboard/empty-state'
import { Skeleton } from '@/components/dashboard/skeleton'
import { PageHero } from '@/components/layout/page-hero'
import { DataTable, type Column } from '@/components/reports/data-table'
import { RangePicker, type RangeSelection } from '@/components/reports/range-picker'
import { Kpi, ReportPanel, SectionError } from '@/components/reports/report-panel'
import { BarChart } from '@/components/tremor/bar-chart'
import { Button } from '@/components/ui/button'
import { useCan } from '@/hooks/use-can'
import { useAuth } from '@/hooks/use-auth'
import { formatCurrency } from '@/lib/currency'
import { formatCount, formatPct, ratePct } from '@/lib/reports/format'
import { describeRange, presetRange, shortDayLabel, type ReportRange } from '@/lib/reports/range'
import { describeSendFailure } from '@/lib/whatsapp/send-errors'

// ---------------------------------------------------------------------------
// Shape of GET /api/whatsapp/spend
// ---------------------------------------------------------------------------

interface SentCounts {
  chatSent: number
  chatDelivered: number
  chatRead: number
  chatFailed: number
  received: number
  templatesSent: number
  broadcastSent: number
  broadcastDelivered: number
  broadcastRead: number
  broadcastFailed: number
  totalSent: number
  totalFailed: number
}

interface SpendData {
  connected: boolean
  wabaId?: string
  wabaName?: string | null
  currency?: string | null
  wabaError?: string | null
  payment: {
    status: 'ok' | 'problem' | 'unknown'
    fundingLinked?: boolean | null
    recentPaymentFailures: number
    problems: string[]
  }
  health?: {
    canSend: string | null
    errors: { code: number | null; description: string; solution: string | null }[]
  }
  spend?: {
    total: number
    volume: number
    billableVolume: number
    freeVolume: number
    byCategory: { category: string; volume: number; billable: number; cost: number }[]
    daily: { day: string; cost: number; volume: number }[]
    source: 'pricing' | 'conversation'
  } | null
  spendError?: string | null
  sent: SentCounts
  failures: { code: number | null; count: number }[]
  checkedAt?: string
}

const CATEGORY_LABELS: Record<string, string> = {
  MARKETING: 'Marketing',
  MARKETING_LITE: 'Marketing (lite)',
  UTILITY: 'Utility',
  AUTHENTICATION: 'Authentication',
  AUTHENTICATION_INTERNATIONAL: 'Authentication (international)',
  SERVICE: 'Service (replies to customers)',
  REFERRAL_CONVERSION: 'Free (from ads)',
  UNKNOWN: 'Other',
}

const categoryLabel = (c: string) =>
  CATEGORY_LABELS[c] ?? c.charAt(0) + c.slice(1).toLowerCase().replace(/_/g, ' ')

const META_BILLING_URL = 'https://business.facebook.com/billing_hub/payment_settings'
const whatsappManagerUrl = (wabaId?: string) =>
  wabaId ? `https://business.facebook.com/wa/manage/home/?waba_id=${encodeURIComponent(wabaId)}` : 'https://business.facebook.com/wa/manage/home/'

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dayKeys(range: ReportRange): string[] {
  const out: string[] = []
  const d = new Date(range.from)
  while (d < range.to) {
    out.push(localDayKey(d))
    d.setDate(d.getDate() + 1)
  }
  return out
}

export default function WhatsAppSpendPage() {
  const { accountId, profileLoading } = useAuth()
  const isAdmin = useCan('edit-settings')
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata', [])

  const [selection, setSelection] = useState<RangeSelection>({ kind: 'preset', days: 30 })
  const range = useMemo<ReportRange>(
    () => (selection.kind === 'preset' ? presetRange(selection.days) : selection.range),
    [selection],
  )

  const [result, setResult] = useState<{ key: string; data?: SpendData; error?: string } | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const key = `${accountId ?? ''}|${range.from.getTime()}|${range.to.getTime()}`

  const load = useCallback(
    async (fresh: boolean) => {
      const params = new URLSearchParams({
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        tz,
        ...(fresh ? { refresh: '1' } : {}),
      })
      const res = await fetch(`/api/whatsapp/spend?${params}`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `Could not load (${res.status})`)
      return body as SpendData
    },
    [range, tz],
  )

  useEffect(() => {
    if (!accountId || !isAdmin) return
    let cancelled = false
    load(false).then(
      (data) => !cancelled && setResult({ key, data }),
      (err: unknown) => !cancelled && setResult({ key, error: err instanceof Error ? err.message : 'Unknown error' }),
    )
    return () => {
      cancelled = true
    }
  }, [key, accountId, isAdmin, load])

  async function refresh() {
    setRefreshing(true)
    try {
      setResult({ key, data: await load(true) })
    } catch (err) {
      setResult({ key, error: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setRefreshing(false)
    }
  }

  const current = result && result.key === key ? result : null
  const data = current?.data

  if (!profileLoading && !isAdmin) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
        <PageHero icon={Wallet} title="WhatsApp spend" />
        <EmptyState icon={ShieldAlert} title="Only owners and admins can see this" hint="Ask an admin of your workspace for access." />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <PageHero
        icon={Wallet}
        title="WhatsApp spend"
        description={`What Meta charges you for WhatsApp messages, your payment status, and everything you sent, for ${describeRange(range)}.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <RangePicker selection={selection} onChange={setSelection} />
            <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing || !data}>
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
          </div>
        }
      />

      {current?.error ? <SectionError message={current.error} /> : null}

      <BillingStatusPanel data={data} loading={!current} />
      <SpendPanel data={data} loading={!current} range={range} />
      <SentPanel data={data} loading={!current} />
      <FailuresPanel data={data} loading={!current} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// 1. Payment & account status
// ---------------------------------------------------------------------------

function StatusRow({
  tone,
  title,
  children,
}: {
  tone: 'ok' | 'warn' | 'bad'
  title: string
  children?: React.ReactNode
}) {
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'warn' ? HelpCircle : XCircle
  const color =
    tone === 'ok'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      : tone === 'warn'
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200'
        : 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300'
  return (
    <div className={`flex gap-3 rounded-2xl border px-4 py-3 ${color}`}>
      <Icon className="mt-0.5 h-5 w-5 flex-shrink-0" />
      <div className="min-w-0 space-y-1 text-sm">
        <p className="font-semibold">{title}</p>
        {children ? <div className="text-foreground/80">{children}</div> : null}
      </div>
    </div>
  )
}

function BillingStatusPanel({ data, loading }: { data?: SpendData; loading: boolean }) {
  return (
    <ReportPanel
      icon={CreditCard}
      title="Payment & account status"
      subtitle="Meta charges your own card for WhatsApp messages. Cards are added and bills paid in Meta, not here."
      action={
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            render={<a href={META_BILLING_URL} target="_blank" rel="noopener noreferrer" />}
          >
            Meta billing <ExternalLink className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            render={<a href={whatsappManagerUrl(data?.wabaId)} target="_blank" rel="noopener noreferrer" />}
          >
            WhatsApp Manager <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>
      }
    >
      {loading || !data ? (
        <Skeleton className="h-28 w-full" />
      ) : !data.connected ? (
        <StatusRow tone="warn" title="WhatsApp is not connected">
          Connect your number in Settings → WhatsApp to see spend and payment status.
        </StatusRow>
      ) : (
        <div className="space-y-3">
          {data.payment.status === 'problem' ? (
            <StatusRow tone="bad" title="Payment problem: Meta may stop sending your messages">
              <ul className="list-disc space-y-1 pl-4">
                {data.payment.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <p className="mt-2">
                Fix it in{' '}
                <a className="font-medium underline" href={META_BILLING_URL} target="_blank" rel="noopener noreferrer">
                  Meta billing
                </a>{' '}
                (add or update the card for this WhatsApp Business Account).
              </p>
            </StatusRow>
          ) : data.payment.status === 'ok' ? (
            <StatusRow tone="ok" title="Payment method added">
              Meta has a payment method on file and reports no payment problems.
            </StatusRow>
          ) : (
            <StatusRow tone="warn" title="Couldn't confirm your payment method">
              Meta reports no payment problems, but didn&apos;t tell us whether a card is added. Check once in{' '}
              <a className="font-medium underline" href={META_BILLING_URL} target="_blank" rel="noopener noreferrer">
                Meta billing
              </a>
              . Without a card, paid messages (templates) stop sending.
            </StatusRow>
          )}

          {data.health?.canSend && data.health.canSend !== 'AVAILABLE' ? (
            <StatusRow
              tone={data.health.canSend === 'BLOCKED' ? 'bad' : 'warn'}
              title={data.health.canSend === 'BLOCKED' ? 'Meta has blocked sending' : 'Meta has limited sending'}
            >
              {data.health.errors.length > 0 ? (
                <ul className="list-disc space-y-1 pl-4">
                  {data.health.errors.map((e) => (
                    <li key={`${e.code}-${e.description}`}>
                      {e.description}
                      {e.solution ? ` ${e.solution}` : ''}
                    </li>
                  ))}
                </ul>
              ) : null}
            </StatusRow>
          ) : data.health?.canSend === 'AVAILABLE' ? (
            <StatusRow tone="ok" title="Your account can send messages" />
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Kpi label="WhatsApp Business Account" value={data.wabaName || '—'} />
            <Kpi label="Billing currency" value={data.currency || '—'} />
            <Kpi
              label="Payment failures (last 7 days)"
              value={formatCount(data.payment.recentPaymentFailures)}
              hint="messages Meta refused because it couldn't charge you"
            />
          </div>
          {data.wabaError ? (
            <p className="text-xs text-muted-foreground">Couldn&apos;t read the account from Meta: {data.wabaError}</p>
          ) : null}
        </div>
      )}
    </ReportPanel>
  )
}

// ---------------------------------------------------------------------------
// 2. Spend (from Meta)
// ---------------------------------------------------------------------------

function SpendPanel({ data, loading, range }: { data?: SpendData; loading: boolean; range: ReportRange }) {
  const currency = data?.currency || 'INR'
  const money = (v: number) => formatCurrency(v, currency)
  const columns: Column<NonNullable<SpendData['spend']>['byCategory'][number]>[] = [
    { header: 'Category', cell: (r) => categoryLabel(r.category), csv: (r) => r.category },
    { header: 'Messages', align: 'right', cell: (r) => formatCount(r.volume), csv: (r) => r.volume },
    { header: 'Paid', align: 'right', cell: (r) => formatCount(r.billable), csv: (r) => r.billable },
    { header: 'Free', align: 'right', cell: (r) => formatCount(r.volume - r.billable), csv: (r) => r.volume - r.billable },
    { header: 'Cost', align: 'right', cell: (r) => money(r.cost), csv: (r) => r.cost },
  ]

  return (
    <ReportPanel
      icon={Wallet}
      title="Spend on WhatsApp messages"
      subtitle="From Meta's pricing data for your WhatsApp Business Account"
      note="Meta updates these numbers with a delay of a few hours. Amounts are before tax (GST) and your Meta invoice is final."
    >
      {loading || !data ? (
        <Skeleton className="h-72 w-full" />
      ) : !data.connected ? (
        <EmptyState icon={Wallet} title="Connect WhatsApp to see spend" />
      ) : !data.spend ? (
        <SectionError message={data.spendError || 'Meta did not return spend data.'} />
      ) : data.spend.volume === 0 ? (
        <EmptyState icon={Wallet} title="No charges in this range" hint="Meta has not counted any messages for this period yet." />
      ) : (
        <SpendBody spend={data.spend} money={money} range={range} columns={columns} />
      )}
    </ReportPanel>
  )
}

function SpendBody({
  spend,
  money,
  range,
  columns,
}: {
  spend: NonNullable<SpendData['spend']>
  money: (v: number) => string
  range: ReportRange
  columns: Column<NonNullable<SpendData['spend']>['byCategory'][number]>[]
}) {
  const byDay = new Map(spend.daily.map((d) => [d.day, d]))
  const chartData = dayKeys(range).map((day) => ({
    day: shortDayLabel(day),
    Spend: byDay.get(day)?.cost ?? 0,
  }))
  const avg = spend.billableVolume > 0 ? spend.total / spend.billableVolume : 0
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Total spent" value={money(spend.total)} />
        <Kpi label="Messages Meta counted" value={formatCount(spend.volume)} />
        <Kpi label="Paid messages" value={formatCount(spend.billableVolume)} />
        <Kpi label="Free messages" value={formatCount(spend.freeVolume)} hint="customer-service replies, ad entry points" />
        <Kpi label="Average per paid message" value={money(avg)} />
      </div>
      <BarChart
        data={chartData}
        index="day"
        categories={['Spend']}
        colors={['emerald']}
        valueFormatter={(v) => money(v)}
        yAxisWidth={64}
        tickGap={28}
        className="h-64"
      />
      <DataTable
        columns={columns}
        rows={spend.byCategory}
        rowKey={(r) => r.category}
        filename={`whatsapp-spend-${localDayKey(range.from)}.csv`}
        empty={null}
      />
      {spend.source === 'conversation' ? (
        <p className="text-xs text-muted-foreground">
          This account still reports per-conversation pricing, so the counts above are conversations, not single messages.
        </p>
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------------------
// 3. What you sent (our records)
// ---------------------------------------------------------------------------

function SentPanel({ data, loading }: { data?: SpendData; loading: boolean }) {
  return (
    <ReportPanel
      icon={MessageSquare}
      title="Messages you sent"
      subtitle="From Repeat Grow: inbox, automations, chatbot, API and broadcasts"
      note="Delivered and read use each message's latest status. Meta's count above can differ slightly (for example messages sent from the WhatsApp Business app)."
    >
      {loading || !data ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <SentBody sent={data.sent} />
      )}
    </ReportPanel>
  )
}

function SentBody({ sent }: { sent: SentCounts }) {
  const delivered = sent.chatDelivered + sent.broadcastDelivered
  const read = sent.chatRead + sent.broadcastRead
  const rows = [
    {
      key: 'chat',
      label: 'Inbox, automations, chatbot & API',
      sent: sent.chatSent,
      delivered: sent.chatDelivered,
      read: sent.chatRead,
      failed: sent.chatFailed,
    },
    {
      key: 'broadcast',
      label: 'Broadcasts',
      sent: sent.broadcastSent,
      delivered: sent.broadcastDelivered,
      read: sent.broadcastRead,
      failed: sent.broadcastFailed,
    },
  ]
  type Row = (typeof rows)[number]
  const columns: Column<Row>[] = [
    { header: 'Where', cell: (r) => r.label, csv: (r) => r.label },
    { header: 'Sent', align: 'right', cell: (r) => formatCount(r.sent), csv: (r) => r.sent },
    { header: 'Delivered', align: 'right', cell: (r) => formatCount(r.delivered), csv: (r) => r.delivered },
    { header: 'Read', align: 'right', cell: (r) => formatCount(r.read), csv: (r) => r.read },
    { header: 'Failed', align: 'right', cell: (r) => formatCount(r.failed), csv: (r) => r.failed },
  ]
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi label="Total sent" value={formatCount(sent.totalSent)} />
        <Kpi label="Delivered rate" value={formatPct(ratePct(delivered, sent.totalSent))} hint="delivered or read" />
        <Kpi label="Read rate" value={formatPct(ratePct(read, sent.totalSent))} />
        <Kpi label="Failed" value={formatCount(sent.totalFailed)} hint={formatPct(ratePct(sent.totalFailed, sent.totalSent))} />
        <Kpi label="Templates from inbox & automations" value={formatCount(sent.templatesSent)} />
        <Kpi label="Received from customers" value={formatCount(sent.received)} />
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.key} filename="messages-sent.csv" empty={null} />
    </>
  )
}

// ---------------------------------------------------------------------------
// 4. Why messages failed
// ---------------------------------------------------------------------------

function FailuresPanel({ data, loading }: { data?: SpendData; loading: boolean }) {
  type Row = SpendData['failures'][number]
  const columns: Column<Row>[] = [
    { header: 'Error', cell: (r) => (r.code ? String(r.code) : '—'), csv: (r) => r.code ?? '' },
    {
      header: 'What it means',
      cell: (r) => <span className="whitespace-normal">{describeSendFailure(r.code, null).replace(/\s*\(error \d+\)$/, '')}</span>,
      csv: (r) => describeSendFailure(r.code, null),
    },
    { header: 'Messages', align: 'right', cell: (r) => formatCount(r.count), csv: (r) => r.count },
  ]
  return (
    <ReportPanel icon={AlertTriangle} title="Why messages failed" subtitle="Meta's reasons for messages that were not delivered in this range">
      {loading || !data ? (
        <Skeleton className="h-24 w-full" />
      ) : data.failures.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="No failed messages in this range" />
      ) : (
        <DataTable
          columns={columns}
          rows={data.failures}
          rowKey={(r) => String(r.code)}
          filename="failed-messages.csv"
          empty={null}
        />
      )}
    </ReportPanel>
  )
}
