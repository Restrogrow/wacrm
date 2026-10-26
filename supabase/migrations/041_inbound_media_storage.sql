-- ============================================================
-- 041_inbound_media_storage
--
-- Private bucket for media customers send (photos, voice notes,
-- videos, documents, stickers). Meta expires media IDs after 7 days,
-- so the webhook copies each file here when it arrives:
--
--   inbound-media/account-<account_id>/<meta media id>
--
-- PRIVATE, with no storage.objects policies: only the service role
-- reads/writes it. Members view files through the authenticated
-- /api/whatsapp/media/<id> route, which scopes reads to their account.
-- (Unlike chat-media, which is public because Meta must fetch the files
-- agents send.)
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('inbound-media', 'inbound-media', false, 52428800)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit;
