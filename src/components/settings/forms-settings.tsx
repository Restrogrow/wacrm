'use client';

// ============================================================
// Settings → WhatsApp forms
//
// Build simple forms (text, email, phone, number, long text, dropdown,
// date, consent) that open inside WhatsApp (Meta Flows). Publishing
// creates the Flow on Meta; agents send it from a chat (clipboard icon
// in the chat header). Answers appear in the chat, can be saved to the
// contact's name / email / custom fields, and are listed here with a
// CSV download. API: /api/whatsapp/forms.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ClipboardList, Download, Loader2, Pencil, Plus, Trash2, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { SettingsPanelHead } from './settings-panel-head';

type FieldType = 'text' | 'email' | 'phone' | 'number' | 'textarea' | 'dropdown' | 'date' | 'optin';

interface Field {
  key?: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[];
  save_to?: string | null;
}

interface FormRow {
  id: string;
  name: string;
  title: string;
  intro: string | null;
  submit_label: string;
  category: string;
  fields: Field[];
  status: 'draft' | 'published' | 'failed' | 'deprecated';
  error: string | null;
  response_count: number;
  created_at: string;
}

interface ResponseRow {
  id: string;
  answers: Record<string, string>;
  created_at: string;
  contacts: { name: string | null; phone: string | null } | null;
}

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'number', label: 'Number' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'date', label: 'Date' },
  { value: 'optin', label: 'Consent checkbox' },
];

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'LEAD_GENERATION', label: 'Lead capture' },
  { value: 'CONTACT_US', label: 'Contact us' },
  { value: 'CUSTOMER_SUPPORT', label: 'Support request' },
  { value: 'SURVEY', label: 'Survey / feedback' },
  { value: 'APPOINTMENT_BOOKING', label: 'Booking request' },
  { value: 'SIGN_UP', label: 'Sign up' },
  { value: 'OTHER', label: 'Other' },
];

const STATUS: Record<FormRow['status'], { label: string; className: string }> = {
  published: { label: 'Live', className: 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 border-emerald-600/30' },
  draft: { label: 'Draft', className: 'bg-muted text-muted-foreground border-border' },
  failed: { label: 'Needs fixing', className: 'bg-red-600/15 text-red-700 dark:text-red-400 border-red-600/30' },
  deprecated: { label: 'Retired', className: 'bg-muted text-muted-foreground border-border' },
};

const STARTER_FIELDS: Field[] = [
  { label: 'Full name', type: 'text', required: true, save_to: 'name' },
  { label: 'Email', type: 'email', required: false, save_to: 'email' },
  { label: 'What are you looking for?', type: 'textarea', required: false },
];

interface Draft {
  name: string;
  title: string;
  intro: string;
  submit_label: string;
  category: string;
  fields: Field[];
}

const emptyDraft = (): Draft => ({
  name: '',
  title: '',
  intro: '',
  submit_label: 'Submit',
  category: 'LEAD_GENERATION',
  fields: STARTER_FIELDS.map((f) => ({ ...f })),
});

function toCsv(form: FormRow, rows: ResponseRow[]): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const header = ['Submitted', 'Contact', 'Phone', ...form.fields.map((f) => f.label)];
  const lines = rows.map((r) => [
    format(new Date(r.created_at), 'yyyy-MM-dd HH:mm'),
    r.contacts?.name ?? '',
    r.contacts?.phone ?? '',
    ...form.fields.map((f) => (f.key ? (r.answers[f.key] ?? '') : '')),
  ]);
  return [header, ...lines].map((l) => l.map((v) => esc(String(v))).join(',')).join('\n');
}

export function FormsSettings() {
  const { canEditSettings } = useAuth();
  const [forms, setForms] = useState<FormRow[] | null>(null);
  const [available, setAvailable] = useState(true);
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [saving, setSaving] = useState(false);
  const [customFields, setCustomFields] = useState<{ id: string; field_name: string }[]>([]);
  const [viewing, setViewing] = useState<{ form: FormRow; rows: ResponseRow[] | null } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/whatsapp/forms');
    const body = await res.json().catch(() => null);
    setAvailable(body?.available !== false);
    setForms(body?.forms ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/whatsapp/forms')
      .then((res) => res.json())
      .catch(() => null)
      .then((body) => {
        if (cancelled) return;
        setAvailable(body?.available !== false);
        setForms(body?.forms ?? []);
      });
    createClient()
      .from('custom_fields')
      .select('id, field_name')
      .order('field_name')
      .then(({ data }) => !cancelled && setCustomFields(data ?? []));
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch(editing.id ? `/api/whatsapp/forms/${editing.id}` : '/api/whatsapp/forms', {
        method: editing.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing.draft),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        toast.error(body?.error ?? 'Could not publish the form.');
        await load();
        return;
      }
      toast.success('Form published on WhatsApp.');
      setEditing(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(form: FormRow) {
    const res = await fetch(`/api/whatsapp/forms/${form.id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error('Could not delete the form.');
      return;
    }
    toast.success('Form deleted. Its responses are kept.');
    await load();
  }

  async function openResponses(form: FormRow) {
    setViewing({ form, rows: null });
    const res = await fetch(`/api/whatsapp/forms/${form.id}`);
    const body = await res.json().catch(() => null);
    setViewing({ form: body?.form ?? form, rows: body?.responses ?? [] });
  }

  function downloadCsv() {
    if (!viewing?.rows) return;
    const blob = new Blob([toCsv(viewing.form, viewing.rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${viewing.form.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-responses.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const d = editing?.draft;
  const setDraft = (patch: Partial<Draft>) => setEditing((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e));
  const setField = (i: number, patch: Partial<Field>) =>
    setDraft({ fields: d!.fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)) });

  return (
    <section className="space-y-4">
      <SettingsPanelHead
        title="WhatsApp forms"
        description="Forms that open inside WhatsApp — collect leads, bookings or feedback without sending people to a website. Send one from any chat with the clipboard icon."
        action={
          canEditSettings && available ? (
            <Button onClick={() => setEditing({ id: null, draft: emptyDraft() })}>
              <Plus className="size-4" />
              New form
            </Button>
          ) : null
        }
      />

      {!forms ? (
        <div className="flex justify-center py-10">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : !available ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Run migration 052_whatsapp_forms.sql to use WhatsApp forms.
          </CardContent>
        </Card>
      ) : forms.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <ClipboardList className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No forms yet. Create a lead form in a minute.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {forms.map((form) => (
            <Card key={form.id}>
              <CardContent className="space-y-2 pt-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium text-foreground">{form.name}</h3>
                      <Badge className={`border text-xs ${STATUS[form.status].className}`}>{STATUS[form.status].label}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {form.fields.length} field{form.fields.length === 1 ? '' : 's'} · “{form.title}”
                    </p>
                  </div>
                  {canEditSettings && (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Edit form"
                        onClick={() =>
                          setEditing({
                            id: form.id,
                            draft: {
                              name: form.name,
                              title: form.title,
                              intro: form.intro ?? '',
                              submit_label: form.submit_label,
                              category: form.category,
                              fields: form.fields.map((f) => ({ ...f })),
                            },
                          })
                        }
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="Delete form" onClick={() => void remove(form)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  )}
                </div>
                {form.status === 'failed' && form.error && (
                  <p className="rounded border border-red-500/30 bg-red-500/5 px-2 py-1.5 text-xs text-red-700 dark:text-red-400">
                    {form.error}
                  </p>
                )}
                <Button variant="outline" size="sm" onClick={() => void openResponses(form)}>
                  <Users className="size-4" />
                  {form.response_count} response{form.response_count === 1 ? '' : 's'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Builder */}
      <Dialog open={editing !== null} onOpenChange={(open) => !saving && !open && setEditing(null)}>
        <DialogContent className="bg-popover border-border max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">{editing?.id ? 'Edit form' : 'New WhatsApp form'}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {editing?.id
                ? 'Saving publishes a new version on WhatsApp; forms already sent keep working.'
                : 'Customers tap a button in the chat and fill this in without leaving WhatsApp.'}
            </DialogDescription>
          </DialogHeader>
          {d && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Form name (internal)</Label>
                  <Input value={d.name} onChange={(e) => setDraft({ name: e.target.value })} placeholder="Diwali lead form" />
                </div>
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={d.category} onValueChange={(v) => v && setDraft({ category: v })}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Title customers see</Label>
                  <Input value={d.title} maxLength={30} onChange={(e) => setDraft({ title: e.target.value })} placeholder="Get a quote" />
                </div>
                <div className="space-y-1.5">
                  <Label>Submit button</Label>
                  <Input value={d.submit_label} maxLength={30} onChange={(e) => setDraft({ submit_label: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Intro text (optional)</Label>
                <Textarea value={d.intro} onChange={(e) => setDraft({ intro: e.target.value })} rows={2} placeholder="Tell us a little and we'll get back within an hour." />
              </div>

              <div className="space-y-2">
                <Label>Fields</Label>
                {d.fields.map((f, i) => (
                  <div key={i} className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                    <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr_auto]">
                      <Input value={f.label} maxLength={30} onChange={(e) => setField(i, { label: e.target.value })} placeholder="Label" />
                      <Select value={f.type} onValueChange={(v) => setField(i, { type: v as FieldType, options: v === 'dropdown' ? (f.options?.length ? f.options : ['Option 1', 'Option 2']) : undefined })}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FIELD_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove field"
                        disabled={d.fields.length === 1}
                        onClick={() => setDraft({ fields: d.fields.filter((_, idx) => idx !== i) })}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    {f.type === 'dropdown' && (
                      <Input
                        value={(f.options ?? []).join(', ')}
                        onChange={(e) => setField(i, { options: e.target.value.split(',').map((o) => o.trimStart()) })}
                        placeholder="Choices, separated by commas"
                      />
                    )}
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      <label className="flex items-center gap-2">
                        <Checkbox checked={f.required} onCheckedChange={(v) => setField(i, { required: v === true })} />
                        Required
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Save to contact:</span>
                        <Select value={f.save_to ?? 'none'} onValueChange={(v) => setField(i, { save_to: v === 'none' ? null : v })}>
                          <SelectTrigger className="h-8 w-44">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Don’t save</SelectItem>
                            <SelectItem value="name">Name</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                            {customFields.map((cf) => (
                              <SelectItem key={cf.id} value={`custom:${cf.id}`}>
                                {cf.field_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                ))}
                {d.fields.length < 15 && (
                  <Button variant="outline" size="sm" onClick={() => setDraft({ fields: [...d.fields, { label: '', type: 'text', required: false }] })}>
                    <Plus className="size-4" />
                    Add field
                  </Button>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="bg-popover border-border">
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Responses */}
      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="bg-popover border-border max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">{viewing?.form.name} — responses</DialogTitle>
          </DialogHeader>
          {!viewing?.rows ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : viewing.rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No responses yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 font-medium">When</th>
                    <th className="px-3 py-2 font-medium">Contact</th>
                    {viewing.form.fields.map((f) => (
                      <th key={f.key ?? f.label} className="px-3 py-2 font-medium">
                        {f.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {viewing.rows.map((r) => (
                    <tr key={r.id} className="border-b border-border align-top last:border-0">
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{format(new Date(r.created_at), 'd MMM, h:mm a')}</td>
                      <td className="px-3 py-2">{r.contacts?.name || r.contacts?.phone || '—'}</td>
                      {viewing.form.fields.map((f) => (
                        <td key={f.key ?? f.label} className="px-3 py-2">
                          {f.key ? (r.answers[f.key] ?? '') : ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <DialogFooter className="bg-popover border-border">
            <Button variant="outline" onClick={downloadCsv} disabled={!viewing?.rows?.length}>
              <Download className="size-4" />
              Download CSV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
