'use client';

// ============================================================
// AiChatbotSettings — Settings → AI chatbot
//
// The account's knowledge base + rules for the WhatsApp AI chatbot
// (lib/ai-chatbot). Any member can read; admin+ can edit and turn it
// on. The "Test the bot" chat runs against the UNSAVED form so admins
// can tune answers before going live — nothing is sent to WhatsApp.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Bot, Loader2, RotateCcw, Save, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import {
  DEFAULT_CHATBOT_SETTINGS,
  INSTRUCTIONS_MAX,
  KNOWLEDGE_BASE_MAX,
  type ChatbotSettings,
} from '@/lib/ai-chatbot/chatbot';
import { SettingsPanelHead } from './settings-panel-head';

const KB_PLACEHOLDER = `Write everything the bot may tell customers. For example:

About: Taste of Banaras — pure-veg Banarasi food in Jaipur.
Timings: 11am–11pm, all days.
Delivery: Jaipur only. Free above ₹499, else ₹40.
Menu & prices: Kachori Sabzi ₹80, Banarasi Thali ₹299, Lassi ₹99 …
Order online: https://tasteofbanaras.in
Tiffin plans: Daily / Weekly / Monthly — details on the website.
Catering: 50+ meals, book 2 days ahead, call the team for a quote.
FAQ: Jain food available on request. No onion-garlic option for thali.`;

type ChatTurn = { role: 'user' | 'assistant'; content: string; handoff?: boolean };

export function AiChatbotSettings() {
  const { canEditSettings } = useAuth();
  const [settings, setSettings] = useState<ChatbotSettings>(DEFAULT_CHATBOT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [missingTable, setMissingTable] = useState<string | null>(null);
  const [aiConfigured, setAiConfigured] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/ai-chatbot');
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.status === 503 && json.code === 'missing_table') {
          setMissingTable(json.error);
        } else if (!res.ok) {
          toast.error(json.error ?? 'Could not load AI chatbot settings.');
        } else {
          setSettings(json.settings);
          setAiConfigured(json.ai_configured !== false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const update = (patch: Partial<ChatbotSettings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    setDirty(true);
  };

  async function save(next: ChatbotSettings = settings) {
    setSaving(true);
    try {
      const res = await fetch('/api/ai-chatbot', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Save failed: ${res.status}`);
      setSettings(json.settings);
      setDirty(false);
      toast.success(json.settings.enabled ? 'Saved — the AI chatbot is live.' : 'Saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      </div>
    );
  }

  if (missingTable) {
    return (
      <div>
        <SettingsPanelHead title="AI chatbot" />
        <Card>
          <CardContent className="space-y-2 py-6 text-sm">
            <p className="font-medium text-foreground">One-time setup needed</p>
            <p className="text-muted-foreground">{missingTable}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const readOnly = !canEditSettings;

  return (
    <div>
      <SettingsPanelHead
        title="AI chatbot"
        description="Let AI chat with customers on WhatsApp using your own information. It answers from the knowledge below, stays quiet while your team is chatting, and hands the chat to a person only when the customer asks for one."
        action={
          <div className="flex items-center gap-2.5">
            <Label htmlFor="ai-enabled" className="text-sm">
              {settings.enabled ? 'On' : 'Off'}
            </Label>
            <Switch
              id="ai-enabled"
              checked={settings.enabled}
              disabled={readOnly || saving}
              onCheckedChange={(checked) => {
                const next = { ...settings, enabled: checked };
                setSettings(next);
                void save(next);
              }}
            />
          </div>
        }
      />

      {!aiConfigured && (
        <p className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          The server has no AI key yet. Set <code>API_GROQ</code> in your hosting environment variables, then redeploy.
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Field
            label="Knowledge base"
            hint={`Menu, prices, timings, delivery area, offers, policies, FAQs. ${settings.knowledge_base.length.toLocaleString()} / ${KNOWLEDGE_BASE_MAX.toLocaleString()}`}
          >
            <Textarea
              value={settings.knowledge_base}
              onChange={(e) => update({ knowledge_base: e.target.value })}
              placeholder={KB_PLACEHOLDER}
              maxLength={KNOWLEDGE_BASE_MAX}
              rows={14}
              disabled={readOnly}
              className="font-mono text-[13px]"
            />
          </Field>

          <Field
            label="Rules & tone (optional)"
            hint='e.g. "Reply in Hinglish. Always share the website for orders. Never give discounts."'
          >
            <Textarea
              value={settings.instructions}
              onChange={(e) => update({ instructions: e.target.value })}
              maxLength={INSTRUCTIONS_MAX}
              rows={3}
              disabled={readOnly}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bot name">
              <Input
                value={settings.bot_name}
                onChange={(e) => update({ bot_name: e.target.value })}
                maxLength={60}
                disabled={readOnly}
              />
            </Field>
            <Field label="Stay quiet after a team reply (minutes)">
              <Input
                type="number"
                min={0}
                max={10080}
                value={settings.pause_minutes_after_agent}
                onChange={(e) => update({ pause_minutes_after_agent: Number(e.target.value) })}
                disabled={readOnly}
              />
            </Field>
          </div>

          <Field
            label="Hand-off message"
            hint="Sent when the bot passes the chat to your team. The chat then shows as Pending in the inbox."
          >
            <Input
              value={settings.handoff_message}
              onChange={(e) => update({ handoff_message: e.target.value })}
              maxLength={1000}
              disabled={readOnly}
            />
          </Field>

          {!readOnly && (
            <div className="flex items-center gap-3">
              <Button onClick={() => void save()} disabled={saving || !dirty}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save
              </Button>
              {dirty && <span className="text-xs text-amber-300">Unsaved changes</span>}
            </div>
          )}

          <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-xs">
            <li>Flows always go first — the bot only answers messages no active flow handled.</li>
            <li>It doesn&apos;t reply to button taps, media, or chats assigned to someone.</li>
            <li>After handing a chat to your team it waits 2 hours; if nobody replied by then, it starts answering again. Setting the chat to Open resumes it right away.</li>
            <li>Lines with [square brackets] are treated as not filled in — replace them with real details.</li>
          </ul>
        </div>

        {!readOnly && <TestChat settings={settings} />}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

function TestChat({ settings }: { settings: ChatbotSettings }) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length, busy]);

  async function ask() {
    const text = draft.trim();
    if (!text || busy) return;
    const next: ChatTurn[] = [...turns, { role: 'user', content: text }];
    setTurns(next);
    setDraft('');
    setBusy(true);
    try {
      const res = await fetch('/api/ai-chatbot/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings,
          messages: next.map(({ role, content }) => ({ role, content })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Test failed: ${res.status}`);
      setTurns([...next, { role: 'assistant', content: json.reply, handoff: json.handoff }]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test failed');
      setTurns(turns);
      setDraft(text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex h-fit flex-col">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Bot className="size-4 text-primary" />
            Test the bot
          </p>
          <Button variant="ghost" size="sm" onClick={() => setTurns([])} disabled={busy || turns.length === 0}>
            <RotateCcw className="size-3.5" />
            Clear
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          Ask like a customer would. Uses the form as typed (even unsaved). Nothing is sent to WhatsApp.
        </p>
        <div className="h-[340px] overflow-y-auto rounded-lg border border-border bg-[#0b141a] p-3">
          <div className="flex flex-col gap-2">
            {turns.length === 0 && (
              <p className="m-auto pt-24 text-center text-xs text-slate-400">
                Try: &quot;What are your timings?&quot; or &quot;Do you deliver to Malviya Nagar?&quot;
              </p>
            )}
            {turns.map((t, i) => (
              <div key={i} className={cn('flex flex-col', t.role === 'user' ? 'items-end' : 'items-start')}>
                <div
                  className={cn(
                    'max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-1.5 text-sm text-slate-100',
                    t.role === 'user' ? 'rounded-tr-sm bg-[#005c4b]' : 'rounded-tl-sm bg-[#202c33]',
                  )}
                >
                  {t.content}
                </div>
                {t.handoff && (
                  <span className="mt-1 text-[11px] text-amber-300">→ would hand this chat to your team</span>
                )}
              </div>
            ))}
            {busy && <div className="text-xs text-slate-400">typing…</div>}
            <div ref={bottomRef} />
          </div>
        </div>
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void ask();
            }}
            placeholder="Type a customer message…"
            disabled={busy}
          />
          <Button size="icon" onClick={() => void ask()} disabled={busy || !draft.trim()} aria-label="Send test message">
            <Send className="size-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
