// ============================================================
// /connect/[client] — consent page for "Connect RepeatGrow".
//
// A partner app (e.g. RestroGrow) sends the account owner here with
// client_id, redirect_uri, state, scopes, and an optional display-only
// `restaurant`. We validate the request against the registered client
// FIRST and render an error (never a redirect) if anything is off; only
// a validated redirect_uri is ever used. Contract:
// docs/RESTROGROW_CONNECT.md §3.3.
// ============================================================

import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle, Check, ShieldCheck } from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getCurrentAccount, UnauthorizedError, type AccountContext } from '@/lib/auth/account';
import { hasMinRole } from '@/lib/auth/roles';
import { SCOPE_DESCRIPTIONS } from '@/lib/api-keys/scopes';
import { validateConnectRequest, type ConnectRequestParams } from '@/lib/connect/connect';
import { findConnectClient, findWhatsAppConfig } from '@/lib/connect/store';
import { allowConnect, cancelConnect } from './actions';

export const metadata: Metadata = {
  title: 'Connect an app',
  robots: { index: false, follow: false },
};

type SearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Image src="/logo-v2.png" alt="" width={28} height={28} />
          <span className="text-foreground font-mono text-lg font-bold">
            Repeat<span className="text-muted-foreground">Grow</span>
          </span>
        </div>
        <Card className="border-border bg-card">
          <CardContent className="space-y-5 p-6">{children}</CardContent>
        </Card>
      </div>
    </div>
  );
}

function ErrorState({ title, message, children }: { title: string; message: string; children?: React.ReactNode }) {
  return (
    <Shell>
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
        <div>
          <h1 className="text-foreground text-lg font-semibold">{title}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{message}</p>
        </div>
      </div>
      {children ?? (
        <Link href="/dashboard" className={buttonVariants({ variant: 'outline', className: 'w-full' })}>
          Go to Repeat Grow
        </Link>
      )}
    </Shell>
  );
}

export default async function ConnectPage({
  params,
  searchParams,
}: {
  params: Promise<{ client: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { client: routeClient } = await params;
  const sp = await searchParams;
  const request: ConnectRequestParams = {
    client_id: first(sp.client_id),
    redirect_uri: first(sp.redirect_uri),
    state: first(sp.state),
    scopes: first(sp.scopes),
    restaurant: first(sp.restaurant),
  };

  // 1. Validate before anything else — an invalid request gets an error
  //    page, never a redirect (not even to /login).
  const client = await findConnectClient(routeClient);
  const validation = validateConnectRequest(routeClient, client, request);
  if (!validation.ok) {
    return (
      <ErrorState
        title="This connection link isn't valid"
        message={`${validation.error} Go back to the app and try connecting again.`}
      />
    );
  }
  const req = validation.request;

  // 2. Signed in? If not, log in and come straight back to this URL.
  let ctx: AccountContext | null = null;
  try {
    ctx = await getCurrentAccount();
  } catch (err) {
    if (!(err instanceof UnauthorizedError)) {
      return (
        <ErrorState
          title="We couldn't load your account"
          message="Your login isn't linked to a Repeat Grow account. Contact support@repeatgrow.com."
        />
      );
    }
  }
  if (!ctx) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(request)) if (v) qs.set(k, v);
    redirect(`/login?next=${encodeURIComponent(`/connect/${encodeURIComponent(routeClient)}?${qs}`)}`);
  }

  // 3. Admins and owners only — same bar as creating an API key.
  if (!hasMinRole(ctx.role, 'admin')) {
    return (
      <ErrorState
        title="Ask an admin to connect"
        message={`Only admins and owners can connect apps. Ask an admin of ${ctx.account.name} to connect ${req.client.name}.`}
      />
    );
  }

  const config = await findWhatsAppConfig(ctx.accountId);
  const hidden = {
    route_client: routeClient,
    client_id: req.client.id,
    redirect_uri: req.redirectUri,
    state: req.state,
    scopes: req.scopes.join(','),
    restaurant: req.label ?? '',
  };
  const hiddenInputs = Object.entries(hidden).map(([name, value]) => (
    <input key={name} type="hidden" name={name} value={value} />
  ));

  return (
    <Shell>
      <div className="text-center">
        <div className="bg-primary/10 mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl">
          <ShieldCheck className="text-primary size-6" />
        </div>
        <h1 className="text-foreground text-xl font-semibold">Connect {req.client.name}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          <span className="text-foreground font-medium">{req.client.name}</span> wants to send WhatsApp
          messages from <span className="text-foreground font-medium">{ctx.account.name}</span>
          {req.scopes.includes('templates:write') ? ' and create message templates for it' : ''}.
        </p>
        {req.label ? (
          <p className="text-muted-foreground mt-2 text-xs">
            For <span className="text-foreground">{req.label}</span>
          </p>
        ) : null}
      </div>

      <div>
        <p className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
          It will be able to
        </p>
        <ul className="space-y-2">
          {req.scopes.map((scope) => (
            <li key={scope} className="flex items-start gap-2 text-sm">
              <Check className="text-primary mt-0.5 size-4 shrink-0" />
              <span className="text-foreground">{SCOPE_DESCRIPTIONS[scope]}</span>
            </li>
          ))}
        </ul>
      </div>

      {!config ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <p className="text-foreground">
            {ctx.account.name} has no WhatsApp number connected yet. You can still connect, but messages
            won&apos;t send until you{' '}
            <Link href="/settings?tab=whatsapp" className="underline">
              connect a number
            </Link>
            .
          </p>
        </div>
      ) : null}

      <p className="text-muted-foreground text-xs">
        You can disconnect at any time from Settings → Connected apps in Repeat Grow, or from{' '}
        {req.client.name}.
      </p>

      <div className="flex gap-3">
        <form action={cancelConnect} className="flex-1">
          {hiddenInputs}
          <Button type="submit" variant="outline" className="w-full">
            Cancel
          </Button>
        </form>
        <form action={allowConnect} className="flex-1">
          {hiddenInputs}
          <Button type="submit" className="w-full">
            Allow
          </Button>
        </form>
      </div>
    </Shell>
  );
}
