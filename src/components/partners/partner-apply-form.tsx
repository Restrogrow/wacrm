'use client';

// The application form on the public /partners page. No login — see
// the note in /api/partners/apply for why applicants don't have one.

import { useState } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function PartnerApplyForm() {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSending(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/partners/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.get('name'),
          email: form.get('email'),
          phone: form.get('phone'),
          company: form.get('company'),
          website_url: form.get('website_url'),
          pitch: form.get('pitch'),
          // Honeypot: left empty by people, filled by bots.
          website: form.get('website'),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? 'Could not send your application. Please try again.');
        return;
      }
      setSent(true);
    } catch {
      setError('Could not reach us. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-6 text-center">
        <CheckCircle2 className="mx-auto size-8 text-emerald-500" />
        <h3 className="mt-3 text-lg font-semibold text-foreground">
          Application received
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          We review applications within 2 working days. If you&apos;re
          approved we&apos;ll email you your referral link and a password for
          your partner dashboard.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-2xl border border-border bg-card p-6"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="p-name">Your name *</Label>
          <Input id="p-name" name="name" required maxLength={100} autoComplete="name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-email">Email *</Label>
          <Input
            id="p-email"
            name="email"
            type="email"
            required
            maxLength={200}
            autoComplete="email"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-phone">Phone / WhatsApp *</Label>
          <Input
            id="p-phone"
            name="phone"
            required
            maxLength={30}
            autoComplete="tel"
            placeholder="+91 98765 43210"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-company">Agency / company</Label>
          <Input id="p-company" name="company" maxLength={120} autoComplete="organization" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="p-website">Website or social profile</Label>
        <Input
          id="p-website"
          name="website_url"
          maxLength={200}
          placeholder="https://"
          inputMode="url"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="p-pitch">How will you find clients? *</Label>
        <Textarea
          id="p-pitch"
          name="pitch"
          required
          maxLength={1000}
          rows={4}
          placeholder="e.g. I run a digital marketing agency with 30 D2C clients in Jaipur, mostly on Shopify."
        />
        <p className="text-xs text-muted-foreground">
          The more specific, the faster we can approve you.
        </p>
      </div>

      {/* Honeypot. Hidden from people, irresistible to bots. Not
          `display:none` — some bots skip those; off-screen with
          aria-hidden keeps it away from screen readers too. */}
      <div className="absolute left-[-9999px]" aria-hidden="true">
        <label htmlFor="p-hp">Website</label>
        <input id="p-hp" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <Button type="submit" disabled={sending} className="w-full">
        {sending && <Loader2 className="size-4 animate-spin" />}
        Apply to become a partner
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        No account needed. We&apos;ll email you either way.
      </p>
    </form>
  );
}
