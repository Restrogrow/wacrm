-- Re-scope the message_templates uniqueness constraint from per-user to
-- per-account, so two teammates on the same account can't shadow each
-- other's same-named template. Follow-up to migration 017's account_id
-- rollout, tracked as a TODO(account-sharing) in
-- src/app/api/whatsapp/templates/submit/route.ts.
--
-- 1. Unique index on (account_id, name, language). Fails loudly on
--    duplicates rather than dropping rows — same pattern as migration
--    014's (user_id, name, language) index.
DO $$
DECLARE
  dupe_count INT;
  sample TEXT;
BEGIN
  SELECT count(*) INTO dupe_count
  FROM (
    SELECT account_id, name, language
    FROM message_templates
    GROUP BY account_id, name, language
    HAVING count(*) > 1
  ) dupes;

  IF dupe_count > 0 THEN
    SELECT string_agg(
      account_id::text || ' / ' || name || ' / ' || COALESCE(language, '(null)') ||
        ' (' || count || ' rows)',
      E'\n  '
    )
    INTO sample
    FROM (
      SELECT account_id, name, language, count(*) AS count
      FROM message_templates
      GROUP BY account_id, name, language
      HAVING count(*) > 1
    ) dupe_detail;

    RAISE EXCEPTION
      E'Cannot add UNIQUE(account_id, name, language) on message_templates — % duplicate combination(s):\n  %\nDelete or rename the rows you do not want to keep, then re-run migrations.',
      dupe_count, sample;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS message_templates_account_name_language_key
  ON message_templates (account_id, name, language);

-- 2. Drop the legacy per-user index now that the account-scoped one
--    covers it — two teammates on the same account are now correctly
--    blocked from colliding, instead of only blocking the same user.
DROP INDEX IF EXISTS message_templates_user_name_language_key;
