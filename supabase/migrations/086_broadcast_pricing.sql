-- ============================================================
-- 086: Cost per broadcast
--
-- Meta's status webhooks say for each message whether it is billable
-- and its pricing category (pricing.billable / pricing.category), but
-- not the price. The webhook now stores both on broadcast_recipients;
-- the WhatsApp spend page multiplies a broadcast's billable messages
-- per category by the account's average cost per paid message in that
-- category (from Meta's pricing analytics) to estimate its cost.
--
--   broadcast_recipients.billable          Meta will charge for it
--   broadcast_recipients.pricing_category  marketing / utility / …
--
-- broadcast_cost_counts() aggregates them per broadcast and category
-- for an account and date range (service role only).
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE broadcast_recipients
  ADD COLUMN IF NOT EXISTS billable boolean,
  ADD COLUMN IF NOT EXISTS pricing_category text;

CREATE OR REPLACE FUNCTION public.broadcast_cost_counts(
  p_account_id uuid,
  p_from timestamptz,
  p_to timestamptz
) RETURNS TABLE (
  broadcast_id uuid,
  pricing_category text,
  priced bigint,
  billable bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    r.broadcast_id,
    upper(coalesce(r.pricing_category, 'unknown')),
    count(*),
    count(*) FILTER (WHERE r.billable)
  FROM broadcast_recipients r
  JOIN broadcasts b ON b.id = r.broadcast_id
  WHERE b.account_id = p_account_id
    AND b.created_at >= p_from
    AND b.created_at < p_to
    AND r.billable IS NOT NULL
  GROUP BY r.broadcast_id, upper(coalesce(r.pricing_category, 'unknown'));
$$;

REVOKE ALL ON FUNCTION public.broadcast_cost_counts(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.broadcast_cost_counts(uuid, timestamptz, timestamptz) TO service_role;
