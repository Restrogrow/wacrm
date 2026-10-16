-- ============================================================
-- Lock privileged columns on profiles and accounts.
--
-- The RLS policies from 017 let a signed-in user UPDATE their own
-- profile row and let an account admin UPDATE their account row, but
-- they apply to every column. From the browser (anon key) that meant:
--   - any user could set profiles.account_role = 'owner', or point
--     profiles.account_id at another business and join it;
--   - any owner/admin could set accounts.plan = 'enterprise' (or clear
--     trial_ends_at / plan_expires_at) and get paid limits for free.
--
-- These triggers reject changes to those columns when the request runs
-- as an end-user database role (authenticated / anon). The server
-- (service_role) and the SECURITY DEFINER RPCs that manage members
-- (set_member_role, remove_account_member, transfer_account_ownership,
-- redeem_invitation) run as their owner, so they are unaffected.
-- The trigger functions are SECURITY INVOKER on purpose: current_user
-- must be the caller's role.
-- ============================================================

CREATE OR REPLACE FUNCTION public.guard_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- Profiles are created by the signup trigger, never by the client.
  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Profiles cannot be created directly'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.account_id IS DISTINCT FROM OLD.account_id
     OR NEW.account_role IS DISTINCT FROM OLD.account_role
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'You cannot change your account, role or email here'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_privileged_columns ON profiles;
CREATE TRIGGER guard_profile_privileged_columns
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileged_columns();


CREATE OR REPLACE FUNCTION public.guard_account_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
     OR NEW.plan IS DISTINCT FROM OLD.plan
     OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at
     OR NEW.plan_expires_at IS DISTINCT FROM OLD.plan_expires_at
     OR NEW.billing_note IS DISTINCT FROM OLD.billing_note
     OR NEW.billing_reminder_key IS DISTINCT FROM OLD.billing_reminder_key
     OR NEW.billing_reminder_sent_at IS DISTINCT FROM OLD.billing_reminder_sent_at
     OR NEW.summary_last_sent_on IS DISTINCT FROM OLD.summary_last_sent_on
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Plan, billing and ownership can only be changed by Repeat Grow'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_account_privileged_columns ON accounts;
CREATE TRIGGER guard_account_privileged_columns
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION public.guard_account_privileged_columns();
