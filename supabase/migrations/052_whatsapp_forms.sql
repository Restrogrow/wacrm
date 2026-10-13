-- ============================================================
-- 052: WhatsApp forms (Meta WhatsApp Flows)
--
-- whatsapp_forms: a simple form built in Settings → WhatsApp forms.
-- The app turns its fields into a single-screen Flow JSON, creates
-- and publishes it on Meta (meta_flow_id), and agents send it from a
-- chat. Published Flows can't be edited on Meta, so changing a form
-- publishes a new Flow and deprecates the old one.
--
-- whatsapp_form_responses: one row per submission (the `nfm_reply`
-- webhook), with the answers; answers mapped to contact fields (name,
-- email, custom fields) are also written to the contact.
--
-- Members can read their account's rows (RLS); writes go through the
-- API routes / webhook with the service-role client.
-- ============================================================

CREATE TABLE IF NOT EXISTS whatsapp_forms (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  title             TEXT NOT NULL,
  intro             TEXT,
  submit_label      TEXT NOT NULL DEFAULT 'Submit',
  category          TEXT NOT NULL DEFAULT 'LEAD_GENERATION',
  fields            JSONB NOT NULL,
  meta_flow_id      TEXT,
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'published', 'failed', 'deprecated')),
  validation_errors JSONB,
  error             TEXT,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_forms_account_idx ON whatsapp_forms (account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_form_responses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  form_id         UUID REFERENCES whatsapp_forms(id) ON DELETE SET NULL,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  message_id      TEXT,
  answers         JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_form_responses_form_idx ON whatsapp_form_responses (form_id, created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_form_responses_account_idx ON whatsapp_form_responses (account_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_form_responses_message_key
  ON whatsapp_form_responses (message_id) WHERE message_id IS NOT NULL;

ALTER TABLE whatsapp_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_form_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view forms" ON whatsapp_forms;
CREATE POLICY "Members can view forms" ON whatsapp_forms
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "Members can view form responses" ON whatsapp_form_responses;
CREATE POLICY "Members can view form responses" ON whatsapp_form_responses
  FOR SELECT USING (is_account_member(account_id, 'viewer'));
