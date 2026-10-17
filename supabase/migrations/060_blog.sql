-- ============================================================
-- 060_blog.sql — database-backed blog managed from /admin/blog
--
-- Posts written in the admin editor live here; the original
-- hand-coded posts (src/lib/blog.ts) keep working next to them.
--
-- Like `platform_admins`, RLS is enabled with ZERO policies on
-- purpose: every read/write goes through the service-role client from
-- server code (admin API routes + public blog pages), never through a
-- user-scoped client. A "published" check is done in the query.
-- ============================================================

CREATE TABLE IF NOT EXISTS blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  seo_title TEXT,
  description TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'General',
  tags TEXT[] NOT NULL DEFAULT '{}',
  focus_keyword TEXT,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  cover_url TEXT,
  cover_alt TEXT NOT NULL DEFAULT '',
  faq JSONB NOT NULL DEFAULT '[]'::jsonb,
  author_name TEXT NOT NULL DEFAULT 'the Repeat Grow team',
  canonical_url TEXT,
  noindex BOOLEAN NOT NULL DEFAULT FALSE,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  -- Publish date. A published post with a FUTURE date stays hidden until
  -- that moment, which gives scheduling without a cron job.
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS blog_posts_status_published_idx
  ON blog_posts (status, published_at DESC);

ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;
-- No policies added — see note above.

-- Public bucket for images uploaded from the editor. Uploads happen
-- with the service role (admin API route), so only a read policy is needed.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'blog-media',
  'blog-media',
  TRUE,
  5242880, -- 5 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Blog media is publicly readable" ON storage.objects;
CREATE POLICY "Blog media is publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'blog-media');
