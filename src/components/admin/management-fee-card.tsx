'use client';

// Platform admin: what to invoice this account for messaging this month.
//
// Meta bills the customer directly, so this is a figure we hand to them
// separately — which means they will hold it against their own Meta
// invoice. The card therefore shows the working, not just the total:
// billable messages per category, split by where they came from, the
// rate each was priced at, and the fee on top.

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Percent, ReceiptText } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const CATEGORIES = ['MARKETING', 'UTILITY', 'AUTHENTICATION', 'SERVICE'] as const;

interface FeeLine {
  category: string;
  broadcast: number;
  conversation: number;
  messages: number;
  rate: number | null;
  spend: number | null;
}

interface Report {
  currency: string;
  month: string;
  lines: FeeLine[];
  totalMessages: number;
  metaSpend: number;
  feePercent: number;
  fee: number;
  total: number;
  unpriced: { category: string; messages: number }[];
  rates: Record<string, number>;
  notReady: boolean;
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function ManagementFeeCard({ accountId }: { accountId: string }) {
  const [month, setMonth] = useState(currentMonth);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feeInput, setFeeInput] = useState('');
  const [rateInputs, setRateInputs] = useState<Record<string, string>>({});

  const load = useCallback(
    async (forMonth: string) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/admin/accounts/${accountId}/management-fee?month=${forMonth}`,
          { cache: 'no-store' },
        );
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not load');
        const json = (await res.json()) as Report;
        setReport(json);
        setFeeInput(String(json.feePercent));
        setRateInputs(
          Object.fromEntries(
            CATEGORIES.map((c) => [c, json.rates[c] !== undefined ? String(json.rates[c]) : '']),
          ),
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not load the fee report');
      } finally {
        setLoading(false);
      }
    },
    [accountId],
  );

  useEffect(() => {
    void load(month);
  }, [load, month]);

  async function save(payload: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/accounts/${accountId}/management-fee`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Could not save');
      toast.success('Saved');
      await load(month);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  const fmt = (n: number) =>
    `${report?.currency === 'INR' ? '₹' : ''}${n.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <ReceiptText className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-bold tracking-tight">Campaign management fee</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Billable messages Meta reported, priced at our rate card. Meta bills the customer
              directly — invoice this fee separately.
            </p>
          </div>
        </div>
        <Input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="w-[11rem]"
          aria-label="Billing month"
        />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </div>
      ) : !report ? null : (
        <>
          {report.notReady && (
            <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              Migration <code>097_management_fee.sql</code> hasn&apos;t been run yet, so counts and
              rates are unavailable.
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] tracking-wider text-muted-foreground uppercase">
                  <th className="py-2 pr-3 font-medium">Category</th>
                  <th className="py-2 pr-3 text-right font-medium">Broadcasts</th>
                  <th className="py-2 pr-3 text-right font-medium">Inbox / flows</th>
                  <th className="py-2 pr-3 text-right font-medium">Billable</th>
                  <th className="py-2 pr-3 text-right font-medium">Rate</th>
                  <th className="py-2 text-right font-medium">Meta spend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {report.lines.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-5 text-center text-muted-foreground">
                      No billable messages in {report.month}.
                    </td>
                  </tr>
                )}
                {report.lines.map((l) => (
                  <tr key={l.category}>
                    <td className="py-2 pr-3 font-medium">{l.category}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                      {l.broadcast.toLocaleString('en-IN')}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                      {l.conversation.toLocaleString('en-IN')}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {l.messages.toLocaleString('en-IN')}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                      {l.rate === null ? (
                        <span className="text-amber-600 dark:text-amber-400">not set</span>
                      ) : (
                        l.rate
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {l.spend === null ? '—' : fmt(l.spend)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {report.unpriced.length > 0 && (
            <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              {report.unpriced.map((u) => `${u.messages.toLocaleString('en-IN')} ${u.category}`).join(', ')}{' '}
              message{report.unpriced.reduce((n, u) => n + u.messages, 0) === 1 ? '' : 's'} have no
              rate, so they are <b>not</b> in the totals below — the fee is understated until you
              set their rate.
            </p>
          )}

          <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
            <div>
              <p className="text-[11px] tracking-wider text-muted-foreground uppercase">
                Meta spend ({report.totalMessages.toLocaleString('en-IN')} msgs)
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums">{fmt(report.metaSpend)}</p>
            </div>
            <div>
              <p className="text-[11px] tracking-wider text-muted-foreground uppercase">
                Fee @ {report.feePercent}%
              </p>
              <p className="text-primary mt-1 text-lg font-bold tabular-nums">{fmt(report.fee)}</p>
            </div>
            <div>
              <p className="text-[11px] tracking-wider text-muted-foreground uppercase">
                Customer total
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums">{fmt(report.total)}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-5 border-t border-border pt-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="fee-pct" className="text-xs">
                Fee for this account
              </Label>
              <div className="mt-1.5 flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="fee-pct"
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={feeInput}
                    onChange={(e) => setFeeInput(e.target.value)}
                    className="pr-8"
                  />
                  <Percent className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                </div>
                <Button
                  size="sm"
                  disabled={saving || feeInput === String(report.feePercent)}
                  onClick={() => save({ fee_percent: Number(feeInput) })}
                >
                  {saving && <Loader2 className="size-4 animate-spin" />}
                  Save
                </Button>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                0 means no fee. Applies to this account only.
              </p>
            </div>

            <div>
              <Label className="text-xs">Rate card · {report.currency} per message</Label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                {CATEGORIES.map((c) => (
                  <div key={c}>
                    <Input
                      type="number"
                      min={0}
                      step={0.001}
                      placeholder={c.slice(0, 4).toLowerCase()}
                      value={rateInputs[c] ?? ''}
                      onChange={(e) => setRateInputs((r) => ({ ...r, [c]: e.target.value }))}
                      aria-label={`${c} rate`}
                    />
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{c}</p>
                  </div>
                ))}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                disabled={saving}
                onClick={() =>
                  save({
                    rates: Object.fromEntries(
                      Object.entries(rateInputs)
                        .filter(([, v]) => v.trim() !== '')
                        .map(([k, v]) => [k, Number(v)]),
                    ),
                  })
                }
              >
                {saving && <Loader2 className="size-4 animate-spin" />}
                Save rate card
              </Button>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                <b>Platform-wide</b> for {report.currency}, not just this account. Take the numbers
                from Meta&apos;s published rates for the customer&apos;s country.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
