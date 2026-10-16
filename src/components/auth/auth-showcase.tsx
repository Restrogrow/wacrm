"use client";

// Left-hand panel of the sign-in / sign-up pages: three product "screens"
// that crossfade on a loop (shared inbox → broadcasts → pipelines) with a
// headline for each. Pure illustration — no data, no network. Hover pauses,
// the dots jump to a slide, and reduced-motion users get no auto-rotation
// or floating.

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { BarChart3, CheckCheck, Clock, Radio, Sparkles, TrendingUp, UserCheck } from "lucide-react";

import { cn } from "@/lib/utils";

const ROTATE_MS = 5500;

/* ------------------------------------------------------------------ */
/* Slide visuals                                                        */
/* ------------------------------------------------------------------ */

function Float({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <div
      className={cn("absolute z-10 motion-safe:animate-[rg-float_6s_ease-in-out_infinite]", className)}
      style={{ animationDelay: `${delay}s` }}
    >
      {children}
    </div>
  );
}

function Chip({ icon: Icon, children, tone = "white" }: { icon: typeof Clock; children: ReactNode; tone?: "white" | "dark" }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-2xl px-3.5 py-2 text-xs font-semibold shadow-xl backdrop-blur",
        tone === "white" ? "bg-white text-slate-800" : "bg-slate-900/80 text-white",
      )}
    >
      <span className="flex size-6 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600">
        <Icon className="size-3.5" />
      </span>
      {children}
    </div>
  );
}

function InboxVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[400px]">
      <div className="rounded-[28px] bg-white p-4 text-slate-800 shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">A</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Aarav Sharma</p>
            <p className="flex items-center gap-1.5 text-[11px] text-emerald-600">
              <span className="size-1.5 rounded-full bg-emerald-500" /> online · +91 98100 00001
            </p>
          </div>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">Open</span>
        </div>
        <div className="space-y-2.5 bg-emerald-50/60 px-1 py-4">
          <p className="max-w-[78%] rounded-2xl rounded-tl-md bg-white px-3.5 py-2 text-[13px] shadow-sm">
            Hi, is the festive combo still available?
          </p>
          <p className="ml-auto max-w-[78%] rounded-2xl rounded-tr-md bg-emerald-600 px-3.5 py-2 text-[13px] text-white shadow-sm">
            Hello Aarav! Yes it is 🎉 Sending you the details now.
          </p>
          <p className="max-w-[78%] rounded-2xl rounded-tl-md bg-white px-3.5 py-2 text-[13px] shadow-sm">
            Great — what&apos;s the delivery time to Delhi?
          </p>
          <div className="flex w-fit items-center gap-1 rounded-2xl rounded-tr-md bg-emerald-600/90 px-3.5 py-3 ml-auto">
            {[0, 1, 2].map((d) => (
              <span
                key={d}
                className="size-1.5 rounded-full bg-white/90 motion-safe:animate-[rg-typing_1.2s_ease-in-out_infinite]"
                style={{ animationDelay: `${d * 0.18}s` }}
              />
            ))}
          </div>
        </div>
        <div className="mt-1 flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2.5 text-xs text-slate-400">
          Type a message or press <kbd className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 shadow-sm">/</kbd> for saved replies
        </div>
      </div>
      <Float className="-top-4 -right-4 sm:-right-8">
        <Chip icon={UserCheck}>Assigned to Priya</Chip>
      </Float>
      <Float className="-bottom-5 -left-3 sm:-left-8" delay={1.5}>
        <Chip icon={Sparkles}>AI replied in 3s</Chip>
      </Float>
    </div>
  );
}

function BroadcastVisual({ active }: { active: boolean }) {
  const bars = [
    { label: "Sent", value: "12,480", pct: 100, color: "bg-sky-500" },
    { label: "Delivered", value: "98%", pct: 98, color: "bg-emerald-500" },
    { label: "Read", value: "84%", pct: 84, color: "bg-violet-500" },
    { label: "Replied", value: "21%", pct: 21, color: "bg-amber-500" },
  ];
  return (
    <div className="relative mx-auto w-full max-w-[400px]">
      <div className="rounded-[28px] bg-white p-5 text-slate-800 shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-emerald-600 text-white">
            <Radio className="size-5" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-bold">Diwali Sale Blast</p>
            <p className="text-[11px] text-slate-500">Template · festive_offer</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">Sent</span>
        </div>
        <div className="mt-5 space-y-3.5">
          {bars.map((b, i) => (
            <div key={b.label}>
              <div className="mb-1.5 flex justify-between text-xs">
                <span className="font-medium text-slate-500">{b.label}</span>
                <span className="font-bold tabular-nums">{b.value}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={cn("h-full rounded-full transition-[width] duration-1000 ease-out", b.color)}
                  style={{ width: active ? `${b.pct}%` : "0%", transitionDelay: `${i * 120}ms` }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2 text-center">
          {[
            ["₹4.2L", "Revenue"],
            ["1,284", "Replies"],
            ["3.4×", "ROI"],
          ].map(([v, l]) => (
            <div key={l} className="rounded-2xl bg-slate-50 py-2.5">
              <p className="text-sm font-bold">{v}</p>
              <p className="text-[10px] text-slate-500">{l}</p>
            </div>
          ))}
        </div>
      </div>
      <Float className="-top-4 -left-3 sm:-left-8">
        <Chip icon={Clock}>Scheduled 10:00 AM</Chip>
      </Float>
      <Float className="-bottom-5 -right-3 sm:-right-8" delay={1.5}>
        <Chip icon={CheckCheck}>12,480 delivered</Chip>
      </Float>
    </div>
  );
}

function PipelineVisual() {
  const cols = [
    { name: "New lead", color: "bg-sky-500", cards: [["Hardware kit", "₹12,500"], ["Sample order", "₹2,200"]] },
    { name: "Negotiation", color: "bg-amber-500", cards: [["Bulk order", "₹85,000"], ["Wholesale kurtis", "₹42,000"]] },
    { name: "Won", color: "bg-emerald-500", cards: [["Monthly supply", "₹26,000"]] },
  ];
  return (
    <div className="relative mx-auto w-full max-w-[420px]">
      <div className="rounded-[28px] bg-white p-4 text-slate-800 shadow-2xl ring-1 ring-black/5">
        <div className="grid grid-cols-3 gap-2.5">
          {cols.map((c) => (
            <div key={c.name} className="rounded-2xl bg-slate-50 p-2">
              <p className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-bold">
                <span className={cn("size-2 rounded-full", c.color)} />
                {c.name}
              </p>
              <div className="space-y-2">
                {c.cards.map(([t, v]) => (
                  <div key={t} className="rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-black/5">
                    <p className="truncate text-[11px] font-semibold">{t}</p>
                    <p className="mt-1.5 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{v}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between rounded-2xl bg-emerald-600 px-4 py-3 text-white">
          <span className="text-xs font-medium text-white/80">Pipeline value</span>
          <span className="text-lg font-bold tabular-nums">₹1,67,700</span>
        </div>
      </div>
      <Float className="-top-4 -right-3 sm:-right-8">
        <Chip icon={TrendingUp}>Deal won · ₹85,000</Chip>
      </Float>
      <Float className="-bottom-5 -left-3 sm:-left-8" delay={1.5}>
        <Chip icon={BarChart3}>+18% this month</Chip>
      </Float>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel                                                                */
/* ------------------------------------------------------------------ */

const SLIDES = [
  {
    id: "inbox",
    title: "Every customer chat in one shared inbox",
    text: "Reply together, assign chats to teammates and let AI handle the repeat questions.",
  },
  {
    id: "broadcasts",
    title: "Reach thousands on WhatsApp in a click",
    text: "Send approved templates to your whole audience and watch delivery, reads and replies live.",
  },
  {
    id: "pipelines",
    title: "Turn conversations into closed deals",
    text: "Track every lead through your pipeline and see exactly what each chat is worth.",
  },
] as const;

export function AuthShowcase() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (paused || reduced) return;
    const t = setInterval(() => setIndex((n) => (n + 1) % SLIDES.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [paused, reduced]);

  return (
    <aside
      className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-[var(--rail)] via-primary to-emerald-400 p-12 text-white lg:flex"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full bg-white/10 blur-3xl" />
      {/* dotted texture */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:26px_26px]" />

      <div className="relative flex items-center gap-3">
        <Image src="/logo-v2.png" alt="Repeat Grow" width={44} height={44} className="size-11 rounded-2xl bg-white p-1" priority />
        <span className="text-xl font-bold tracking-tight">Repeat Grow</span>
      </div>

      {/* Slides */}
      <div className="relative my-8 flex flex-1 flex-col justify-center">
        <div className="relative h-[400px]">
          {SLIDES.map((s, i) => {
            const active = i === index;
            return (
              <div
                key={s.id}
                aria-hidden={!active}
                className={cn(
                  "absolute inset-0 flex items-center transition-all duration-700 ease-out",
                  active ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-4 scale-[0.97] opacity-0",
                )}
              >
                {s.id === "inbox" && <InboxVisual />}
                {s.id === "broadcasts" && <BroadcastVisual active={active} />}
                {s.id === "pipelines" && <PipelineVisual />}
              </div>
            );
          })}
        </div>

        <div className="relative mt-10 h-[116px] max-w-lg">
          {SLIDES.map((s, i) => (
            <div
              key={s.id}
              aria-live={i === index ? "polite" : undefined}
              className={cn(
                "absolute inset-0 transition-all duration-700 ease-out",
                i === index ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
              )}
            >
              <h2 className="text-3xl leading-tight font-bold tracking-tight">{s.title}</h2>
              <p className="mt-3 text-base text-white/80">{s.text}</p>
            </div>
          ))}
        </div>

        <div className="relative mt-2 flex items-center gap-2" role="tablist" aria-label="Product highlights">
          {SLIDES.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Show: ${s.title}`}
              onClick={() => setIndex(i)}
              className={cn(
                "h-2 rounded-full transition-all duration-500",
                i === index ? "w-8 bg-white" : "w-2 bg-white/40 hover:bg-white/70",
              )}
            />
          ))}
        </div>
      </div>

      <p className="relative text-sm text-white/70">&copy; {new Date().getFullYear()} Repeat Grow</p>
    </aside>
  );
}
