-- ============================================================
-- 047: Account deletion needs platform-admin approval
--
-- "Delete my account" (Settings → Your data) no longer deletes
-- straight away. It files a request here; a platform admin approves
-- or rejects it on /admin. Approval runs prepare_user_deletion
-- (migration 046) and deletes the login.
--
-- email / business_name are kept only while the request is open so
-- the admin knows who is asking; they're cleared when the request is
-- approved (the user is deleted) — account_deletions keeps the
-- anonymous record.
--
-- Service-role only (RLS on, no policies): the API routes check who
-- is asking.
-- ============================================================

CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,            -- no FK: the row outlives the user
  account_id    UUID REFERENCES accounts(id) ON DELETE SET NULL,
  is_owner      BOOLEAN NOT NULL,
  email         TEXT,
  business_name TEXT,
  reason        TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  admin_note    TEXT,
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at    TIMESTAMPTZ,
  decided_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE account_deletion_requests ENABLE ROW LEVEL SECURITY;

-- One open request per user.
CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_requests_one_pending
  ON account_deletion_requests (user_id) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS account_deletion_requests_status_idx
  ON account_deletion_requests (status, requested_at DESC);
