-- ============================================================
-- 073_widget_shortlinks.sql — website chat widget + tracked short links
--
-- chat_widgets        : one floating "Chat on WhatsApp" widget per account
--                       (admin-managed). Customers embed a one-line
--                       <script>; the public script reads a sanitised copy
--                       of this row through a controlled API endpoint.
-- widget_stats_daily  : impressions + clicks per widget per day. Counts
--                       only, no visitor data of any kind.
-- short_links         : /l/<code> redirects created by account admins.
-- short_link_daily    : clicks per link per day, split by device class and
--                       referrer HOST. No IP addresses, no user agents.
--
-- RLS: members can read their account's rows, admins can write configs
-- and links. Counters are written only by two SECURITY DEFINER
-- functions that the service role alone can run (the public endpoints
-- call them with the service-role client), so the public never touches
-- these tables directly.
-- ============================================================

-- ---------- 1. chat widget --------------------------------------
CREATE TABLE IF NOT EXISTS chat_widgets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  -- Random, unguessable id used in the public snippet and API.
  public_id       text NOT NULL UNIQUE CHECK (public_id ~ '^[A-Za-z0-9]{10,24}$'),
  enabled         boolean NOT NULL DEFAULT false,
  -- Digits-only international number shown on wa.me links (admin's choice).
  phone           text NOT NULL DEFAULT '' CHECK (phone ~ '^[0-9]{0,15}$'),
  position        text NOT NULL DEFAULT 'right' CHECK (position IN ('left', 'right')),
  color           text NOT NULL DEFAULT '#25D366' CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  button_label    text NOT NULL DEFAULT 'Chat with us' CHECK (char_length(button_label) <= 40),
  greeting        text NOT NULL DEFAULT 'Hi! How can we help you?' CHECK (char_length(greeting) <= 200),
  prefill_message text NOT NULL DEFAULT 'Hi! I have a question.' CHECK (char_length(prefill_message) <= 300),
  -- When on, the widget shows offline_text outside business hours
  -- (uses the account's Business hours settings, migration 066).
  hours_aware     boolean NOT NULL DEFAULT false,
  offline_text    text NOT NULL DEFAULT 'We are offline right now. Send a message and we will reply as soon as we are back.'
                  CHECK (char_length(offline_text) <= 200),
  -- Ask for the visitor's first name before opening WhatsApp.
  collect_name    boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_widgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_widgets_select ON chat_widgets;
CREATE POLICY chat_widgets_select ON chat_widgets FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS chat_widgets_insert ON chat_widgets;
CREATE POLICY chat_widgets_insert ON chat_widgets FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS chat_widgets_update ON chat_widgets;
CREATE POLICY chat_widgets_update ON chat_widgets FOR UPDATE
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS chat_widgets_delete ON chat_widgets;
CREATE POLICY chat_widgets_delete ON chat_widgets FOR DELETE
  USING (is_account_member(account_id, 'admin'));

-- ---------- 2. widget stats -------------------------------------
CREATE TABLE IF NOT EXISTS widget_stats_daily (
  widget_id   uuid NOT NULL REFERENCES chat_widgets(id) ON DELETE CASCADE,
  day         date NOT NULL,
  impressions integer NOT NULL DEFAULT 0,
  clicks      integer NOT NULL DEFAULT 0,
  PRIMARY KEY (widget_id, day)
);

ALTER TABLE widget_stats_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS widget_stats_daily_select ON widget_stats_daily;
CREATE POLICY widget_stats_daily_select ON widget_stats_daily FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM chat_widgets w
    WHERE w.id = widget_stats_daily.widget_id AND is_account_member(w.account_id)
  ));

-- Count one impression ('view') or click ('click') for an ENABLED widget.
-- Returns true when something was counted. Days use India time so the
-- numbers match what the team sees on the clock.
CREATE OR REPLACE FUNCTION public.widget_track(p_public_id text, p_event text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id  uuid;
  v_day date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF p_event NOT IN ('view', 'click') THEN
    RETURN false;
  END IF;

  SELECT id INTO v_id FROM chat_widgets WHERE public_id = p_public_id AND enabled;
  IF v_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO widget_stats_daily AS s (widget_id, day, impressions, clicks)
  VALUES (v_id, v_day, CASE WHEN p_event = 'view' THEN 1 ELSE 0 END, CASE WHEN p_event = 'click' THEN 1 ELSE 0 END)
  ON CONFLICT (widget_id, day) DO UPDATE
    SET impressions = s.impressions + EXCLUDED.impressions,
        clicks      = s.clicks + EXCLUDED.clicks;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.widget_track(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.widget_track(text, text) TO service_role;

-- ---------- 3. short links --------------------------------------
CREATE TABLE IF NOT EXISTS short_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  code            text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9-]{3,32}$'),
  target_url      text NOT NULL CHECK (char_length(target_url) <= 2000),
  label           text NOT NULL DEFAULT '' CHECK (char_length(label) <= 80),
  utm_source      text NOT NULL DEFAULT '' CHECK (char_length(utm_source) <= 60),
  utm_medium      text NOT NULL DEFAULT '' CHECK (char_length(utm_medium) <= 60),
  utm_campaign    text NOT NULL DEFAULT '' CHECK (char_length(utm_campaign) <= 60),
  is_active       boolean NOT NULL DEFAULT true,
  total_clicks    bigint NOT NULL DEFAULT 0,
  last_clicked_at timestamptz,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS short_links_account_created_idx
  ON short_links (account_id, created_at DESC);

ALTER TABLE short_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS short_links_select ON short_links;
CREATE POLICY short_links_select ON short_links FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS short_links_insert ON short_links;
CREATE POLICY short_links_insert ON short_links FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS short_links_update ON short_links;
CREATE POLICY short_links_update ON short_links FOR UPDATE
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS short_links_delete ON short_links;
CREATE POLICY short_links_delete ON short_links FOR DELETE
  USING (is_account_member(account_id, 'admin'));

-- ---------- 4. short link clicks --------------------------------
CREATE TABLE IF NOT EXISTS short_link_daily (
  link_id       uuid NOT NULL REFERENCES short_links(id) ON DELETE CASCADE,
  day           date NOT NULL,
  device        text NOT NULL CHECK (device IN ('mobile', 'desktop', 'tablet', 'bot', 'other')),
  referrer_host text NOT NULL DEFAULT '' CHECK (char_length(referrer_host) <= 100),
  clicks        integer NOT NULL DEFAULT 0,
  PRIMARY KEY (link_id, day, device, referrer_host)
);

ALTER TABLE short_link_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS short_link_daily_select ON short_link_daily;
CREATE POLICY short_link_daily_select ON short_link_daily FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM short_links l
    WHERE l.id = short_link_daily.link_id AND is_account_member(l.account_id)
  ));

-- Look up an ACTIVE link by code, count the visit, and hand back what the
-- redirect needs. Link previews and crawlers (device = 'bot') are recorded
-- but do not count toward total_clicks, so a WhatsApp preview does not
-- look like a customer click. Returns no row for an unknown/inactive code.
CREATE OR REPLACE FUNCTION public.short_link_hit(p_code text, p_device text, p_referrer text)
RETURNS TABLE (target_url text, utm_source text, utm_medium text, utm_campaign text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  l       short_links%ROWTYPE;
  v_day   date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_dev   text := CASE WHEN p_device IN ('mobile', 'desktop', 'tablet', 'bot') THEN p_device ELSE 'other' END;
  v_ref   text := left(lower(coalesce(p_referrer, '')), 100);
BEGIN
  SELECT * INTO l FROM short_links WHERE code = p_code AND is_active;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO short_link_daily AS d (link_id, day, device, referrer_host, clicks)
  VALUES (l.id, v_day, v_dev, v_ref, 1)
  ON CONFLICT (link_id, day, device, referrer_host) DO UPDATE SET clicks = d.clicks + 1;

  IF v_dev <> 'bot' THEN
    UPDATE short_links SET total_clicks = total_clicks + 1, last_clicked_at = now() WHERE id = l.id;
  END IF;

  RETURN QUERY SELECT l.target_url, l.utm_source, l.utm_medium, l.utm_campaign;
END;
$$;

REVOKE ALL ON FUNCTION public.short_link_hit(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.short_link_hit(text, text, text) TO service_role;
