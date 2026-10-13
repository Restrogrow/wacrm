import { describe, expect, it } from 'vitest';

import { csvCell, toCsv } from './export-csv';

describe('csvCell', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('Sharma, Priya')).toBe('"Sharma, Priya"');
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""');
    expect(csvCell('a\nb')).toBe('"a\nb"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(42)).toBe('42');
  });

  it('neutralises spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell('+919876543210')).toBe("'+919876543210");
    expect(csvCell('@cmd')).toBe("'@cmd");
  });
});

describe('toCsv', () => {
  it('adds a BOM and CRLF rows', () => {
    expect(toCsv(['Name', 'City'], [['Priya', 'Pune']])).toBe(
      '﻿Name,City\r\nPriya,Pune\r\n'
    );
  });
});
