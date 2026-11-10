'use client';

// What the customer sees: how many AI credits are left, what each AI
// action costs, and how many of each that balance still buys.
//
// The point of the table is that nobody has to ask "what does this
// cost?" — the rate card is the same one the server charges from
// (lib/credits/credits.ts, overridable per feature in `credit_rates`).
//
// Reads through RLS: `account_credits` and `credit_rates` are readable
// by members, written only by the service role.

import { useEffect, useState } from 'react';
import { Coins } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';
import {
  DEFAULT_CREDIT_COSTS,
  actionsAffordable,
  creditCost,
} from '@/lib/credits/credits';
import type { AiFeature } from '@/lib/ai/quota';

/** Shown in the order a merchant is likely to care about them. */
const FEATURES: { key: AiFeature; label: string; hint: string }[] = [
  { key: 'chatbot', label: 'Chatbot reply', hint: 'An AI answer to a customer' },
  { key: 'suggest', label: 'Reply suggestion', hint: 'Suggested replies in the inbox' },
  { key: 'summary', label: 'Chat summary', hint: 'The sparkles button on a chat' },
  { key: 'analysis', label: 'Lead score', hint: 'Intent, mood and score for a chat' },
  { key: 'voice_call', label: 'AI voice call', hint: 'Up to 10 minutes on a call' },
];

const n = (value: number) => value.toLocaleString('en-IN');

export function CreditsPanel() {
  const [balance, setBalance] = useState<number | null>(null);
  const [enforced, setEnforced] = useState(false);
  const [rates, setRates] = useState<Record<string, number>>({});
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      const [credits, rateRows, account] = await Promise.all([
        supabase.from('account_credits').select('balance').maybeSingle(),
        supabase.from('credit_rates').select('feature, credits'),
        supabase.from('accounts').select('credits_enforced').maybeSingle(),
      ]);
      if (cancelled) return;
      // Tables absent (migration 100 not applied) or signed out: say
      // nothing rather than show a scary zero.
      if (credits.error) {
        setMissing(true);
        return;
      }
      setBalance(Number(credits.data?.balance ?? 0));
      setEnforced(account.data?.credits_enforced === true);
      const next: Record<string, number> = {};
      for (const row of (rateRows.data ?? []) as {
        feature: string;
        credits: number;
      }[]) {
        next[row.feature] = Number(row.credits);
      }
      setRates(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (missing) return null;

  const out = enforced && balance !== null && balance <= 0;

  return (
    <div>
      <h3 className="text-foreground mb-3 flex items-center gap-2 text-base font-bold tracking-tight">
        <Coins className="size-5 text-primary" />
        AI credits
      </h3>
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-3xl font-bold tabular-nums">
              {balance === null ? '—' : n(balance)}
            </span>
            <span className="text-muted-foreground text-sm">credits left</span>
          </div>

          <p className="text-muted-foreground text-sm">
            {out
              ? 'Your credits have run out, so AI features are paused. Your inbox, broadcasts and everything else keep working — message us to top up.'
              : enforced
                ? 'AI features use credits. When they run out the AI pauses and chats wait for your team, so no customer is lost.'
                : 'AI usage is being measured against your plan. Nothing is paused yet.'}
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-border border-b text-left text-xs">
                  <th className="pb-2 font-medium">What</th>
                  <th className="pb-2 text-right font-medium">Credits</th>
                  <th className="pb-2 text-right font-medium">
                    {balance === null ? 'Left' : 'You can run'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {FEATURES.map((f) => {
                  const cost = creditCost(f.key, rates);
                  const affordable =
                    balance === null ? null : actionsAffordable(balance, cost);
                  return (
                    <tr key={f.key} className="border-border/60 border-b last:border-0">
                      <td className="py-2">
                        <span className="text-foreground font-medium">{f.label}</span>
                        <span className="text-muted-foreground block text-xs">
                          {f.hint}
                        </span>
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {cost === 0 ? 'Free' : n(cost)}
                        {cost !== DEFAULT_CREDIT_COSTS[f.key] && (
                          <span className="text-muted-foreground block text-xs">
                            your rate
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {affordable === null
                          ? '—'
                          : affordable === Infinity
                            ? 'Unlimited'
                            : n(affordable)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-muted-foreground text-xs">
            WhatsApp message fees are separate and billed by Meta directly to
            your WhatsApp Business Account — credits only cover AI.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
