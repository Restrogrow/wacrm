// ============================================================
// Daily summary — the reporting window and the email body. Pure.
// ============================================================

import {
  istDaysAgo,
  istStartOfDay,
  istDayKey,
  formatDayLabel,
} from '@/lib/admin/time';

export interface SummaryWindow {
  from: Date;
  to: Date;
  /** "Yesterday, 13 Oct" or "Today so far, 14 Oct". */
  label: string;
}

/** Morning summaries cover the previous IST day; from noon, today so far. */
export function summaryWindow(
  hourIst: number,
  now = Date.now()
): SummaryWindow {
  const today = istStartOfDay(now);
  if (hourIst < 12) {
    const from = istDaysAgo(1, now);
    return {
      from,
      to: today,
      label: `Yesterday, ${formatDayLabel(istDayKey(from))}`,
    };
  }
  return {
    from: today,
    to: new Date(now),
    label: `Today so far, ${formatDayLabel(istDayKey(today))}`,
  };
}

export interface SummaryStats {
  messagesReceived: number;
  messagesSent: number;
  newContacts: number;
  newConversations: number;
  awaitingReply: number;
  broadcastsSent: number;
  dealsCreated: number;
  dealsWon: number;
  dealsWonValue: string | null;
  optOuts: number;
}

export const SUMMARY_ROWS: { key: keyof SummaryStats; label: string }[] = [
  { key: 'messagesReceived', label: 'Messages received' },
  { key: 'messagesSent', label: 'Messages sent' },
  { key: 'newConversations', label: 'New conversations' },
  { key: 'newContacts', label: 'New contacts' },
  { key: 'awaitingReply', label: 'Chats waiting for a reply (now)' },
  { key: 'broadcastsSent', label: 'Broadcasts sent' },
  { key: 'dealsCreated', label: 'Deals created' },
  { key: 'dealsWon', label: 'Deals won' },
  { key: 'optOuts', label: 'Opt-outs (STOP)' },
];

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!
  );

export function renderSummaryEmail(args: {
  accountName: string;
  window: SummaryWindow;
  stats: SummaryStats;
  appUrl: string;
}): { subject: string; html: string; text: string } {
  const { accountName, window, stats, appUrl } = args;
  const value = (key: keyof SummaryStats) =>
    key === 'dealsWon' && stats.dealsWonValue
      ? `${stats.dealsWon} (${stats.dealsWonValue})`
      : String(stats[key] ?? 0);

  const subject = `${accountName} — WhatsApp summary · ${window.label}`;
  const rowsHtml = SUMMARY_ROWS.map(
    (r) => `<tr>
      <td style="padding:10px 0;border-bottom:1px solid #eee;color:#555;font-size:14px">${escapeHtml(r.label)}</td>
      <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right;font-weight:600;font-size:14px;color:#111">${escapeHtml(value(r.key))}</td>
    </tr>`
  ).join('');

  const html = `<!doctype html>
<html><body style="margin:0;background:#f6f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:12px;padding:24px">
        <tr><td>
          <p style="margin:0;color:#7c3aed;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase">Repeat Grow daily summary</p>
          <h1 style="margin:6px 0 2px;font-size:20px;color:#111">${escapeHtml(accountName)}</h1>
          <p style="margin:0 0 16px;color:#666;font-size:14px">${escapeHtml(window.label)}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>
          <p style="margin:20px 0 0"><a href="${escapeHtml(appUrl)}/inbox" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600">Open the inbox</a></p>
          <p style="margin:20px 0 0;color:#999;font-size:12px">Change or turn off this email in Settings → Daily summary.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    `Repeat Grow daily summary — ${accountName}`,
    window.label,
    '',
    ...SUMMARY_ROWS.map((r) => `${r.label}: ${value(r.key)}`),
    '',
    `Open the inbox: ${appUrl}/inbox`,
    'Change or turn off this email in Settings → Daily summary.',
  ].join('\n');

  return { subject, html, text };
}
