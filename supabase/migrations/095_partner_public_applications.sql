-- ============================================================
-- 095_partner_public_applications.sql — apply without an account
--
-- The partner program moves off the signed-in dashboard and onto a
-- public landing page (/partners). Anyone can apply from there, which
-- means an application now arrives with no logged-in user attached.
--
-- 092 modelled a partner as "an auth user who is also a partner"
-- (`user_id uuid NOT NULL UNIQUE`). That was right when the only way in
-- was a form inside the app, but it makes a public application
-- impossible to store. So `user_id` becomes nullable and now means
-- "the login this partner uses for their portal, once they have one":
--
--   applied (public form) → user_id NULL, status 'pending'
--   approved by admin     → login created / linked, user_id set
--
-- The UNIQUE stays as it is: Postgres allows many NULLs in a unique
-- index, so pending applications don't collide with each other while
-- one login still can't belong to two partners.
--
-- Duplicate applications from the same email are rejected in the API
-- rather than by a constraint here, deliberately — a unique index on
-- email would also forbid the legitimate case of someone re-applying
-- after a rejection, and would fail outright if any two existing rows
-- already share an address.
-- ============================================================

ALTER TABLE partners
  ALTER COLUMN user_id DROP NOT NULL;

-- Admin review queue reads "newest pending first", and the approval
-- flow looks an application up by email to attach a login to it.
CREATE INDEX IF NOT EXISTS partners_status_created_idx
  ON partners (status, created_at DESC);

CREATE INDEX IF NOT EXISTS partners_email_idx
  ON partners (lower(email))
  WHERE email IS NOT NULL;
