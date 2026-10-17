-- ============================================================
-- 061_security_hardening.sql — fake-trial / signup abuse + function lockdown
--
-- 1. Blocks throwaway-email signups (a list you can edit) and repeat
--    free trials made with email aliases (a+1@gmail.com, a.b@gmail.com).
-- 2. Stops anonymous/signed-in users calling record_webhook_failure()
--    through the public REST API (the app only calls it with the
--    service role).
--
-- RLS is on with zero policies for the new tables, like platform_admins:
-- only the service role / SECURITY DEFINER code touches them.
-- ============================================================

-- ---------- 1. blocked disposable domains -----------------------
CREATE TABLE IF NOT EXISTS blocked_email_domains (
  domain TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE blocked_email_domains ENABLE ROW LEVEL SECURITY;

INSERT INTO blocked_email_domains (domain) VALUES
  ('mailinator.com'), ('guerrillamail.com'), ('guerrillamail.net'), ('guerrillamail.org'),
  ('guerrillamailblock.com'), ('sharklasers.com'), ('grr.la'), ('spam4.me'),
  ('10minutemail.com'), ('10minutemail.net'), ('20minutemail.com'), ('tempmail.com'),
  ('temp-mail.org'), ('temp-mail.io'), ('tempmail.net'), ('tempmailo.com'),
  ('throwawaymail.com'), ('yopmail.com'), ('yopmail.net'), ('yopmail.fr'),
  ('trashmail.com'), ('trashmail.net'), ('trashmail.de'), ('getnada.com'),
  ('nada.email'), ('dispostable.com'), ('maildrop.cc'), ('mailnesia.com'),
  ('mintemail.com'), ('mohmal.com'), ('moakt.com'), ('emailondeck.com'),
  ('fakeinbox.com'), ('fakemail.net'), ('fake-mail.net'), ('getairmail.com'),
  ('harakirimail.com'), ('incognitomail.com'), ('instant-mail.de'), ('jetable.org'),
  ('mailcatch.com'), ('mailforspam.com'), ('mailnull.com'), ('mytemp.email'),
  ('spambox.us'), ('spamgourmet.com'), ('tempinbox.com'), ('tempr.email'),
  ('discard.email'), ('discardmail.com'), ('burnermail.io'), ('inboxkitten.com'),
  ('emailfake.com'), ('crazymailing.com'), ('tmail.ws'), ('tmpmail.org'),
  ('tmpmail.net'), ('mail.tm'), ('1secmail.com'), ('1secmail.net'),
  ('1secmail.org'), ('byom.de'), ('dropmail.me'), ('gmailnator.com'),
  ('anonbox.net'), ('mailsac.com'), ('tempail.com'), ('luxusmail.org')
ON CONFLICT DO NOTHING;

-- ---------- 2. one free trial per real mailbox ------------------
CREATE TABLE IF NOT EXISTS signup_email_history (
  normalized_email TEXT PRIMARY KEY,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE signup_email_history ENABLE ROW LEVEL SECURITY;

-- Collapse aliases to the real mailbox: lowercase, drop "+tag", and for
-- Gmail also drop dots and treat googlemail.com as gmail.com.
CREATE OR REPLACE FUNCTION public.normalize_signup_email(p_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_local TEXT;
  v_domain TEXT;
BEGIN
  p_email := lower(btrim(coalesce(p_email, '')));
  IF position('@' IN p_email) = 0 THEN
    RETURN p_email;
  END IF;
  v_local := split_part(p_email, '@', 1);
  v_domain := split_part(p_email, '@', 2);
  v_local := split_part(v_local, '+', 1);
  IF v_domain = 'googlemail.com' THEN
    v_domain := 'gmail.com';
  END IF;
  IF v_domain = 'gmail.com' THEN
    v_local := replace(v_local, '.', '');
  END IF;
  RETURN v_local || '@' || v_domain;
END;
$$;

-- Existing users count as already-used mailboxes.
INSERT INTO signup_email_history (normalized_email)
SELECT DISTINCT public.normalize_signup_email(email)
FROM auth.users
WHERE email IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.block_abusive_signups()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(coalesce(NEW.email, ''));
  v_domain TEXT := split_part(lower(coalesce(NEW.email, '')), '@', 2);
  v_norm TEXT;
BEGIN
  -- Phone / anonymous sign-ins have no email: nothing to check.
  IF v_email = '' THEN
    RETURN NEW;
  END IF;

  -- The Repeat Grow team's own mailboxes and test aliases are exempt.
  IF v_domain = 'repeatgrow.com' OR v_email LIKE 'support.repeatgrow+%@gmail.com' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM blocked_email_domains WHERE domain = v_domain) THEN
    RAISE EXCEPTION 'signup_blocked: disposable email addresses are not allowed'
      USING ERRCODE = 'P0001';
  END IF;

  v_norm := public.normalize_signup_email(v_email);
  IF EXISTS (SELECT 1 FROM signup_email_history WHERE normalized_email = v_norm) THEN
    RAISE EXCEPTION 'signup_blocked: this email has already been used to sign up'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO signup_email_history (normalized_email) VALUES (v_norm)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.block_abusive_signups() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.normalize_signup_email(TEXT) FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS block_abusive_signups_trigger ON auth.users;
CREATE TRIGGER block_abusive_signups_trigger
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.block_abusive_signups();

-- ---------- 3. lock down a server-only function -----------------
REVOKE ALL ON FUNCTION public.record_webhook_failure(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_webhook_failure(uuid, int) TO service_role;
