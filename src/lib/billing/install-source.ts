// ============================================================
// Where an account came from, and therefore who bills it.
//
// Shopify App Store requirement 1.2.1: an app distributed through the
// App Store must charge App Store merchants through Shopify's Billing
// API. Split billing is permitted — everyone else can keep paying us
// directly — but only if the two are distinguishable, which is what
// `accounts.install_source` is for (migration 099).
//
// Pure logic, no I/O, so the decision can be tested. The write lives
// in install-source-server.ts.
// ============================================================

export const INSTALL_SOURCES = ['website', 'shopify_app_store'] as const;
export type InstallSource = (typeof INSTALL_SOURCES)[number];

export const DEFAULT_INSTALL_SOURCE: InstallSource = 'website';

export function isInstallSource(value: unknown): value is InstallSource {
  return (
    typeof value === 'string' &&
    (INSTALL_SOURCES as readonly string[]).includes(value)
  );
}

/** Reads a database row's column, falling back to the default. */
export function installSourceOf(value: unknown): InstallSource {
  return isInstallSource(value) ? value : DEFAULT_INSTALL_SOURCE;
}

/** Must this account be charged through Shopify's Billing API? */
export function billsThroughShopify(value: unknown): boolean {
  return installSourceOf(value) === 'shopify_app_store';
}

export type AdoptDecision =
  | { adopt: true }
  | { adopt: false; reason: AdoptSkipReason };

export type AdoptSkipReason =
  /** Not a Shopify-initiated install — an in-app "Connect Shopify". */
  | 'not_from_app_store'
  /** Already marked; the source is set once and never rewritten. */
  | 'already_set'
  /**
   * A paying website customer who installed from the Shopify admin.
   * Left alone on purpose — see the note below.
   */
  | 'paying_website_customer';

export interface AdoptInput {
  /** The account's current column value. */
  current: unknown;
  /**
   * True only when Shopify itself signed the install request (App Store
   * listing or Shopify admin), as opposed to an admin clicking
   * "Connect Shopify" inside Repeat Grow.
   */
  fromAppStore: boolean;
  /** The account's plan. Anything other than 'trial' is paying us. */
  plan: unknown;
}

/**
 * Should this account move onto Shopify billing?
 *
 * The one judgement worth spelling out: a customer who signed up on the
 * website, is **already paying us**, and later installs from the
 * Shopify admin is NOT flipped. Shopify's rule reads "customers who
 * install through the App Store must use Shopify billing", so flipping
 * would be the literal reading — but it would also silently move a
 * live paying customer's billing relationship, cancel nothing, and
 * risk double-charging them. The safer failure is to leave them put and
 * surface it (`paying_website_customer`) for a human to decide.
 *
 * Trial accounts have no billing relationship to protect, so they do
 * flip, which covers the ordinary App Store signup.
 *
 * This is the rule to confirm with Shopify in the resubmission notes.
 */
export function shouldAdoptShopifyBilling(input: AdoptInput): AdoptDecision {
  if (!input.fromAppStore) return { adopt: false, reason: 'not_from_app_store' };
  if (installSourceOf(input.current) !== DEFAULT_INSTALL_SOURCE) {
    return { adopt: false, reason: 'already_set' };
  }
  if (isPayingPlan(input.plan)) {
    return { adopt: false, reason: 'paying_website_customer' };
  }
  return { adopt: true };
}

/**
 * Is the account on a plan it pays for? Unknown values count as paying,
 * because the costly mistake here is moving someone's billing by
 * accident, not failing to.
 */
export function isPayingPlan(plan: unknown): boolean {
  if (typeof plan !== 'string') return true;
  const value = plan.trim().toLowerCase();
  if (value === '' || value === 'trial') return false;
  return true;
}
