-- ============================================================
-- 029_signup_business_fields
--
-- The signup form only collected full name / email / password.
-- We now also ask for business name, mobile number, nature of
-- business, and team size so a new account starts with useful
-- context instead of a placeholder account name.
--
-- Business-level fields (nature_of_business, team_size) live on
-- `accounts` — they describe the account, not the individual user.
-- `mobile_number` lives on `profiles` — it's the signing-up person's
-- own contact number.
--
-- `accounts.name` already existed (017_account_sharing); this
-- migration doesn't touch its column, only how handle_new_user()
-- populates it — business name now wins over full name as the
-- account's display name.
--
-- RLS: no change needed. profiles/accounts already have
-- owner-or-member SELECT/UPDATE policies (017); these are just new
-- columns on existing rows.
-- ============================================================

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS nature_of_business TEXT,
  ADD COLUMN IF NOT EXISTS team_size TEXT;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS mobile_number TEXT;

-- ============================================================
-- Replace handle_new_user() to read the new signup fields out of
-- auth.users.raw_user_meta_data (populated via supabase.auth.signUp's
-- `options.data`) and store them on the new account/profile.
-- ============================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name TEXT;
  v_business_name TEXT;
  v_nature_of_business TEXT;
  v_team_size TEXT;
  v_mobile_number TEXT;
  v_account_id UUID;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
  v_business_name := COALESCE(NEW.raw_user_meta_data->>'business_name', '');
  v_nature_of_business := NULLIF(NEW.raw_user_meta_data->>'nature_of_business', '');
  v_team_size := NULLIF(NEW.raw_user_meta_data->>'team_size', '');
  v_mobile_number := NULLIF(NEW.raw_user_meta_data->>'mobile_number', '');

  INSERT INTO public.accounts (name, owner_user_id, nature_of_business, team_size)
  VALUES (
    COALESCE(NULLIF(v_business_name, ''), NULLIF(v_full_name, ''), NEW.email, 'My account'),
    NEW.id,
    v_nature_of_business,
    v_team_size
  )
  RETURNING id INTO v_account_id;

  INSERT INTO public.profiles (user_id, full_name, email, mobile_number, account_id, account_role)
  VALUES (NEW.id, v_full_name, NEW.email, v_mobile_number, v_account_id, 'owner');

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to bootstrap account/profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
