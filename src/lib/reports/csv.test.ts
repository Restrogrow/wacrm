import { describe, expect, it } from 'vitest'

import { csvCell, toCsv } from './csv'

describe('csvCell', () => {
  it('leaves plain values alone and renders empties as blank', () => {
    expect(csvCell('hello')).toBe('hello')
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
    expect(csvCell(12.5)).toBe('12.5')
    expect(csvCell(Number.NaN)).toBe('')
    expect(csvCell(true)).toBe('true')
  })

  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"')
  })

  it('neutralises spreadsheet formulas in text cells', () => {
    expect(csvCell('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)")
    expect(csvCell('+91 98765')).toBe("'+91 98765")
    expect(csvCell('-2+3')).toBe("'-2+3")
    expect(csvCell('@cmd')).toBe("'@cmd")
    expect(csvCell('\t=1')).toBe("'\t=1")
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe('"\'=HYPERLINK(""http://x"",""y"")"')
  })

  it('keeps real negative numbers numeric', () => {
    expect(csvCell(-5)).toBe('-5')
  })
})

describe('toCsv', () => {
  it('writes a header and CRLF-separated rows', () => {
    const csv = toCsv(
      [
        { header: 'Name', value: (r: { n: string; v: number }) => r.n },
        { header: 'Value', value: (r) => r.v },
      ],
      [
        { n: 'Broadcast, one', v: 3 },
        { n: '=evil()', v: -1 },
      ],
    )
    expect(csv).toBe('Name,Value\r\n"Broadcast, one",3\r\n\'=evil(),-1')
  })

  it('escapes header cells too', () => {
    expect(toCsv([{ header: '=x', value: () => 1 }], [{}])).toBe("'=x\r\n1")
  })
})
