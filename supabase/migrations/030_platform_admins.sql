-- ============================================================
-- 030_platform_admins.sql — Repeat Grow team access, cross-account
--
-- Introduces `platform_admins`, an allowlist of auth.users who may
-- load /admin — the internal, cross-tenant support/ops view used by
-- the Repeat Grow team (not a customer-facing feature). Deliberately
-- NOT modeled as an account_role: platform admins aren't a member of
-- any one customer's account, they operate above the tenancy
-- boundary entirely, so this is a separate table rather than another
-- value on `account_role_enum`.
--
-- No client-side RLS policy is defined, on purpose. Every read goes
-- through the service-role client from a server-only guard
-- (`requirePlatformAdmin` in src/lib/auth/platform-admin.ts), never
-- through a user-scoped Supabase client. RLS stays enabled with zero
-- policies, so even a misconfigured client-side query returns nothing
-- rather than every row.
--
-- Granting the first admin is a manual, one-time step — run this in
-- the Supabase SQL editor (or via the CLI against the service role)
-- once you know which login should have access:
--
--   INSERT INTO platform_admins (user_id)
--   SELECT id FROM auth.users WHERE email = 'you@example.com';
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
-- No policies added — see note above.
