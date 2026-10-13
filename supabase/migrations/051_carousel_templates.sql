-- ============================================================
-- 051: Carousel templates
--
-- carousel_cards holds the 2–10 cards of a media-card carousel
-- template (Marketing only): each card's image/video link, upload
-- handle, text, sample values and buttons. NULL for every other
-- template. Validated in the app (lib/whatsapp/carousel.ts).
-- ============================================================

ALTER TABLE message_templates
  ADD COLUMN IF NOT EXISTS carousel_cards JSONB;

ALTER TABLE message_templates
  DROP CONSTRAINT IF EXISTS message_templates_carousel_cards_shape_check;
ALTER TABLE message_templates
  ADD CONSTRAINT message_templates_carousel_cards_shape_check
  CHECK (
    carousel_cards IS NULL
    OR (jsonb_typeof(carousel_cards) = 'array' AND jsonb_array_length(carousel_cards) BETWEEN 2 AND 10)
  );
