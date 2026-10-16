-- ============================================================
-- Pro plan (between Growth and Enterprise).
--
-- Plans: trial | starter | growth | pro | enterprise.
-- Pro limits: 200,000 contacts, 1,000 broadcasts a month, 100
-- automations + flows, 100 custom fields, 50 team members.
-- Enterprise stays unlimited (custom pricing). Trial keeps Growth
-- limits. Mirrors src/lib/billing/plans.ts: change both together.
-- ============================================================

-- Allow 'pro' in accounts.plan. The CHECK from 041 was unnamed, so find
-- whichever check constraint covers the plan column and replace it.
DO $$
DECLARE
  c text;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att
      ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
    WHERE con.conrelid = 'public.accounts'::regclass
      AND con.contype = 'c'
      AND att.attname = 'plan'
  LOOP
    EXECUTE format('ALTER TABLE public.accounts DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_plan_check
  CHECK (plan IN ('trial', 'starter', 'growth', 'pro', 'enterprise'));

CREATE OR REPLACE FUNCTION public.account_effective_plan(p_account_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN a.plan IN ('starter', 'growth', 'pro', 'enterprise')
         AND (a.plan_expires_at IS NULL OR a.plan_expires_at > now()) THEN a.plan
    WHEN a.plan = 'trial' AND a.trial_ends_at > now() THEN 'trial'
    ELSE 'expired'
  END
  FROM accounts a
  WHERE a.id = p_account_id
$$;

-- NULL = unlimited. Trial gets Growth limits; expired falls back to Starter.
CREATE OR REPLACE FUNCTION public.plan_limit(p_plan text, p_resource text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_plan = 'enterprise' THEN NULL
    WHEN p_plan = 'pro' THEN
      CASE p_resource
        WHEN 'contacts' THEN 200000
        WHEN 'broadcasts_per_month' THEN 1000
        WHEN 'automation_flows' THEN 100
        WHEN 'custom_fields' THEN 100
        WHEN 'team_members' THEN 50
      END
    WHEN p_plan IN ('growth', 'trial') THEN
      CASE p_resource
        WHEN 'contacts' THEN 50000
        WHEN 'broadcasts_per_month' THEN 250
        WHEN 'automation_flows' THEN 25
        WHEN 'custom_fields' THEN 25
        WHEN 'team_members' THEN 25
      END
    ELSE
      CASE p_resource
        WHEN 'contacts' THEN 2000
        WHEN 'broadcasts_per_month' THEN 60
        WHEN 'automation_flows' THEN 5
        WHEN 'custom_fields' THEN 5
        WHEN 'team_members' THEN 5
      END
  END
$$;
