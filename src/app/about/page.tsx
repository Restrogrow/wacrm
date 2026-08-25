import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About Us",
  robots: {
    index: true,
    follow: true,
  },
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
        &larr; Back to Repeat Grow
      </Link>

      <h1 className="mt-6 text-3xl font-bold tracking-tight">About Us</h1>

      <div className="mt-10 space-y-6 text-sm leading-relaxed text-foreground/90">
        <p>
          Repeat Grow is a WhatsApp CRM built for sales and support teams —
          a shared inbox, contacts, sales pipelines, broadcasts, and
          no-code automations, all built on the official WhatsApp Business
          API.
        </p>
        <p>
          Most WhatsApp tools stop at messaging. We built Repeat Grow
          because a conversation on its own doesn&apos;t grow a business —
          what turns a first-time chat into a repeat customer is knowing
          who you talked to, what they wanted, and what happens next. That&apos;s
          the gap Repeat Grow fills: every conversation is tied to a
          contact, a deal, and a next step.
        </p>
        <p>
          Rather than handing you a self-serve tool and walking away, we
          set the platform up for you — connecting your WhatsApp Business
          number, importing your contacts, and getting your team trained
          and working from the shared inbox in days.
        </p>
        <p>
          Have questions about who we are or how Repeat Grow works? Reach
          out any time — see our{" "}
          <Link href="/contact" className="underline">
            Contact Us
          </Link>{" "}
          page.
        </p>
      </div>
    </div>
  );
}
