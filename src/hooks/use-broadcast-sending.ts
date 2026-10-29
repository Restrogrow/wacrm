'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Contact, MessageTemplate } from '@/types';
import { planLimitMessage } from '@/lib/billing/plans';
import { resolveSegmentContacts } from '@/lib/segments/resolve';

export type CustomFieldOperator = 'is' | 'is_not' | 'contains';

export interface CustomFieldFilter {
  fieldId: string;
  operator: CustomFieldOperator;
  value: string;
}

export interface AudienceConfig {
  type: 'all' | 'tags' | 'custom_field' | 'csv' | 'segment';
  tagIds?: string[];
  /** Saved segment (migration 068); members are resolved at send/schedule time. */
  segmentId?: string;
  customField?: CustomFieldFilter;
  csvContacts?: { phone: string; name?: string }[];
  /** Contacts carrying any of these tags are subtracted from the result. */
  excludeTagIds?: string[];
}

/**
 * Variable mapping — each template placeholder (by key, usually "1",
 * "2", …) is resolved at send time. `field` maps to a built-in contact
 * field (name/phone/email/company); `custom_field` maps to a
 * contact_custom_values.value row keyed by the custom_fields.id stored
 * in `value`.
 */
export type VariableMapping =
  | { type: 'static'; value: string }
  | { type: 'field'; value: string }
  | { type: 'custom_field'; value: string };

interface BroadcastPayload {
  name: string;
  template: MessageTemplate;
  audience: AudienceConfig;
  variables: Record<string, VariableMapping>;
  /**
   * Media URL for an IMAGE/VIDEO/DOCUMENT header. Required at send
   * time for media-header templates — Meta rejects the send without
   * it. Passed through as `messageParams.headerMediaUrl`; the builder
   * falls back to the template's stored URL only when this is empty.
   */
  headerMediaUrl?: string;
}

interface UseBroadcastSendingReturn {
  createAndSendBroadcast: (payload: BroadcastPayload) => Promise<string>;
  /** Save a broadcast to be sent by the server at `scheduledAt` (ISO). */
  scheduleBroadcast: (payload: BroadcastPayload, scheduledAt: string) => Promise<string>;
  isProcessing: boolean;
  progress: number;
}

/** `broadcast_recipients` inserts are independent of the send rate. */
const INSERT_BATCH_SIZE = 200;

/** contactId → (customFieldId → value). */
type CustomValueIndex = Map<string, Map<string, string>>;

/**
 * Per-contact resolution of custom-field placeholders. Static and
 * built-in-field mappings resolve synchronously; custom fields read
 * from a pre-built index to avoid N+1 queries during the send loop.
 */
export function resolveVariables(
  variables: Record<string, VariableMapping>,
  contact: Contact,
  customValues?: Map<string, string>,
): string[] {
  // Keys are typically "1","2",... — numeric-aware sort keeps
  // {{1}} before {{10}}.
  const keys = Object.keys(variables).sort((a, b) => {
    const an = Number(a);
    const bn = Number(b);
    if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
    return a.localeCompare(b);
  });

  return keys.map((key) => {
    const v = variables[key];
    if (v.type === 'static') return v.value;

    if (v.type === 'field') {
      const fieldMap: Record<string, string | undefined> = {
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        company: contact.company,
      };
      return fieldMap[v.value] ?? '';
    }

    // custom_field
    return customValues?.get(v.value) ?? '';
  });
}

/**
 * Bulk-fetch contact_custom_values for a set of contacts. Returns an
 * index keyed by contact_id → field_id → value.
 */
async function fetchCustomValueIndex(
  supabase: ReturnType<typeof createClient>,
  contactIds: string[],
): Promise<CustomValueIndex> {
  const index: CustomValueIndex = new Map();
  if (contactIds.length === 0) return index;

  // Supabase PostgREST caps the .in(...) IN-clause roughly at 1000
  // values. Page through to stay safe.
  const PAGE = 500;
  for (let i = 0; i < contactIds.length; i += PAGE) {
    const slice = contactIds.slice(i, i + PAGE);
    const { data } = await supabase
      .from('contact_custom_values')
      .select('contact_id, custom_field_id, value')
      .in('contact_id', slice);

    for (const row of data ?? []) {
      const bucket = index.get(row.contact_id) ?? new Map<string, string>();
      bucket.set(row.custom_field_id, row.value ?? '');
      index.set(row.contact_id, bucket);
    }
  }
  return index;
}

export function useBroadcastSending(): UseBroadcastSendingReturn {
  const { accountId } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  async function resolveAudience(audience: AudienceConfig): Promise<Contact[]> {
    const supabase = createClient();

    let contacts: Contact[] = [];

    if (audience.type === 'all') {
      const { data, error } = await supabase.from('contacts').select('*');
      if (error) throw new Error(`Failed to fetch contacts: ${error.message}`);
      contacts = data ?? [];
    } else if (
      audience.type === 'tags' &&
      audience.tagIds &&
      audience.tagIds.length > 0
    ) {
      const { data: contactTags, error: tagError } = await supabase
        .from('contact_tags')
        .select('contact_id')
        .in('tag_id', audience.tagIds);

      if (tagError)
        throw new Error(`Failed to fetch contact tags: ${tagError.message}`);

      if (contactTags && contactTags.length > 0) {
        const uniqueContactIds = [
          ...new Set(contactTags.map((ct) => ct.contact_id)),
        ];
        const { data, error } = await supabase
          .from('contacts')
          .select('*')
          .in('id', uniqueContactIds);
        if (error) throw new Error(`Failed to fetch contacts: ${error.message}`);
        contacts = data ?? [];
      }
    } else if (audience.type === 'custom_field' && audience.customField) {
      contacts = await resolveCustomFieldAudience(supabase, audience.customField);
    } else if (audience.type === 'csv' && audience.csvContacts) {
      contacts = await upsertCsvContacts(supabase, audience.csvContacts);
    } else if (audience.type === 'segment' && audience.segmentId) {
      if (!accountId) throw new Error('Your profile is not linked to an account.');
      // Rules are read from the database and opted-out contacts are dropped there.
      contacts = await resolveSegmentContacts(supabase, accountId, audience.segmentId);
    }

    // Apply exclude tags (works across all contact-derived audience
    // types). CSV contacts are synthetic so exclusion doesn't apply.
    if (audience.excludeTagIds && audience.excludeTagIds.length > 0) {
      const { data: excludeRows } = await supabase
        .from('contact_tags')
        .select('contact_id')
        .in('tag_id', audience.excludeTagIds);
      const excludedIds = new Set((excludeRows ?? []).map((r) => r.contact_id));
      contacts = contacts.filter((c) => !excludedIds.has(c.id));
    }

    return contacts;
  }

  /**
   * CSV uploads arrive as raw phone/name pairs, not DB rows. Before we
   * can insert broadcast_recipients (whose contact_id FKs contacts.id),
   * we need real contacts.id UUIDs. So: look up each CSV phone in the
   * caller's contacts table; insert any that don't exist; return the
   * resolved set.
   *
   * Pre-existing implementation synthesized `csv-N` strings as
   * contact_id, which failed the UUID cast on insert — every CSV
   * broadcast silently created zero recipients.
   */
  async function upsertCsvContacts(
    supabase: ReturnType<typeof createClient>,
    csvRows: { phone: string; name?: string }[],
  ): Promise<Contact[]> {
    if (csvRows.length === 0) return [];

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      throw new Error('You are not signed in.');
    }
    if (!accountId) {
      throw new Error('Your profile is not linked to an account.');
    }

    // De-duplicate by phone within the CSV (users can paste duplicates).
    const uniqueByPhone = new Map<string, { phone: string; name?: string }>();
    for (const row of csvRows) {
      if (row.phone) uniqueByPhone.set(row.phone, row);
    }
    const phones = [...uniqueByPhone.keys()];

    // Single round-trip lookup of existing contacts by phone.
    const { data: existing, error: lookupErr } = await supabase
      .from('contacts')
      .select('*')
      .eq('user_id', user.id)
      .in('phone', phones);
    if (lookupErr) {
      throw new Error(`Failed to look up CSV contacts: ${lookupErr.message}`);
    }

    const byPhone = new Map<string, Contact>();
    for (const c of (existing ?? []) as Contact[]) {
      if (c.phone) byPhone.set(c.phone, c);
    }

    // Insert only missing contacts, in one batch per 200 rows (PostgREST
    // has a default payload cap — 200 keeps individual requests small).
    const missing = phones
      .filter((p) => !byPhone.has(p))
      .map((phone) => ({
        user_id: user.id,
        account_id: accountId,
        phone,
        name: uniqueByPhone.get(phone)?.name ?? null,
      }));

    const INSERT_CHUNK = 200;
    for (let i = 0; i < missing.length; i += INSERT_CHUNK) {
      const chunk = missing.slice(i, i + INSERT_CHUNK);
      const { data: inserted, error: insertErr } = await supabase
        .from('contacts')
        .insert(chunk)
        .select();
      if (insertErr) {
        throw new Error(`Failed to create CSV contacts: ${insertErr.message}`);
      }
      for (const c of (inserted ?? []) as Contact[]) {
        if (c.phone) byPhone.set(c.phone, c);
      }
    }

    // Preserve input order so analytics roughly matches the CSV order.
    return phones
      .map((p) => byPhone.get(p))
      .filter((c): c is Contact => Boolean(c));
  }

  async function resolveCustomFieldAudience(
    supabase: ReturnType<typeof createClient>,
    filter: CustomFieldFilter,
  ): Promise<Contact[]> {
    const { fieldId, operator, value } = filter;

    // Build the WHERE clause for the operator. PostgREST supports
    // eq/neq/ilike via the query builder — use ilike with wildcards
    // for "contains" so the match is case-insensitive.
    let query = supabase
      .from('contact_custom_values')
      .select('contact_id')
      .eq('custom_field_id', fieldId);

    if (operator === 'is') query = query.eq('value', value);
    else if (operator === 'is_not') query = query.neq('value', value);
    else if (operator === 'contains') query = query.ilike('value', `%${value}%`);

    const { data: matches, error: matchErr } = await query;
    if (matchErr)
      throw new Error(`Custom-field filter failed: ${matchErr.message}`);

    const contactIds = [...new Set((matches ?? []).map((m) => m.contact_id))];
    if (contactIds.length === 0) return [];

    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .in('id', contactIds);
    if (error) throw new Error(`Failed to fetch contacts: ${error.message}`);
    return data ?? [];
  }

  /**
   * Resolve the audience and every recipient's template values now and
   * store the broadcast with its recipients (migration 043). Sending is
   * always done by the server (lib/broadcasts/scheduled.ts): straight
   * away for "Send now", by the cron at `scheduledAt` for "Send later".
   */
  async function storeBroadcast(
    payload: BroadcastPayload,
    scheduledAt: string | null,
  ): Promise<string> {
    const supabase = createClient();

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) throw new Error('You are not signed in.');
    if (!accountId) throw new Error('Your profile is not linked to an account.');
    if (
      scheduledAt !== null &&
      (Number.isNaN(Date.parse(scheduledAt)) || Date.parse(scheduledAt) <= Date.now())
    ) {
      throw new Error('Pick a time in the future.');
    }

    setProgress(10);
    const contacts = await resolveAudience(payload.audience);
    if (contacts.length === 0) throw new Error('No contacts found for this audience.');

    setProgress(30);
    const customValueIndex = await fetchCustomValueIndex(
      supabase,
      contacts.map((c) => c.id),
    );

    // Media-header templates (image/video/document) require a media URL
    // on every send; it is stored once on the broadcast.
    const headerType = payload.template.header_type;
    const isMediaHeader =
      headerType === 'image' || headerType === 'video' || headerType === 'document';
    const headerMediaUrl = payload.headerMediaUrl?.trim();

    setProgress(50);
    const { data: broadcast, error: broadcastError } = await supabase
      .from('broadcasts')
      .insert({
        user_id: user.id,
        account_id: accountId,
        name: payload.name,
        template_name: payload.template.name,
        template_language: payload.template.language ?? 'en_US',
        template_variables: payload.variables,
        audience_filter: {
          type: payload.audience.type,
          segmentId: payload.audience.segmentId,
          tagIds: payload.audience.tagIds,
          customField: payload.audience.customField,
          excludeTagIds: payload.audience.excludeTagIds,
        },
        message_params: isMediaHeader && headerMediaUrl ? { headerMediaUrl } : null,
        // "Send now" is stored as 'draft' until every recipient is in, so
        // the cron never starts a half-built broadcast; then it flips to
        // 'sending' with scheduled_at = now.
        status: scheduledAt ? 'scheduled' : 'draft',
        scheduled_at: new Date(scheduledAt ?? Date.now()).toISOString(),
        total_recipients: contacts.length,
        sent_count: 0,
        delivered_count: 0,
        read_count: 0,
        replied_count: 0,
        failed_count: 0,
      })
      .select()
      .single();
    if (broadcastError || !broadcast) {
      throw new Error(
        planLimitMessage(broadcastError) ??
          `Failed to save broadcast: ${broadcastError?.message ?? 'unknown error'}`,
      );
    }

    setProgress(70);
    const rows = contacts.map((contact) => ({
      broadcast_id: broadcast.id,
      contact_id: contact.id,
      status: 'pending' as const,
      params: resolveVariables(payload.variables, contact, customValueIndex.get(contact.id)),
    }));
    for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
      const { error } = await supabase
        .from('broadcast_recipients')
        .insert(rows.slice(i, i + INSERT_BATCH_SIZE));
      if (error) {
        // Don't leave a half-built broadcast that the server would send.
        await supabase.from('broadcasts').delete().eq('id', broadcast.id);
        throw new Error(`Failed to save recipients: ${error.message}`);
      }
    }
    setProgress(90);
    return broadcast.id;
  }

  async function createAndSendBroadcast(payload: BroadcastPayload): Promise<string> {
    setIsProcessing(true);
    setProgress(0);
    try {
      const broadcastId = await storeBroadcast(payload, null);
      const supabase = createClient();
      const { error: startError } = await supabase
        .from('broadcasts')
        .update({ status: 'sending', scheduled_at: new Date().toISOString() })
        .eq('id', broadcastId);
      if (startError) throw new Error(`Failed to start broadcast: ${startError.message}`);

      // Start sending now; if this call fails the cron picks it up
      // within a minute anyway, unless the plan doesn't allow sending.
      const res = await fetch(`/api/whatsapp/broadcast/${broadcastId}/send`, {
        method: 'POST',
      }).catch(() => null);
      if (res && res.status === 402) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Your plan does not allow sending right now.');
      }
      // Billing hold: saved, starts by itself once Meta can charge again.
      if (res?.ok && (await res.json().catch(() => ({}))).billing_hold) {
        toast.info('Broadcast saved. WhatsApp billing has a problem, so it will start by itself once billing works again.');
      }
      setProgress(100);
      return broadcastId;
    } finally {
      setIsProcessing(false);
    }
  }

  async function scheduleBroadcast(
    payload: BroadcastPayload,
    scheduledAt: string,
  ): Promise<string> {
    setIsProcessing(true);
    setProgress(0);
    try {
      const broadcastId = await storeBroadcast(payload, scheduledAt);
      setProgress(100);
      return broadcastId;
    } finally {
      setIsProcessing(false);
    }
  }

  return { createAndSendBroadcast, scheduleBroadcast, isProcessing, progress };
}
