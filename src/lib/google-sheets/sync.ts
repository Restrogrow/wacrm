// Row writers used by the WhatsApp webhook and the "Export all" action.
// The sync* functions swallow their errors (recording them on the
// connection) so a Sheets outage can never break message handling.

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { appendRows, getAccessToken, type Connection } from './api';
import { CONTACTS_TAB, MESSAGES_TAB } from './config';

export interface SheetContact {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  created_at?: string | null;
}

export async function getConnection(accountId: string): Promise<Connection | null> {
  const { data } = await supabaseAdmin()
    .from('google_sheets_connections')
    .select('*')
    .eq('account_id', accountId)
    .eq('status', 'active')
    .maybeSingle();
  return data && data.spreadsheet_id ? (data as Connection) : null;
}

/** The connection even before a spreadsheet has been chosen. */
export async function getConnectionAnyState(accountId: string): Promise<Connection | null> {
  const { data } = await supabaseAdmin()
    .from('google_sheets_connections')
    .select('*')
    .eq('account_id', accountId)
    .eq('status', 'active')
    .maybeSingle();
  return (data as Connection) ?? null;
}

async function record(accountId: string, count: number, error: string | null) {
  const db = supabaseAdmin();
  if (error) {
    await db
      .from('google_sheets_connections')
      .update({ last_error: error.slice(0, 500), updated_at: new Date().toISOString() })
      .eq('account_id', accountId);
    return;
  }
  const { data } = await db
    .from('google_sheets_connections')
    .select('rows_synced')
    .eq('account_id', accountId)
    .maybeSingle();
  await db
    .from('google_sheets_connections')
    .update({
      last_sync_at: new Date().toISOString(),
      last_error: null,
      rows_synced: (data?.rows_synced ?? 0) + count,
    })
    .eq('account_id', accountId);
}

function contactRow(c: SheetContact): string[] {
  return [c.name ?? '', c.phone ?? '', c.email ?? '', c.company ?? '', c.created_at ?? new Date().toISOString()];
}

/** Append a newly created contact (no-op unless connected with contact sync on). */
export async function syncNewContact(accountId: string, contact: SheetContact) {
  try {
    const conn = await getConnection(accountId);
    if (!conn?.sync_contacts) return;
    await appendRows(await getAccessToken(conn), conn.spreadsheet_id!, CONTACTS_TAB, [contactRow(contact)]);
    await record(accountId, 1, null);
  } catch (err) {
    await record(accountId, 0, err instanceof Error ? err.message : 'Sync failed').catch(() => {});
  }
}

/** Append one WhatsApp message to the log tab (no-op unless message logging is on). */
export async function syncMessage(
  accountId: string,
  m: {
    direction: 'Inbound' | 'Outbound';
    contactName?: string | null;
    phone?: string | null;
    type?: string | null;
    text?: string | null;
    at?: string;
  }
) {
  try {
    const conn = await getConnection(accountId);
    if (!conn?.sync_messages) return;
    await appendRows(await getAccessToken(conn), conn.spreadsheet_id!, MESSAGES_TAB, [
      [m.at ?? new Date().toISOString(), m.direction, m.contactName ?? '', m.phone ?? '', m.type ?? 'text', m.text ?? ''],
    ]);
    await record(accountId, 1, null);
  } catch (err) {
    await record(accountId, 0, err instanceof Error ? err.message : 'Sync failed').catch(() => {});
  }
}

/** Write every existing contact to the sheet in chunks. Returns rows written. */
export async function exportAllContacts(accountId: string): Promise<number> {
  const conn = await getConnection(accountId);
  if (!conn) throw new Error('Connect a spreadsheet first.');
  const token = await getAccessToken(conn);
  const db = supabaseAdmin();
  let written = 0;
  for (let from = 0; ; from += 500) {
    const { data, error } = await db
      .from('contacts')
      .select('name, phone, email, company, created_at')
      .eq('account_id', accountId)
      .order('created_at', { ascending: true })
      .range(from, from + 499);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    await appendRows(token, conn.spreadsheet_id!, CONTACTS_TAB, data.map(contactRow));
    written += data.length;
    if (data.length < 500) break;
  }
  await record(accountId, written, null);
  return written;
}
