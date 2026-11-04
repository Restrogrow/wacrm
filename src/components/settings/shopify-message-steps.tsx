'use client';

// ============================================================
// ShopifyMessageSteps — the "Automatic messages" editor.
//
// One card per store event, and inside each one a SEQUENCE of steps:
// "Abandoned cart → after 30 minutes, then after 7 hours, then after
// 24 hours", each with its own template, variable mapping and optional
// dynamic URL button.
//
// Deliberately NOT built into `integration-message-rules.tsx`. That
// component is shared with WooCommerce, Calendly and the generic
// webhook panel, all of which are genuinely one-template-per-event;
// threading a step list through it would complicate three features
// that don't want it to serve one that does. The small shared pieces
// (template list, variable counting, key helper) are imported from
// there, so the parts worth sharing still are.
// ============================================================

import { useMemo } from 'react';
import {
  Clock,
  MessageSquare,
  Plus,
  Send,
  Loader2,
  Link2,
  Trash2,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  countTemplateVariables,
  templateKey,
  type TemplateOption,
  type VariableOption,
} from './integration-message-rules';
import {
  URL_BUTTON_VARIABLES,
  type ShopifyEvent,
  type ShopifyVariable,
} from '@/lib/shopify/events';
import {
  DELAY_UNITS,
  MAX_STEPS_PER_EVENT,
  delayToMinutes,
  minutesToDelay,
  type DelayUnit,
} from '@/lib/shopify/steps';
import type { StepStats } from '@/app/api/integrations/shopify/stats/route';

export interface StepDraft {
  enabled: boolean;
  template_name: string | null;
  template_language: string | null;
  body_variables: ShopifyVariable[];
  delay_minutes: number;
  delay_unit: DelayUnit;
  url_button_variable: ShopifyVariable | null;
}

export function emptyStep(delayMinutes = 0): StepDraft {
  return {
    enabled: false,
    template_name: null,
    template_language: null,
    body_variables: [],
    delay_minutes: delayMinutes,
    delay_unit: delayMinutes >= 1440 ? 'days' : delayMinutes >= 60 ? 'hours' : 'minutes',
    url_button_variable: null,
  };
}

/** The URL button carrying a `{{n}}`, if the template has one. */
function dynamicUrlButton(
  buttons: unknown
): { index: number; url: string } | null {
  if (!Array.isArray(buttons)) return null;
  for (let i = 0; i < buttons.length; i++) {
    const b = buttons[i] as Record<string, unknown> | null;
    const url = String(b?.url ?? '');
    if (String(b?.type ?? '').toUpperCase() === 'URL' && /\{\{\s*\d+\s*\}\}/.test(url)) {
      return { index: i, url };
    }
  }
  return null;
}

interface Props {
  events: readonly ShopifyEvent[];
  meta: Record<ShopifyEvent, { label: string; description: string }>;
  variables: VariableOption[];
  steps: Record<ShopifyEvent, StepDraft[]>;
  templates: TemplateOption[];
  stats: StepStats[];
  readOnly: boolean;
  canTest: boolean;
  testingEvent: ShopifyEvent | null;
  onChange: (event: ShopifyEvent, index: number, patch: Partial<StepDraft>) => void;
  onAddStep: (event: ShopifyEvent) => void;
  onRemoveStep: (event: ShopifyEvent, index: number) => void;
  onTest: (event: ShopifyEvent) => void;
  icons?: Partial<Record<ShopifyEvent, LucideIcon>>;
}

export function ShopifyMessageSteps({
  events,
  meta,
  variables,
  steps,
  templates,
  stats,
  readOnly,
  canTest,
  testingEvent,
  onChange,
  onAddStep,
  onRemoveStep,
  onTest,
  icons,
}: Props) {
  const templateByKey = useMemo(
    () => new Map(templates.map((t) => [templateKey(t.name, t.language), t])),
    [templates]
  );
  const statByKey = useMemo(
    () => new Map(stats.map((s) => [`${s.event}:${s.step_order}`, s])),
    [stats]
  );

  return (
    <div className="space-y-4">
      {templates.length === 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm text-muted-foreground">
          <Clock className="size-4 shrink-0 text-amber-500" />
          You don&apos;t have any approved templates yet — create one in
          Templates and wait for Meta approval.
        </div>
      )}

      {events.map((event) => {
        const eventSteps = steps[event] ?? [];
        const info = meta[event];
        const EventIcon = icons?.[event] ?? MessageSquare;
        const anyOn = eventSteps.some((s) => s.enabled);

        return (
          <Card
            key={event}
            className={cn('transition-all', anyOn ? 'ring-primary/30 shadow-md' : 'opacity-95')}
          >
            <CardContent className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={cn(
                      'flex size-11 shrink-0 items-center justify-center rounded-2xl transition-colors',
                      anyOn
                        ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    <EventIcon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-foreground flex items-center gap-2 text-base font-bold tracking-tight">
                      {info.label}
                      {anyOn && (
                        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-semibold tracking-wide text-primary uppercase">
                          {eventSteps.filter((s) => s.enabled).length} step
                          {eventSteps.filter((s) => s.enabled).length === 1 ? '' : 's'}
                        </span>
                      )}
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                      {info.description}
                    </p>
                  </div>
                </div>
                {canTest && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={testingEvent !== null || !eventSteps[0]?.template_name}
                    onClick={() => onTest(event)}
                  >
                    {testingEvent === event ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    Send test
                  </Button>
                )}
              </div>

              <div className="space-y-3">
                {eventSteps.map((step, index) => (
                  <StepRow
                    key={index}
                    event={event}
                    index={index}
                    step={step}
                    total={eventSteps.length}
                    variables={variables}
                    templates={templates}
                    templateByKey={templateByKey}
                    stat={statByKey.get(`${event}:${index}`)}
                    readOnly={readOnly}
                    onChange={onChange}
                    onRemove={onRemoveStep}
                  />
                ))}
              </div>

              {!readOnly && eventSteps.length < MAX_STEPS_PER_EVENT && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onAddStep(event)}
                  className="w-full border-dashed"
                >
                  <Plus className="size-4" />
                  Add follow-up
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function StepRow({
  event,
  index,
  step,
  total,
  variables,
  templates,
  templateByKey,
  stat,
  readOnly,
  onChange,
  onRemove,
}: {
  event: ShopifyEvent;
  index: number;
  step: StepDraft;
  total: number;
  variables: VariableOption[];
  templates: TemplateOption[];
  templateByKey: Map<string, TemplateOption>;
  stat: StepStats | undefined;
  readOnly: boolean;
  onChange: (event: ShopifyEvent, index: number, patch: Partial<StepDraft>) => void;
  onRemove: (event: ShopifyEvent, index: number) => void;
}) {
  const template = templateByKey.get(
    templateKey(step.template_name, step.template_language)
  );
  const varCount = countTemplateVariables(template?.body_text);
  const urlButton = dynamicUrlButton(template?.buttons);
  const { value: delayValue, unit: delayUnit } = minutesToDelay(
    step.delay_minutes,
    step.delay_unit
  );

  const preview = template?.body_text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => {
    const key = step.body_variables[Number(n) - 1];
    return variables.find((v) => v.key === key)?.example ?? `{{${n}}}`;
  });

  return (
    <div
      className={cn(
        'rounded-2xl border p-3',
        step.enabled ? 'border-border bg-muted/30' : 'border-dashed border-border bg-transparent'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
            {index + 1}
          </span>
          <span className="text-xs font-semibold text-foreground">
            {index === 0 ? 'First message' : `Follow-up ${index}`}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {!readOnly && total > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onRemove(event, index)}
              aria-label={`Remove step ${index + 1}`}
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
          <Switch
            checked={step.enabled}
            disabled={readOnly}
            onCheckedChange={(checked) => onChange(event, index, { enabled: checked })}
            aria-label={`Send step ${index + 1}`}
          />
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label className="text-muted-foreground text-xs">Template</Label>
          <Select
            value={templateKey(step.template_name, step.template_language)}
            onValueChange={(value) => {
              const t = templateByKey.get(value ?? '');
              onChange(event, index, {
                template_name: t?.name ?? null,
                template_language: t?.language ?? null,
                body_variables: Array.from(
                  { length: countTemplateVariables(t?.body_text) },
                  (_, i) =>
                    (step.body_variables[i] ??
                      variables[i]?.key ??
                      variables[0]?.key ??
                      '') as ShopifyVariable
                ),
                // A template with no dynamic URL button can't use a
                // mapping; clear it so a stale value isn't saved.
                url_button_variable: dynamicUrlButton(t?.buttons)
                  ? step.url_button_variable
                  : null,
              });
            }}
            disabled={readOnly}
          >
            <SelectTrigger className="bg-muted w-full">
              <SelectValue placeholder="Choose a template" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem
                  key={templateKey(t.name, t.language)}
                  value={templateKey(t.name, t.language)}
                >
                  {t.name} ({t.language}) · {t.category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-muted-foreground text-xs">
            {index === 0 ? 'Send after' : 'Send after (from the event)'}
          </Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              value={delayValue}
              disabled={readOnly}
              onChange={(e) =>
                onChange(event, index, {
                  delay_minutes: delayToMinutes(Number(e.target.value) || 0, delayUnit),
                  delay_unit: delayUnit,
                })
              }
              className="bg-muted w-20"
            />
            <Select
              value={delayUnit}
              onValueChange={(value) => {
                const unit = (value ?? 'minutes') as DelayUnit;
                onChange(event, index, {
                  delay_minutes: delayToMinutes(delayValue, unit),
                  delay_unit: unit,
                });
              }}
              disabled={readOnly}
            >
              <SelectTrigger className="bg-muted w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DELAY_UNITS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-muted-foreground text-[11px]">
            {step.delay_minutes <= 0
              ? 'Sends as soon as the event happens.'
              : 'Counted from the event, not from the previous step.'}
          </p>
        </div>
      </div>

      {varCount > 0 && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {Array.from({ length: varCount }, (_, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-muted-foreground w-10 shrink-0 font-mono text-xs">
                {`{{${i + 1}}}`}
              </span>
              <Select
                value={step.body_variables[i] ?? ''}
                onValueChange={(value) => {
                  const vars = [...step.body_variables];
                  vars[i] = (value ?? variables[0]?.key ?? '') as ShopifyVariable;
                  onChange(event, index, { body_variables: vars });
                }}
                disabled={readOnly}
              >
                <SelectTrigger className="bg-muted w-full">
                  <SelectValue placeholder="Choose a value" />
                </SelectTrigger>
                <SelectContent>
                  {variables.map((v) => (
                    <SelectItem key={v.key} value={v.key}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}

      {urlButton && (
        <div className="mt-3 rounded-xl border border-border bg-background/60 p-3">
          <div className="flex items-center gap-2">
            <Link2 className="size-3.5 shrink-0 text-primary" />
            <Label className="text-xs font-semibold text-foreground">
              Button link
            </Label>
          </div>
          <p className="text-muted-foreground mt-1 text-[11px]">
            This template&apos;s button is{' '}
            <code className="font-mono">{urlButton.url}</code>. Choose what
            fills it — only the path is sent, the domain is stripped. A link on
            a different domain is skipped and logged.
          </p>
          <Select
            value={step.url_button_variable ?? ''}
            onValueChange={(value) =>
              onChange(event, index, {
                url_button_variable: (value || null) as ShopifyVariable | null,
              })
            }
            disabled={readOnly}
          >
            <SelectTrigger className="bg-muted mt-2 w-full">
              <SelectValue placeholder="Choose a link" />
            </SelectTrigger>
            <SelectContent>
              {URL_BUTTON_VARIABLES.map((key) => (
                <SelectItem key={key} value={key}>
                  {variables.find((v) => v.key === key)?.label ?? key}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {preview && (
        <p className="text-muted-foreground mt-3 rounded-xl bg-background/60 p-2 text-xs leading-relaxed whitespace-pre-wrap">
          {preview}
        </p>
      )}

      {stat && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2">
          <StatChip label="Sent" value={stat.sent} />
          <StatChip label="Delivered" value={stat.delivered} />
          <StatChip label="Read" value={stat.read} />
          {stat.queued > 0 && <StatChip label="Queued" value={stat.queued} />}
          {stat.cancelled > 0 && (
            <StatChip label="Cancelled" value={stat.cancelled} />
          )}
          {stat.skipped > 0 && <StatChip label="Skipped" value={stat.skipped} />}
          {stat.failed > 0 && <StatChip label="Failed" value={stat.failed} tone="danger" />}
          {event === 'abandoned_checkout' && (
            <StatChip
              label="Orders recovered"
              value={stat.orders_recovered}
              tone="good"
            />
          )}
        </div>
      )}
    </div>
  );
}

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'good' | 'danger';
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-[10px] font-medium',
        tone === 'good' && 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400',
        tone === 'danger' && 'border-red-500/40 text-red-600 dark:text-red-400'
      )}
    >
      {label} {value}
    </Badge>
  );
}
