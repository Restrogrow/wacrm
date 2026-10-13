import { describe, expect, it } from 'vitest';

import { renderSummaryEmail, summaryWindow, type SummaryStats } from './report';

// 14 Oct 2026, 09:05 IST
const now = Date.parse('2026-10-14T03:35:00Z');

describe('summaryWindow', () => {
  it('covers yesterday for morning sends', () => {
    const w = summaryWindow(9, now);
    expect(w.from.toISOString()).toBe('2026-10-12T18:30:00.000Z');
    expect(w.to.toISOString()).toBe('2026-10-13T18:30:00.000Z');
    expect(w.label).toBe('Yesterday, 13 Oct');
  });

  it('covers today so far from noon', () => {
    const w = summaryWindow(20, now);
    expect(w.from.toISOString()).toBe('2026-10-13T18:30:00.000Z');
    expect(w.label).toBe('Today so far, 14 Oct');
  });
});

describe('renderSummaryEmail', () => {
  const stats: SummaryStats = {
    messagesReceived: 42,
    messagesSent: 30,
    newContacts: 5,
    newConversations: 7,
    awaitingReply: 2,
    broadcastsSent: 1,
    dealsCreated: 3,
    dealsWon: 1,
    dealsWonValue: '₹4,999',
    optOuts: 0,
  };

  it('includes the numbers and escapes the account name', () => {
    const email = renderSummaryEmail({
      accountName: 'Taste <of> Banaras',
      window: summaryWindow(9, now),
      stats,
      appUrl: 'https://repeatgrow.com',
    });
    expect(email.subject).toContain('Yesterday, 13 Oct');
    expect(email.html).toContain('Taste &lt;of&gt; Banaras');
    expect(email.html).not.toContain('<of>');
    expect(email.text).toContain('Messages received: 42');
    expect(email.text).toContain('Deals won: 1 (₹4,999)');
    expect(email.html).toContain('https://repeatgrow.com/inbox');
  });
});
