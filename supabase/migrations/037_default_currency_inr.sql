-- ============================================================
-- 037_default_currency_inr
--
-- Repeat Grow sells to Indian businesses (pricing is in ₹), so new
-- accounts and deals now default to INR instead of USD. Mirrors
-- DEFAULT_CURRENCY in src/lib/currency.ts.
--
-- Existing accounts still on USD are switched too: USD was only ever
-- the column default (021), and at the time of writing no deals
-- existed, so no stored deal value changes meaning. Deals keep their
-- own `currency`; only accounts are updated here.
-- ============================================================

ALTER TABLE accounts ALTER COLUMN default_currency SET DEFAULT 'INR';
ALTER TABLE deals ALTER COLUMN currency SET DEFAULT 'INR';

UPDATE accounts SET default_currency = 'INR' WHERE default_currency = 'USD';
