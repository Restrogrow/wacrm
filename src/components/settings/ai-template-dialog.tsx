'use client';

// ============================================================
// AiTemplateDialog — "Create with AI" in Settings → Templates.
//
// The customer pastes the message they want to send. Gemini turns it
// into a full template (name, category, language, header, body with
// variables + samples, footer, buttons), asking a few questions first
// if something essential is missing. The customer reviews the result
// and either submits it to Meta for approval or opens it in the full
// editor to tweak.
// ============================================================

import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Pencil, Send, Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { TemplatePayload } from '@/lib/whatsapp/template-validators';

type Step = 'message' | 'questions' | 'review';

/** Fill {{n}} with the sample values for the preview. */
function fillSamples(text: string, samples: string[] | undefined): string {
  return text.replace(/\{\{(\d+)\}\}/g, (m, n) => samples?.[Number(n) - 1] || m);
}

export function AiTemplateDialog({
  open,
  onOpenChange,
  onEdit,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Open the draft in the full template editor. */
  onEdit: (draft: TemplatePayload) => void;
  /** Called after the draft was submitted to Meta. */
  onSubmitted: (dryRun: boolean) => void;
}) {
  const [step, setStep] = useState<Step>('message');
  const [message, setMessage] = useState('');
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [draft, setDraft] = useState<TemplatePayload | null>(null);
  const [summary, setSummary] = useState('');
  const [working, setWorking] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setStep('message');
    setMessage('');
    setQuestions([]);
    setAnswers([]);
    setDraft(null);
    setSummary('');
    setWorking(false);
    setSubmitting(false);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  async function generate(withAnswers: boolean) {
    if (!message.trim()) {
      toast.error('Paste the message you want to send');
      return;
    }
    setWorking(true);
    try {
      const res = await fetch('/api/whatsapp/templates/ai-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          answers: withAnswers
            ? questions.map((question, i) => ({ question, answer: answers[i] ?? '' }))
            : [],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'The AI could not create a template');
        return;
      }
      if (data.status === 'needs_info') {
        setQuestions(data.questions);
        setAnswers(data.questions.map(() => ''));
        setStep('questions');
      } else {
        setDraft(data.draft);
        setSummary(data.summary ?? '');
        setStep('review');
      }
    } catch {
      toast.error('Could not reach the server');
    } finally {
      setWorking(false);
    }
  }

  async function submit() {
    if (!draft) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/whatsapp/templates/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || `Submit failed (HTTP ${res.status})`);
        return;
      }
      onSubmitted(!!data.dry_run);
      close();
    } catch {
      toast.error('Could not reach the server');
    } finally {
      setSubmitting(false);
    }
  }

  const samples = draft?.sample_values;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="bg-popover border-border max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground flex items-center gap-2">
            <Sparkles className="text-primary size-5" />
            Create template with AI
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {step === 'message' &&
              'Paste the message you want to send. AI sets up the name, category, language, variables and buttons, ready for Meta approval.'}
            {step === 'questions' && 'A few details are missing. Answer what you can, then continue.'}
            {step === 'review' && 'Check the template, then submit it to Meta for approval.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'message' && (
          <div className="space-y-1.5">
            <Label htmlFor="ai-template-message" className="text-muted-foreground">
              Your message
            </Label>
            <Textarea
              id="ai-template-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={7}
              maxLength={3000}
              placeholder={
                'e.g. Hi Priya, your order #4521 from Spice Garden is out for delivery and will reach you by 7:30 PM. Track it here: https://spicegarden.in/track'
              }
            />
            <p className="text-muted-foreground text-xs">
              Write it as you would send it to one customer. AI turns names, dates and codes into variables.
            </p>
          </div>
        )}

        {step === 'questions' && (
          <div className="space-y-4">
            {questions.map((q, i) => (
              <div key={q} className="space-y-1.5">
                <Label htmlFor={`ai-q-${i}`} className="text-foreground">
                  {q}
                </Label>
                <Input
                  id={`ai-q-${i}`}
                  value={answers[i] ?? ''}
                  onChange={(e) =>
                    setAnswers((prev) => prev.map((a, j) => (j === i ? e.target.value : a)))
                  }
                  placeholder="Leave blank to let AI decide"
                />
              </div>
            ))}
          </div>
        )}

        {step === 'review' && draft && (
          <div className="space-y-4">
            {summary ? <p className="text-muted-foreground text-sm">{summary}</p> : null}

            <div className="flex flex-wrap gap-2 text-xs">
              <Badge className="border-border bg-muted text-foreground font-mono">{draft.name}</Badge>
              <Badge className="border-border bg-muted text-foreground">{draft.category}</Badge>
              <Badge className="border-border bg-muted text-foreground">{draft.language}</Badge>
            </div>

            {/* WhatsApp-style preview with sample values filled in */}
            <div className="rounded-2xl bg-[#0b141a] p-4">
              <div className="max-w-[85%] rounded-2xl rounded-tl-none bg-[#202c33] p-3 text-sm text-[#e9edef] shadow">
                {draft.header_type === 'text' && draft.header_content ? (
                  <p className="mb-1 font-semibold">{fillSamples(draft.header_content, samples?.header)}</p>
                ) : null}
                {draft.header_type && draft.header_type !== 'text' ? (
                  <p className="mb-2 rounded bg-black/30 px-2 py-6 text-center text-xs text-[#8696a0] uppercase">
                    {draft.header_type}
                  </p>
                ) : null}
                <p className="whitespace-pre-wrap">{fillSamples(draft.body_text, samples?.body)}</p>
                {draft.footer_text ? <p className="mt-1 text-xs text-[#8696a0]">{draft.footer_text}</p> : null}
              </div>
              {draft.buttons?.length ? (
                <div className="mt-1 flex max-w-[85%] flex-col gap-1">
                  {draft.buttons.map((b, i) => (
                    <div
                      key={i}
                      className="rounded-2xl bg-[#202c33] py-2 text-center text-sm text-[#53bdeb]"
                    >
                      {b.text}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="space-y-1">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Template text</p>
              <p className="border-border text-foreground rounded-xl border p-3 font-mono text-xs whitespace-pre-wrap">
                {draft.body_text}
              </p>
              {samples?.body?.length ? (
                <p className="text-muted-foreground text-xs">
                  Samples for Meta:{' '}
                  {samples.body.map((s, i) => (
                    <span key={i}>
                      {i > 0 ? ', ' : ''}
                      <code>{`{{${i + 1}}}`}</code> = {s}
                    </span>
                  ))}
                </p>
              ) : null}
            </div>
          </div>
        )}

        <DialogFooter className="bg-popover border-border gap-2">
          {step === 'message' && (
            <>
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button onClick={() => generate(false)} disabled={working || !message.trim()}>
                {working ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {working ? 'Creating…' : 'Create template'}
              </Button>
            </>
          )}
          {step === 'questions' && (
            <>
              <Button variant="outline" onClick={() => setStep('message')} disabled={working}>
                <ArrowLeft className="size-4" />
                Back
              </Button>
              <Button onClick={() => generate(true)} disabled={working}>
                {working ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {working ? 'Creating…' : 'Continue'}
              </Button>
            </>
          )}
          {step === 'review' && draft && (
            <>
              <Button variant="outline" onClick={() => setStep('message')} disabled={submitting}>
                <ArrowLeft className="size-4" />
                Start over
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  onEdit(draft);
                  close();
                }}
                disabled={submitting}
              >
                <Pencil className="size-4" />
                Edit details
              </Button>
              <Button onClick={submit} disabled={submitting}>
                {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                {submitting ? 'Submitting…' : 'Submit for approval'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
