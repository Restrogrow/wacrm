// ============================================================
// Shopify automation steps — pure logic, no I/O.
//
// An event's automation is a list of steps, each with its own template,
// variable mapping and delay. "Abandoned cart → 30 min, then 7 h, then
// 24 h" is three steps on `abandoned_checkout`.
//
// Delays are measured from the EVENT, not from the previous step. That
// makes a sequence's schedule independent of its own history: deleting
// step 2 or re-ordering the list can't shift when step 3 fires, and the
// merchant reading "step 3: 24 hours" sees the real answer rather than
// a sum they have to work out. It also means a step whose predecessor
// failed still goes out, which is what you want for a cart chase.
// ============================================================

import {
  countBodyVariables,
  isShopifyVariable,
  isUrlButtonVariable,
  type ShopifyVariable,
} from './events';

export const DELAY_UNITS = ['minutes', 'hours', 'days'] as const;
export type DelayUnit = (typeof DELAY_UNITS)[number];

export function isDelayUnit(value: unknown): value is DelayUnit {
  return (
    typeof value === 'string' && (DELAY_UNITS as readonly string[]).includes(value)
  );
}

/** Mirrors the CHECK on shopify_event_rules.delay_minutes (migration 093). */
export const MAX_DELAY_MINUTES = 129_600; // 90 days

/**
 * Steps per event. Five is past any sensible cart sequence and bounds
 * how many queue rows one webhook can create.
 */
export const MAX_STEPS_PER_EVENT = 5;

const UNIT_MINUTES: Record<DelayUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 1440,
};

export interface MessageStep {
  step_order: number;
  enabled: boolean;
  template_name: string | null;
  template_language: string | null;
  body_variables: ShopifyVariable[];
  /** Authoritative delay from the event. 0 = send immediately. */
  delay_minutes: number;
  /** What the merchant typed, for redisplay only. */
  delay_unit: DelayUnit;
  /** Fills a URL button's {{1}}; null when the template has no such button. */
  url_button_variable: ShopifyVariable | null;
}

export function delayToMinutes(value: number, unit: DelayUnit): number {
  return Math.round(value) * UNIT_MINUTES[unit];
}

/**
 * Split stored minutes back into the largest unit that divides evenly,
 * so 420 redisplays as "7 hours" rather than "420 minutes". A stored
 * `delay_unit` takes precedence when it still divides cleanly — the
 * merchant who typed "60 minutes" should not be shown "1 hour".
 */
export function minutesToDelay(
  minutes: number,
  preferred?: DelayUnit | null
): { value: number; unit: DelayUnit } {
  if (minutes <= 0) return { value: 0, unit: preferred ?? 'minutes' };

  if (preferred && minutes % UNIT_MINUTES[preferred] === 0) {
    return { value: minutes / UNIT_MINUTES[preferred], unit: preferred };
  }
  for (const unit of ['days', 'hours', 'minutes'] as const) {
    if (minutes % UNIT_MINUTES[unit] === 0) {
      return { value: minutes / UNIT_MINUTES[unit], unit };
    }
  }
  return { value: minutes, unit: 'minutes' };
}

/** "Send immediately" / "after 30 minutes" / "after 7 hours". */
export function describeDelay(step: MessageStep): string {
  if (step.delay_minutes <= 0) return 'Send immediately';
  const { value, unit } = minutesToDelay(step.delay_minutes, step.delay_unit);
  const label = value === 1 ? unit.replace(/s$/, '') : unit;
  return `After ${value} ${label}`;
}

export function sendAtFor(eventAt: Date, delayMinutes: number): Date {
  return new Date(eventAt.getTime() + Math.max(0, delayMinutes) * 60_000);
}

/**
 * The queue's uniqueness key, and so the no-double-send guarantee.
 *
 * Built from (event, step, entity) rather than a random id: a Shopify
 * retry re-runs the whole handler and tries to re-schedule the same
 * sequence, and this makes that collide on insert instead of queueing a
 * second copy. `entityKey` is the checkout token for cart steps and the
 * Shopify order id for order steps.
 */
export function dedupeKey(
  event: string,
  stepOrder: number,
  entityKey: string
): string {
  return `${event}:${stepOrder}:${entityKey}`;
}

// ------------------------------------------------------------
// Validation (API input)
// ------------------------------------------------------------

export type StepsResult =
  | { ok: true; value: MessageStep[] }
  | { ok: false; error: string };

function asInt(value: unknown, min: number, max: number): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.round(n);
  return i >= min && i <= max ? i : null;
}

/**
 * Validate one event's steps as they arrive from the Settings form.
 *
 * `bodyTextOf` resolves a template name to its body so the variable
 * mapping can be checked against the real {{n}} count — a template with
 * three variables and two mapped would otherwise be rejected by Meta at
 * send time, hours later, with the merchant long gone from the page.
 */
export function validateSteps(
  raw: unknown,
  bodyTextOf: (templateName: string) => string | null | undefined
): StepsResult {
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'Steps must be a list.' };
  }
  if (raw.length === 0) return { ok: true, value: [] };
  if (raw.length > MAX_STEPS_PER_EVENT) {
    return {
      ok: false,
      error: `At most ${MAX_STEPS_PER_EVENT} steps per event.`,
    };
  }

  const steps: MessageStep[] = [];
  for (let i = 0; i < raw.length; i++) {
    const s = (raw[i] && typeof raw[i] === 'object' ? raw[i] : {}) as Record<
      string,
      unknown
    >;
    const position = i + 1;

    const enabled = s.enabled === true;
    const templateName =
      typeof s.template_name === 'string' && s.template_name.trim()
        ? s.template_name.trim()
        : null;

    // An enabled step with no template would sit in the queue and fail
    // at send time; reject it while the merchant can still fix it.
    if (enabled && !templateName) {
      return { ok: false, error: `Step ${position} needs a template.` };
    }

    const delayMinutes = asInt(s.delay_minutes ?? 0, 0, MAX_DELAY_MINUTES);
    if (delayMinutes === null) {
      return {
        ok: false,
        error: `Step ${position}: delay must be between 0 and 90 days.`,
      };
    }

    const delayUnit = isDelayUnit(s.delay_unit) ? s.delay_unit : 'minutes';

    const bodyVariables = Array.isArray(s.body_variables)
      ? s.body_variables.filter(isShopifyVariable)
      : [];

    if (enabled && templateName) {
      const needed = countBodyVariables(bodyTextOf(templateName));
      if (bodyVariables.length !== needed) {
        return {
          ok: false,
          error: `Step ${position}: template "${templateName}" has ${needed} variable${needed === 1 ? '' : 's'} to fill, but ${bodyVariables.length} ${bodyVariables.length === 1 ? 'is' : 'are'} mapped.`,
        };
      }
    }

    // Null rather than an error when it isn't a URL variable: the
    // dropdown only offers URL ones, so a bad value here is a stale
    // client, and dropping it degrades to "no dynamic button" instead
    // of blocking the save.
    const urlButtonVariable = isUrlButtonVariable(s.url_button_variable)
      ? s.url_button_variable
      : null;

    steps.push({
      step_order: i,
      enabled,
      template_name: templateName,
      template_language:
        typeof s.template_language === 'string' && s.template_language.trim()
          ? s.template_language.trim()
          : null,
      body_variables: bodyVariables,
      delay_minutes: delayMinutes,
      delay_unit: delayUnit,
      url_button_variable: urlButtonVariable,
    });
  }

  // Two steps at the same delay would fire together and read as a
  // duplicate to the customer. Equal delays are the likely typo
  // ("30 min, 30 min"), so catch it rather than silently ordering them.
  const enabledDelays = steps
    .filter((s) => s.enabled)
    .map((s) => s.delay_minutes);
  if (new Set(enabledDelays).size !== enabledDelays.length) {
    return {
      ok: false,
      error: 'Two steps have the same delay — give each one a different time.',
    };
  }

  return { ok: true, value: steps };
}

/** Steps that should actually be scheduled, earliest first. */
export function schedulableSteps(steps: MessageStep[]): MessageStep[] {
  return steps
    .filter((s) => s.enabled && s.template_name)
    .sort((a, b) => a.delay_minutes - b.delay_minutes);
}
