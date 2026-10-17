import type { Metadata } from 'next'

import { BlogEditor, type EditorPost } from '@/components/admin/blog-editor'

export const metadata: Metadata = { title: 'New post' }

const EMPTY: EditorPost = {
  id: null,
  title: '',
  slug: '',
  seo_title: '',
  description: '',
  content: '',
  category: 'WhatsApp API',
  tags: [],
  focus_keyword: '',
  keywords: [],
  cover_url: '',
  cover_alt: '',
  faq: [],
  author_name: 'the Repeat Grow team',
  canonical_url: '',
  noindex: false,
  featured: false,
  status: 'draft',
  published_at: null,
}

export default function NewBlogPostPage() {
  return <BlogEditor initial={EMPTY} />
}
