import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { BlogEditor, type EditorPost } from '@/components/admin/blog-editor'
import type { DbBlogRow } from '@/lib/blog-db'
import { supabaseAdmin } from '@/lib/flows/admin-client'

export const metadata: Metadata = { title: 'Edit post' }
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function EditBlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) notFound()

  const { data } = await supabaseAdmin().from('blog_posts').select('*').eq('id', id).maybeSingle()
  if (!data) notFound()
  const r = data as DbBlogRow

  const initial: EditorPost = {
    id: r.id,
    title: r.title,
    slug: r.slug,
    seo_title: r.seo_title ?? '',
    description: r.description,
    content: r.content,
    category: r.category,
    tags: r.tags,
    focus_keyword: r.focus_keyword ?? '',
    keywords: r.keywords,
    cover_url: r.cover_url ?? '',
    cover_alt: r.cover_alt,
    faq: r.faq ?? [],
    author_name: r.author_name,
    canonical_url: r.canonical_url ?? '',
    noindex: r.noindex,
    featured: r.featured,
    status: r.status,
    published_at: r.published_at,
  }

  return <BlogEditor key={r.id} initial={initial} />
}
