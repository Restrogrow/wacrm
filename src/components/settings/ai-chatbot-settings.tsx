'use client';

// ============================================================
// AiChatbotSettings — Settings → AI chatbot
//
// The account's knowledge base + rules for the WhatsApp AI chatbot
// (lib/ai-chatbot). Any member can read; admin+ can edit and turn it
// on. The "Test the bot" chat runs against the UNSAVED form so admins
// can tune answers before going live — nothing is sent to WhatsApp.
// The "AI calls" card sets what the AI voice agent says on AI calls
// (lib/ai/voice-agent.ts); it uses the same knowledge base and name.
// ============================================================

import { IconChip } from '@/components/icon-chip';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  BookOpen,
  Bot,
  Check,
  Lightbulb,
  Loader2,
  PhoneCall,
  RotateCcw,
  Save,
  Send,
  Smile,
  Sparkles,
  UserRound,
  Zap,
} from 'lucide-react';

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
  VOICE_INSTRUCTIONS_MAX,
  VOICE_NAMES,
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

const VOICE_PLACEHOLDER = `What should the AI do on calls? For example:

You are calling people who asked about our tiffin plans on WhatsApp.
1. Ask which plan they are interested in (daily, weekly or monthly).
2. Answer questions about the menu and prices.
3. If they are interested, offer to send the order link on WhatsApp.
Speak in Hinglish if they reply in Hindi.`;

type ChatTurn = { role: 'user' | 'assistant'; content: string; handoff?: boolean };

const TEST_SUGGESTIONS = [
  'Hi',
  'What are your timings?',
  'Are you open now?',
  'Do you deliver?',
  'I want to talk to someone',
];

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
        <SettingsPanelHead icon={Bot} title="AI chatbot" />
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
  const kbPct = Math.min(100, Math.round((settings.knowledge_base.length / KNOWLEDGE_BASE_MAX) * 100));

  const toggle = (checked: boolean) => {
    const next = { ...settings, enabled: checked };
    setSettings(next);
    void save(next);
  };

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        icon={Bot}
        title="AI chatbot"
        description="Let AI chat with customers on WhatsApp using your own information. It answers from the knowledge below, stays quiet while your team is chatting, and hands the chat to a person only when the customer asks for one."
      />

      {!aiConfigured && (
        <p className="flex items-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <Zap className="size-4 shrink-0" />
          <span>
            The server has no AI key yet. Set <code>GEMINI_KEY</code> in your hosting environment variables, then redeploy.
          </span>
        </p>
      )}

      {/* Status card */}
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-4 rounded-3xl border p-5 shadow-sm transition-colors sm:p-6',
          settings.enabled
            ? 'border-primary-soft-2 bg-gradient-to-r from-primary-soft via-card to-card'
            : 'border-border bg-card',
        )}
      >
        <div className="flex items-center gap-4">
          <IconChip icon={Sparkles} tone={settings.enabled ? 'solid' : 'muted'} className="size-14 rounded-2xl" />
          <div>
            <p className="flex items-center gap-2 text-lg font-bold tracking-tight text-foreground">
              {settings.bot_name || 'Assistant'} is {settings.enabled ? 'live' : 'paused'}
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wide uppercase',
                  settings.enabled ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                )}
              >
                {settings.enabled ? 'On' : 'Off'}
              </span>
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {settings.enabled
                ? 'Answering customers on WhatsApp from your knowledge base.'
                : 'Turn it on when your knowledge base is ready. Test it first on the right.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Label htmlFor="ai-enabled" className="text-sm font-medium">
            {settings.enabled ? 'Turn off' : 'Turn on'}
          </Label>
          <Switch id="ai-enabled" checked={settings.enabled} disabled={readOnly || saving} onCheckedChange={toggle} />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          {/* Knowledge base */}
          <Card>
            <CardContent className="space-y-4">
              <SectionTitle
                icon={BookOpen}
                title="Knowledge base"
                subtitle="Menu, prices, timings, delivery area, offers, policies, FAQs."
              />
              <Textarea
                value={settings.knowledge_base}
                onChange={(e) => update({ knowledge_base: e.target.value })}
                placeholder={KB_PLACEHOLDER}
                maxLength={KNOWLEDGE_BASE_MAX}
                rows={14}
                disabled={readOnly}
                className="font-mono text-[13px]"
              />
              <div className="space-y-1.5">
                <div className="h-2 overflow-hidden rounded-full bg-border">
                  <div
                    className={cn('h-full rounded-full transition-all', kbPct >= 90 ? 'bg-amber-500' : 'bg-primary')}
                    style={{ width: `${kbPct}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {settings.knowledge_base.length.toLocaleString()} / {KNOWLEDGE_BASE_MAX.toLocaleString()} characters
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Personality */}
          <Card>
            <CardContent className="space-y-4">
              <SectionTitle icon={Smile} title="Personality" subtitle="How the bot introduces itself and how it should sound." />
              <div className="grid gap-4 sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
                <Field label="Bot name">
                  <Input
                    value={settings.bot_name}
                    onChange={(e) => update({ bot_name: e.target.value })}
                    maxLength={60}
                    disabled={readOnly}
                  />
                </Field>
                <Field
                  label="Rules & tone (optional)"
                  hint={'e.g. "Reply in Hinglish. Always share the website for orders. Never give discounts."'}
                >
                  <Textarea
                    value={settings.instructions}
                    onChange={(e) => update({ instructions: e.target.value })}
                    maxLength={INSTRUCTIONS_MAX}
                    rows={3}
                    disabled={readOnly}
                  />
                </Field>
              </div>
            </CardContent>
          </Card>

          {/* Hand-off */}
          <Card>
            <CardContent className="space-y-4">
              <SectionTitle
                icon={UserRound}
                title="Hand-off to your team"
                subtitle="When and how the bot steps aside for a human."
              />
              <div className="grid gap-4 sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
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
              </div>
            </CardContent>
          </Card>

          {/* AI calls */}
          <Card>
            <CardContent className="space-y-4">
              <SectionTitle
                icon={PhoneCall}
                title="AI calls"
                subtitle="The AI voice agent for WhatsApp calls: calls you start with AI call, and incoming calls if you switch that on. It uses the knowledge base and name above."
              />
              <Field
                label="Call goal and script (calls you start)"
                hint="The AI says it is an AI assistant, may hang up when the call is done, and asks you to take over when the customer wants a person. AI calls are capped at 10 minutes."
              >
                <Textarea
                  value={settings.voice_instructions}
                  onChange={(e) => update({ voice_instructions: e.target.value })}
                  placeholder={VOICE_PLACEHOLDER}
                  maxLength={VOICE_INSTRUCTIONS_MAX}
                  rows={7}
                  disabled={readOnly}
                />
              </Field>
              <div className="space-y-4 rounded-2xl border border-border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-foreground">AI answers incoming calls</p>
                    <p className="text-xs text-muted-foreground">
                      When a customer calls and nobody picks up, the AI answers. It only works while someone has this
                      dashboard open in a browser (for example the counter computer); click the page once after opening
                      it so the AI can speak.
                    </p>
                  </div>
                  <Switch
                    checked={settings.voice_inbound_enabled}
                    onCheckedChange={(checked) => update({ voice_inbound_enabled: checked })}
                    disabled={readOnly}
                    aria-label="AI answers incoming calls"
                  />
                </div>
                {settings.voice_inbound_enabled && (
                  <div className="grid gap-4 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
                    <Field label="Ring for your team first (seconds)">
                      <Input
                        type="number"
                        min={0}
                        max={30}
                        value={settings.voice_inbound_delay_seconds}
                        onChange={(e) => update({ voice_inbound_delay_seconds: Number(e.target.value) })}
                        disabled={readOnly}
                      />
                    </Field>
                    <Field
                      label="What the AI should do on incoming calls"
                      hint="Empty: answer questions from the knowledge base and take a message for the team."
                    >
                      <Textarea
                        value={settings.voice_inbound_instructions}
                        onChange={(e) => update({ voice_inbound_instructions: e.target.value })}
                        placeholder={'e.g. Answer questions about plans and prices. If they want a demo, take their name, restaurant name and a good time, and say the team will confirm on WhatsApp.'}
                        maxLength={VOICE_INSTRUCTIONS_MAX}
                        rows={4}
                        disabled={readOnly}
                      />
                    </Field>
                  </div>
                )}
              </div>
              <div className="grid gap-2 sm:max-w-xs">
                <Label className="text-sm">Voice</Label>
                <select
                  value={settings.voice_name}
                  onChange={(e) => update({ voice_name: e.target.value })}
                  disabled={readOnly}
                  className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {VOICE_NAMES.map((v) => (
                    <option key={v} value={v}>
                      {v || 'Default voice'}
                    </option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>

          {/* How it works */}
          <Card>
            <CardContent className="space-y-4">
              <SectionTitle icon={Lightbulb} title="Good to know" subtitle="How the bot behaves behind the scenes." />
              <ul className="grid gap-3 md:grid-cols-2">
                {HOW_IT_WORKS.map((text) => (
                  <li key={text} className="flex gap-3 rounded-2xl bg-muted/50 p-3.5 text-xs leading-relaxed text-muted-foreground">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                      <Check className="size-3" />
                    </span>
                    {text}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {!readOnly && (
          <div className="xl:sticky xl:top-0 xl:self-start">
            <TestChat settings={settings} />
          </div>
        )}
      </div>

      {/* Floating save bar */}
      {!readOnly && dirty && (
        <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-2xl border border-primary-soft-2 bg-card/95 px-5 py-3 shadow-xl backdrop-blur">
          <span className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-300">
            <span className="size-2 animate-pulse rounded-full bg-amber-500" />
            You have unsaved changes
          </span>
          <Button onClick={() => void save()} disabled={saving} className="rounded-xl shadow-md shadow-primary/25">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save changes
          </Button>
        </div>
      )}
    </div>
  );
}

const HOW_IT_WORKS = [
  'Flows always go first — the bot only answers messages no active flow handled.',
  'It waits a few seconds before replying, so several quick messages get one answer, and it stays quiet if an automation or teammate already replied.',
  'It knows the current date and time, so it can answer "are you open now?" from your timings.',
  "For photos and voice notes it asks the customer to type, or hands payment proofs and complaints to your team. It doesn't reply to button taps or chats assigned to someone.",
  'After handing a chat to your team it waits 2 hours; if nobody replied by then, it starts answering again. Setting the chat to Open resumes it right away.',
  'Lines with [square brackets] are treated as not filled in — replace them with real details.',
];

function SectionTitle({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <IconChip icon={Icon} className="size-11 shrink-0 rounded-2xl" />
      <div>
        <h3 className="text-base font-bold tracking-tight text-foreground">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
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

  async function ask(override?: string) {
    const text = (override ?? draft).trim();
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
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-base font-bold tracking-tight">
            <span className="flex size-8 items-center justify-center rounded-2xl bg-primary-soft text-primary"><Bot className="size-4" /></span>
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
        <div className="h-[340px] overflow-y-auto rounded-2xl border border-border bg-primary-soft/50 p-3">
          <div className="flex flex-col gap-2">
            {turns.length === 0 && (
              <div className="m-auto flex flex-col items-center gap-2 pt-16 text-center">
                <p className="text-xs text-muted-foreground">Try a question, or tap one:</p>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {TEST_SUGGESTIONS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => void ask(q)}
                      disabled={busy}
                      className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm hover:border-primary hover:text-primary"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className={cn('flex flex-col', t.role === 'user' ? 'items-end' : 'items-start')}>
                <div
                  className={cn(
                    'max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm shadow-sm',
                    t.role === 'user' ? 'rounded-tr-sm bg-primary text-primary-foreground' : 'rounded-tl-sm bg-card text-foreground',
                  )}
                >
                  {t.content}
                </div>
                {t.handoff && (
                  <span className="mt-1 text-[11px] text-amber-600">→ would hand this chat to your team</span>
                )}
              </div>
            ))}
            {busy && <div className="text-xs text-muted-foreground">typing…</div>}
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
