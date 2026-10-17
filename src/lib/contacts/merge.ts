// ============================================================
// Contact merge — field-combination rules for the preview screen.
//
// The database function merge_contacts() (migration 068) does the real
// merge in one transaction; this module mirrors its field rules so the
// preview shows exactly what the merged contact will look like.
//
//   - text fields (name, email, company, avatar): the side the user
//     picked wins unless it is blank, then the other side fills in;
//   - phone: the primary's, unless the primary has none (a BSUID-only
//     contact) and the secondary does;
//   - opted-out: if either was opted out, the earliest opt-out is kept
//     (we never silently re-subscribe someone who said STOP);
//   - created date: the oldest of the two;
//   - ad attribution: the older first touch wins.
// ============================================================

import type { Contact } from '@/types';

export type MergeSide = 'primary' | 'secondary';
export type MergeField = 'name' | 'email' | 'company' | 'avatar_url';

export const MERGE_FIELDS: { key: MergeField; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'company', label: 'Company' },
  { key: 'avatar_url', label: 'Photo' },
];

export type MergeChoices = Partial<Record<MergeField, MergeSide>>;

const blank = (v: string | null | undefined): boolean => !v || v.trim() === '';

/** Mirror of the SQL _merge_pick(): chosen side wins unless blank. */
export function pickField(
  primary: string | null | undefined,
  secondary: string | null | undefined,
  choice: MergeSide | undefined,
): string | null {
  const first = choice === 'secondary' ? secondary : primary;
  const second = choice === 'secondary' ? primary : secondary;
  if (!blank(first)) return first ?? null;
  if (!blank(second)) return second ?? null;
  return null;
}

/** Fields where both contacts have a value and the values differ. */
export function fieldConflicts(primary: Contact, secondary: Contact): MergeField[] {
  return MERGE_FIELDS.map((f) => f.key).filter((key) => {
    const a = primary[key];
    const b = secondary[key];
    if (blank(a) || blank(b)) return false;
    return (a as string).trim().toLowerCase() !== (b as string).trim().toLowerCase();
  });
}

/** Default choice: keep the primary for every conflict. */
export function defaultChoices(): Record<MergeField, MergeSide> {
  return { name: 'primary', email: 'primary', company: 'primary', avatar_url: 'primary' };
}

export interface MergedPreview {
  name: string | null;
  email: string | null;
  company: string | null;
  avatar_url: string | null;
  phone: string;
  opted_out_at: string | null;
  created_at: string;
  /** True when the secondary's first ad touch is older and wins. */
  adFromSecondary: boolean;
}

export function previewMerge(primary: Contact, secondary: Contact, choices: MergeChoices): MergedPreview {
  const optedOut =
    primary.opted_out_at && secondary.opted_out_at
      ? primary.opted_out_at < secondary.opted_out_at
        ? primary.opted_out_at
        : secondary.opted_out_at
      : (primary.opted_out_at ?? secondary.opted_out_at ?? null);

  const sAd = secondary.ad_first_seen_at;
  const pAd = primary.ad_first_seen_at;

  return {
    name: pickField(primary.name, secondary.name, choices.name),
    email: pickField(primary.email, secondary.email, choices.email),
    company: pickField(primary.company, secondary.company, choices.company),
    avatar_url: pickField(primary.avatar_url, secondary.avatar_url, choices.avatar_url),
    phone: blank(primary.phone) ? secondary.phone : primary.phone,
    opted_out_at: optedOut,
    created_at: primary.created_at < secondary.created_at ? primary.created_at : secondary.created_at,
    adFromSecondary: !!sAd && (!pAd || sAd < pAd),
  };
}
