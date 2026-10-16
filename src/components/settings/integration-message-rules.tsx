'use client';

// ============================================================
// Shared pieces for integration settings (Shopify, Calendly, …):
// pick an approved WhatsApp template per event, map each body {{n}}
// to an integration variable, preview it, send a test — plus the
// "Recent messages" activity list.
// ============================================================

import { IconChip } from '@/components/icon-chip';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Clock, Loader2, MessageSquare, Send, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createClient } from '@/lib/supabase/client';

export interface TemplateOption {
  name: string;
  language: string;
  category: string;
  body_text: string;
}

export interface MessageRule {
  enabled: boolean;
  template_name: string | null;
  template_language: string | null;
  body_variables: string[];
}

export interface VariableOption {
  key: string;
  label: string;
  example: string;
}

export const templateKey = (name: string | null, language: string | null) =>
  name ? `${name}::${language || 'en_US'}` : '';

/** Highest {{n}} in a template body = number of body variables. */
export function countTemplateVariables(
  bodyText: string | null | undefined
): number {
  let max = 0;
  for (const match of (bodyText ?? '').matchAll(/\{\{\s*(\d+)\s*\}\}/g)) {
    max = Math.max(max, Number(match[1]));
  }
  return max;
}

/** The account's Meta-approved templates (RLS scopes them to the account). */
export function useApprovedTemplates(): TemplateOption[] {
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  useEffect(() => {
    void (async () => {
      const { data } = await createClient()
        .from('message_templates')
        .select('name, language, category, body_text')
        .eq('status', 'APPROVED')
        .order('name');
      setTemplates((data ?? []) as TemplateOption[]);
    })();
  }, []);
  return templates;
}

export function MessageRulesEditor<E extends string, R extends MessageRule>({
  events,
  meta,
  variables,
  rules,
  templates,
  readOnly,
  canTest,
  testingEvent,
  onChange,
  onTest,
  renderExtra,
  icons,
}: {
  events: readonly E[];
  meta: Record<E, { label: string; description: string }>;
  variables: VariableOption[];
  rules: Record<E, R>;
  templates: TemplateOption[];
  readOnly: boolean;
  /** Show "Send test" (store connected and the user may edit). */
  canTest: boolean;
  testingEvent: E | null;
  onChange: (event: E, patch: Partial<R>) => void;
  onTest: (event: E) => void;
  /** Extra per-event fields, e.g. a delay input. */
  renderExtra?: (event: E, rule: R) => ReactNode;
  /** Optional icon per event, shown in the card header. */
  icons?: Partial<Record<E, LucideIcon>>;
}) {
  const templateByKey = useMemo(
    () => new Map(templates.map((t) => [templateKey(t.name, t.language), t])),
    [templates]
  );

  return (
    <div className="space-y-4">
      {templates.length === 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm text-muted-foreground">
          <Clock className="size-4 shrink-0 text-amber-500" />
          You don&apos;t have any approved templates yet — create one in Templates and wait for Meta approval.
        </div>
      )}
      {events.map((event) => {
        const rule = rules[event];
        const info = meta[event];
        const template = templateByKey.get(
          templateKey(rule.template_name, rule.template_language)
        );
        const varCount = countTemplateVariables(template?.body_text);
        const preview = template?.body_text.replace(
          /\{\{\s*(\d+)\s*\}\}/g,
          (_m, n) => {
            const key = rule.body_variables[Number(n) - 1];
            return variables.find((v) => v.key === key)?.example ?? `{{${n}}}`;
          }
        );
        const extra = renderExtra?.(event, rule);
        const EventIcon = icons?.[event] ?? MessageSquare;

        return (
          <Card
            key={event}
            className={cn(
              'transition-all',
              rule.enabled ? 'ring-primary/30 shadow-md' : 'opacity-95',
            )}
          >
            <CardContent className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={cn(
                      'flex size-11 shrink-0 items-center justify-center rounded-2xl transition-colors',
                      rule.enabled
                        ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <EventIcon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-foreground flex items-center gap-2 text-base font-bold tracking-tight">
                      {info.label}
                      {rule.enabled && (
                        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-semibold tracking-wide text-primary uppercase">
                          On
                        </span>
                      )}
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                      {info.description}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={rule.enabled}
                  disabled={readOnly}
                  onCheckedChange={(checked) =>
                    onChange(event, { enabled: checked } as Partial<R>)
                  }
                  aria-label={`Send ${info.label} message`}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Label className="text-muted-foreground text-xs">
                    Template
                  </Label>
                  <Select
                    value={templateKey(
                      rule.template_name,
                      rule.template_language
                    )}
                    onValueChange={(value) => {
                      const t = templateByKey.get(value ?? '');
                      onChange(event, {
                        template_name: t?.name ?? null,
                        template_language: t?.language ?? null,
                        body_variables: Array.from(
                          { length: countTemplateVariables(t?.body_text) },
                          (_, i) =>
                            rule.body_variables[i] ??
                            variables[i]?.key ??
                            variables[0]?.key ??
                            ''
                        ),
                      } as Partial<R>);
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
                {extra}
              </div>

              {varCount > 0 && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {Array.from({ length: varCount }, (_, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-muted-foreground w-10 shrink-0 font-mono text-xs">
                        {`{{${i + 1}}}`}
                      </span>
                      <Select
                        value={rule.body_variables[i] ?? ''}
                        onValueChange={(value) => {
                          const vars = [...rule.body_variables];
                          vars[i] = value ?? variables[0]?.key ?? '';
                          onChange(event, {
                            body_variables: vars,
                          } as Partial<R>);
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

              {preview && (
                <div className="rounded-2xl bg-primary-soft/50 p-3">
                  <p className="text-muted-foreground mb-1.5 text-[10px] font-semibold tracking-wider uppercase">
                    Customer sees
                  </p>
                  <p className="bg-card text-foreground max-w-md rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm whitespace-pre-wrap shadow-sm">
                    {preview}
                  </p>
                </div>
              )}

              {canTest && rule.template_name && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onTest(event)}
                  disabled={testingEvent === event}
                >
                  {testingEvent === event ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  Send test
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export interface ActivityItem {
  id: string;
  status: 'received' | 'sent' | 'skipped' | 'failed';
  label: string;
  phone: string | null;
  detail: string | null;
  created_at: string;
}

export function fmtActivityTime(iso: string | null): string {
  if (!iso) return 'never';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function IntegrationActivity({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="text-foreground mb-3 flex items-center gap-2 text-base font-bold tracking-tight">
        <IconChip icon={Clock} className="size-9 rounded-xl" />
        Recent messages
      </h3>
      <Card>
        <CardContent className="p-2">
          <ul className="divide-border divide-y">
            {items.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-1 rounded-2xl px-4 py-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:gap-3"
              >
                <Badge
                  variant={
                    row.status === 'sent'
                      ? 'default'
                      : row.status === 'failed'
                        ? 'destructive'
                        : 'outline'
                  }
                  className="w-fit"
                >
                  {row.status}
                </Badge>
                <span className="text-foreground text-sm">{row.label}</span>
                <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
                  {row.phone ? `+${row.phone}` : ''}
                  {row.detail ? ` — ${row.detail}` : ''}
                </span>
                <span className="text-muted-foreground text-xs">
                  {fmtActivityTime(row.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
