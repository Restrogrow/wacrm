"use client";

// /admin/emails — pick any email the platform sends, see exactly how it
// looks (desktop / phone), and send a sample to the test inbox.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Loader2,
  Mail,
  Monitor,
  Send,
  Smartphone,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";

export interface PreviewEmail {
  id: string;
  name: string;
  category: string;
  sender: "app" | "supabase";
  trigger: string;
  audience: string;
  schedule?: string;
  live: boolean;
  note?: string;
  supabaseTemplate?: string;
  subject: string;
  html: string;
  text: string;
  /** Supabase only: the real template (with {{ .Token }} etc.) to paste. */
  supabaseHtml?: string;
  supabaseSubject?: string;
}

export function EmailsPreview({
  emails,
  smtpConfigured,
  testRecipient,
}: {
  emails: PreviewEmail[];
  smtpConfigured: boolean;
  testRecipient: string;
}) {
  const [activeId, setActiveId] = useState(emails[0]?.id ?? "");
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [view, setView] = useState<"html" | "text">("html");
  const [sending, setSending] = useState<string | null>(null);
  const [status, setStatus] = useState<Record<string, "ok" | "fail">>({});

  const active = emails.find((e) => e.id === activeId) ?? emails[0];
  const groups = useMemo(() => {
    const map = new Map<string, PreviewEmail[]>();
    for (const e of emails) map.set(e.category, [...(map.get(e.category) ?? []), e]);
    return Array.from(map.entries());
  }, [emails]);

  async function send(id: string) {
    setSending(id);
    try {
      const res = await fetch("/api/admin/emails/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      const failed = (json.failed ?? []) as { id: string; error?: string }[];
      setStatus((prev) => {
        const next = { ...prev };
        for (const r of (json.results ?? []) as { id: string; ok: boolean }[]) next[r.id] = r.ok ? "ok" : "fail";
        return next;
      });
      if (failed.length) toast.error(`${failed.length} failed: ${failed[0].error ?? "send error"}`);
      else toast.success(id === "all" ? `Sent ${json.sent} test emails to ${json.to}` : `Sent to ${json.to}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send");
    } finally {
      setSending(null);
    }
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Copy failed");
    }
  }

  if (!active) return null;

  return (
    <div className="space-y-5">
      {/* SMTP status + send all */}
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 rounded-3xl border p-5",
          smtpConfigured ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/10",
        )}
      >
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex size-11 items-center justify-center rounded-2xl",
              smtpConfigured ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600",
            )}
          >
            {smtpConfigured ? <CheckCircle2 className="size-5" /> : <XCircle className="size-5" />}
          </span>
          <div>
            <p className="text-sm font-bold">
              {smtpConfigured ? "Email (SMTP) is configured on this server" : "Email (SMTP) is not configured on this server"}
            </p>
            <p className="text-xs text-muted-foreground">
              {smtpConfigured ? (
                <>
                  Test emails go to <b>{testRecipient}</b> with a [TEST] prefix.
                </>
              ) : (
                "Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM in this server's environment to enable sending. You can still preview every email."
              )}
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={!smtpConfigured || sending !== null}
          onClick={() => void send("all")}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 transition-opacity disabled:opacity-50"
        >
          {sending === "all" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Send all {emails.length} test emails
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* List */}
        <nav aria-label="Emails" className="space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
          {groups.map(([category, list]) => (
            <div key={category}>
              <p className="px-2 pb-1.5 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">{category}</p>
              <ul className="space-y-1">
                {list.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => setActiveId(e.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors",
                        e.id === active.id ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" : "hover:bg-muted",
                      )}
                    >
                      <Mail className="size-4 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{e.name}</span>
                        <span
                          className={cn(
                            "block text-[11px]",
                            e.id === active.id ? "text-primary-foreground/80" : "text-muted-foreground",
                          )}
                        >
                          {e.sender === "supabase" ? "Sent by Supabase" : "Sent by the app"}
                          {!e.live ? " · not live yet" : ""}
                        </span>
                      </span>
                      {status[e.id] === "ok" && <Check className="size-4 shrink-0" aria-label="Test sent" />}
                      {status[e.id] === "fail" && <XCircle className="size-4 shrink-0" aria-label="Test failed" />}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Preview */}
        <section className="min-w-0 space-y-4">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-bold tracking-tight">{active.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Subject:</span> {active.subject}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-bold",
                    active.live ? "bg-primary-soft text-primary" : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                  )}
                >
                  {active.live ? "Live" : "Not live yet"}
                </span>
                <button
                  type="button"
                  disabled={!smtpConfigured || sending !== null}
                  onClick={() => void send(active.id)}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 transition-opacity disabled:opacity-50"
                >
                  {sending === active.id ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  Send test to {testRecipient}
                </button>
              </div>
            </div>

            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-2xl bg-muted/50 p-3">
                <dt className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">When it&apos;s sent</dt>
                <dd className="mt-1">{active.trigger}</dd>
              </div>
              <div className="rounded-2xl bg-muted/50 p-3">
                <dt className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Who gets it</dt>
                <dd className="mt-1">{active.audience}</dd>
              </div>
              <div className="rounded-2xl bg-muted/50 p-3">
                <dt className="flex items-center gap-1 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                  <Clock className="size-3" /> Automation
                </dt>
                <dd className="mt-1">{active.schedule ?? "Sent on the event above"}</dd>
              </div>
            </dl>

            {active.note && (
              <p className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-300">
                {active.note}
              </p>
            )}

            {active.sender === "supabase" && active.supabaseHtml && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-primary-soft/50 p-3">
                <p className="mr-auto text-xs text-muted-foreground">
                  Paste into <b>Supabase → Authentication → Email Templates → {active.supabaseTemplate}</b>
                </p>
                <button
                  type="button"
                  onClick={() => void copy(active.supabaseSubject ?? active.subject, "Subject")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold"
                >
                  <Copy className="size-3.5" /> Copy subject
                </button>
                <button
                  type="button"
                  onClick={() => void copy(active.supabaseHtml ?? "", "Template HTML")}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                >
                  <Copy className="size-3.5" /> Copy template HTML
                </button>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-full bg-muted p-1 text-xs font-semibold">
              {(["html", "text"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={cn("rounded-full px-4 py-1.5", view === v ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground")}
                >
                  {v === "html" ? "Designed" : "Plain text"}
                </button>
              ))}
            </div>
            {view === "html" && (
              <div className="inline-flex rounded-full bg-muted p-1 text-xs font-semibold">
                {(
                  [
                    ["desktop", Monitor, "Desktop"],
                    ["phone", Smartphone, "Phone"],
                  ] as const
                ).map(([d, Icon, label]) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDevice(d)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5",
                      device === d ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground",
                    )}
                  >
                    <Icon className="size-3.5" /> {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {view === "html" ? (
            <div className="rounded-3xl border border-border bg-muted/40 p-3 sm:p-5">
              <iframe
                title={`${active.name} preview`}
                srcDoc={active.html}
                sandbox=""
                className={cn("mx-auto block h-[720px] w-full rounded-2xl border border-border bg-white shadow-sm", device === "phone" && "max-w-[390px]")}
              />
            </div>
          ) : (
            <pre className="max-h-[720px] overflow-auto rounded-3xl border border-border bg-card p-5 font-mono text-xs leading-relaxed whitespace-pre-wrap shadow-sm">
              {active.text}
            </pre>
          )}
        </section>
      </div>
    </div>
  );
}
