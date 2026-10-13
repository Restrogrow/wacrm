// ============================================================
// Business details collected at signup — pure, no I/O.
//
// Email signups fill these in on /signup. Google (OAuth) signups
// skip that form, so handle_new_user() creates the account without
// them; the dashboard layout then routes the owner through
// /onboarding until they're filled in. Both forms share the option
// lists below so the values stored stay consistent.
//
// Storage (migration 029): nature_of_business / team_size live on
// `accounts`, mobile_number on the owner's `profiles` row, and the
// business name is `accounts.name`.
// ============================================================

export const NATURE_OF_BUSINESS_OPTIONS = [
  "Retail & E-commerce",
  "Services & Consulting",
  "Healthcare",
  "Education",
  "Real Estate",
  "Hospitality & Travel",
  "Finance & Insurance",
  "Manufacturing",
  "Other",
];

export const TEAM_SIZE_OPTIONS = ["Just me", "2-5", "6-20", "21-50", "50+"];

export interface BusinessProfileFields {
  natureOfBusiness: string | null;
  teamSize: string | null;
  mobileNumber: string | null;
}

/** True once every signup-form business field has a value. */
export function isBusinessProfileComplete(fields: BusinessProfileFields): boolean {
  return Boolean(
    fields.natureOfBusiness?.trim() &&
      fields.teamSize?.trim() &&
      fields.mobileNumber?.trim(),
  );
}

/** "google", "email", … — how a Supabase auth user signed up. */
export function signupProviderLabel(provider: string | null | undefined): string {
  if (!provider) return "—";
  if (provider === "email") return "Email";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}
