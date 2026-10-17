import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, FileText, Plus } from 'lucide-react'

import { BLOG_POSTS } from '@/lib/blog'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { countWords } from '@/lib/blog-utils'

export const metadata: Metadata = { title: 'Blog' }
export const dynamic = 'force-dynamic'

type Row = {
  id: string
  slug: string
  title: string
  category: string
  status: 'draft' | 'published'
  published_at: string | null
  updated_at: string
  content: string
  featured: boolean
}

function stateOf(r: Row): 'live' | 'scheduled' | 'draft' {
  if (r.status !== 'published') return 'draft'
  return r.published_at && new Date(r.published_at) > new Date() ? 'scheduled' : 'live'
}

const BADGE = {
  live: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  scheduled: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  draft: 'bg-muted text-muted-foreground',
} as const

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })

export default async function AdminBlogPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>
}) {
  const { status = 'all', q = '' } = await searchParams

  const { data, error } = await supabaseAdmin()
    .from('blog_posts')
    .select('id, slug, title, category, status, published_at, updated_at, content, featured')
    .order('updated_at', { ascending: false })

  const all = (data ?? []) as Row[]
  const counts = {
    all: all.length,
    live: all.filter((r) => stateOf(r) === 'live').length,
    scheduled: all.filter((r) => stateOf(r) === 'scheduled').length,
    draft: all.filter((r) => stateOf(r) === 'draft').length,
  }
  const needle = q.trim().toLowerCase()
  const rows = all.filter(
    (r) =>
      (status === 'all' || stateOf(r) === status) &&
      (!needle || r.title.toLowerCase().includes(needle) || r.category.toLowerCase().includes(needle)),
  )

  const tabs = [
    ['all', 'All'],
    ['live', 'Published'],
    ['scheduled', 'Scheduled'],
    ['draft', 'Drafts'],
  ] as const

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/admin" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
            <ArrowLeft className="size-3.5" /> Admin dashboard
          </Link>
          <h1 className="mt-2 flex items-center gap-2 text-xl font-bold tracking-tight">
            <FileText className="text-primary size-5" /> Blog
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">Write, schedule and manage posts. They appear on repeatgrow.com/blog.</p>
        </div>
        <Link
          href="/admin/blog/new"
          className="bg-primary text-primary-foreground inline-flex items-center gap-1.5 self-start rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90"
        >
          <Plus className="size-4" /> New post
        </Link>
      </header>

      {error && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          Could not load posts ({error.message}). Run migration <code>060_blog.sql</code> in the Supabase SQL editor, then refresh.
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav className="flex gap-1 text-sm">
          {tabs.map(([key, label]) => (
            <Link
              key={key}
              href={`/admin/blog?status=${key}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
              className={`rounded-lg px-3 py-1.5 font-medium ${status === key ? 'bg-primary-soft text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {label} <span className="opacity-60">{counts[key]}</span>
            </Link>
          ))}
        </nav>
        <form className="flex gap-2">
          <input type="hidden" name="status" value={status} />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search title or category"
            className="border-border bg-background w-full rounded-lg border px-3 py-1.5 text-sm outline-none sm:w-64"
          />
        </form>
      </div>

      <div className="border-border bg-card divide-border divide-y overflow-hidden rounded-2xl border shadow-sm">
        {rows.length === 0 && (
          <p className="text-muted-foreground p-8 text-center text-sm">
            {all.length === 0 ? 'No posts yet. Click "New post" to write your first one.' : 'No posts match.'}
          </p>
        )}
        {rows.map((r) => {
          const st = stateOf(r)
          return (
            <Link key={r.id} href={`/admin/blog/${r.id}`} className="hover:bg-muted/50 flex items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {r.title}
                  {r.featured && <span className="text-primary ml-2 text-xs">★ featured</span>}
                </p>
                <p className="text-muted-foreground mt-0.5 truncate text-xs">
                  /blog/{r.slug} · {r.category} · {countWords(r.content)} words
                </p>
              </div>
              <div className="text-right text-xs">
                <span className={`rounded-full px-2.5 py-0.5 font-semibold ${BADGE[st]}`}>
                  {st === 'live' ? 'Published' : st === 'scheduled' ? 'Scheduled' : 'Draft'}
                </span>
                <p className="text-muted-foreground mt-1">
                  {st === 'draft' ? `Edited ${fmt(r.updated_at)}` : fmt(r.published_at ?? r.updated_at)}
                </p>
              </div>
            </Link>
          )
        })}
      </div>

      <p className="text-muted-foreground text-xs">
        {BLOG_POSTS.length} older posts are written in code and appear on the blog too, but are edited by a developer, not here.
      </p>
    </div>
  )
}
