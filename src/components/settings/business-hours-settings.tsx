'use client';

// ============================================================
// BusinessHoursSettings — Settings → Business hours
//
// Weekly opening hours, welcome / away auto-replies and the
// first-response (SLA) target. Everyone on the account can read it;
// admins and above can change it (RLS in migration 066 enforces the
// same). Saved straight to `business_hours_settings`.
// ============================================================

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlarmClock, Clock, Loader2, Plus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import {
  DATE_RE,
  DAY_KEYS,
  DAY_LABELS,
  DEFAULT_SETTINGS,
  isOpenNow,
  rowToSettings,
  validateSettings,
  type BusinessHoursSettings,
} from '@/lib/business-hours/hours';
import { SettingsPanelHead } from './settings-panel-head';

const COMMON_TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Dhaka',
  'Asia/Karachi',
  'Asia/Colombo',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'Australia/Sydney',
  'UTC',
];

function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-foreground text-sm font-semibold">{label}</p>
        {hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
    </div>
  );
}

export function BusinessHoursPanel() {
  const { accountId, user, canEditSettings } = useAuth();
  const [s, setS] = useState<BusinessHoursSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [holidayDraft, setHolidayDraft] = useState('');

  useEffect(() => {
    let cancelled = false;
    void createClient()
      .from('business_hours_settings')
      .select('*')
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error && /business_hours_settings/.test(error.message)) {
          setMissing(true);
        } else {
          setS(rowToSettings(data));
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const patch = (p: Partial<BusinessHoursSettings>) => setS((prev) => ({ ...prev, ...p }));

  function addHoliday() {
    const d = holidayDraft.trim();
    if (!DATE_RE.test(d)) {
      toast.error('Pick a date first');
      return;
    }
    if (!s.holidays.includes(d)) patch({ holidays: [...s.holidays, d].sort() });
    setHolidayDraft('');
  }

  async function save() {
    if (!accountId) return;
    const check = validateSettings(s);
    if (!check.ok) {
      toast.error(check.error);
      return;
    }
    setSaving(true);
    try {
      const { error } = await createClient()
        .from('business_hours_settings')
        .upsert(
          {
            account_id: accountId,
            ...s,
            updated_by: user?.id ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'account_id' },
        );
      if (error) {
        toast.error('Could not save. Only admins can change these settings.');
        return;
      }
      toast.success('Saved');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="text-primary size-6 animate-spin" />
      </div>
    );
  }

  if (missing) {
    return (
      <section className="space-y-6">
        <SettingsPanelHead icon={Clock} title="Business hours" />
        <Card>
          <CardContent className="text-muted-foreground py-6 text-sm">
            Business hours aren&apos;t set up yet. Run
            supabase/migrations/066_business_hours_sla.sql in the Supabase SQL Editor.
          </CardContent>
        </Card>
      </section>
    );
  }

  const readOnly = !canEditSettings;
  const openNow = isOpenNow(s);

  return (
    <section className="animate-in fade-in-50 space-y-6 duration-200">
      <SettingsPanelHead
        icon={Clock}
        title="Business hours"
        description="Set when your team is available, reply automatically when it isn't, and get alerted when a customer waits too long."
        action={
          canEditSettings ? (
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Save changes
            </Button>
          ) : null
        }
      />

      {readOnly && (
        <p className="text-muted-foreground text-sm">Only admins can change these settings.</p>
      )}

      {/* ---------------- opening hours ---------------- */}
      <Card>
        <CardContent className="space-y-5">
          <Toggle
            label="Use business hours"
            hint={
              s.enabled
                ? `Right now you are ${openNow ? 'open' : 'closed'} (${s.timezone}).`
                : 'Off: you count as always open, so no away message is sent.'
            }
            checked={s.enabled}
            onChange={(enabled) => patch({ enabled })}
            disabled={readOnly}
          />

          <div className={s.enabled ? 'space-y-5' : 'pointer-events-none space-y-5 opacity-50'}>
            <div className="max-w-xs space-y-1.5">
              <Label htmlFor="bh-tz" className="text-muted-foreground text-xs">
                Timezone
              </Label>
              <Input
                id="bh-tz"
                list="bh-timezones"
                value={s.timezone}
                onChange={(e) => patch({ timezone: e.target.value })}
                disabled={readOnly}
              />
              <datalist id="bh-timezones">
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz} />
                ))}
              </datalist>
            </div>

            <div className="space-y-2">
              {DAY_KEYS.slice(1)
                .concat(DAY_KEYS[0])
                .map((day) => {
                  const dh = s.weekly[day];
                  const set = (p: Partial<typeof dh>) =>
                    patch({ weekly: { ...s.weekly, [day]: { ...dh, ...p } } });
                  return (
                    <div key={day} className="flex flex-wrap items-center gap-3">
                      <div className="flex w-36 items-center gap-3">
                        <Switch
                          checked={dh.open}
                          onCheckedChange={(open) => set({ open })}
                          disabled={readOnly}
                          aria-label={`${DAY_LABELS[day]} open`}
                        />
                        <span className="text-sm font-medium">{DAY_LABELS[day]}</span>
                      </div>
                      {dh.open ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type="time"
                            value={dh.start}
                            onChange={(e) => set({ start: e.target.value })}
                            className="w-32"
                            disabled={readOnly}
                            aria-label={`${DAY_LABELS[day]} opens`}
                          />
                          <span className="text-muted-foreground text-sm">to</span>
                          <Input
                            type="time"
                            value={dh.end}
                            onChange={(e) => set({ end: e.target.value })}
                            className="w-32"
                            disabled={readOnly}
                            aria-label={`${DAY_LABELS[day]} closes`}
                          />
                          {dh.start > dh.end && (
                            <span className="text-muted-foreground text-xs">runs past midnight</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">Closed</span>
                      )}
                    </div>
                  );
                })}
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">Holidays (closed all day)</Label>
              <div className="flex flex-wrap gap-2">
                {s.holidays.map((h) => (
                  <span
                    key={h}
                    className="bg-muted inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs"
                  >
                    {h}
                    {!readOnly && (
                      <button
                        type="button"
                        aria-label={`Remove ${h}`}
                        onClick={() => patch({ holidays: s.holidays.filter((x) => x !== h) })}
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </span>
                ))}
                {s.holidays.length === 0 && (
                  <span className="text-muted-foreground text-xs">None added.</span>
                )}
              </div>
              {!readOnly && (
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={holidayDraft}
                    onChange={(e) => setHolidayDraft(e.target.value)}
                    className="w-44"
                    aria-label="Holiday date"
                  />
                  <Button type="button" variant="outline" onClick={addHoliday}>
                    <Plus className="size-4" />
                    Add
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---------------- auto-replies ---------------- */}
      <Card>
        <CardContent className="space-y-5">
          <h3 className="text-foreground text-base font-bold tracking-tight">Automatic replies</h3>
          <p className="text-muted-foreground -mt-3 text-xs">
            Sent as normal chat messages (not templates) the moment a customer writes in. Use{' '}
            <code>{'{{name}}'}</code> for their first name. Nothing is sent to contacts who opted out,
            or when a flow or the STOP keyword already handled the message.
          </p>

          <div className="space-y-3">
            <Toggle
              label="Welcome message"
              hint="Sent once, when a customer's first message starts a conversation."
              checked={s.welcome_enabled}
              onChange={(welcome_enabled) => patch({ welcome_enabled })}
              disabled={readOnly}
            />
            <Textarea
              value={s.welcome_message}
              onChange={(e) => patch({ welcome_message: e.target.value })}
              rows={3}
              maxLength={1000}
              disabled={readOnly || !s.welcome_enabled}
              aria-label="Welcome message"
            />
          </div>

          <div className="space-y-3">
            <Toggle
              label="Away message"
              hint={
                s.enabled
                  ? 'Sent when someone writes outside your business hours.'
                  : 'Turn on "Use business hours" above for this to work.'
              }
              checked={s.away_enabled}
              onChange={(away_enabled) => patch({ away_enabled })}
              disabled={readOnly}
            />
            <Textarea
              value={s.away_message}
              onChange={(e) => patch({ away_message: e.target.value })}
              rows={3}
              maxLength={1000}
              disabled={readOnly || !s.away_enabled}
              aria-label="Away message"
            />
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Send at most once every</span>
              <Input
                type="number"
                min={1}
                max={168}
                value={s.away_cooldown_hours}
                onChange={(e) => patch({ away_cooldown_hours: Number(e.target.value) })}
                className="w-20"
                disabled={readOnly || !s.away_enabled}
                aria-label="Away message cooldown in hours"
              />
              <span className="text-muted-foreground">hours per chat</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---------------- SLA ---------------- */}
      <Card>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-2">
            <AlarmClock className="text-primary size-5" />
            <h3 className="text-foreground text-base font-bold tracking-tight">Reply-time alert (SLA)</h3>
          </div>
          <Toggle
            label="Alert me when a customer waits too long"
            hint="If nobody on your team replies in time, the assigned agent (or all admins, if the chat is unassigned) gets a notification and the chat shows an “SLA breached” badge. Auto-replies and bot messages don't count as a reply."
            checked={s.sla_enabled}
            onChange={(sla_enabled) => patch({ sla_enabled })}
            disabled={readOnly}
          />
          <div className={s.sla_enabled ? 'space-y-4' : 'pointer-events-none space-y-4 opacity-50'}>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">First reply target</span>
              <Input
                type="number"
                min={1}
                max={1440}
                value={s.sla_first_response_minutes}
                onChange={(e) => patch({ sla_first_response_minutes: Number(e.target.value) })}
                className="w-24"
                disabled={readOnly}
                aria-label="First reply target in minutes"
              />
              <span className="text-muted-foreground">minutes</span>
            </div>
            <Toggle
              label="Only count business hours"
              hint="The clock pauses while you are closed. Needs “Use business hours” above."
              checked={s.sla_business_hours_only}
              onChange={(sla_business_hours_only) => patch({ sla_business_hours_only })}
              disabled={readOnly || !s.enabled}
            />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
