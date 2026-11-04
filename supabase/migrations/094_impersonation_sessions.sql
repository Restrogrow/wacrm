-- ============================================================
-- 094_impersonation_sessions.sql — "Log in as" from /admin
--
-- Lets a platform admin (see 030_platform_admins.sql) drop into a
-- customer's account as one of its members, with one click, to
-- reproduce a support issue without asking for their password.
--
-- The mechanic: the server mints a Supabase magic-link token for the
-- target user via the admin API and immediately redeems it on the
-- caller's own cookie jar. The browser now holds a *real* session for
-- the target user — every RLS policy, account_role check and
-- `account_id` scope in the app applies unchanged, because as far as
-- the rest of the system is concerned there is no impersonation, just
-- that user signed in. No bypass path is introduced, which is the
-- whole reason to do it this way rather than with an "acting-as"
-- override threaded through the data layer.
--
-- The cost of that simplicity is that the admin's own session is
-- overwritten. This table is what buys it back: one row per
-- impersonation, holding who did it and who they became, so the
-- "Stop impersonating" button can restore the admin's session.
--
-- Why a table and not a signed cookie: the exit path logs the browser
-- back in as `admin_user_id` — so whatever stores that id is, in
-- effect, an authentication credential. A cookie the client can read
-- or forge would be a privilege-escalation primitive (set the cookie
-- to any admin's uuid, hit /stop, become them). So the cookie carries
-- only a 256-bit random token; the uuid pair lives server-side, keyed
-- by the token's SHA-256 — same build as `account_invitations`
-- (migration 017) and `api_keys` (026).
--
-- `audit_log` gets the human-readable "X logged in as Y" entry via
-- recordAudit(). This table is the machinery for getting back, and
-- rows are never deleted, so it doubles as the precise record of how
-- long each session lasted.
--
-- No client-side RLS policy, same reasoning as `platform_admins`:
-- every read and write goes through the service-role client from
-- server-only code (src/lib/auth/impersonation.ts). RLS stays on with
-- zero policies so a stray client-side query returns nothing rather
-- than the whole table.
-- ============================================================

CREATE TABLE IF NOT EXISTS impersonation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- SHA-256 (hex) of the random token held in the browser cookie.
  -- The plaintext is never stored, so a dump of this table can't be
  -- replayed to resume anyone's session.
  token_hash TEXT NOT NULL UNIQUE,

  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Which account the admin was looking at when they clicked. Nulled
  -- rather than cascading the row away if the account is ever deleted,
  -- so the history survives the customer leaving.
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,

  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Hard ceiling on the window in which /stop will restore the admin.
  -- Past this the row is dead: the browser keeps the target's session
  -- (an ordinary Supabase session, nothing to revoke) but the one-click
  -- way back is gone and the admin signs in again.
  expires_at TIMESTAMPTZ NOT NULL,

  -- Set when "Stop impersonating" succeeds. Single-use: a row with
  -- ended_at can never restore a session again.
  ended_at TIMESTAMPTZ
);

-- "Every impersonation by this admin, newest first."
CREATE INDEX IF NOT EXISTS impersonation_sessions_admin_started_idx
  ON impersonation_sessions (admin_user_id, started_at DESC);

-- The same question from the other side: "who has been in this account."
CREATE INDEX IF NOT EXISTS impersonation_sessions_account_started_idx
  ON impersonation_sessions (account_id, started_at DESC);

ALTER TABLE impersonation_sessions ENABLE ROW LEVEL SECURITY;
-- No policies added — see note above.
