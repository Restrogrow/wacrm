-- ============================================================
-- 046: Self-service account deletion (DPDP Act / GDPR "right to
-- erasure")
--
-- prepare_user_deletion(user_id) runs before the app deletes the
-- auth user (supabase.auth.admin.deleteUser). It makes that delete
-- safe:
--
--   * Owner — deletes the business account they own, which cascades
--     to every account-scoped row (contacts, chats, messages, deals,
--     broadcasts, templates, automations, integrations…). Refused
--     while other teammates are still in the account: they must be
--     removed, or ownership transferred, first.
--   * Teammate — business rows they created still carry their
--     user_id, and the legacy user_id foreign keys from migration 001
--     are ON DELETE CASCADE. Those rows are reassigned to the account
--     owner first, so deleting a teammate never deletes business data.
--
-- account_deletions keeps an anonymous record (ids and counts only,
-- no names or emails) so platform admins can see deletions happened.
--
-- Service-role only: the API route checks who is asking and
-- confirms the request before calling it.
-- ============================================================

CREATE TABLE IF NOT EXISTS account_deletions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,          -- deleted auth user (no FK)
  account_id      UUID,                   -- account they belonged to
  was_owner       BOOLEAN NOT NULL,
  deleted_account BOOLEAN NOT NULL,       -- true when the business was deleted
  reassigned_rows INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE account_deletions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS account_deletions_created_idx
  ON account_deletions (created_at DESC);

CREATE OR REPLACE FUNCTION public.prepare_user_deletion(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owned_account UUID;
  v_member_account UUID;
  v_account_owner UUID;
  v_other_members INTEGER;
  v_reassigned INTEGER := 0;
  v_count INTEGER;
  v_table TEXT;
  -- Business tables whose legacy user_id cascades on auth-user delete.
  -- Newer tables use created_by … ON DELETE SET NULL and are safe.
  v_tables TEXT[] := ARRAY[
    'contacts', 'tags', 'custom_fields', 'contact_notes', 'conversations',
    'whatsapp_config', 'message_templates', 'pipelines', 'deals',
    'broadcasts', 'automations', 'automation_logs',
    'automation_pending_executions', 'flows', 'flow_runs'
  ];
BEGIN
  SELECT id INTO v_owned_account FROM accounts WHERE owner_user_id = p_user_id;

  IF v_owned_account IS NOT NULL THEN
    SELECT count(*) INTO v_other_members
      FROM profiles
     WHERE account_id = v_owned_account AND user_id <> p_user_id;

    IF v_other_members > 0 THEN
      RAISE EXCEPTION 'Remove your % teammate(s) or transfer ownership before deleting your account', v_other_members
        USING ERRCODE = 'PL002';
    END IF;

    -- Cascades to every account-scoped table and the owner's profile.
    DELETE FROM accounts WHERE id = v_owned_account;

    INSERT INTO account_deletions (user_id, account_id, was_owner, deleted_account)
    VALUES (p_user_id, v_owned_account, true, true);

    RETURN jsonb_build_object('deleted_account', true, 'account_id', v_owned_account, 'reassigned_rows', 0);
  END IF;

  -- Teammate: hand their rows in the business account to the owner.
  SELECT p.account_id, a.owner_user_id
    INTO v_member_account, v_account_owner
    FROM profiles p
    JOIN accounts a ON a.id = p.account_id
   WHERE p.user_id = p_user_id
   LIMIT 1;

  IF v_member_account IS NOT NULL AND v_account_owner IS NOT NULL THEN
    FOREACH v_table IN ARRAY v_tables LOOP
      IF to_regclass('public.' || v_table) IS NOT NULL THEN
        EXECUTE format(
          'UPDATE public.%I SET user_id = $1 WHERE user_id = $2 AND account_id = $3',
          v_table
        ) USING v_account_owner, p_user_id, v_member_account;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_reassigned := v_reassigned + v_count;
      END IF;
    END LOOP;
  END IF;

  INSERT INTO account_deletions (user_id, account_id, was_owner, deleted_account, reassigned_rows)
  VALUES (p_user_id, v_member_account, false, false, v_reassigned);

  RETURN jsonb_build_object('deleted_account', false, 'account_id', v_member_account, 'reassigned_rows', v_reassigned);
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_user_deletion(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prepare_user_deletion(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_user_deletion(UUID) TO service_role;
