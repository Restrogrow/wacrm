'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  Clock,
  IndianRupee,
  MessageSquare,
  Radio,
  Users,
  UserCheck,
} from 'lucide-react'

import { EmptyState } from '@/components/dashboard/empty-state'
import { Skeleton } from '@/components/dashboard/skeleton'
import { PageHero } from '@/components/layout/page-hero'
import { DataTable, type Column } from '@/components/reports/data-table'
import { RangePicker, type RangeSelection } from '@/components/reports/range-picker'
import { Kpi, ReportPanel, SectionError } from '@/components/reports/report-panel'
import { BarChart } from '@/components/tremor/bar-chart'
import { useAuth } from '@/hooks/use-auth'
import { formatCurrency } from '@/lib/currency'
import { createClient } from '@/lib/supabase/client'
import { formatCount, formatDuration, formatPct, ratePct } from '@/lib/reports/format'
import {
  browserTimeZone,
  loadAgents,
  loadBroadcasts,
  loadConversations,
  loadMessaging,
  loadSales,
  type AgentRow,
  type BroadcastRow,
  type ConversationDay,
  type ConversationSummary,
  type DealsRow,
  type MessagingDay,
  type OrdersRow,
} from '@/lib/reports/queries'
import { describeRange, presetRange, shortDayLabel, type ReportRange } from '@/lib/reports/range'

type Section<T> = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; data: T }

const loading = { state: 'loading' } as const

/**
 * Runs `load` whenever `key` changes. A result only counts if it was produced
 * for the current key, so switching ranges shows a skeleton until the new
 * data arrives and a slow earlier request can never overwrite a newer one.
 */
function useSection<T>(load: (() => Promise<T>) | null, key: string): Section<T> {
  const [result, setResult] = useState<{ key: string; section: Section<T> } | null>(null)

  useEffect(() => {
    if (!load) return
    let cancelled = false
    load().then(
      (data) => {
        if (!cancelled) setResult({ key, section: { state: 'ready', data } })
      },
      (err: unknown) => {
        if (!cancelled) {
          setResult({ key, section: { state: 'error', message: err instanceof Error ? err.message : 'Unknown error' } })
        }
      },
    )
    return () => {
      cancelled = true
    }
    // `load` is rebuilt every render; `key` captures everything it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return result && result.key === key ? result.section : loading
}

const dateStamp = (range: ReportRange) => {
  const iso = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const last = new Date(range.to)
  last.setDate(last.getDate() - 1)
  return `${iso(range.from)}-${iso(last)}`
}

export default function ReportsPage() {
  const { accountId, defaultCurrency } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const tz = useMemo(() => browserTimeZone(), [])

  const [selection, setSelection] = useState<RangeSelection>({ kind: 'preset', days: 30 })
  const range = useMemo<ReportRange>(
    () => (selection.kind === 'preset' ? presetRange(selection.days) : selection.range),
    [selection],
  )
  const stamp = dateStamp(range)
  const ready = !!accountId
  const key = `${accountId ?? ''}|${range.from.getTime()}|${range.to.getTime()}`

  const messaging = useSection<MessagingDay[]>(
    ready ? () => loadMessaging(supabase, accountId, range, tz) : null,
    key,
  )
  const conversations = useSection<{ daily: ConversationDay[]; summary: ConversationSummary }>(
    ready ? () => loadConversations(supabase, accountId, range, tz) : null,
    key,
  )
  const agents = useSection<AgentRow[]>(ready ? () => loadAgents(supabase, accountId, range) : null, key)
  const broadcasts = useSection<BroadcastRow[]>(
    ready ? () => loadBroadcasts(supabase, accountId, range) : null,
    key,
  )
  const sales = useSection<{ deals: DealsRow[]; orders: OrdersRow[] }>(
    ready ? () => loadSales(supabase, accountId, range) : null,
    key,
  )

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <PageHero
        icon={BarChart3}
        title="Reports"
        description={`Messaging, conversations, team, broadcasts and sales for ${describeRange(range)}. Days follow your local time zone (${tz}).`}
        action={<RangePicker selection={selection} onChange={setSelection} />}
      />

      <MessagingSection section={messaging} stamp={stamp} />
      <ConversationsSection section={conversations} stamp={stamp} />
      <AgentsSection section={agents} stamp={stamp} />
      <BroadcastsSection section={broadcasts} stamp={stamp} />
      <SalesSection section={sales} stamp={stamp} defaultCurrency={defaultCurrency} />
    </div>
  )
}

function SectionBody<T>({
  section,
  children,
  height = 'h-40',
}: {
  section: Section<T>
  children: (data: T) => React.ReactNode
  height?: string
}) {
  if (section.state === 'loading') return <Skeleton className={`${height} w-full`} />
  if (section.state === 'error') return <SectionError message={section.message} />
  return <>{children(section.data)}</>
}

// ---------------------------------------------------------------------------
// 1. Messaging
// ---------------------------------------------------------------------------

function MessagingSection({ section, stamp }: { section: Section<MessagingDay[]>; stamp: string }) {
  const columns: Column<MessagingDay>[] = [
    { header: 'Day', cell: (r) => r.day, csv: (r) => r.day },
    { header: 'Inbound', align: 'right', cell: (r) => formatCount(r.inbound), csv: (r) => r.inbound },
    { header: 'Outbound', align: 'right', cell: (r) => formatCount(r.outbound), csv: (r) => r.outbound },
    { header: 'Delivered or read', align: 'right', cell: (r) => formatCount(r.delivered + r.read), csv: (r) => r.delivered + r.read },
    { header: 'Read', align: 'right', cell: (r) => formatCount(r.read), csv: (r) => r.read },
    { header: 'Failed', align: 'right', cell: (r) => formatCount(r.failed), csv: (r) => r.failed },
  ]

  return (
    <ReportPanel
      icon={MessageSquare}
      title="Messaging"
      subtitle="Customer messages in, agent and bot messages out"
      note="Delivery rates use each outbound message's latest status, because the app stores the current status only, not when it changed."
    >
      <SectionBody section={section} height="h-72">
        {(days) => {
          const inbound = days.reduce((n, d) => n + d.inbound, 0)
          const outbound = days.reduce((n, d) => n + d.outbound, 0)
          const delivered = days.reduce((n, d) => n + d.delivered + d.read, 0)
          const read = days.reduce((n, d) => n + d.read, 0)
          const failed = days.reduce((n, d) => n + d.failed, 0)
          if (inbound + outbound === 0) {
            return (
              <EmptyState
                icon={MessageSquare}
                title="No messages in this range"
                hint="Try a longer range, or send and receive some messages."
              />
            )
          }
          const chartData = days.map((d) => ({
            day: shortDayLabel(d.day),
            Inbound: d.inbound,
            Outbound: d.outbound,
          }))
          return (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <Kpi label="Inbound" value={formatCount(inbound)} />
                <Kpi label="Outbound" value={formatCount(outbound)} />
                <Kpi label="Delivered rate" value={formatPct(ratePct(delivered, outbound))} hint="delivered or read" />
                <Kpi label="Read rate" value={formatPct(ratePct(read, outbound))} />
                <Kpi label="Failed rate" value={formatPct(ratePct(failed, outbound))} />
              </div>
              <BarChart
                data={chartData}
                index="day"
                categories={['Inbound', 'Outbound']}
                colors={['blue', 'emerald']}
                valueFormatter={(v) => formatCount(v)}
                yAxisWidth={48}
                allowDecimals={false}
                tickGap={28}
                className="h-72"
              />
              <DataTable
                columns={columns}
                rows={days}
                rowKey={(r) => r.day}
                filename={`messaging-${stamp}.csv`}
                empty={null}
              />
            </>
          )
        }}
      </SectionBody>
    </ReportPanel>
  )
}

// ---------------------------------------------------------------------------
// 2. Conversations
// ---------------------------------------------------------------------------

function ConversationsSection({
  section,
  stamp,
}: {
  section: Section<{ daily: ConversationDay[]; summary: ConversationSummary }>
  stamp: string
}) {
  const columns: Column<ConversationDay>[] = [
    { header: 'Day', cell: (r) => r.day, csv: (r) => r.day },
    { header: 'New conversations', align: 'right', cell: (r) => formatCount(r.created), csv: (r) => r.created },
    { header: 'Closed (approx.)', align: 'right', cell: (r) => formatCount(r.closed), csv: (r) => r.closed },
  ]

  return (
    <ReportPanel
      icon={Clock}
      title="Conversations"
      subtitle="New vs closed, and how fast your team replies"
      note="First response is exact: the time from a customer's first message to the first reply by a team member (bot replies are not counted). Closed dates and resolution time are approximate: the app records when a conversation was last updated, not the moment it was closed."
    >
      <SectionBody section={section} height="h-72">
        {({ daily, summary }) => {
          if (summary.created === 0 && summary.closed === 0 && daily.every((d) => d.created + d.closed === 0)) {
            return (
              <EmptyState
                icon={Clock}
                title="No conversations in this range"
                hint={`${summary.openNow} open and ${summary.pendingNow} pending right now.`}
              />
            )
          }
          const chartData = daily.map((d) => ({
            day: shortDayLabel(d.day),
            New: d.created,
            'Closed (approx.)': d.closed,
          }))
          return (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                <Kpi label="New" value={formatCount(summary.created)} />
                <Kpi label="Closed" value={formatCount(summary.closed)} hint="of those started in range" />
                <Kpi
                  label="Avg first response"
                  value={formatDuration(summary.firstResponseAvgS)}
                  hint={`${formatCount(summary.firstResponseSamples)} replied`}
                />
                <Kpi label="Median first response" value={formatDuration(summary.firstResponseMedianS)} />
                <Kpi
                  label="Avg resolution (approx.)"
                  value={formatDuration(summary.resolutionAvgS)}
                  hint={`${formatCount(summary.resolutionSamples)} closed`}
                />
                <Kpi label="Open now" value={formatCount(summary.openNow)} hint={`${formatCount(summary.pendingNow)} pending`} />
              </div>
              <BarChart
                data={chartData}
                index="day"
                categories={['New', 'Closed (approx.)']}
                colors={['blue', 'emerald']}
                valueFormatter={(v) => formatCount(v)}
                yAxisWidth={48}
                allowDecimals={false}
                tickGap={28}
                className="h-64"
              />
              <DataTable
                columns={columns}
                rows={daily}
                rowKey={(r) => r.day}
                filename={`conversations-${stamp}.csv`}
                empty={null}
              />
            </>
          )
        }}
      </SectionBody>
    </ReportPanel>
  )
}

// ---------------------------------------------------------------------------
// 3. Agents
// ---------------------------------------------------------------------------

function AgentsSection({ section, stamp }: { section: Section<AgentRow[]>; stamp: string }) {
  const columns: Column<AgentRow>[] = [
    { header: 'Team member', cell: (r) => <span className="font-medium text-foreground">{r.name}</span>, csv: (r) => r.name },
    { header: 'Conversations', align: 'right', cell: (r) => formatCount(r.conversations), csv: (r) => r.conversations },
    { header: 'Closed', align: 'right', cell: (r) => formatCount(r.closed), csv: (r) => r.closed },
    { header: 'Messages sent', align: 'right', cell: (r) => formatCount(r.messagesSent), csv: (r) => r.messagesSent },
    {
      header: 'Avg first response',
      align: 'right',
      cell: (r) => formatDuration(r.firstResponseAvgS),
      csv: (r) => (r.firstResponseAvgS === null ? '' : Math.round(r.firstResponseAvgS)),
    },
    { header: 'Replied conversations', align: 'right', cell: (r) => formatCount(r.firstResponseSamples), csv: (r) => r.firstResponseSamples },
  ]

  return (
    <ReportPanel
      icon={UserCheck}
      title="Agent performance"
      subtitle="Credited to whoever a conversation is assigned to"
      note="The app does not record which person sent each message, so activity is attributed to the conversation's current assignee. Assign conversations in the inbox to get accurate per-person numbers; unassigned work shows under Unassigned."
    >
      <SectionBody section={section}>
        {(rows) => (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.agentId ?? 'unassigned'}
            filename={`agents-${stamp}.csv`}
            empty={<EmptyState icon={Users} title="No team activity in this range" hint="Assign conversations to team members to see their numbers here." />}
          />
        )}
      </SectionBody>
    </ReportPanel>
  )
}

// ---------------------------------------------------------------------------
// 4. Broadcasts
// ---------------------------------------------------------------------------

function BroadcastsSection({ section, stamp }: { section: Section<BroadcastRow[]>; stamp: string }) {
  const columns: Column<BroadcastRow>[] = [
    { header: 'Broadcast', cell: (r) => <span className="font-medium text-foreground">{r.name}</span>, csv: (r) => r.name },
    { header: 'Status', cell: (r) => <span className="capitalize">{r.status}</span>, csv: (r) => r.status },
    { header: 'Created', cell: (r) => new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }), csv: (r) => r.createdAt.slice(0, 10) },
    { header: 'Recipients', align: 'right', cell: (r) => formatCount(r.recipients), csv: (r) => r.recipients },
    { header: 'Sent', align: 'right', cell: (r) => formatCount(r.sent), csv: (r) => r.sent },
    { header: 'Delivered', align: 'right', cell: (r) => `${formatCount(r.delivered)} (${formatPct(ratePct(r.delivered, r.sent))})`, csv: (r) => r.delivered },
    { header: 'Read', align: 'right', cell: (r) => `${formatCount(r.read)} (${formatPct(ratePct(r.read, r.sent))})`, csv: (r) => r.read },
    { header: 'Replied', align: 'right', cell: (r) => `${formatCount(r.replied)} (${formatPct(ratePct(r.replied, r.sent))})`, csv: (r) => r.replied },
    { header: 'Failed', align: 'right', cell: (r) => formatCount(r.failed), csv: (r) => r.failed },
  ]

  return (
    <ReportPanel
      icon={Radio}
      title="Broadcasts"
      subtitle="Broadcasts created in this range (drafts are left out)"
      note="Percentages are shares of messages sent. Delivered counts include messages that were later read or replied to."
    >
      <SectionBody section={section}>
        {(rows) => (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            filename={`broadcasts-${stamp}.csv`}
            empty={<EmptyState icon={Radio} title="No broadcasts in this range" hint="Broadcasts you send appear here with their delivery and reply results." />}
          />
        )}
      </SectionBody>
    </ReportPanel>
  )
}

// ---------------------------------------------------------------------------
// 5. Sales
// ---------------------------------------------------------------------------

function SalesSection({
  section,
  stamp,
  defaultCurrency,
}: {
  section: Section<{ deals: DealsRow[]; orders: OrdersRow[] }>
  stamp: string
  defaultCurrency: string
}) {
  const pair = (count: number, value: number, currency: string) => `${formatCount(count)} · ${formatCurrency(value, currency)}`
  const dealColumns: Column<DealsRow>[] = [
    { header: 'Currency', cell: (r) => r.currency, csv: (r) => r.currency },
    { header: 'Created', align: 'right', cell: (r) => pair(r.createdCount, r.createdValue, r.currency), csv: (r) => r.createdCount },
    { header: 'Won (approx.)', align: 'right', cell: (r) => pair(r.wonCount, r.wonValue, r.currency), csv: (r) => r.wonCount },
    { header: 'Lost (approx.)', align: 'right', cell: (r) => pair(r.lostCount, r.lostValue, r.currency), csv: (r) => r.lostCount },
    { header: 'Open pipeline', align: 'right', cell: (r) => pair(r.openCount, r.openValue, r.currency), csv: (r) => r.openCount },
  ]
  // The CSV carries plain numbers: one count column and one value column per measure.
  const dealExport: Column<DealsRow>[] = [
    { header: 'Currency', cell: () => null, csv: (r) => r.currency },
    { header: 'Created count', cell: () => null, csv: (r) => r.createdCount },
    { header: 'Created value', cell: () => null, csv: (r) => r.createdValue },
    { header: 'Won count', cell: () => null, csv: (r) => r.wonCount },
    { header: 'Won value', cell: () => null, csv: (r) => r.wonValue },
    { header: 'Lost count', cell: () => null, csv: (r) => r.lostCount },
    { header: 'Lost value', cell: () => null, csv: (r) => r.lostValue },
    { header: 'Open count', cell: () => null, csv: (r) => r.openCount },
    { header: 'Open value', cell: () => null, csv: (r) => r.openValue },
  ]

  const orderColumns: Column<OrdersRow>[] = [
    { header: 'Source', cell: (r) => (r.source === 'shopify' ? 'Shopify' : 'WhatsApp orders'), csv: (r) => r.source },
    { header: 'Currency', cell: (r) => r.currency, csv: (r) => r.currency },
    { header: 'Orders placed', align: 'right', cell: (r) => formatCount(r.orders), csv: (r) => r.orders },
    { header: 'Paid', align: 'right', cell: (r) => (r.paid === null ? '—' : formatCount(r.paid)), csv: (r) => r.paid },
    {
      header: 'Revenue',
      align: 'right',
      cell: (r) => formatCurrency(r.revenue, r.currency),
      csv: (r) => r.revenue,
    },
  ]

  return (
    <ReportPanel
      icon={IndianRupee}
      title="Sales"
      subtitle="Deals and orders, shown separately for each currency"
      note="Won and lost deals are dated by when the deal was last updated, because the app does not store a close date. Open pipeline is a live snapshot. WhatsApp order revenue counts orders marked paid; Shopify revenue is the gross order total because payment state is not stored."
    >
      <SectionBody section={section} height="h-56">
        {({ deals, orders }) => {
          const empty = deals.length === 0 && orders.length === 0
          if (empty) {
            return (
              <EmptyState
                icon={IndianRupee}
                title="No sales activity in this range"
                hint={`Deals you create and orders you receive show up here in ${defaultCurrency} and any other currency you use.`}
              />
            )
          }
          return (
            <>
              <div>
                <h3 className="mb-2 text-sm font-semibold text-foreground">Deals</h3>
                <DataTable
                  columns={dealColumns}
                  exportColumns={dealExport}
                  rows={deals}
                  rowKey={(r) => r.currency}
                  filename={`deals-${stamp}.csv`}
                  empty={<EmptyState icon={IndianRupee} title="No deals in this range" hint="Create deals in Pipelines to track them here." />}
                />
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold text-foreground">Orders</h3>
                <DataTable
                  columns={orderColumns}
                  rows={orders}
                  rowKey={(r) => `${r.source}-${r.currency}`}
                  filename={`orders-${stamp}.csv`}
                  empty={<EmptyState icon={IndianRupee} title="No orders in this range" hint="WhatsApp and Shopify orders appear here." />}
                />
              </div>
            </>
          )
        }}
      </SectionBody>
    </ReportPanel>
  )
}
