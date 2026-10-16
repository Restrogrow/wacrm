import { describe, expect, it } from 'vitest';

import { parseSpreadsheetId } from './api';

describe('parseSpreadsheetId', () => {
  const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde';

  it('extracts the ID from a full sheet URL', () => {
    expect(parseSpreadsheetId(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`)).toBe(id);
  });

  it('accepts a bare ID', () => {
    expect(parseSpreadsheetId(` ${id} `)).toBe(id);
  });

  it('rejects anything else', () => {
    expect(parseSpreadsheetId('https://example.com')).toBeNull();
    expect(parseSpreadsheetId('short')).toBeNull();
  });
});
