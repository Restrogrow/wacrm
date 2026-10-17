// What the browser may see about an alert channel. Never includes the
// encrypted target (webhook URL / bot token).

import { describeTarget, isAlertKind } from './core';

export const CHANNEL_LIST_COLUMNS = 'id, kind, name, chat_id, events, enabled, last_status, last_error, last_sent_at, created_at';

export interface ChannelListRow {
  id: string;
  kind: string;
  name: string;
  chat_id: string | null;
  events: string[] | null;
  enabled: boolean;
  last_status: string | null;
  last_error: string | null;
  last_sent_at: string | null;
  created_at: string;
}

export function publicChannel(row: ChannelListRow) {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    description: isAlertKind(row.kind) ? describeTarget(row.kind, row.chat_id) : row.kind,
    events: row.events ?? [],
    enabled: row.enabled,
    last_status: row.last_status,
    last_error: row.last_error,
    last_sent_at: row.last_sent_at,
    created_at: row.created_at,
  };
}
