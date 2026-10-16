import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import { BarChart3, MessageSquare, Zap } from "lucide-react";

// Shared metadata for auth pages (login / signup / forgot-password).
// None of these should be indexed — they'd compete with the marketing
// landing in SERPs and offer nothing to a searcher who hasn't already
// signed up. Each page still gets its own <title> via its own
// metadata.title override below the route group layout.
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

const PERKS = [
  { icon: MessageSquare, text: "One shared WhatsApp inbox for your whole team" },
  { icon: Zap, text: "Broadcasts and automations that run on their own" },
  { icon: BarChart3, text: "Pipelines, orders and analytics in one place" },
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-[var(--rail)] via-primary to-emerald-400 p-12 text-white lg:flex">
        <div className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <Image
            src="/logo-v2.png"
            alt="Repeat Grow"
            width={44}
            height={44}
            className="size-11 rounded-2xl"
            priority
          />
          <span className="text-xl font-bold tracking-tight">Repeat Grow</span>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-4xl leading-tight font-bold tracking-tight">
            Turn WhatsApp chats into repeat customers.
          </h2>
          <ul className="mt-8 space-y-4">
            {PERKS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-white/90">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
                  <Icon className="size-5" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/70">
          &copy; {new Date().getFullYear()} Repeat Grow
        </p>
      </aside>
      <div className="bg-background">{children}</div>
    </div>
  );
}
