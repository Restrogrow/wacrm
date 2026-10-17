-- ============================================================
-- 068_segments_merge.sql — saved contact segments + contact merge
--
-- 1. `segments`: saved smart lists. A segment is a JSON rule set:
--      { "match": "all" | "any",
--        "conditions": [ { "field": "...", "op": "...", "value": ... } ] }
--    Rules are evaluated entirely in SQL by segment_matches() /
--    segment_cond_match(). There is NO dynamic SQL: every condition is
--    a fixed CASE branch reading its parameters from the JSON, so a
--    rule can never inject SQL. Free-text conditions use position()
--    instead of ILIKE so '%' and '_' in a search are literal.
--    All evaluation functions are SECURITY INVOKER: RLS on contacts,
--    contact_tags, conversations … still scopes every row to the
--    caller's account, and each entry point also checks membership.
--
-- 2. find_duplicate_contacts(): groups contacts that share an email or
--    the same last 10 phone digits (so 98765 43210 and +91 98765 43210
--    are caught even though their normalised numbers differ).
--
-- 3. merge_contacts(): folds one contact into another in one
--    transaction. SECURITY DEFINER because notifications and other
--    child rows are guarded per user by RLS; it therefore checks, by
--    hand, that the caller is an agent+ of the contacts' account, and
--    returns the same error for "missing" and "not yours" so ids can't
--    be probed across accounts.
--
-- Idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- segments table
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS segments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  rules       JSONB NOT NULL DEFAULT '{"match":"all","conditions":[]}'::jsonb
              CHECK (
                jsonb_typeof(rules) = 'object'
                AND jsonb_typeof(rules -> 'conditions') = 'array'
                AND jsonb_array_length(rules -> 'conditions') <= 20
              ),
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS segments_account_name_key
  ON segments (account_id, lower(btrim(name)));

ALTER TABLE segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS segments_select ON segments;
DROP POLICY IF EXISTS segments_insert ON segments;
DROP POLICY IF EXISTS segments_update ON segments;
DROP POLICY IF EXISTS segments_delete ON segments;
CREATE POLICY segments_select ON segments FOR SELECT USING (is_account_member(account_id));
CREATE POLICY segments_insert ON segments FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY segments_update ON segments FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY segments_delete ON segments FOR DELETE USING (is_account_member(account_id, 'agent'));

-- ------------------------------------------------------------
-- One condition against one contact
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.segment_cond_match(c public.contacts, cond jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_field  text := cond ->> 'field';
  v_op     text := cond ->> 'op';
  v_text   text := coalesce(cond ->> 'value', '');
  v_val    text;
  v_ids    uuid[];
  v_days   int;
  v_digits text;
BEGIN
  IF v_field IN ('name', 'phone', 'email', 'company') THEN
    v_val := CASE v_field
      WHEN 'name'  THEN c.name
      WHEN 'phone' THEN c.phone
      WHEN 'email' THEN c.email
      ELSE c.company
    END;
    CASE v_op
      WHEN 'contains' THEN
        IF v_text = '' THEN RETURN false; END IF;
        IF position(lower(v_text) IN lower(coalesce(v_val, ''))) > 0 THEN RETURN true; END IF;
        IF v_field = 'phone' THEN
          v_digits := regexp_replace(v_text, '\D', '', 'g');
          RETURN v_digits <> '' AND position(v_digits IN coalesce(c.phone_normalized, '')) > 0;
        END IF;
        RETURN false;
      WHEN 'not_contains' THEN
        IF v_text = '' THEN RETURN true; END IF;
        RETURN position(lower(v_text) IN lower(coalesce(v_val, ''))) = 0;
      WHEN 'equals'       THEN RETURN lower(btrim(coalesce(v_val, ''))) = lower(btrim(v_text));
      WHEN 'is_empty'     THEN RETURN btrim(coalesce(v_val, '')) = '';
      WHEN 'is_not_empty' THEN RETURN btrim(coalesce(v_val, '')) <> '';
      ELSE RAISE EXCEPTION 'unknown operator "%" for field "%"', v_op, v_field USING ERRCODE = '22023';
    END CASE;

  ELSIF v_field = 'tag' THEN
    IF jsonb_typeof(cond -> 'value') <> 'array' THEN
      RAISE EXCEPTION 'tag condition needs a list of tags' USING ERRCODE = '22023';
    END IF;
    v_ids := ARRAY(SELECT jsonb_array_elements_text(cond -> 'value'))::uuid[];
    IF cardinality(v_ids) = 0 THEN
      RAISE EXCEPTION 'tag condition needs at least one tag' USING ERRCODE = '22023';
    END IF;
    CASE v_op
      WHEN 'has_any' THEN
        RETURN EXISTS (SELECT 1 FROM contact_tags ct WHERE ct.contact_id = c.id AND ct.tag_id = ANY (v_ids));
      WHEN 'has_none' THEN
        RETURN NOT EXISTS (SELECT 1 FROM contact_tags ct WHERE ct.contact_id = c.id AND ct.tag_id = ANY (v_ids));
      WHEN 'has_all' THEN
        RETURN (SELECT count(DISTINCT ct.tag_id) FROM contact_tags ct
                 WHERE ct.contact_id = c.id AND ct.tag_id = ANY (v_ids))
             = (SELECT count(DISTINCT x) FROM unnest(v_ids) AS x);
      ELSE RAISE EXCEPTION 'unknown operator "%" for field "tag"', v_op USING ERRCODE = '22023';
    END CASE;

  ELSIF v_field = 'created_at' THEN
    CASE v_op
      WHEN 'before' THEN RETURN c.created_at <  v_text::date;
      WHEN 'after'  THEN RETURN c.created_at >= (v_text::date + 1);
      WHEN 'within_days' THEN
        v_days := v_text::int;
        RETURN c.created_at >= now() - make_interval(days => v_days);
      WHEN 'older_than_days' THEN
        v_days := v_text::int;
        RETURN c.created_at < now() - make_interval(days => v_days);
      ELSE RAISE EXCEPTION 'unknown operator "%" for field "created_at"', v_op USING ERRCODE = '22023';
    END CASE;

  ELSIF v_field = 'ad_source' THEN
    CASE v_op
      WHEN 'from_ad'     THEN RETURN c.ad_source_type IS NOT NULL;
      WHEN 'not_from_ad' THEN RETURN c.ad_source_type IS NULL;
      WHEN 'contains' THEN
        IF v_text = '' THEN RETURN false; END IF;
        RETURN position(lower(v_text) IN lower(
                 coalesce(c.ad_headline, '') || ' ' || coalesce(c.ad_source_id, '') || ' ' ||
                 coalesce(c.ad_source_url, '') || ' ' || coalesce(c.ad_body, ''))) > 0;
      ELSE RAISE EXCEPTION 'unknown operator "%" for field "ad_source"', v_op USING ERRCODE = '22023';
    END CASE;

  ELSIF v_field = 'opted_out' THEN
    CASE v_op
      WHEN 'is_true'  THEN RETURN c.opted_out_at IS NOT NULL;
      WHEN 'is_false' THEN RETURN c.opted_out_at IS NULL;
      ELSE RAISE EXCEPTION 'unknown operator "%" for field "opted_out"', v_op USING ERRCODE = '22023';
    END CASE;

  ELSIF v_field = 'has_open_conversation' THEN
    CASE v_op
      WHEN 'is_true' THEN
        RETURN EXISTS (SELECT 1 FROM conversations cv WHERE cv.contact_id = c.id AND cv.status <> 'closed');
      WHEN 'is_false' THEN
        RETURN NOT EXISTS (SELECT 1 FROM conversations cv WHERE cv.contact_id = c.id AND cv.status <> 'closed');
      ELSE RAISE EXCEPTION 'unknown operator "%" for field "has_open_conversation"', v_op USING ERRCODE = '22023';
    END CASE;

  ELSIF v_field = 'custom_field' THEN
    SELECT cv.value INTO v_val
      FROM contact_custom_values cv
     WHERE cv.contact_id = c.id
       AND cv.custom_field_id = (cond ->> 'field_id')::uuid;
    CASE v_op
      WHEN 'is'       THEN RETURN v_val IS NOT NULL AND lower(btrim(v_val)) = lower(btrim(v_text));
      WHEN 'is_not'   THEN RETURN v_val IS NULL OR lower(btrim(v_val)) <> lower(btrim(v_text));
      WHEN 'contains' THEN
        IF v_text = '' THEN RETURN false; END IF;
        RETURN position(lower(v_text) IN lower(coalesce(v_val, ''))) > 0;
      WHEN 'is_empty'     THEN RETURN btrim(coalesce(v_val, '')) = '';
      WHEN 'is_not_empty' THEN RETURN btrim(coalesce(v_val, '')) <> '';
      ELSE RAISE EXCEPTION 'unknown operator "%" for field "custom_field"', v_op USING ERRCODE = '22023';
    END CASE;
  END IF;

  RAISE EXCEPTION 'unknown segment field "%"', v_field USING ERRCODE = '22023';
END;
$$;

-- ------------------------------------------------------------
-- A whole rule set against one contact
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.segment_matches(c public.contacts, rules jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_conds jsonb := coalesce(rules -> 'conditions', '[]'::jsonb);
BEGIN
  IF jsonb_typeof(v_conds) <> 'array' THEN
    RAISE EXCEPTION 'segment conditions must be a list' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(v_conds) > 20 THEN
    RAISE EXCEPTION 'a segment can have at most 20 conditions' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(v_conds) = 0 THEN
    RETURN true;
  END IF;
  IF coalesce(rules ->> 'match', 'all') = 'any' THEN
    RETURN EXISTS (SELECT 1 FROM jsonb_array_elements(v_conds) e WHERE public.segment_cond_match(c, e));
  END IF;
  RETURN NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_conds) e WHERE NOT public.segment_cond_match(c, e));
END;
$$;

-- ------------------------------------------------------------
-- Paged members of a rule set (used by the contacts list and by
-- broadcasts). Same return shape as filter_contacts_by_tags (025).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.segment_contacts(
  p_account_id         uuid,
  p_rules              jsonb,
  p_search             text    DEFAULT NULL,
  p_limit              int     DEFAULT 25,
  p_offset             int     DEFAULT 0,
  p_exclude_opted_out  boolean DEFAULT false
)
RETURNS TABLE (contact contacts, total_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_account_member(p_account_id) THEN
    RAISE EXCEPTION 'not a member of this account' USING ERRCODE = '42501';
  END IF;
  p_limit  := least(greatest(coalesce(p_limit, 25), 1), 1000);
  p_offset := greatest(coalesce(p_offset, 0), 0);

  RETURN QUERY
  WITH matched AS (
    SELECT c.id, c.created_at
    FROM contacts c
    WHERE c.account_id = p_account_id
      AND (NOT coalesce(p_exclude_opted_out, false) OR c.opted_out_at IS NULL)
      AND (
        nullif(btrim(coalesce(p_search, '')), '') IS NULL
        OR position(lower(btrim(p_search)) IN lower(
             coalesce(c.name, '') || ' ' || c.phone || ' ' || coalesce(c.email, ''))) > 0
      )
      AND public.segment_matches(c, p_rules)
  ), page AS (
    SELECT m.id, count(*) OVER () AS total_count
    FROM matched m
    ORDER BY m.created_at DESC, m.id
    LIMIT p_limit OFFSET p_offset
  )
  SELECT c AS contact, page.total_count
  FROM page
  JOIN contacts c ON c.id = page.id
  ORDER BY c.created_at DESC, c.id;
END;
$$;

-- Live count for the rule builder preview.
CREATE OR REPLACE FUNCTION public.segment_count(
  p_account_id         uuid,
  p_rules              jsonb,
  p_exclude_opted_out  boolean DEFAULT false
)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_count bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_account_member(p_account_id) THEN
    RAISE EXCEPTION 'not a member of this account' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO v_count
  FROM contacts c
  WHERE c.account_id = p_account_id
    AND (NOT coalesce(p_exclude_opted_out, false) OR c.opted_out_at IS NULL)
    AND public.segment_matches(c, p_rules);
  RETURN v_count;
END;
$$;

-- Saved segments with their current size, for the sidebar.
CREATE OR REPLACE FUNCTION public.segments_with_counts(p_account_id uuid)
RETURNS TABLE (
  id            uuid,
  name          text,
  rules         jsonb,
  created_at    timestamptz,
  updated_at    timestamptz,
  contact_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_account_member(p_account_id) THEN
    RAISE EXCEPTION 'not a member of this account' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT s.id, s.name, s.rules, s.created_at, s.updated_at,
         (SELECT count(*) FROM contacts c
           WHERE c.account_id = s.account_id AND public.segment_matches(c, s.rules))
  FROM segments s
  WHERE s.account_id = p_account_id
  ORDER BY lower(s.name);
END;
$$;

-- ------------------------------------------------------------
-- Duplicate finder
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_duplicate_contacts(p_account_id uuid)
RETURNS TABLE (kind text, dup_key text, contact_ids uuid[])
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_account_member(p_account_id) THEN
    RAISE EXCEPTION 'not a member of this account' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH phone_groups AS (
    SELECT 'phone'::text AS k, right(c.phone_normalized, 10) AS key_value,
           array_agg(c.id ORDER BY c.created_at, c.id) AS ids
    FROM contacts c
    WHERE c.account_id = p_account_id AND length(c.phone_normalized) >= 10
    GROUP BY right(c.phone_normalized, 10)
    HAVING count(*) > 1
  ), email_groups AS (
    SELECT 'email'::text, lower(btrim(c.email)),
           array_agg(c.id ORDER BY c.created_at, c.id)
    FROM contacts c
    WHERE c.account_id = p_account_id AND btrim(coalesce(c.email, '')) <> ''
    GROUP BY lower(btrim(c.email))
    HAVING count(*) > 1
  )
  SELECT * FROM (
    SELECT * FROM phone_groups
    UNION ALL
    SELECT * FROM email_groups
  ) g
  ORDER BY 1, 2
  LIMIT 200;
END;
$$;

-- Counts of what a merge would move, per contact (for the preview).
CREATE OR REPLACE FUNCTION public.contact_merge_preview(p_a uuid, p_b uuid)
RETURNS TABLE (
  contact_id    uuid,
  conversations bigint,
  deals         bigint,
  notes         bigint,
  tags          bigint,
  orders        bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT c.id,
         (SELECT count(*) FROM conversations x  WHERE x.contact_id = c.id),
         (SELECT count(*) FROM deals x          WHERE x.contact_id = c.id),
         (SELECT count(*) FROM contact_notes x  WHERE x.contact_id = c.id),
         (SELECT count(*) FROM contact_tags x   WHERE x.contact_id = c.id),
         (SELECT count(*) FROM whatsapp_orders x WHERE x.contact_id = c.id)
  FROM contacts c
  WHERE c.id IN (p_a, p_b);
$$;

-- ------------------------------------------------------------
-- Merge
-- ------------------------------------------------------------
-- Pick a text field: the chosen side wins unless it is blank.
CREATE OR REPLACE FUNCTION public._merge_pick(p_primary text, p_secondary text, p_choice text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_choice = 'secondary' THEN
      CASE WHEN btrim(coalesce(p_secondary, '')) <> '' THEN p_secondary ELSE p_primary END
    ELSE
      CASE WHEN btrim(coalesce(p_primary, '')) <> '' THEN p_primary ELSE p_secondary END
  END;
$$;

CREATE OR REPLACE FUNCTION public.merge_contacts(
  p_primary    uuid,
  p_secondary  uuid,
  p_choices    jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  p         contacts;
  s         contacts;
  v_table   text;
  v_n       bigint;
  v_moved   jsonb := '{}'::jsonb;
  v_use_s_ad boolean;
  v_phone   text;
  v_optout  timestamptz;
  v_tables  text[] := ARRAY[
    'conversations', 'contact_notes', 'deals', 'broadcast_recipients',
    'automation_logs', 'automation_pending_executions', 'notifications',
    'shopify_orders', 'whatsapp_calls', 'whatsapp_form_responses',
    'whatsapp_orders', 'woocommerce_orders', 'payment_links'
  ];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_primary IS NULL OR p_secondary IS NULL OR p_primary = p_secondary THEN
    RAISE EXCEPTION 'pick two different contacts' USING ERRCODE = '22023';
  END IF;

  -- Lock both rows in a fixed order so two merges can't deadlock.
  PERFORM 1 FROM contacts WHERE id IN (p_primary, p_secondary) ORDER BY id FOR UPDATE;
  SELECT * INTO p FROM contacts WHERE id = p_primary;
  SELECT * INTO s FROM contacts WHERE id = p_secondary;

  -- One error for missing / other account / not enough role, so ids
  -- can't be probed across accounts.
  IF p.id IS NULL OR s.id IS NULL
     OR p.account_id <> s.account_id
     OR NOT public.is_account_member(p.account_id, 'agent') THEN
    RAISE EXCEPTION 'contact not found' USING ERRCODE = 'P0002';
  END IF;

  -- 1. Re-point child rows that have no per-contact unique constraint.
  --    Static table list; skipped if a table doesn't exist in this deployment.
  FOREACH v_table IN ARRAY v_tables LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format('UPDATE public.%I SET contact_id = $1 WHERE contact_id = $2', v_table)
        USING p.id, s.id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n > 0 THEN v_moved := v_moved || jsonb_build_object(v_table, v_n); END IF;
    END IF;
  END LOOP;

  -- 2. Tags: move only the ones the primary doesn't already have.
  UPDATE contact_tags ct SET contact_id = p.id
   WHERE ct.contact_id = s.id
     AND NOT EXISTS (SELECT 1 FROM contact_tags x WHERE x.contact_id = p.id AND x.tag_id = ct.tag_id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN v_moved := v_moved || jsonb_build_object('contact_tags', v_n); END IF;
  DELETE FROM contact_tags WHERE contact_id = s.id;

  -- 3. Custom field values: primary keeps its value; a blank one is
  --    filled from the secondary; fields only the secondary has move over.
  UPDATE contact_custom_values pv SET value = sv.value
    FROM contact_custom_values sv
   WHERE pv.contact_id = p.id AND sv.contact_id = s.id
     AND sv.custom_field_id = pv.custom_field_id
     AND btrim(coalesce(pv.value, '')) = '' AND btrim(coalesce(sv.value, '')) <> '';
  UPDATE contact_custom_values cv SET contact_id = p.id
   WHERE cv.contact_id = s.id
     AND NOT EXISTS (SELECT 1 FROM contact_custom_values x
                      WHERE x.contact_id = p.id AND x.custom_field_id = cv.custom_field_id);
  DELETE FROM contact_custom_values WHERE contact_id = s.id;

  -- 4. Flow runs: history moves; an active run moves only if the
  --    primary has none (idx_one_active_run_per_contact).
  UPDATE flow_runs SET contact_id = p.id WHERE contact_id = s.id AND status <> 'active';
  UPDATE flow_runs fr SET contact_id = p.id
   WHERE fr.contact_id = s.id AND fr.status = 'active'
     AND NOT EXISTS (SELECT 1 FROM flow_runs x
                      WHERE x.user_id = fr.user_id AND x.contact_id = p.id AND x.status = 'active');

  -- 5. Remove the secondary BEFORE writing merged identifiers onto the
  --    primary, so unique indexes (phone, whatsapp_user_id) can't clash.
  DELETE FROM contacts WHERE id = s.id;

  -- 6. Merged field values.
  v_phone  := CASE WHEN btrim(coalesce(p.phone, '')) = '' THEN s.phone ELSE p.phone END;
  v_optout := CASE
                WHEN p.opted_out_at IS NULL THEN s.opted_out_at
                WHEN s.opted_out_at IS NULL THEN p.opted_out_at
                ELSE least(p.opted_out_at, s.opted_out_at)
              END;
  -- First ad touch wins: take the secondary's attribution only if it is older.
  v_use_s_ad := s.ad_first_seen_at IS NOT NULL
                AND (p.ad_first_seen_at IS NULL OR s.ad_first_seen_at < p.ad_first_seen_at);

  UPDATE contacts SET
    phone             = v_phone,
    name              = public._merge_pick(p.name,       s.name,       p_choices ->> 'name'),
    email             = public._merge_pick(p.email,      s.email,      p_choices ->> 'email'),
    company           = public._merge_pick(p.company,    s.company,    p_choices ->> 'company'),
    avatar_url        = public._merge_pick(p.avatar_url, s.avatar_url, p_choices ->> 'avatar_url'),
    whatsapp_user_id  = coalesce(p.whatsapp_user_id, s.whatsapp_user_id),
    whatsapp_username = coalesce(p.whatsapp_username, s.whatsapp_username),
    opted_out_at      = v_optout,
    ad_source_type    = CASE WHEN v_use_s_ad THEN s.ad_source_type ELSE p.ad_source_type END,
    ad_source_id      = CASE WHEN v_use_s_ad THEN s.ad_source_id   ELSE p.ad_source_id END,
    ad_source_url     = CASE WHEN v_use_s_ad THEN s.ad_source_url  ELSE p.ad_source_url END,
    ad_headline       = CASE WHEN v_use_s_ad THEN s.ad_headline    ELSE p.ad_headline END,
    ad_body           = CASE WHEN v_use_s_ad THEN s.ad_body        ELSE p.ad_body END,
    ad_ctwa_clid      = CASE WHEN v_use_s_ad THEN s.ad_ctwa_clid   ELSE p.ad_ctwa_clid END,
    ad_first_seen_at  = CASE WHEN v_use_s_ad THEN s.ad_first_seen_at ELSE p.ad_first_seen_at END,
    created_at        = least(p.created_at, s.created_at),
    updated_at        = now()
  WHERE id = p.id;

  -- 7. Leave a trail on the surviving contact.
  INSERT INTO contact_notes (contact_id, user_id, account_id, note_text)
  VALUES (
    p.id, v_uid, p.account_id,
    'Merged duplicate contact "' || coalesce(nullif(btrim(s.name), ''), 'no name') ||
    '" (' || coalesce(nullif(s.phone, ''), s.email, 'no phone') || ') into this contact.'
  );

  RETURN jsonb_build_object('primary_id', p.id, 'merged_id', s.id, 'moved', v_moved);
END;
$$;

ALTER FUNCTION public.merge_contacts(uuid, uuid, jsonb) OWNER TO postgres;

-- ------------------------------------------------------------
-- Lock the API surface: signed-in users only, never anon.
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.segment_cond_match(public.contacts, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.segment_matches(public.contacts, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.segment_contacts(uuid, jsonb, text, int, int, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.segment_count(uuid, jsonb, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.segments_with_counts(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.find_duplicate_contacts(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.contact_merge_preview(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._merge_pick(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.merge_contacts(uuid, uuid, jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.segment_cond_match(public.contacts, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.segment_matches(public.contacts, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.segment_contacts(uuid, jsonb, text, int, int, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.segment_count(uuid, jsonb, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.segments_with_counts(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_duplicate_contacts(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.contact_merge_preview(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._merge_pick(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merge_contacts(uuid, uuid, jsonb) TO authenticated;
