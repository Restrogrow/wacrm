-- ============================================================
-- 106_partner_commission_default_40.sql
--
-- Default partner commission rate: 20% -> 40%, for NEW applications
-- only (createApplication() never sets commission_rate explicitly, so
-- the column default is what actually applies — see migration 092).
-- Existing partners keep whatever rate they already have; an admin can
-- still override any partner's rate individually in Settings
-- (admin/partners/[id]).
-- ============================================================

ALTER TABLE partners
  ALTER COLUMN commission_rate SET DEFAULT 40;
