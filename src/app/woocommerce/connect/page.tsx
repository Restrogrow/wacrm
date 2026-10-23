// /woocommerce/connect?store=https://shop.example.com
//
// Where the Repeat Grow WordPress plugin's "Connect to Repeat Grow" button
// lands. Validates the store address, makes the merchant log in (and come
// back), checks they are an admin, then asks them to confirm before sending
// them to their store's WooCommerce approval screen. The explicit confirm
// stops a link from silently attaching someone else's store to an account.

import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle, Check } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { WooConnectButton } from '@/components/integrations/woo-connect-button';
import { getCurrentAccount, UnauthorizedError, type AccountContext } from '@/lib/auth/account';
import { hasMinRole } from '@/lib/auth/roles';
import { normalizeStoreUrl } from '@/lib/woocommerce/verify';

export const metadata: Metadata = {
  title: 'Connect WooCommerce',
  robots: { index: false, follow: false },
};

type SearchParams = Record<string, string | string[] | undefined>;

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

function ErrorState({ title, message }: { title: string; message: string }) {
  return (
    <Shell>
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
        <div>
          <h1 className="text-foreground text-lg font-semibold">{title}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{message}</p>
        </div>
      </div>
      <Link href="/integrations/woocommerce" className={buttonVariants({ variant: 'outline', className: 'w-full' })}>
        Go to Repeat Grow
      </Link>
    </Shell>
  );
}

export default async function WooConnectPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const rawStore = Array.isArray(sp.store) ? sp.store[0] : sp.store;
  const storeUrl = normalizeStoreUrl(rawStore ?? null);
  if (!storeUrl) {
    return <ErrorState title="This link isn't valid" message="The store address is missing or wrong. Go back to WooCommerce → Repeat Grow and click Connect again." />;
  }
  if (!storeUrl.startsWith('https://')) {
    return (
      <ErrorState
        title="Your store needs https"
        message="One-click connect only works for stores on https://. Use the manual setup on the WooCommerce page in Repeat Grow instead."
      />
    );
  }

  let ctx: AccountContext | null = null;
  try {
    ctx = await getCurrentAccount();
  } catch (err) {
    if (!(err instanceof UnauthorizedError)) {
      return <ErrorState title="We couldn't load your account" message="Your login isn't linked to a Repeat Grow account. Contact support@repeatgrow.com." />;
    }
  }
  if (!ctx) {
    redirect(`/login?next=${encodeURIComponent(`/woocommerce/connect?store=${encodeURIComponent(storeUrl)}`)}`);
  }
  if (!hasMinRole(ctx.role, 'admin')) {
    return <ErrorState title="Ask an admin to connect" message={`Only admins and owners can connect a store. Ask an admin of ${ctx.account.name}.`} />;
  }

  const host = new URL(storeUrl).host;
  return (
    <Shell>
      <div className="text-center">
        <h1 className="text-foreground text-xl font-semibold">Connect your WooCommerce store</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Connect <span className="text-foreground font-medium">{host}</span> to{' '}
          <span className="text-foreground font-medium">{ctx.account.name}</span> on Repeat Grow.
        </p>
      </div>
      <ul className="space-y-2 text-sm">
        {[
          'Your store asks you to approve Repeat Grow (one click).',
          'Repeat Grow creates the order webhooks for you.',
          'New and updated orders can send WhatsApp messages to customers.',
        ].map((t) => (
          <li key={t} className="flex items-start gap-2">
            <Check className="text-primary mt-0.5 size-4 shrink-0" />
            <span className="text-foreground">{t}</span>
          </li>
        ))}
      </ul>
      <WooConnectButton storeUrl={storeUrl} className="w-full" label={`Continue to ${host}`} />
      <p className="text-muted-foreground text-center text-xs">
        Not your store or account?{' '}
        <Link href="/integrations/woocommerce" className="underline underline-offset-2">
          Cancel
        </Link>
      </p>
    </Shell>
  );
}
