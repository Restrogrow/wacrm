"use client";

// New-message alerts that agents can't miss: a desktop notification and
// a short chime when a customer writes, plus the unread count in the tab
// title. Mounted once in the dashboard shell, so it works on every page.
//
// Skips chats a teammate is assigned to and the chat already on screen.
// Desktop notifications need the browser's permission, which a browser
// only lets us ask for after a click, so a small card offers to turn
// them on.

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellOff, Volume2, VolumeX, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useTotalUnread } from "@/hooks/use-total-unread";
import { createClient } from "@/lib/supabase/client";
import {
  dismissPrompt,
  promptDismissed,
  setSoundEnabled,
  shouldAlert,
  soundEnabled,
} from "@/lib/notify-prefs";

type Permission = NotificationPermission | "unsupported";

function currentPermission(): Permission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/** Two soft notes via Web Audio, so there is no sound file to load. */
function playChime(ctxRef: React.MutableRefObject<AudioContext | null>) {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = ctxRef.current ?? new Ctx();
    ctxRef.current = ctx;
    if (ctx.state === "suspended") void ctx.resume();
    const start = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = start + i * 0.12;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  } catch {
    // audio blocked until the user interacts with the page; ignore
  }
}

function previewText(row: { content_type?: string; content_text?: string | null }): string {
  const text = (row.content_text ?? "").trim();
  if (text) return text.length > 120 ? `${text.slice(0, 117)}…` : text;
  switch (row.content_type) {
    case "image":
      return "📷 Photo";
    case "video":
      return "🎥 Video";
    case "audio":
      return "🎤 Voice message";
    case "document":
      return "📄 Document";
    case "location":
      return "📍 Location";
    default:
      return "New message";
  }
}

/** Desktop-alert and sound switches, on the Notifications page. */
export function MessageAlertSettings() {
  const [permission, setPermission] = useState<Permission>("unsupported");
  const [sound, setSound] = useState(true);
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    setPermission(currentPermission());
    setSound(soundEnabled());
  }, []);

  async function enable() {
    if (!("Notification" in window)) return;
    setPermission(await Notification.requestPermission());
  }

  function toggleSound() {
    const next = !sound;
    setSound(next);
    setSoundEnabled(next);
    if (next) playChime(audioRef);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-foreground">New message alerts</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {permission === "granted"
            ? "Desktop alerts are on in this browser."
            : permission === "denied"
              ? "Desktop alerts are blocked. Allow notifications for this site in your browser settings."
              : permission === "unsupported"
                ? "This browser doesn't support desktop alerts."
                : "Turn on desktop alerts to hear about new customer messages in the background."}{" "}
          Chats assigned to a teammate don&apos;t alert you.
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        {permission === "default" && (
          <Button size="sm" onClick={() => void enable()}>
            <Bell className="size-3.5" />
            Turn on alerts
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={toggleSound}>
          {sound ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
          Sound {sound ? "on" : "off"}
        </Button>
      </div>
    </div>
  );
}

export function MessageNotifier() {
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id;
  const totalUnread = useTotalUnread();
  const [permission, setPermission] = useState<Permission>("unsupported");
  const [showPrompt, setShowPrompt] = useState(false);
  const [sound, setSound] = useState(true);
  const audioRef = useRef<AudioContext | null>(null);
  const baseTitleRef = useRef<string | null>(null);

  // Read browser-only state after mount.
  useEffect(() => {
    const p = currentPermission();
    setPermission(p);
    setSound(soundEnabled());
    setShowPrompt(p === "default" && !promptDismissed());
  }, []);

  // "(3) Inbox | Repeat Grow" in the tab title while chats are unread.
  useEffect(() => {
    const strip = (t: string) => t.replace(/^\(\d+\)\s+/, "");
    if (baseTitleRef.current === null) baseTitleRef.current = strip(document.title);
    const apply = () => {
      const base = strip(document.title);
      document.title = totalUnread > 0 ? `(${totalUnread}) ${base}` : base;
    };
    apply();
    // Pages change the title on navigation; re-apply after they do.
    const observer = new MutationObserver(() => {
      const hasPrefix = /^\(\d+\)\s+/.test(document.title);
      if (totalUnread > 0 && !hasPrefix) apply();
      if (totalUnread === 0 && hasPrefix) apply();
    });
    const titleEl = document.querySelector("title");
    if (titleEl) observer.observe(titleEl, { childList: true });
    return () => observer.disconnect();
  }, [totalUnread]);

  const alertFor = useCallback(
    async (row: { id: string; conversation_id: string; content_type?: string; content_text?: string | null }) => {
      if (!userId) return;
      const supabase = createClient();
      const { data: conv } = await supabase
        .from("conversations")
        .select("id, assigned_agent_id, contact:contacts(name, phone)")
        .eq("id", row.conversation_id)
        .maybeSingle();
      if (!conv) return;

      const ok = shouldAlert({
        conversationId: row.conversation_id,
        assignedTo: (conv.assigned_agent_id as string | null) ?? null,
        currentUserId: userId,
        tabHidden: document.hidden,
        location: window.location.pathname + window.location.search,
      });
      if (!ok) return;

      if (soundEnabled()) playChime(audioRef);

      if (currentPermission() === "granted" && (document.hidden || !document.hasFocus())) {
        const contact = (Array.isArray(conv.contact) ? conv.contact[0] : conv.contact) as
          | { name?: string | null; phone?: string | null }
          | null;
        const who = contact?.name || (contact?.phone ? `+${String(contact.phone).replace(/^\+/, "")}` : "Customer");
        try {
          const n = new Notification(`${who} on WhatsApp`, {
            body: previewText(row),
            icon: "/icon.png",
            tag: `conv-${row.conversation_id}`,
          });
          n.onclick = () => {
            window.focus();
            router.push(`/inbox?c=${row.conversation_id}`);
            n.close();
          };
        } catch {
          // some browsers only allow notifications from a service worker
        }
      }
    },
    [userId, router],
  );

  // Listen for inbound messages across all chats this user can see (RLS).
  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const channel = supabase
      .channel("message-notifier")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: "sender_type=eq.customer" },
        (payload) => {
          const row = payload.new as {
            id: string;
            conversation_id: string;
            content_type?: string;
            content_text?: string | null;
          };
          if (row?.conversation_id) void alertFor(row);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, alertFor]);

  async function enable() {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
    setShowPrompt(false);
    if (result === "granted") playChime(audioRef);
  }

  function closePrompt() {
    dismissPrompt();
    setShowPrompt(false);
  }

  function toggleSound() {
    const next = !sound;
    setSound(next);
    setSoundEnabled(next);
    if (next) playChime(audioRef);
  }

  if (!showPrompt) return null;

  return (
    <div
      role="dialog"
      aria-label="Turn on message notifications"
      className="fixed bottom-4 left-4 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-border bg-popover p-4 shadow-lg"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Bell className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-popover-foreground">Never miss a customer</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Get a desktop alert and a sound when a customer messages you, even when this tab is in the background.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => void enable()} disabled={permission === "unsupported"}>
              <Bell className="size-3.5" />
              Turn on
            </Button>
            <Button size="sm" variant="ghost" onClick={toggleSound} title={sound ? "Sound is on" : "Sound is off"}>
              {sound ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
              Sound {sound ? "on" : "off"}
            </Button>
          </div>
          {permission === "denied" && (
            <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
              <BellOff className="size-3" />
              Notifications are blocked in your browser settings.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={closePrompt}
          aria-label="Dismiss"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
