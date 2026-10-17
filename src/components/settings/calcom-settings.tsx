'use client';

// CalComSettings - Integrations -> Cal.com. Thin wrapper over the shared
// webhook panel, plus the phone question and booking host settings.
// API: /api/integrations/calcom.

import { useState } from 'react';
import { toast } from 'sonner';
import { Bell, BellRing, CalendarCheck, CalendarClock, CalendarX, Repeat, type LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CALCOM_TRIGGERS } from '@/lib/calcom/config';
import {
  CALCOM_EVENTS,
  CALCOM_EVENT_META,
  CALCOM_VARIABLES,
  type CalComEvent,
} from '@/lib/calcom/events';
import { WebhookIntegrationPanel, type PanelConnection } from './webhook-integration-panel';

const EVENT_ICONS: Partial<Record<CalComEvent, LucideIcon>> = {
  booking_confirmed: CalendarCheck,
  booking_rescheduled: Repeat,
  reminder_24h: Bell,
  reminder_1h: BellRing,
  booking_cancelled: CalendarX,
};

function CalComExtra({
  connection,
  readOnly,
  reload,
}: {
  connection: PanelConnection;
  readOnly: boolean;
  reload: () => Promise<void>;
}) {
  const [phoneField, setPhoneField] = useState((connection.phone_field as string | null) ?? '');
  const [host, setHost] = useState((connection.booking_page as string | undefined) ?? 'https://cal.com');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/integrations/calcom', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_field: phoneField, booking_page: host }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(json.error ?? 'Could not save');
      else {
        toast.success('Saved');
        await reload();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label className="text-muted-foreground text-xs">Cal.com address (for reschedule and cancel links)</Label>
        <Input value={host} onChange={(e) => setHost(e.target.value)} disabled={readOnly} placeholder="https://cal.com" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-muted-foreground text-xs">Phone question name (optional)</Label>
        <Input
          value={phoneField}
          onChange={(e) => setPhoneField(e.target.value)}
          disabled={readOnly}
          placeholder="attendeePhoneNumber"
        />
      </div>
      {!readOnly && (
        <div className="sm:col-span-2">
          <p className="text-muted-foreground mb-2 text-xs">
            Add a <b>Phone number</b> question to your Cal.com event type so we know where to send WhatsApp
            messages. If you named it something custom, type that field name here.
          </p>
          <Button variant="outline" size="sm" onClick={save} disabled={saving}>
            Save
          </Button>
        </div>
      )}
    </div>
  );
}

export function CalComSettings() {
  return (
    <WebhookIntegrationPanel<CalComEvent>
      apiBase="/api/integrations/calcom"
      name="Cal.com"
      icon={CalendarClock}
      description="Send booking confirmations, 24-hour and 1-hour reminders, and reschedule or cancellation messages on WhatsApp whenever someone books through Cal.com."
      connectTitle="Connect Cal.com"
      connectHelp="We create a webhook URL and a signing secret; you paste them into Cal.com. No passwords or API keys needed."
      connectButton="Get webhook URL and secret"
      secretLabel="Secret"
      connectedLabel="Cal.com"
      connectInput={{
        label: 'Cal.com address (leave as is for cal.com)',
        placeholder: 'https://cal.com',
        field: 'booking_page',
      }}
      events={CALCOM_EVENTS}
      meta={CALCOM_EVENT_META}
      variables={CALCOM_VARIABLES}
      eventIcons={EVENT_ICONS}
      triggers={CALCOM_TRIGGERS.map((t) => ({ name: t.adminName, code: t.trigger, drives: t.drives }))}
      renderExtra={(args) => <CalComExtra {...args} />}
      steps={
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            In Cal.com, open <b>Settings → Developer → Webhooks</b> and click <b>New</b>.
          </li>
          <li>
            Paste the <b>Webhook URL</b> below as the Subscriber URL, tick the three triggers listed below, and
            paste the <b>Secret</b>. Keep the payload template as default.
          </li>
          <li>
            Add a <b>Phone number</b> question to your event type so bookings include the attendee&apos;s number.
          </li>
        </ol>
      }
      activityLabel={(row) =>
        `${row.event ? (CALCOM_EVENT_META[row.event as CalComEvent]?.label ?? row.event) : row.topic}${
          row.attendee_name ? ` · ${row.attendee_name}` : ''
        }${row.topic === 'test' ? ' · test' : ''}`
      }
    />
  );
}
