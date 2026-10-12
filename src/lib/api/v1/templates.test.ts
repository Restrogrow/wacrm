import { describe, expect, it, vi } from 'vitest';

import {
  createTemplateIdempotent,
  decideTemplateAction,
  normalizeCategory,
  parseCreateTemplateBody,
  parseNamesParam,
  serializeTemplate,
  TemplateRequestError,
  type CreateTemplateDeps,
  type TemplateRow,
} from './templates';

const BODY = 'Happy birthday, {{1}}! {{2}} has a treat for you: {{3}}. Use code {{4}} before {{5}}.';
const REQUEST = {
  name: 'spice_garden_indiranagar_birthday_gift',
  category: 'MARKETING',
  language: 'en',
  body_text: BODY,
  sample_values: { body: ['Priya', 'Spice Garden Indiranagar', 'Free Gulab Jamun', 'GIFT7K2Q9M', '27 Oct'] },
};

function row(overrides: Partial<TemplateRow> = {}): TemplateRow {
  return {
    id: 'tpl-1',
    name: REQUEST.name,
    language: 'en',
    category: 'Marketing',
    status: 'PENDING',
    body_text: BODY,
    meta_template_id: '1234567890',
    ...overrides,
  };
}

function deps(existing: TemplateRow | null, dryRun = false) {
  return {
    findExisting: vi.fn(async () => existing),
    submitNew: vi.fn(async () => row({ id: 'tpl-new', status: 'PENDING' })),
    resubmit: vi.fn(async () => row({ status: 'PENDING' })),
    isDryRun: () => dryRun,
  } satisfies CreateTemplateDeps;
}

const payload = () => parseCreateTemplateBody(REQUEST);

describe('parseCreateTemplateBody', () => {
  it('accepts any-case category and maps it to the stored form', () => {
    expect(payload().category).toBe('Marketing');
    expect(normalizeCategory('utility')).toBe('Utility');
    expect(normalizeCategory('Marketing')).toBe('Marketing');
    expect(normalizeCategory('nope')).toBeNull();
  });

  it('rejects AUTHENTICATION and missing fields', () => {
    expect(() => parseCreateTemplateBody({ ...REQUEST, category: 'AUTHENTICATION' })).toThrow(TemplateRequestError);
    expect(() => parseCreateTemplateBody({ ...REQUEST, name: '' })).toThrow(/name/);
    expect(() => parseCreateTemplateBody({ ...REQUEST, body_text: undefined })).toThrow(/body_text/);
    expect(() => parseCreateTemplateBody(null)).toThrow(TemplateRequestError);
  });
});

describe('createTemplateIdempotent', () => {
  it('submits a new template when none exists', async () => {
    const d = deps(null);
    const r = await createTemplateIdempotent(payload(), d);
    expect(r.kind).toBe('created');
    expect(d.submitNew).toHaveBeenCalledOnce();
    expect(d.resubmit).not.toHaveBeenCalled();
  });

  it.each(['PENDING', 'APPROVED'])('same body, %s: returns the current row, no resubmit', async (status) => {
    const d = deps(row({ status }));
    const r = await createTemplateIdempotent(payload(), d);
    expect(r.kind).toBe('unchanged');
    expect(r.template.status).toBe(status);
    expect(d.submitNew).not.toHaveBeenCalled();
    expect(d.resubmit).not.toHaveBeenCalled();
  });

  it('APPROVED with a different body: conflict, nothing sent to Meta', async () => {
    const d = deps(row({ status: 'APPROVED', body_text: 'Old wording {{1}} here.' }));
    const r = await createTemplateIdempotent(payload(), d);
    expect(r.kind).toBe('conflict');
    expect(d.submitNew).not.toHaveBeenCalled();
    expect(d.resubmit).not.toHaveBeenCalled();
  });

  it('REJECTED: resubmits (edit on Meta), even with the same body', async () => {
    const d = deps(row({ status: 'REJECTED' }));
    const r = await createTemplateIdempotent(payload(), d);
    expect(r.kind).toBe('resubmitted');
    expect(d.resubmit).toHaveBeenCalledOnce();
    expect(d.submitNew).not.toHaveBeenCalled();
  });

  it('DRAFT that never reached Meta: submitted fresh', async () => {
    const d = deps(row({ status: 'DRAFT', meta_template_id: null }));
    const r = await createTemplateIdempotent(payload(), d);
    expect(r.kind).toBe('resubmitted');
    expect(d.submitNew).toHaveBeenCalledOnce();
    expect(d.resubmit).not.toHaveBeenCalled();
  });

  it('REJECTED dry-run row is submitted fresh once dry-run is off', async () => {
    const d = deps(row({ status: 'REJECTED', meta_template_id: 'dry-run-abc' }), false);
    await createTemplateIdempotent(payload(), d);
    expect(d.submitNew).toHaveBeenCalledOnce();
    expect(d.resubmit).not.toHaveBeenCalled();
  });
});

describe('helpers', () => {
  it('decideTemplateAction covers every branch', () => {
    expect(decideTemplateAction(null, { body_text: BODY })).toBe('create');
    expect(decideTemplateAction({ status: 'PENDING', body_text: 'x' }, { body_text: BODY })).toBe('conflict');
    expect(decideTemplateAction({ status: 'PAUSED', body_text: BODY }, { body_text: BODY })).toBe('unchanged');
  });

  it('serializes category and status in Meta words', () => {
    expect(serializeTemplate(row({ status: 'APPROVED' }))).toEqual({
      id: 'tpl-1',
      name: REQUEST.name,
      language: 'en',
      category: 'MARKETING',
      status: 'APPROVED',
    });
  });

  it('parses ?names= and caps it at 50', () => {
    expect(parseNamesParam(null)).toBeNull();
    expect(parseNamesParam('a, b,,a')).toEqual(['a', 'b']);
    const tooMany = Array.from({ length: 51 }, (_, i) => `t${i}`).join(',');
    expect(() => parseNamesParam(tooMany)).toThrow(TemplateRequestError);
  });
});
