-- ============================================================
-- 092_partner_program
--
-- Partner (referral) program: people bring businesses to Repeat Grow
-- and earn a share of what those businesses pay.
--
--   partners            one row per partner (an auth user). Applies from
--                       /partner, a platform admin approves in
--                       /admin/partners. `code` is the referral code used
--                       in the link repeatgrow.com/r/<code>.
--   partner_referrals   which account each partner brought in (one
--                       partner per account). Made when a visitor who
--                       came through /r/<code> signs up, or by an admin.
--   partner_commissions what a partner earned from one payment. Made when
--                       an admin records "Amount received" on a referred
--                       account's plan, or added by hand.
--   partner_payouts     money sent to a partner; marks commissions paid.
--
-- RLS: all four tables have RLS enabled and NO policies, so only the
-- service role (the /api/partner and /api/admin/partners routes) can
-- touch them. Partners only ever see their own rows through the API.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS partners (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  code            text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9][a-z0-9-]{2,31}$'),
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  name            text NOT NULL,
  email           text,
  phone           text,
  company         text,
  website         text,
  pitch           text,
  commission_rate numeric(5, 2) NOT NULL DEFAULT 20
                    CHECK (commission_rate >= 0 AND commission_rate <= 100),
  payout_method   text,
  payout_details  text,
  admin_note      text,
  clicks          integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  approved_at     timestamptz
);

CREATE TABLE IF NOT EXISTS partner_referrals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id  uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  account_id  uuid NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  source      text NOT NULL DEFAULT 'link' CHECK (source IN ('link', 'admin')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS partner_referrals_partner_idx
  ON partner_referrals (partner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS partner_payouts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id  uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  amount      numeric(12, 2) NOT NULL CHECK (amount > 0),
  method      text,
  reference   text,
  note        text,
  paid_at     timestamptz NOT NULL DEFAULT now(),
  created_by  uuid
);
CREATE INDEX IF NOT EXISTS partner_payouts_partner_idx
  ON partner_payouts (partner_id, paid_at DESC);

CREATE TABLE IF NOT EXISTS partner_commissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id      uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  account_id      uuid REFERENCES accounts(id) ON DELETE SET NULL,
  payment_amount  numeric(12, 2),
  rate            numeric(5, 2),
  amount          numeric(12, 2) NOT NULL CHECK (amount > 0),
  description     text,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'paid', 'void')),
  payout_id       uuid REFERENCES partner_payouts(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid
);
CREATE INDEX IF NOT EXISTS partner_commissions_partner_idx
  ON partner_commissions (partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS partner_commissions_pending_idx
  ON partner_commissions (partner_id) WHERE status = 'pending';

ALTER TABLE partners            ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_referrals   ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_payouts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_commissions ENABLE ROW LEVEL SECURITY;

-- Count a click on a referral link in one statement (no read-modify-write).
CREATE OR REPLACE FUNCTION public.partner_record_click(p_code text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH hit AS (
    UPDATE partners SET clicks = clicks + 1
    WHERE code = lower(p_code) AND status = 'approved'
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM hit)
$$;

REVOKE ALL ON FUNCTION public.partner_record_click(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partner_record_click(text) TO service_role;
