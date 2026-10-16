-- ============================================================
-- Demo requests from the public /demo page.
--
-- Written by POST /api/demo-request with the service role. RLS is on
-- with no policies, so signed-in users and anonymous visitors cannot
-- read or write the table through PostgREST. Platform admins read it
-- in the Supabase table editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS demo_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  business_name TEXT NOT NULL,
  whatsapp      TEXT NOT NULL,
  email         TEXT,
  team_size     TEXT,
  use_case      TEXT,
  message       TEXT,
  source_page   TEXT,
  status        TEXT NOT NULL DEFAULT 'new'
                CHECK (status IN ('new', 'contacted', 'demo_done', 'won', 'lost')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE demo_requests ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS demo_requests_created_idx
  ON demo_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS demo_requests_status_idx
  ON demo_requests (status, created_at DESC);
