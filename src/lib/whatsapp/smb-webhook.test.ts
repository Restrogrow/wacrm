import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  handleCoexistenceAccountUpdate,
  handleCoexistenceWebhookChange,
  HISTORY_DECLINED_ERROR_CODE,
  isCoexistenceWebhookField,
} from './smb-webhook';

type Table = 'whatsapp_config' | 'contacts' | 'conversations' | 'messages';

interface Row {
  table: Table;
  op: 'select' | 'insert' | 'update';
  select?: string;
  filters: Array<{ column: string; value: unknown }>;
  payload?: Record<string, unknown>;
  result: { data: unknown; error: { message: string; code?: string } | null };
}

/**
 * Minimal Supabase stub covering the query shapes smb-webhook uses:
 *   .from(t).select().eq()... (reads)
 *   .from(t).insert(payload)   (contact/message/conversation creates)
 *   .from(t).update(payload).eq()... (updates)
 * Chained .eq()s accumulate filters; awaited results come from the
 * pre-registered per-table result queue.
 */
function makeSupabaseStub(results: Partial<Record<Table, Array<{ data: unknown; error?: { message: string; code?: string } | null }>>>) {
  const calls: Row[] = [];

  function nextResult(table: Table) {
    const queue = results[table] ?? [];
    return queue.shift() ?? { data: null, error: null };
  }

  function buildQuery(entry: Row) {
    const q = {
      eq(column: string, value: unknown) {
        entry.filters.push({ column, value });
        return q;
      },
      like(column: string, _value: unknown) {
        entry.filters.push({ column, value: 'like' });
        return q;
      },
      lt(column: string, _value: unknown) {
        entry.filters.push({ column, value: 'lt' });
        return q;
      },
      limit(_n: number) {
        return q;
      },
      maybeSingle() {
        return Promise.resolve(nextResult(entry.table));
      },
      single() {
        return Promise.resolve(nextResult(entry.table));
      },
      then(onFulfilled: (v: { data: unknown; error?: { message: string; code?: string } | null }) => unknown) {
        return Promise.resolve(nextResult(entry.table)).then(onFulfilled);
      },
    };
    return q;
  }

  const stub = {
    from(table: Table) {
      return {
        select(_sel: string) {
          const entry: Row = { table, op: 'select', filters: [], result: null as never };
          calls.push(entry);
          return buildQuery(entry);
        },
        insert(payload: Record<string, unknown>) {
          const entry: Row = { table, op: 'insert', filters: [], payload, result: null as never };
          calls.push(entry);
          return {
            select() {
              return {
                single() {
                  return Promise.resolve(nextResult(table));
                },
              };
            },
            then(onFulfilled: (v: { data: unknown; error?: { message: string; code?: string } | null }) => unknown) {
              return Promise.resolve(nextResult(table)).then(onFulfilled);
            },
          };
        },
        update(payload: Record<string, unknown>) {
          const entry: Row = { table, op: 'update', filters: [], payload, result: null as never };
          calls.push(entry);
          return buildQuery(entry);
        },
      };
    },
  };

  return { stub: stub as unknown as SupabaseClient, calls };
}

// A config row that findConfigByPhoneNumberId will resolve.
const CONFIG_ROW = { id: 'cfg-1', account_id: 'acct-1', user_id: 'user-1' };
const CONFIG_RESULT = { data: CONFIG_ROW, error: null };

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('isCoexistenceWebhookField', () => {
  it('recognises the three coexistence fields', () => {
    expect(isCoexistenceWebhookField('history')).toBe(true);
    expect(isCoexistenceWebhookField('smb_app_state_sync')).toBe(true);
    expect(isCoexistenceWebhookField('smb_message_echoes')).toBe(true);
  });

  it('rejects messaging and template fields', () => {
    expect(isCoexistenceWebhookField('messages')).toBe(false);
    expect(isCoexistenceWebhookField('message_template_status_update')).toBe(false);
  });
});

describe('smb_app_state_sync — contacts', () => {
  it('creates a new contact on action=add', async () => {
    const { stub, calls } = makeSupabaseStub({
      whatsapp_config: [CONFIG_RESULT],
      contacts: [
        { data: null, error: null }, // findExistingContactRow → none
        { data: { id: 'c-new' }, error: null }, // insert
      ],
    });

    await handleCoexistenceWebhookChange(
      {
        field: 'smb_app_state_sync',
        value: {
          metadata: { phone_number_id: 'PN-1' },
          state_sync: [
            {
              type: 'contact',
              action: 'add',
              contact: { full_name: 'Pablo Morales', phone_number: '16505551234' },
              metadata: { timestamp: '1739321024' },
            },
          ],
        },
      },
      stub,
    );

    const inserts = calls.filter((c) => c.op === 'insert' && c.table === 'contacts');
    expect(inserts).toHaveLength(1);
    expect(inserts[0].payload).toMatchObject({
      account_id: 'acct-1',
      user_id: 'user-1',
      phone: '16505551234',
      name: 'Pablo Morales',
    });
  });

  it('updates the name of an existing contact on action=add', async () => {
    const { stub, calls } = makeSupabaseStub({
      whatsapp_config: [CONFIG_RESULT],
      contacts: [
        { data: [{ id: 'c-1', name: 'Old Name', phone: '16505551234' }], error: null },
        { data: null, error: null }, // update
      ],
    });

    await handleCoexistenceWebhookChange(
      {
        field: 'smb_app_state_sync',
        value: {
          metadata: { phone_number_id: 'PN-1' },
          state_sync: [
            {
              type: 'contact',
              action: 'add',
              contact: { full_name: 'New Name', phone_number: '16505551234' },
            },
          ],
        },
      },
      stub,
    );

    const updates = calls.filter((c) => c.op === 'update' && c.table === 'contacts');
    expect(updates).toHaveLength(1);
    expect(updates[0].payload?.name).toBe('New Name');
  });

  it('neutralises the name on action=remove without deleting the row', async () => {
    const { stub, calls } = makeSupabaseStub({
      whatsapp_config: [CONFIG_RESULT],
      contacts: [
        { data: [{ id: 'c-1', name: 'Pablo', phone: '16505551234' }], error: null },
        { data: null, error: null }, // update
      ],
    });

    await handleCoexistenceWebhookChange(
      {
        field: 'smb_app_state_sync',
        value: {
          metadata: { phone_number_id: 'PN-1' },
          state_sync: [
            {
              type: 'contact',
              action: 'remove',
              contact: { phone_number: '16505551234' },
            },
          ],
        },
      },
      stub,
    );

    const updates = calls.filter((c) => c.op === 'update' && c.table === 'contacts');
    expect(updates).toHaveLength(1);
    expect(updates[0].payload?.name).toBe('16505551234');
    expect(calls.some((c) => c.table === 'contacts' && c.op === 'insert')).toBe(false);
  });

  it('is a no-op when no config matches the phone_number_id', async () => {
    const { stub, calls } = makeSupabaseStub({
      whatsapp_config: [{ data: null, error: null }],
    });

    await handleCoexistenceWebhookChange(
      {
        field: 'smb_app_state_sync',
        value: {
          metadata: { phone_number_id: 'UNKNOWN' },
          state_sync: [
            { type: 'contact', action: 'add', contact: { phone_number: '16505551234' } },
          ],
        },
      },
      stub,
    );

    expect(calls.filter((c) => c.table === 'contacts')).toHaveLength(0);
  });
});

describe('smb_message_echoes — messages sent from the Business app', () => {
  it('stores a text echo as an agent message in the contact thread', async () => {
    const { stub, calls } = makeSupabaseStub({
      whatsapp_config: [CONFIG_RESULT],
      messages: [{ data: null, error: null }], // dedupe lookup → none
      contacts: [{ data: [{ id: 'c-1', name: 'Pablo', phone: '16505551234' }], error: null }], // existing contact
      conversations: [{ data: { id: 'conv-1' }, error: null }],
    });

    await handleCoexistenceWebhookChange(
      {
        field: 'smb_message_echoes',
        value: {
          metadata: { phone_number_id: 'PN-1' },
          message_echoes: [
            {
              from: '15550783881',
              to: '16505551234',
              id: 'wamid.ECHO-1',
              timestamp: '1739321024',
              type: 'text',
              text: { body: 'Sent from my phone' },
            },
          ],
        },
      },
      stub,
    );

    const inserts = calls.filter((c) => c.op === 'insert' && c.table === 'messages');
    expect(inserts).toHaveLength(1);
    expect(inserts[0].payload).toMatchObject({
      conversation_id: 'conv-1',
      sender_type: 'agent',
      content_type: 'text',
      content_text: 'Sent from my phone',
      message_id: 'wamid.ECHO-1',
      status: 'delivered',
    });
  });

  it('skips an echo whose wamid was already stored (dedup)', async () => {
    const { stub, calls } = makeSupabaseStub({
      whatsapp_config: [CONFIG_RESULT],
      messages: [{ data: { id: 'm-1' }, error: null }], // dedupe hit
    });

    await handleCoexistenceWebhookChange(
      {
        field: 'smb_message_echoes',
        value: {
          metadata: { phone_number_id: 'PN-1' },
          message_echoes: [
            { from: '15550783881', to: '16505551234', id: 'wamid.DUP', timestamp: '1739321024', type: 'text', text: { body: 'x' } },
          ],
        },
      },
      stub,
    );

    expect(calls.filter((c) => c.op === 'insert' && c.table === 'messages')).toHaveLength(0);
  });

  it('handles revoke by rewriting the original message text', async () => {
    const { stub, calls } = makeSupabaseStub({
      whatsapp_config: [CONFIG_RESULT],
      messages: [
        // Revoke lookup: message + joined conversation account
        { data: { id: 'm-1', conversation_id: 'conv-1', conversations: { account_id: 'acct-1' } }, error: null },
        { data: null, error: null }, // update
      ],
    });

    await handleCoexistenceWebhookChange(
      {
        field: 'smb_message_echoes',
        value: {
          metadata: { phone_number_id: 'PN-1' },
          message_echoes: [
            {
              from: '15550783881',
              to: '16505551234',
              id: 'wamid.REVOKE-EVENT',
              timestamp: '1739321024',
              type: 'revoke',
              revoke: { original_message_id: 'wamid.ORIGINAL' },
            },
          ],
        },
      },
      stub,
    );

    const updates = calls.filter((c) => c.op === 'update' && c.table === 'messages');
    expect(updates).toHaveLength(1);
    expect(updates[0].payload?.content_text).toBe('[Message deleted]');
  });

  it('handles edit by overwriting the stored text', async () => {
    const { stub, calls } = makeSupabaseStub({
      whatsapp_config: [CONFIG_RESULT],
      messages: [
        { data: { id: 'm-1', conversation_id: 'conv-1', conversations: { account_id: 'acct-1' } }, error: null },
        { data: null, error: null },
      ],
    });

    await handleCoexistenceWebhookChange(
      {
        field: 'smb_message_echoes',
        value: {
          metadata: { phone_number_id: 'PN-1' },
          message_echoes: [
            {
              from: '15550783881',
              to: '16505551234',
              id: 'wamid.EDIT-EVENT',
              timestamp: '1739321024',
              type: 'edit',
              edit: {
                original_message_id: 'wamid.ORIGINAL',
                message: { type: 'text', text: { body: 'Edited body' } },
              },
            },
          ],
        },
      },
      stub,
    );

    const updates = calls.filter((c) => c.op === 'update' && c.table === 'messages');
    expect(updates).toHaveLength(1);
    expect(updates[0].payload?.content_text).toBe('Edited body');
  });
});

describe('history — past chat import', () => {
  const historyChange = (threads: unknown[], extra: Record<string, unknown> = {}) => ({
    field: 'history',
    value: {
      metadata: { phone_number_id: 'PN-1' },
      history: [{ metadata: { phase: 0, chunk_order: 1, progress: 55 }, threads, ...extra }],
    },
  });

  it('stores customer and agent messages from a thread', async () => {
    const { stub, calls } = makeSupabaseStub({
      whatsapp_config: [
        CONFIG_RESULT,
        { data: null, error: null }, // progress update
      ],
      contacts: [{ data: [{ id: 'c-1', phone: '16505551234' }], error: null }],
      conversations: [{ data: { id: 'conv-1' }, error: null }],
      messages: [
        { data: null, error: null }, // dupe lookup msg1
        { data: null, error: null }, // insert msg1 (via then)
        { data: null, error: null }, // preview update msg1
        { data: null, error: null }, // dupe lookup msg2
        { data: null, error: null }, // insert msg2
        { data: null, error: null }, // preview update msg2
      ],
    });

    await handleCoexistenceWebhookChange(
      historyChange([
        {
          id: '16505551234',
          messages: [
            { from: '15550783881', to: '16505551234', id: 'wamid.H1', timestamp: '1739230955', type: 'text', text: { body: 'from business' } },
            { from: '16505551234', id: 'wamid.H2', timestamp: '1739230970', type: 'text', text: { body: 'from customer' } },
          ],
        },
      ]),
      stub,
    );

    const inserts = calls.filter((c) => c.op === 'insert' && c.table === 'messages');
    expect(inserts).toHaveLength(2);
    // `to` present → business-sent → agent
    expect(inserts[0].payload?.sender_type).toBe('agent');
    expect(inserts[0].payload?.content_text).toBe('from business');
    // No `to` → customer
    expect(inserts[1].payload?.sender_type).toBe('customer');
    expect(inserts[1].payload?.content_text).toBe('from customer');
  });

  it('records the decline error (2593109) on the config row', async () => {
    const { stub, calls } = makeSupabaseStub({
      whatsapp_config: [
        CONFIG_RESULT,
        { data: null, error: null }, // smb_sync_error update
      ],
    });

    await handleCoexistenceWebhookChange(
      {
        field: 'history',
        value: {
          metadata: { phone_number_id: 'PN-1' },
          history: [
            {
              errors: [
                {
                  code: HISTORY_DECLINED_ERROR_CODE,
                  title: 'History sync is turned off by the business from the WhatsApp Business App',
                },
              ],
            },
          ],
        },
      },
      stub,
    );

    const updates = calls.filter((c) => c.op === 'update' && c.table === 'whatsapp_config');
    expect(updates).toHaveLength(1);
    expect(updates[0].payload?.smb_sync_error).toBe(
      'History sync is turned off by the business from the WhatsApp Business App',
    );
    expect(calls.filter((c) => c.table === 'messages')).toHaveLength(0);
  });

  it('maps media_placeholder to a text marker', async () => {
    const { stub, calls } = makeSupabaseStub({
      whatsapp_config: [CONFIG_RESULT],
      contacts: [{ data: [{ id: 'c-1', phone: '16505551234' }], error: null }],
      conversations: [{ data: { id: 'conv-1' }, error: null }],
      messages: [
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
      ],
    });

    await handleCoexistenceWebhookChange(
      historyChange([
        {
          id: '16505551234',
          messages: [
            { from: '16505551234', id: 'wamid.MP', timestamp: '1739230955', type: 'media_placeholder' },
          ],
        },
      ]),
      stub,
    );

    const inserts = calls.filter((c) => c.op === 'insert' && c.table === 'messages');
    expect(inserts[0].payload?.content_type).toBe('text');
    expect(inserts[0].payload?.content_text).toBe('[Media message]');
  });
});

describe('account_update — PARTNER_REMOVED', () => {
  it('marks the matching coexistence config disconnected', async () => {
    const { stub, calls } = makeSupabaseStub({
      whatsapp_config: [
        { data: [{ id: 'cfg-1' }], error: null }, // lookup
        { data: null, error: null }, // update
      ],
    });

    await handleCoexistenceAccountUpdate(
      {
        event: 'PARTNER_REMOVED',
        phone_number: '15550783881',
        disconnection_info: { reason: 'PRIMARY_INACTIVITY', initiated_by: 'SYSTEM' },
      },
      stub,
      'WABA-1',
    );

    const lookups = calls.filter((c) => c.op === 'select' && c.table === 'whatsapp_config');
    expect(lookups[0].filters).toEqual(
      expect.arrayContaining([
        { column: 'is_on_biz_app', value: true },
        { column: 'waba_id', value: 'WABA-1' },
      ]),
    );
    const updates = calls.filter((c) => c.op === 'update' && c.table === 'whatsapp_config');
    expect(updates).toHaveLength(1);
    expect(updates[0].payload?.status).toBe('disconnected');
    expect(String(updates[0].payload?.smb_sync_error)).toContain('PRIMARY_INACTIVITY');
  });

  it('ignores unrelated account_update events', async () => {
    const { stub, calls } = makeSupabaseStub({});

    await handleCoexistenceAccountUpdate({ event: 'APPROVED' }, stub, 'WABA-1');
    expect(calls).toHaveLength(0);
  });
});
