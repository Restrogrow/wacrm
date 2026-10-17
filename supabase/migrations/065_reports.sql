-- ============================================================
-- 065_reports.sql — aggregation functions behind /reports
--
-- Every function is SECURITY INVOKER (the default): row-level security
-- on conversations / messages / deals / orders still applies to the
-- caller, so a user can only ever aggregate rows of their own account.
-- On top of RLS each function refuses callers who are not a member of
-- p_account_id (viewer and above may read reports) and ranges longer
-- than 366 days.
--
-- Metrics are exact unless noted in the function comment. The schema
-- stores no per-status timestamps for messages and no resolved_at for
-- conversations, so "closed" dates and resolution times are
-- approximations based on conversations.updated_at.
-- ============================================================

-- The report queries walk messages per conversation and filter by time.
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages (conversation_id, created_at);

-- ------------------------------------------------------------
-- Guard shared by every report function
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._report_guard(
  p_account_id uuid,
  p_from timestamptz,
  p_to timestamptz
) RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_account_member(p_account_id) THEN
    RAISE EXCEPTION 'not a member of this account' USING ERRCODE = '42501';
  END IF;
  IF p_to <= p_from THEN
    RAISE EXCEPTION 'invalid date range' USING ERRCODE = '22023';
  END IF;
  IF p_to - p_from > interval '366 days' THEN
    RAISE EXCEPTION 'date range too long (max 365 days)' USING ERRCODE = '22023';
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- 1. Messaging: daily volume + outbound delivery state.
--    Inbound = customer messages; outbound = agent + bot messages.
--    Delivery columns reflect each outbound message's CURRENT status
--    (the schema keeps only the latest status, not when it changed).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_messaging_daily(
  p_account_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_tz text DEFAULT 'UTC'
) RETURNS TABLE (
  day date,
  inbound bigint,
  outbound bigint,
  out_sent bigint,
  out_delivered bigint,
  out_read bigint,
  out_failed bigint
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  PERFORM public._report_guard(p_account_id, p_from, p_to);
  RETURN QUERY
  SELECT
    (m.created_at AT TIME ZONE p_tz)::date,
    count(*) FILTER (WHERE m.sender_type = 'customer'),
    count(*) FILTER (WHERE m.sender_type IN ('agent', 'bot')),
    count(*) FILTER (WHERE m.sender_type IN ('agent', 'bot') AND m.status IN ('sending', 'sent')),
    count(*) FILTER (WHERE m.sender_type IN ('agent', 'bot') AND m.status = 'delivered'),
    count(*) FILTER (WHERE m.sender_type IN ('agent', 'bot') AND m.status = 'read'),
    count(*) FILTER (WHERE m.sender_type IN ('agent', 'bot') AND m.status = 'failed')
  FROM conversations c
  JOIN messages m ON m.conversation_id = c.id
  WHERE c.account_id = p_account_id
    AND m.created_at >= p_from
    AND m.created_at < p_to
  GROUP BY 1
  ORDER BY 1;
END;
$$;

-- ------------------------------------------------------------
-- 2a. Conversations per day: new vs closed.
--     APPROXIMATE for "closed": a conversation counts on the day its
--     row was last updated while status = 'closed'.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_conversations_daily(
  p_account_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_tz text DEFAULT 'UTC'
) RETURNS TABLE (
  day date,
  new_count bigint,
  closed_count bigint
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  PERFORM public._report_guard(p_account_id, p_from, p_to);
  RETURN QUERY
  WITH n AS (
    SELECT (c.created_at AT TIME ZONE p_tz)::date AS d, count(*) AS cnt
    FROM conversations c
    WHERE c.account_id = p_account_id AND c.created_at >= p_from AND c.created_at < p_to
    GROUP BY 1
  ), x AS (
    SELECT (c.updated_at AT TIME ZONE p_tz)::date AS d, count(*) AS cnt
    FROM conversations c
    WHERE c.account_id = p_account_id AND c.status = 'closed'
      AND c.updated_at >= p_from AND c.updated_at < p_to
    GROUP BY 1
  )
  SELECT coalesce(n.d, x.d), coalesce(n.cnt, 0), coalesce(x.cnt, 0)
  FROM n FULL JOIN x ON n.d = x.d
  ORDER BY 1;
END;
$$;

-- ------------------------------------------------------------
-- 2b. Conversation summary for conversations CREATED in the range.
--     First response (exact): seconds from the customer's first message
--       to the first HUMAN agent message after it (bot replies are not
--       counted). Conversations that started with an outbound message
--       are skipped.
--     Resolution (APPROXIMATE): closed conversations only, measured as
--       updated_at - created_at.
--     open_now / pending_now are live snapshots, not range-bound.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_conversation_summary(
  p_account_id uuid,
  p_from timestamptz,
  p_to timestamptz
) RETURNS TABLE (
  new_count bigint,
  closed_count bigint,
  first_response_avg_s double precision,
  first_response_median_s double precision,
  first_response_samples bigint,
  resolution_avg_s double precision,
  resolution_median_s double precision,
  resolution_samples bigint,
  open_now bigint,
  pending_now bigint
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  PERFORM public._report_guard(p_account_id, p_from, p_to);
  RETURN QUERY
  WITH conv AS (
    SELECT c.id, c.status, c.created_at, c.updated_at
    FROM conversations c
    WHERE c.account_id = p_account_id AND c.created_at >= p_from AND c.created_at < p_to
  ), fr AS (
    SELECT extract(epoch FROM (r.t - f.t))::double precision AS secs
    FROM conv c
    CROSS JOIN LATERAL (
      SELECT min(m.created_at) AS t FROM messages m
      WHERE m.conversation_id = c.id AND m.sender_type = 'customer'
    ) f
    CROSS JOIN LATERAL (
      SELECT min(m.created_at) AS t FROM messages m
      WHERE m.conversation_id = c.id AND m.sender_type = 'agent' AND m.created_at > f.t
    ) r
    WHERE f.t IS NOT NULL AND r.t IS NOT NULL
  ), res AS (
    SELECT extract(epoch FROM (c.updated_at - c.created_at))::double precision AS secs
    FROM conv c
    WHERE c.status = 'closed' AND c.updated_at >= c.created_at
  )
  SELECT
    (SELECT count(*) FROM conv),
    (SELECT count(*) FROM conv WHERE status = 'closed'),
    (SELECT avg(secs) FROM fr),
    (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY secs) FROM fr),
    (SELECT count(*) FROM fr),
    (SELECT avg(secs) FROM res),
    (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY secs) FROM res),
    (SELECT count(*) FROM res),
    (SELECT count(*) FROM conversations WHERE account_id = p_account_id AND status = 'open'),
    (SELECT count(*) FROM conversations WHERE account_id = p_account_id AND status = 'pending');
END;
$$;

-- ------------------------------------------------------------
-- 3. Agent performance, attributed through conversations.assigned_agent_id
--    (the app does not record WHICH agent sent each message).
--    conversations / closed / first response: conversations created in the
--      range, grouped by their current assignee.
--    messages_sent: agent messages sent in the range inside conversations
--      currently assigned to that person.
--    A NULL agent_user_id row is the unassigned queue.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_agents(
  p_account_id uuid,
  p_from timestamptz,
  p_to timestamptz
) RETURNS TABLE (
  agent_user_id uuid,
  agent_name text,
  conversations bigint,
  closed bigint,
  messages_sent bigint,
  first_response_avg_s double precision,
  first_response_samples bigint
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  PERFORM public._report_guard(p_account_id, p_from, p_to);
  RETURN QUERY
  WITH conv AS (
    SELECT c.id, c.assigned_agent_id AS a, c.status
    FROM conversations c
    WHERE c.account_id = p_account_id AND c.created_at >= p_from AND c.created_at < p_to
  ), fr AS (
    SELECT c.a, extract(epoch FROM (r.t - f.t))::double precision AS secs
    FROM conv c
    CROSS JOIN LATERAL (
      SELECT min(m.created_at) AS t FROM messages m
      WHERE m.conversation_id = c.id AND m.sender_type = 'customer'
    ) f
    CROSS JOIN LATERAL (
      SELECT min(m.created_at) AS t FROM messages m
      WHERE m.conversation_id = c.id AND m.sender_type = 'agent' AND m.created_at > f.t
    ) r
    WHERE f.t IS NOT NULL AND r.t IS NOT NULL
  ), fr_agg AS (
    SELECT fr.a, avg(fr.secs) AS avg_s, count(*) AS n FROM fr GROUP BY fr.a
  ), conv_agg AS (
    SELECT conv.a, count(*) AS n, count(*) FILTER (WHERE conv.status = 'closed') AS closed_n
    FROM conv GROUP BY conv.a
  ), msg_agg AS (
    SELECT c.assigned_agent_id AS a, count(*) AS n
    FROM conversations c
    JOIN messages m ON m.conversation_id = c.id
    WHERE c.account_id = p_account_id
      AND m.sender_type = 'agent'
      AND m.created_at >= p_from AND m.created_at < p_to
    GROUP BY c.assigned_agent_id
  ), keys AS (
    SELECT conv_agg.a FROM conv_agg
    UNION
    SELECT msg_agg.a FROM msg_agg
  )
  SELECT
    k.a,
    CASE
      WHEN k.a IS NULL THEN 'Unassigned'
      ELSE coalesce(nullif(btrim(p.full_name), ''), p.email, 'Former team member')
    END,
    coalesce(ca.n, 0),
    coalesce(ca.closed_n, 0),
    coalesce(ma.n, 0),
    fa.avg_s,
    coalesce(fa.n, 0)
  FROM keys k
  LEFT JOIN conv_agg ca ON ca.a IS NOT DISTINCT FROM k.a
  LEFT JOIN msg_agg ma ON ma.a IS NOT DISTINCT FROM k.a
  LEFT JOIN fr_agg fa ON fa.a IS NOT DISTINCT FROM k.a
  LEFT JOIN profiles p ON p.user_id = k.a AND p.account_id = p_account_id
  ORDER BY coalesce(ca.n, 0) DESC, coalesce(ma.n, 0) DESC;
END;
$$;

-- ------------------------------------------------------------
-- 5a. Deals per currency.
--     created_*: deals created in the range.
--     won_* / lost_*: deals now won / lost whose row was last updated in
--       the range (APPROXIMATE close date: there is no closed_at column).
--     open_*: live pipeline snapshot, not range-bound.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_deals(
  p_account_id uuid,
  p_from timestamptz,
  p_to timestamptz
) RETURNS TABLE (
  currency text,
  created_count bigint,
  created_value numeric,
  won_count bigint,
  won_value numeric,
  lost_count bigint,
  lost_value numeric,
  open_count bigint,
  open_value numeric
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  PERFORM public._report_guard(p_account_id, p_from, p_to);
  RETURN QUERY
  SELECT
    coalesce(nullif(btrim(d.currency), ''), 'INR'),
    count(*) FILTER (WHERE d.created_at >= p_from AND d.created_at < p_to),
    coalesce(sum(d.value) FILTER (WHERE d.created_at >= p_from AND d.created_at < p_to), 0),
    count(*) FILTER (WHERE d.status = 'won' AND d.updated_at >= p_from AND d.updated_at < p_to),
    coalesce(sum(d.value) FILTER (WHERE d.status = 'won' AND d.updated_at >= p_from AND d.updated_at < p_to), 0),
    count(*) FILTER (WHERE d.status = 'lost' AND d.updated_at >= p_from AND d.updated_at < p_to),
    coalesce(sum(d.value) FILTER (WHERE d.status = 'lost' AND d.updated_at >= p_from AND d.updated_at < p_to), 0),
    count(*) FILTER (WHERE d.status = 'open'),
    coalesce(sum(d.value) FILTER (WHERE d.status = 'open'), 0)
  FROM deals d
  WHERE d.account_id = p_account_id
    AND (
      (d.created_at >= p_from AND d.created_at < p_to)
      OR (d.updated_at >= p_from AND d.updated_at < p_to)
      OR d.status = 'open'
    )
  GROUP BY 1
  ORDER BY 1;
END;
$$;

-- ------------------------------------------------------------
-- 5b. Orders placed in the range, by source.
--     whatsapp: WhatsApp orders (amounts stored in paise); revenue counts
--       orders that are marked paid so far.
--     shopify: Shopify orders; revenue is the gross order total (Shopify's
--       total is stored as text, non-numeric values are ignored) and
--       paid_count is NULL because payment state is not stored.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_orders(
  p_account_id uuid,
  p_from timestamptz,
  p_to timestamptz
) RETURNS TABLE (
  source text,
  currency text,
  order_count bigint,
  paid_count bigint,
  revenue numeric
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  PERFORM public._report_guard(p_account_id, p_from, p_to);
  RETURN QUERY
  SELECT
    'whatsapp'::text,
    coalesce(nullif(btrim(o.currency), ''), 'INR'),
    count(*),
    count(*) FILTER (WHERE o.payment_status = 'paid'),
    coalesce(sum(o.total) FILTER (WHERE o.payment_status = 'paid'), 0)::numeric / 100.0
  FROM whatsapp_orders o
  WHERE o.account_id = p_account_id AND o.created_at >= p_from AND o.created_at < p_to
  GROUP BY 2
  UNION ALL
  SELECT
    'shopify'::text,
    coalesce(nullif(btrim(s.currency), ''), 'INR'),
    count(*),
    NULL::bigint,
    coalesce(sum(CASE WHEN s.total ~ '^[0-9]+(\.[0-9]+)?$' THEN s.total::numeric END), 0)
  FROM shopify_orders s
  WHERE s.account_id = p_account_id AND s.created_at >= p_from AND s.created_at < p_to
  GROUP BY 2
  ORDER BY 1, 2;
END;
$$;

-- ------------------------------------------------------------
-- Lock the API surface: signed-in users only, never anon.
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public._report_guard(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_messaging_daily(uuid, timestamptz, timestamptz, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_conversations_daily(uuid, timestamptz, timestamptz, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_conversation_summary(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_agents(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_deals(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_orders(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public._report_guard(uuid, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.report_messaging_daily(uuid, timestamptz, timestamptz, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.report_conversations_daily(uuid, timestamptz, timestamptz, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.report_conversation_summary(uuid, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.report_agents(uuid, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.report_deals(uuid, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.report_orders(uuid, timestamptz, timestamptz) TO authenticated, service_role;
