-- ============================================================
-- 062_ad_attribution.sql — Click-to-WhatsApp ad attribution
--
-- When a customer starts a chat by tapping a Click-to-WhatsApp ad (or a
-- post "Send message" button), Meta adds a `referral` object to their
-- first inbound message. We store the FIRST touch per contact on the
-- contact row itself so it shows in the inbox, contact view, dashboard
-- and can be used by automations (the existing `contact_field`
-- condition can test e.g. ad_source_type = 'ad').
--
-- Plain nullable columns on `contacts`: the table's existing RLS
-- (account membership) already covers them, so no new policies.
-- ============================================================

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS ad_source_type TEXT,       -- 'ad' | 'post' | 'other'
  ADD COLUMN IF NOT EXISTS ad_source_id TEXT,         -- Meta ad / post id
  ADD COLUMN IF NOT EXISTS ad_source_url TEXT,        -- link the ad points at
  ADD COLUMN IF NOT EXISTS ad_headline TEXT,
  ADD COLUMN IF NOT EXISTS ad_body TEXT,
  ADD COLUMN IF NOT EXISTS ad_ctwa_clid TEXT,         -- click id for conversion reporting
  ADD COLUMN IF NOT EXISTS ad_first_seen_at TIMESTAMPTZ;

-- Fast "leads from ads in the last N days" per account (dashboard card).
CREATE INDEX IF NOT EXISTS contacts_ad_first_seen_idx
  ON contacts (account_id, ad_first_seen_at DESC)
  WHERE ad_first_seen_at IS NOT NULL;
