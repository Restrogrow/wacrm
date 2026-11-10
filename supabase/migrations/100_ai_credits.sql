-- ============================================================
-- 100_ai_credits.sql — a credit balance for AI usage.
--
-- Until now AI was rationed by per-plan DAILY caps (migration 074,
-- lib/ai/quota.ts). A cap answers "how much per day", not "how much is
-- left", so there was nothing to top up and nothing to run out.
--
-- Three tables and two functions:
--
--   credit_ledger    append-only history. Every grant, top-up, spend
--                    and refund is a row; nothing is ever updated, so
--                    a balance can always be explained line by line.
--   account_credits  the running balance, so reading it is not a sum
--                    over all history. Only the functions below touch
--                    it, and only together with a ledger row.
--   credit_rates     what each AI action costs, editable without a
--                    deploy. Code has defaults; a row here wins.
--
--   credit_add()     grant / top-up / refund. Idempotent.
--   credit_spend()   charge for one AI action. Atomic, idempotent, and
--                    refuses rather than going negative.
--
-- ENFORCEMENT IS OFF BY DEFAULT. `accounts.credits_enforced` starts
-- false everywhere, so day one changes nothing for anyone: spends are
-- recorded, balances go negative-free by refusing nothing, and the
-- daily caps stay the only real limit. Turn it on per account once the
-- per-plan allowances are set from real consumption data. Running the
-- numbers off a dry run beats guessing them and throttling live
-- accounts by accident.
-- ============================================================

-- ---------- 1. the ledger -----------------------------------------
CREATE TABLE IF NOT EXISTS credit_ledger (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- Positive adds, negative spends. Never zero: a no-op entry would
  -- only make the history harder to read.
  credits      integer NOT NULL CHECK (credits <> 0),
  kind         text NOT NULL CHECK (kind IN (
                 'plan_allowance',  -- the monthly include for the plan
                 'admin_grant',     -- a platform admin added credits
                 'topup',           -- the account paid for more
                 'spend',           -- an AI action
                 'refund',          -- an AI action that failed
                 'expiry'           -- unused allowance taken back
               )),
  -- Which AI feature, for spends and refunds. Free text so adding a
  -- feature in lib/ai/quota.ts is a code change, not a migration.
  feature      text,
  note         text,
  -- The no-double-spend guarantee. A retried webhook, a double-clicked
  -- button or a re-run cron must not charge twice.
  idempotency_key text,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS credit_ledger_account_idx
  ON credit_ledger (account_id, created_at DESC);

-- Scoped to the account, not global: two accounts can legitimately
-- produce the same key (e.g. the same month's allowance).
CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_idempotency_idx
  ON credit_ledger (account_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE credit_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credit_ledger_select ON credit_ledger;
CREATE POLICY credit_ledger_select ON credit_ledger FOR SELECT
  USING (is_account_member(account_id));
-- No write policies: the functions below (service role) are the only writers.

-- ---------- 2. the balance ----------------------------------------
CREATE TABLE IF NOT EXISTS account_credits (
  account_id    uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  balance       integer NOT NULL DEFAULT 0,
  -- So the "running low" warning is sent once per descent, not every
  -- time a spend lands under the threshold.
  low_warned_at timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE account_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_credits_select ON account_credits;
CREATE POLICY account_credits_select ON account_credits FOR SELECT
  USING (is_account_member(account_id));

-- ---------- 3. the published rate card ----------------------------
-- Editable without a deploy, like message_rates in 097. Starts EMPTY:
-- lib/credits/credits.ts carries the defaults, and a row here only
-- overrides one. An empty table therefore means "use the defaults",
-- not "everything is free".
CREATE TABLE IF NOT EXISTS credit_rates (
  feature    text PRIMARY KEY,
  credits    integer NOT NULL CHECK (credits >= 0),
  note       text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE credit_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credit_rates_select ON credit_rates;
-- Readable by any member: the point of a rate card is that the
-- customer can see what they are being charged.
CREATE POLICY credit_rates_select ON credit_rates FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ---------- 4. enforcement switch ---------------------------------
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS credits_enforced boolean NOT NULL DEFAULT false;

-- ---------- 5. add credits ----------------------------------------
-- Grant, top-up or refund. Returns the balance afterwards.
--
-- Idempotent on (account_id, idempotency_key): calling twice with the
-- same key adds once and returns the balance, so a retried cron or a
-- double-submitted admin form cannot double-credit.
CREATE OR REPLACE FUNCTION public.credit_add(
  p_account_id      uuid,
  p_credits         integer,
  p_kind            text,
  p_note            text DEFAULT NULL,
  p_feature         text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_created_by      uuid DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted uuid;
  v_balance  integer;
BEGIN
  IF p_credits <= 0 THEN
    RAISE EXCEPTION 'credit_add expects a positive amount, got %', p_credits
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO credit_ledger (
    account_id, credits, kind, feature, note, idempotency_key, created_by
  )
  VALUES (
    p_account_id, p_credits, p_kind, p_feature, p_note, p_idempotency_key,
    p_created_by
  )
  ON CONFLICT (account_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_inserted;

  -- Already applied under this key: report the balance, change nothing.
  IF v_inserted IS NULL THEN
    SELECT balance INTO v_balance FROM account_credits
     WHERE account_id = p_account_id;
    RETURN COALESCE(v_balance, 0);
  END IF;

  INSERT INTO account_credits (account_id, balance, updated_at)
  VALUES (p_account_id, p_credits, now())
  ON CONFLICT (account_id) DO UPDATE
    SET balance = account_credits.balance + p_credits,
        -- Topped back up, so the next descent warns again.
        low_warned_at = NULL,
        updated_at = now()
  RETURNING balance INTO v_balance;

  RETURN v_balance;
END;
$$;

-- ---------- 6. spend credits --------------------------------------
-- Charge for one AI action.
--
-- Returns the balance left when the charge went through, or NULL when
-- it was refused for want of credits — the caller turns that into the
-- "out of credits" message.
--
-- Order matters: the balance is moved first, guarded on
-- `balance >= p_credits`, and the ledger row is written only once that
-- succeeded. The reverse (write, then undo on failure) would mean
-- deleting from a table this file calls append-only.
--
-- Idempotency has a fast path and a guarantee. The pre-check below
-- catches the ordinary case, a retry seconds or minutes later. Two
-- *concurrent* calls with one key can both pass it, but then the
-- unique index rejects the second ledger insert and that whole
-- transaction — including its balance change — rolls back, so one
-- charge still lands.
--
-- `p_enforced = false` records the spend and always allows it. That is
-- the dry run: real consumption data without throttling anyone.
CREATE OR REPLACE FUNCTION public.credit_spend(
  p_account_id      uuid,
  p_credits         integer,
  p_feature         text,
  p_enforced        boolean DEFAULT true,
  p_idempotency_key text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance integer;
BEGIN
  IF p_credits < 0 THEN
    RAISE EXCEPTION 'credit_spend expects a non-negative amount, got %', p_credits
      USING ERRCODE = '22023';
  END IF;

  -- A free feature: nothing to charge, nothing to refuse.
  IF p_credits = 0 THEN
    SELECT balance INTO v_balance FROM account_credits
     WHERE account_id = p_account_id;
    RETURN COALESCE(v_balance, 0);
  END IF;

  -- Already charged under this key: allow, and report the balance.
  IF p_idempotency_key IS NOT NULL AND EXISTS (
    SELECT 1 FROM credit_ledger
     WHERE account_id = p_account_id
       AND idempotency_key = p_idempotency_key
  ) THEN
    SELECT balance INTO v_balance FROM account_credits
     WHERE account_id = p_account_id;
    RETURN COALESCE(v_balance, 0);
  END IF;

  IF p_enforced THEN
    -- No row means no credits were ever added, so there is nothing to
    -- spend and the guard correctly matches nothing.
    UPDATE account_credits
       SET balance = balance - p_credits,
           updated_at = now()
     WHERE account_id = p_account_id
       AND balance >= p_credits
    RETURNING balance INTO v_balance;

    IF v_balance IS NULL THEN
      RETURN NULL;
    END IF;
  ELSE
    -- Dry run: let the balance go below zero, so the shortfall is
    -- visible while the per-plan numbers are still being chosen.
    INSERT INTO account_credits (account_id, balance, updated_at)
    VALUES (p_account_id, -p_credits, now())
    ON CONFLICT (account_id) DO UPDATE
      SET balance = account_credits.balance - p_credits,
          updated_at = now()
    RETURNING balance INTO v_balance;
  END IF;

  INSERT INTO credit_ledger (
    account_id, credits, kind, feature, idempotency_key
  )
  VALUES (
    p_account_id, -p_credits, 'spend', p_feature, p_idempotency_key
  );

  RETURN v_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.credit_add(uuid, integer, text, text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_add(uuid, integer, text, text, text, text, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.credit_spend(uuid, integer, text, boolean, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_spend(uuid, integer, text, boolean, text)
  TO service_role;
