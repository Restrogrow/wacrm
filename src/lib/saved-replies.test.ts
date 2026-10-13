import { describe, expect, it } from 'vitest';

import {
  matchReplies,
  normalizeShortcut,
  renderReply,
  slashQuery,
} from './saved-replies';

const replies = [
  {
    id: '1',
    shortcut: 'price',
    title: 'Price list',
    body: 'Our prices start at ₹499',
  },
  {
    id: '2',
    shortcut: 'hours',
    title: 'Opening hours',
    body: 'We are open 11am–11pm',
  },
  {
    id: '3',
    shortcut: 'thanks',
    title: null,
    body: 'Thanks {{name}}! Price confirmed.',
  },
];

describe('slashQuery', () => {
  it('only triggers on a leading slash word', () => {
    expect(slashQuery('/')).toBe('');
    expect(slashQuery('/Pri')).toBe('pri');
    expect(slashQuery('/price list')).toBeNull();
    expect(slashQuery('hi /price')).toBeNull();
    expect(slashQuery('')).toBeNull();
  });
});

describe('matchReplies', () => {
  it('ranks shortcut prefixes before other matches', () => {
    expect(matchReplies(replies, 'pri').map((r) => r.id)).toEqual(['1', '3']);
    expect(matchReplies(replies, 'open').map((r) => r.id)).toEqual(['2']);
    expect(matchReplies(replies, '').length).toBe(3);
  });
});

describe('renderReply', () => {
  it('fills variables', () => {
    expect(
      renderReply('Hi {{name}} ({{full_name}}), {{agent}} here', {
        contactName: 'Priya Sharma',
        agentName: 'Rahul Verma',
      })
    ).toBe('Hi Priya (Priya Sharma), Rahul here');
  });

  it("doesn't greet a phone number and tidies the gap", () => {
    expect(
      renderReply('Hi {{name}}, welcome!', { contactName: '919876543210' })
    ).toBe('Hi, welcome!');
  });
});

describe('normalizeShortcut', () => {
  it('makes a safe shortcut', () => {
    expect(normalizeShortcut(' /Price List! ')).toBe('price-list');
  });
});
