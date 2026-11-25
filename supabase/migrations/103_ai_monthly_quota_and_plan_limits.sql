-- ============================================================
-- 103_ai_monthly_quota_and_plan_limits.sql
--
-- Two changes from the November 2026 official pricing sheet
-- (RepeatGrow_Pricing_Plans.pdf):
--
-- 1. AI chatbot replies and AI voice-agent calls are now billed
--    per calendar month, not per day. The sheet is explicit: "AI
--    replies and voice minutes reset every billing month; unused
--    ones do not carry forward." `ai_usage_daily` (migration 074)
--    stays as-is for 'suggest'/'analysis'/'summary' — the sheet
--    doesn't mention those as a plan differentiator, they're just an
--    internal cost guardrail, not a customer-facing limit. Only
--    'chatbot' and 'voice_call' move to the new monthly table.
--
-- 2. plan_limit() numbers updated to match the sheet: contacts,
--    broadcasts and custom fields are unlimited on every plan now;
--    team_members is 3/5/10/unlimited (was 5/25/50/unlimited); and
--    automation_flows is repurposed as chatbot_flows — 2/unlimited/
--    unlimited/unlimited — scoped to the `flows` table only (the
--    visual chatbot-flow builder). The sheet never mentions a limit
--    on `automations` (CRM trigger automations), so that trigger is
--    dropped: it's unlimited on every plan, same as broadcasts.
--
-- Lowering a limit never deletes anything or breaks an account that
-- already exceeds it — same as every plan_limit() change before this
-- one, the trigger only blocks a *new* insert once at the cap.
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_usage_monthly (
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  feature TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, month, feature)
);

ALTER TABLE ai_usage_monthly ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: service role only, same as ai_usage_daily.

-- Atomically count one use this calendar month (Asia/Kolkata). Returns
-- TRUE if allowed, FALSE if this month's cap is already reached (the
-- counter is then left unchanged). Mirrors ai_usage_bump() exactly,
-- just keyed by month instead of day.
CREATE OR REPLACE FUNCTION public.ai_usage_bump_monthly(
  p_account_id UUID,
  p_feature TEXT,
  p_cap INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month DATE := date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_used INTEGER;
BEGIN
  IF p_cap <= 0 THEN
    RETURN FALSE;
  END IF;
  INSERT INTO ai_usage_monthly (account_id, month, feature, used)
  VALUES (p_account_id, v_month, p_feature, 1)
  ON CONFLICT (account_id, month, feature)
  DO UPDATE SET used = ai_usage_monthly.used + 1
  WHERE ai_usage_monthly.used < p_cap
  RETURNING used INTO v_used;
  RETURN v_used IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.ai_usage_bump_monthly(UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_usage_bump_monthly(UUID, TEXT, INTEGER) TO service_role;

-- Unconditional add, no cap check — for recording something that
-- already happened (an AI call's real minutes, known only once it
-- ends) rather than gating something about to happen. The gate for
-- voice_call is a plain read of this table before the call starts
-- (lib/ai/quota.ts); this just adds the true amount afterwards, even
-- if that pushes the month over its cap by the one call already in
-- flight — there is nothing left to refuse by then.
CREATE OR REPLACE FUNCTION public.ai_usage_record_monthly(
  p_account_id UUID,
  p_feature TEXT,
  p_amount INTEGER
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month DATE := date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF p_amount <= 0 THEN
    RETURN;
  END IF;
  INSERT INTO ai_usage_monthly (account_id, month, feature, used)
  VALUES (p_account_id, v_month, p_feature, p_amount)
  ON CONFLICT (account_id, month, feature)
  DO UPDATE SET used = ai_usage_monthly.used + p_amount;
END;
$$;

REVOKE ALL ON FUNCTION public.ai_usage_record_monthly(UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_usage_record_monthly(UUID, TEXT, INTEGER) TO service_role;

-- ---- plan_limit(): new numbers, chatbot_flows replaces automation_flows ----
CREATE OR REPLACE FUNCTION public.plan_limit(p_plan text, p_resource text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_plan = 'enterprise' THEN NULL
    WHEN p_plan IN ('growth', 'trial') THEN
      CASE p_resource
        WHEN 'team_members' THEN 5
        WHEN 'chatbot_flows' THEN NULL
        ELSE NULL
      END
    WHEN p_plan = 'pro' THEN
      CASE p_resource
        WHEN 'team_members' THEN 10
        WHEN 'chatbot_flows' THEN NULL
        ELSE NULL
      END
    ELSE
      CASE p_resource
        WHEN 'team_members' THEN 3
        WHEN 'chatbot_flows' THEN 2
        ELSE NULL
      END
  END
$$;

-- enforce_plan_limit(): 'chatbot_flows' counts only the `flows` table
-- (the visual chatbot-flow builder) — `automations` (CRM trigger
-- automations) is no longer counted into it or limited at all.
CREATE OR REPLACE FUNCTION public.enforce_plan_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resource text := TG_ARGV[0];
  v_plan text;
  v_limit integer;
  v_count integer;
  v_label text;
BEGIN
  v_plan := account_effective_plan(NEW.account_id);
  IF v_plan IS NULL THEN
    RETURN NEW;
  END IF;
  v_limit := plan_limit(v_plan, v_resource);
  IF v_limit IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_resource = 'chatbot_flows' THEN
    SELECT count(*) INTO v_count FROM flows WHERE account_id = NEW.account_id;
    v_label := 'chatbot flows';
  ELSIF v_resource = 'team_members' THEN
    SELECT (SELECT count(*) FROM profiles WHERE account_id = NEW.account_id)
         + (SELECT count(*) FROM account_invitations
              WHERE account_id = NEW.account_id
                AND accepted_at IS NULL AND expires_at > now())
      INTO v_count;
    v_label := 'team members (including pending invites)';
  ELSE
    RETURN NEW;
  END IF;

  IF v_count >= v_limit THEN
    -- SQLSTATE PL001 lets the app recognise it (lib/billing/plans.ts);
    -- the message itself is shown to the user as-is.
    RAISE EXCEPTION 'The % plan allows % %. Upgrade your plan to add more.',
      CASE v_plan WHEN 'expired' THEN 'Starter' ELSE initcap(v_plan) END,
      v_limit, v_label
      USING ERRCODE = 'PL001';
  END IF;
  RETURN NEW;
END;
$$;

-- automations, custom_fields, broadcasts, contacts: unlimited on every
-- plan now (the sheet shows a plain checkmark, no number, for all of
-- them) — drop their triggers; enforce_plan_limit() above no longer
-- has a branch for any of these resource names either.
DROP TRIGGER IF EXISTS enforce_plan_limit_automations ON automations;
DROP TRIGGER IF EXISTS enforce_plan_limit_custom_fields ON custom_fields;
DROP TRIGGER IF EXISTS enforce_plan_limit_broadcasts ON broadcasts;
DROP TRIGGER IF EXISTS enforce_plan_limit_contacts ON contacts;

-- flows: renamed resource, same trigger mechanics.
DROP TRIGGER IF EXISTS enforce_plan_limit_flows ON flows;
CREATE TRIGGER enforce_plan_limit_flows
  BEFORE INSERT ON flows
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limit('chatbot_flows');

-- team_members: same trigger, new numbers via plan_limit() above.
