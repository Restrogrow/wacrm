import type { Metadata } from 'next';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';

import { FEATURE_LABELS, loadAiUsage, type UsageBucket } from '@/lib/admin/ai-usage';
import { USD_TO_INR, estimateChatbotCost } from '@/lib/ai/pricing';

export const metadata: Metadata = {
  title: 'AI usage',
};

// Live view of the Gemini bill.
export const dynamic = 'force-dynamic';

const nf = new Intl.NumberFormat('en-IN');
const tokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 10_000 ? `${(n / 1000).toFixed(1)}k` : nf.format(n));
const usd = (n: number) => (n === 0 ? '$0' : n < 0.01 ? `$${n.toFixed(5)}` : `$${n.toFixed(2)}`);
const inr = (n: number) => `₹${nf.format(Math.round(n * USD_TO_INR * 100) / 100)}`;
const clampInt = (v: string | string[] | undefined, fallback: number, max: number) => {
  const n = Math.round(Number(Array.isArray(v) ? v[0] : v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback;
};

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border-border rounded-2xl border p-4">
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p className="mt-1.5 text-xl font-bold tabular-nums">{value}</p>
      {sub ? <p className="text-muted-foreground mt-1 text-xs">{sub}</p> : null}
    </div>
  );
}

function UsageTable({ title, rows, firstColumn }: { title: string; rows: UsageBucket[]; firstColumn: string }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="border-border text-muted-foreground rounded-2xl border p-5 text-sm">No AI calls recorded yet.</p>
      ) : (
        <div className="border-border overflow-x-auto rounded-2xl border">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-left text-xs">
              <tr className="border-border border-b">
                <th className="px-4 py-2.5 font-medium">{firstColumn}</th>
                <th className="px-4 py-2.5 text-right font-medium">Calls</th>
                <th className="px-4 py-2.5 text-right font-medium">Input tokens</th>
                <th className="px-4 py-2.5 text-right font-medium">Output</th>
                <th className="px-4 py-2.5 text-right font-medium">Thinking</th>
                <th className="px-4 py-2.5 text-right font-medium">Avg time</th>
                <th className="px-4 py-2.5 text-right font-medium">Cost</th>
                <th className="px-4 py-2.5 text-right font-medium">Per call</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {rows.map((r) => (
                <tr key={r.key} className="border-border border-b last:border-0">
                  <td className="px-4 py-2.5 font-medium">{r.label}</td>
                  <td className="px-4 py-2.5 text-right">{nf.format(r.calls)}</td>
                  <td className="px-4 py-2.5 text-right">{tokens(r.inputTokens)}</td>
                  <td className="px-4 py-2.5 text-right">{tokens(r.outputTokens)}</td>
                  <td className="px-4 py-2.5 text-right">{tokens(r.thinkingTokens)}</td>
                  <td className="text-muted-foreground px-4 py-2.5 text-right">
                    {r.avgLatencyMs !== null ? `${(r.avgLatencyMs / 1000).toFixed(1)} s` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {usd(r.usd)} <span className="text-muted-foreground text-xs">{inr(r.usd)}</span>
                  </td>
                  <td className="text-muted-foreground px-4 py-2.5 text-right">{usd(r.calls ? r.usd / r.calls : 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function AiUsagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const days = clampInt(sp.days, 30, 365);
  const customers = clampInt(sp.customers, 1000, 10_000_000);
  const msgs = clampInt(sp.msgs, 10, 10_000);
  const r = await loadAiUsage(days);

  const est = estimateChatbotCost(customers, msgs, r.chatbotUsdPerReply);
  const avg = r.chatbotAvg;
  const thinkingShare = r.totals.outputTokens + r.totals.thinkingTokens > 0
    ? r.totals.thinkingTokens / (r.totals.outputTokens + r.totals.thinkingTokens)
    : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/admin" className="text-muted-foreground hover:text-foreground text-sm">
            &larr; Admin dashboard
          </Link>
          <h1 className="mt-2 text-xl font-bold tracking-tight">AI usage and cost</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Every Gemini call on our key, last {days} days. Costs use Google&apos;s paid-tier prices (
            <code className="text-xs">src/lib/ai/pricing.ts</code>), ₹ at {USD_TO_INR}/$.
          </p>
        </div>
        <div className="flex gap-2 self-start">
          {[7, 30, 90].map((d) => (
            <Link
              key={d}
              href={`/admin/ai-usage?days=${d}`}
              prefetch={false}
              className={`border-border inline-flex items-center rounded-lg border px-3 py-1.5 text-sm ${d === days ? 'bg-muted font-semibold' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {d} days
            </Link>
          ))}
          <Link
            href={`/admin/ai-usage?days=${days}`}
            prefetch={false}
            className="border-border text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm"
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </Link>
        </div>
      </header>

      {r.tableMissing ? (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5 text-sm">
          Token tracking is off: run <code>supabase/migrations/087_ai_usage_events.sql</code> in the Supabase SQL editor.
          Until then only the daily use counts below are available.
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label={`AI cost, last ${days} days`} value={usd(r.totals.usd + r.voiceCalls.usd)} sub={`${inr(r.totals.usd + r.voiceCalls.usd)} · chat AI ${usd(r.totals.usd)} + voice calls ${usd(r.voiceCalls.usd)}`} />
        <Card label="AI calls" value={nf.format(r.totals.calls)} sub={`${tokens(r.totals.inputTokens + r.totals.outputTokens + r.totals.thinkingTokens)} tokens in total`} />
        <Card
          label="Model in use"
          value={r.currentModel}
          sub={`$${r.price.input} in / $${r.price.output} out per 1M tokens${r.currentModelKnownPrice ? '' : ' (price unknown, using 3.8 Flash)'}`}
        />
        <Card
          label="Chatbot, per reply"
          value={usd(r.chatbotUsdPerReply)}
          sub={r.chatbotMeasured && avg ? `measured: ${nf.format(avg.input)} in, ${nf.format(avg.output)} out, ${nf.format(avg.thinking)} thinking` : 'estimate (no replies recorded yet)'}
        />
      </section>

      <section className="border-border space-y-4 rounded-2xl border p-5">
        <div>
          <h2 className="text-sm font-semibold">Cost calculator (chatbot)</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Each customer message the bot answers is one Gemini call at {usd(r.chatbotUsdPerReply)}
            {r.chatbotMeasured ? ' (your real average)' : ' (typical estimate until real replies are recorded)'}.
          </p>
        </div>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="days" value={days} />
          <label className="text-xs font-medium">
            Customers
            <input name="customers" type="number" min={1} defaultValue={customers} className="border-border bg-background mt-1 block w-32 rounded-lg border px-3 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium">
            Messages each
            <input name="msgs" type="number" min={1} defaultValue={msgs} className="border-border bg-background mt-1 block w-32 rounded-lg border px-3 py-1.5 text-sm" />
          </label>
          <button type="submit" className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-semibold">
            Calculate
          </button>
        </form>
        <p className="text-sm">
          {nf.format(customers)} customers × {nf.format(msgs)} messages = <b>{nf.format(est.replies)} bot replies</b> ≈{' '}
          <b className="text-lg">{usd(est.usd)}</b> <span className="text-muted-foreground">({inr(est.usd)})</span>
        </p>
        <p className="text-muted-foreground text-xs">
          Voice notes and photos cost more per reply (the audio or image is extra input). Google&apos;s Gemini 3.8 Flash price
          doubles on 1 Jan 2027: the same traffic would be about {usd(est.usd * 2)} ({inr(est.usd * 2)}).
        </p>
      </section>

      <UsageTable title="By feature" rows={r.byFeature} firstColumn="Feature" />
      <UsageTable title="By model" rows={r.byModel} firstColumn="Model" />
      <UsageTable title="Top accounts (chatbot)" rows={r.byAccount} firstColumn="Account" />

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="border-border rounded-2xl border p-5">
          <h2 className="text-sm font-semibold">AI voice calls (Gemini Live)</h2>
          <p className="mt-2 text-sm tabular-nums">
            {nf.format(r.voiceCalls.calls)} calls · {r.voiceCalls.minutes.toFixed(1)} min ≈ <b>{usd(r.voiceCalls.usd)}</b>{' '}
            <span className="text-muted-foreground">({inr(r.voiceCalls.usd)})</span>
          </p>
          <p className="text-muted-foreground mt-1 text-xs">About $0.023 (₹2) per call minute: $0.005 listening + $0.018 speaking.</p>
        </div>
        <div className="border-border rounded-2xl border p-5">
          <h2 className="text-sm font-semibold">Uses per feature (daily counters)</h2>
          {r.dailyCounts.length === 0 ? (
            <p className="text-muted-foreground mt-2 text-sm">None.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm tabular-nums">
              {r.dailyCounts.map((d) => (
                <li key={d.feature} className="flex justify-between">
                  <span>{FEATURE_LABELS[d.feature] ?? d.feature}</span>
                  <span>{nf.format(d.used)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="border-border space-y-3 rounded-2xl border p-5 text-sm">
        <h2 className="font-semibold">How to keep the bill down</h2>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <b>Shorter knowledge bases.</b> The whole knowledge base goes with every reply, so it is most of the input cost
            {avg ? ` (${nf.format(avg.input)} input tokens per reply now)` : ''}. Keep it to the facts customers ask about.
          </li>
          <li>
            <b>Thinking is billed as output.</b> {thinkingShare ? `${Math.round(thinkingShare * 100)}% of output tokens are thinking. ` : ''}
            The chatbot already asks for low thinking.
          </li>
          <li>
            <b>Let flows and keyword replies answer the common questions</b> (menu, price list, timings). They cost nothing; the bot only
            answers what they don&apos;t.
          </li>
          <li>
            <b>Cheaper model:</b> set <code>GEMINI_MODEL=gemini-3.1-flash-lite</code> in Hostinger ($0.25 in / $1.50 out, about a third
            of 3.8 Flash). Test the answers first; Lite is weaker on Hinglish and tricky questions.
          </li>
          <li>
            <b>Daily caps per plan</b> already limit chatbot replies per account (src/lib/ai/quota.ts), so one busy account
            can&apos;t run up the bill.
          </li>
        </ul>
      </section>

      {r.truncated ? <p className="text-muted-foreground text-xs">Showing the newest 50,000 calls only.</p> : null}
    </div>
  );
}
