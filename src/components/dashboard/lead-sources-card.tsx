"use client"

import { useEffect, useState } from 'react'
import { Megaphone } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { aggregateLeadSources, type LeadSourceRow } from '@/lib/ad-attribution'
import { EmptyState } from './empty-state'
import { PanelTitle } from './panel-title'
import { Skeleton } from './skeleton'

const DAYS = 30

/**
 * "Lead sources": how many contacts started a chat from each Click-to-WhatsApp
 * ad or post in the last 30 days. Reads through the signed-in user's RLS
 * client, so it only ever sees their own account.
 */
export function LeadSourcesCard() {
  const [rows, setRows] = useState<LeadSourceRow[] | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    const since = new Date(Date.now() - DAYS * 86_400_000).toISOString()
    void createClient()
      .from('contacts')
      .select('ad_source_type, ad_source_id, ad_source_url, ad_headline, ad_first_seen_at')
      .gte('ad_first_seen_at', since)
      .limit(5000)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          // Most likely migration 062 is not applied yet: hide quietly.
          setUnavailable(true)
        } else {
          setRows(aggregateLeadSources(data ?? []))
          setTotal(data?.length ?? 0)
        }
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (unavailable) return null

  const top = (rows ?? []).slice(0, 6)
  const max = top[0]?.count ?? 1

  return (
    <section className="rounded-3xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-3 px-6 pt-5 pb-1">
        <PanelTitle
          icon={Megaphone}
          title="Lead sources"
          subtitle={`Contacts who started a chat from a Click-to-WhatsApp ad or post, last ${DAYS} days`}
        />
        {!loading && total > 0 && (
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 tabular-nums dark:text-amber-400">
            {total} from ads
          </span>
        )}
      </header>
      <div className="px-6 pt-3 pb-6">
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : top.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="No ad leads yet"
            hint="When a customer taps your Click-to-WhatsApp ad and messages you, the ad shows up here and they get an “Ad lead” tag."
          />
        ) : (
          <ul className="space-y-3">
            {top.map((r) => (
              <li key={`${r.type}:${r.key}`}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium text-foreground">
                    {r.label}
                    <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {r.type}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{r.count}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-amber-500"
                    style={{ width: `${Math.max(6, Math.round((r.count / max) * 100))}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
