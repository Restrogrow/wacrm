// ============================================================
// Segment (smart list) rules — shared by the rule builder, the
// contacts list and the broadcast audience picker.
//
// A rule set is plain JSON stored in `segments.rules` (migration 068)
// and evaluated in SQL by segment_matches(). This module defines the
// vocabulary, validates a rule set before it is saved or sent to the
// database, and turns conditions into readable sentences. There is
// no SQL here: the database reads each condition's parameters from
// the JSON, so nothing a user types is ever spliced into a query.
// ============================================================

export const MAX_CONDITIONS = 20;
export const MAX_TEXT_LENGTH = 200;

export type SegmentMatch = 'all' | 'any';

export type SegmentFieldKey =
  | 'name'
  | 'phone'
  | 'email'
  | 'company'
  | 'tag'
  | 'created_at'
  | 'ad_source'
  | 'opted_out'
  | 'has_open_conversation'
  | 'custom_field';

/** What kind of input an operator needs. */
export type ValueKind = 'none' | 'text' | 'tags' | 'date' | 'days';

export interface SegmentCondition {
  field: SegmentFieldKey;
  op: string;
  /** text / date (YYYY-MM-DD) / days (as text) / tag ids */
  value?: string | string[];
  /** Only for field === 'custom_field' */
  field_id?: string;
}

export interface SegmentRules {
  match: SegmentMatch;
  conditions: SegmentCondition[];
}

export interface OperatorDef {
  op: string;
  label: string;
  kind: ValueKind;
}

export interface FieldDef {
  key: SegmentFieldKey;
  label: string;
  ops: OperatorDef[];
}

const TEXT_OPS: OperatorDef[] = [
  { op: 'contains', label: 'contains', kind: 'text' },
  { op: 'not_contains', label: 'does not contain', kind: 'text' },
  { op: 'equals', label: 'is exactly', kind: 'text' },
  { op: 'is_empty', label: 'is empty', kind: 'none' },
  { op: 'is_not_empty', label: 'is not empty', kind: 'none' },
];

export const FIELD_DEFS: FieldDef[] = [
  { key: 'name', label: 'Name', ops: TEXT_OPS },
  { key: 'phone', label: 'Phone', ops: TEXT_OPS },
  { key: 'email', label: 'Email', ops: TEXT_OPS },
  { key: 'company', label: 'Company', ops: TEXT_OPS },
  {
    key: 'tag',
    label: 'Tags',
    ops: [
      { op: 'has_any', label: 'has any of', kind: 'tags' },
      { op: 'has_all', label: 'has all of', kind: 'tags' },
      { op: 'has_none', label: 'has none of', kind: 'tags' },
    ],
  },
  {
    key: 'created_at',
    label: 'Added',
    ops: [
      { op: 'within_days', label: 'in the last N days', kind: 'days' },
      { op: 'older_than_days', label: 'more than N days ago', kind: 'days' },
      { op: 'before', label: 'before date', kind: 'date' },
      { op: 'after', label: 'after date', kind: 'date' },
    ],
  },
  {
    key: 'ad_source',
    label: 'Came from an ad',
    ops: [
      { op: 'from_ad', label: 'yes (any Click-to-WhatsApp ad)', kind: 'none' },
      { op: 'not_from_ad', label: 'no', kind: 'none' },
      { op: 'contains', label: 'ad headline / id contains', kind: 'text' },
    ],
  },
  {
    key: 'opted_out',
    label: 'Opted out (STOP)',
    ops: [
      { op: 'is_true', label: 'yes', kind: 'none' },
      { op: 'is_false', label: 'no', kind: 'none' },
    ],
  },
  {
    key: 'has_open_conversation',
    label: 'Has an open conversation',
    ops: [
      { op: 'is_true', label: 'yes', kind: 'none' },
      { op: 'is_false', label: 'no', kind: 'none' },
    ],
  },
  {
    key: 'custom_field',
    label: 'Custom field',
    ops: [
      { op: 'is', label: 'is', kind: 'text' },
      { op: 'is_not', label: 'is not', kind: 'text' },
      { op: 'contains', label: 'contains', kind: 'text' },
      { op: 'is_empty', label: 'is empty', kind: 'none' },
      { op: 'is_not_empty', label: 'is not empty', kind: 'none' },
    ],
  },
];

const FIELD_BY_KEY = new Map(FIELD_DEFS.map((f) => [f.key, f]));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function getFieldDef(key: string): FieldDef | undefined {
  return FIELD_BY_KEY.get(key as SegmentFieldKey);
}

export function getOperatorDef(field: string, op: string): OperatorDef | undefined {
  return getFieldDef(field)?.ops.find((o) => o.op === op);
}

export function emptyRules(): SegmentRules {
  return { match: 'all', conditions: [] };
}

/** A fresh condition for a field, using that field's first operator. */
export function newCondition(field: SegmentFieldKey): SegmentCondition {
  const def = FIELD_BY_KEY.get(field)!;
  const first = def.ops[0];
  return {
    field,
    op: first.op,
    ...(first.kind === 'tags' ? { value: [] } : first.kind === 'none' ? {} : { value: '' }),
  };
}

function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export type ValidationResult =
  | { ok: true; rules: SegmentRules }
  | { ok: false; error: string };

/**
 * Validate and normalise a rule set. Unknown fields/operators, missing
 * values, bad dates/numbers/uuids and oversize input are rejected with a
 * human message. The returned rules contain only known keys, trimmed
 * text and de-duplicated tag ids.
 */
export function validateRules(input: unknown): ValidationResult {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Rules are missing.' };
  const raw = input as Record<string, unknown>;
  const match: SegmentMatch = raw.match === 'any' ? 'any' : 'all';
  if (!Array.isArray(raw.conditions)) return { ok: false, error: 'Rules need a list of conditions.' };
  if (raw.conditions.length > MAX_CONDITIONS) {
    return { ok: false, error: `A segment can have at most ${MAX_CONDITIONS} conditions.` };
  }

  const conditions: SegmentCondition[] = [];
  for (const [i, item] of raw.conditions.entries()) {
    const n = i + 1;
    if (!item || typeof item !== 'object') return { ok: false, error: `Condition ${n} is invalid.` };
    const c = item as Record<string, unknown>;
    const field = typeof c.field === 'string' ? c.field : '';
    const op = typeof c.op === 'string' ? c.op : '';
    const def = getFieldDef(field);
    if (!def) return { ok: false, error: `Condition ${n}: unknown field.` };
    const opDef = def.ops.find((o) => o.op === op);
    if (!opDef) return { ok: false, error: `Condition ${n}: unknown option for ${def.label}.` };

    const out: SegmentCondition = { field: def.key, op };

    if (def.key === 'custom_field') {
      const fid = typeof c.field_id === 'string' ? c.field_id : '';
      if (!UUID_RE.test(fid)) return { ok: false, error: `Condition ${n}: pick a custom field.` };
      out.field_id = fid;
    }

    switch (opDef.kind) {
      case 'none':
        break;
      case 'text': {
        const v = typeof c.value === 'string' ? c.value.trim() : '';
        if (!v) return { ok: false, error: `Condition ${n}: enter a value.` };
        if (v.length > MAX_TEXT_LENGTH) {
          return { ok: false, error: `Condition ${n}: value is too long (max ${MAX_TEXT_LENGTH}).` };
        }
        out.value = v;
        break;
      }
      case 'date': {
        const v = typeof c.value === 'string' ? c.value.trim() : '';
        if (!isValidDate(v)) return { ok: false, error: `Condition ${n}: pick a valid date.` };
        out.value = v;
        break;
      }
      case 'days': {
        const v = typeof c.value === 'string' || typeof c.value === 'number' ? String(c.value).trim() : '';
        if (!/^\d{1,4}$/.test(v) || Number(v) < 1) {
          return { ok: false, error: `Condition ${n}: enter a number of days (1 or more).` };
        }
        out.value = String(Number(v));
        break;
      }
      case 'tags': {
        if (!Array.isArray(c.value)) return { ok: false, error: `Condition ${n}: pick at least one tag.` };
        const ids = [...new Set(c.value.filter((x): x is string => typeof x === 'string'))];
        if (ids.length === 0) return { ok: false, error: `Condition ${n}: pick at least one tag.` };
        if (ids.length > 50 || ids.some((id) => !UUID_RE.test(id))) {
          return { ok: false, error: `Condition ${n}: invalid tag selection.` };
        }
        out.value = ids;
        break;
      }
    }
    conditions.push(out);
  }

  return { ok: true, rules: { match, conditions } };
}

/**
 * Best-effort read of rules loaded from the database (which are already
 * validated on save). Falls back to an empty rule set rather than
 * throwing, so one corrupt row can't break the contacts page.
 */
export function readRules(raw: unknown): SegmentRules {
  const result = validateRules(raw);
  return result.ok ? result.rules : emptyRules();
}

export interface DescribeContext {
  tagNames: Record<string, string>;
  fieldNames: Record<string, string>;
}

/** "Tags has any of VIP, Lead" — for chips and the broadcast review step. */
export function describeCondition(c: SegmentCondition, ctx: DescribeContext): string {
  const def = getFieldDef(c.field);
  const opDef = getOperatorDef(c.field, c.op);
  if (!def || !opDef) return 'Unknown condition';

  const subject =
    c.field === 'custom_field' ? (c.field_id && ctx.fieldNames[c.field_id]) || 'Custom field' : def.label;

  let value = '';
  if (opDef.kind === 'tags' && Array.isArray(c.value)) {
    value = c.value.map((id) => ctx.tagNames[id] ?? 'a deleted tag').join(', ');
  } else if (opDef.kind === 'days' && typeof c.value === 'string') {
    return `${subject} ${opDef.label.replace('N', c.value)}`;
  } else if (typeof c.value === 'string') {
    value = opDef.kind === 'text' ? `"${c.value}"` : c.value;
  }
  return [subject, opDef.label, value].filter(Boolean).join(' ');
}

export function describeRules(rules: SegmentRules, ctx: DescribeContext): string {
  if (rules.conditions.length === 0) return 'Everyone';
  const joiner = rules.match === 'any' ? ' OR ' : ' AND ';
  return rules.conditions.map((c) => describeCondition(c, ctx)).join(joiner);
}
