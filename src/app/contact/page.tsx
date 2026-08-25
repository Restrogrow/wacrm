import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contact Us",
  robots: {
    index: true,
    follow: true,
  },
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
        &larr; Back to Repeat Grow
      </Link>

      <h1 className="mt-6 text-3xl font-bold tracking-tight">Contact Us</h1>
      <p className="mt-3 text-sm leading-relaxed text-foreground/90">
        Have a question, want a plan scoped for your team, or need support
        with your account? Reach us through any of the channels below.
      </p>

      <div className="mt-10 space-y-6">
        <div className="rounded-lg border border-border p-5">
          <h2 className="text-sm font-semibold text-foreground">Email</h2>
          <a
            href="mailto:support.repeatgrow@gmail.com"
            className="mt-1 block text-sm text-muted-foreground underline"
          >
            support.repeatgrow@gmail.com
          </a>
        </div>

        <div className="rounded-lg border border-border p-5">
          <h2 className="text-sm font-semibold text-foreground">Phone</h2>
          <a
            href="tel:+916377568749"
            className="mt-1 block text-sm text-muted-foreground underline"
          >
            +91 63775 68749
          </a>
        </div>

        <div className="rounded-lg border border-border p-5">
          <h2 className="text-sm font-semibold text-foreground">WhatsApp</h2>
          <a
            href="https://wa.me/916377568749"
            target="_blank"
            rel="noopener"
            className="mt-1 block text-sm text-muted-foreground underline"
          >
            +91 63775 68749
          </a>
        </div>
      </div>
    </div>
  );
}
