'use client';

// Blog post editor for /admin/blog/new and /admin/blog/[id].
// Markdown writing with a formatting toolbar, live preview, image upload,
// an SEO checklist + Google preview, FAQ (emits FAQ rich-result markup),
// scheduling and draft/publish. API: /api/admin/blog.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Bold,
  Code,
  ExternalLink,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Plus,
  Quote,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { BlogMarkdown } from '@/components/blog/markdown';
import { BlogProseStyles } from '@/components/blog/post-layout';
import {
  countWords,
  parseList,
  readMinutes,
  runSeoChecks,
  slugify,
  type FaqEntry,
} from '@/lib/blog-utils';

export interface EditorPost {
  id: string | null;
  title: string;
  slug: string;
  seo_title: string;
  description: string;
  content: string;
  category: string;
  tags: string[];
  focus_keyword: string;
  keywords: string[];
  cover_url: string;
  cover_alt: string;
  faq: FaqEntry[];
  author_name: string;
  canonical_url: string;
  noindex: boolean;
  featured: boolean;
  status: 'draft' | 'published';
  published_at: string | null;
}

const SITE = 'https://repeatgrow.com';
const CATEGORIES = ['WhatsApp API', 'E-commerce', 'Bookings', 'Templates', 'Payments', 'Automation', 'Guides', 'Product updates'];

const STARTER = `Start with a short intro that uses your focus keyword in the first sentence or two.

## First main section

Write 150–300 words per section. Use **bold** for key terms and [links](/pricing) to other pages.

## Second main section

- Short bullet points are easy to scan
- Add an image with the toolbar button

## Conclusion

Wrap up and point readers to the next step, like [booking a demo](/demo).
`;

type ViewMode = 'write' | 'split' | 'preview';

function toLocalInput(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const inputCls =
  'border-border bg-background focus:border-primary w-full rounded-lg border px-3 py-2 text-sm outline-none';
const labelCls = 'text-muted-foreground mb-1 block text-xs font-semibold';
const cardCls = 'rounded-2xl border border-border bg-card p-4 shadow-sm';

export function BlogEditor({ initial }: { initial: EditorPost }) {
  const router = useRouter();
  const [post, setPost] = useState<EditorPost>(initial);
  const [view, setView] = useState<ViewMode>('split');
  const [slugTouched, setSlugTouched] = useState(!!initial.id);
  const [busy, setBusy] = useState<null | 'save' | 'publish' | 'delete' | 'upload'>(null);
  const [dirty, setDirty] = useState(false);
  const [tagsText, setTagsText] = useState(initial.tags.join(', '));
  const [kwText, setKwText] = useState(initial.keywords.join(', '));
  const [scheduleAt, setScheduleAt] = useState(toLocalInput(initial.published_at));
  const textRef = useRef<HTMLTextAreaElement>(null);
  const bodyUpload = useRef<HTMLInputElement>(null);
  const coverUpload = useRef<HTMLInputElement>(null);

  const set = useCallback(<K extends keyof EditorPost>(key: K, value: EditorPost[K]) => {
    setPost((p) => ({ ...p, [key]: value }));
    setDirty(true);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const seo = useMemo(
    () =>
      runSeoChecks({
        title: post.title,
        seoTitle: post.seo_title,
        slug: post.slug,
        description: post.description,
        content: post.content,
        focusKeyword: post.focus_keyword,
        coverUrl: post.cover_url,
        coverAlt: post.cover_alt,
      }),
    [post.title, post.seo_title, post.slug, post.description, post.content, post.focus_keyword, post.cover_url, post.cover_alt],
  );

  const words = countWords(post.content);

  // ---- toolbar -------------------------------------------------
  function edit(fn: (sel: string) => { text: string; select?: [number, number] }) {
    const el = textRef.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e, value } = el;
    const out = fn(value.slice(s, e));
    const next = value.slice(0, s) + out.text + value.slice(e);
    set('content', next);
    requestAnimationFrame(() => {
      el.focus();
      const [a, b] = out.select ?? [s + out.text.length, s + out.text.length];
      el.setSelectionRange(s + a, s + b);
    });
  }
  const wrap = (before: string, after: string, placeholder: string) =>
    edit((sel) => {
      const inner = sel || placeholder;
      return { text: `${before}${inner}${after}`, select: [before.length, before.length + inner.length] };
    });
  const linePrefix = (prefix: string, placeholder: string) =>
    edit((sel) => {
      const inner = sel || placeholder;
      const text = inner
        .split('\n')
        .map((l, i) => (prefix === '1. ' ? `${i + 1}. ` : prefix) + l)
        .join('\n');
      return { text: `\n${text}\n`, select: [1, 1 + text.length] };
    });

  function insertLink() {
    const url = window.prompt('Link URL (use /pricing for pages on this site)', 'https://');
    if (!url) return;
    edit((sel) => {
      const label = sel || 'link text';
      return { text: `[${label}](${url})`, select: [1, 1 + label.length] };
    });
  }

  async function upload(file: File): Promise<string | null> {
    setBusy('upload');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/admin/blog/upload', { method: 'POST', body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      return json.url as string;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function onBodyImage(file: File | undefined) {
    if (!file) return;
    const url = await upload(file);
    if (!url) return;
    const alt = window.prompt('Describe this image (alt text, helps SEO & accessibility)', '') ?? '';
    edit(() => ({ text: `\n\n![${alt}](${url})\n\n` }));
    toast.success('Image added');
  }

  async function onCoverImage(file: File | undefined) {
    if (!file) return;
    const url = await upload(file);
    if (url) {
      set('cover_url', url);
      toast.success('Cover uploaded');
    }
  }

  // ---- save ----------------------------------------------------
  async function save(status: 'draft' | 'published') {
    if (!post.title.trim()) {
      toast.error('Add a title first');
      return;
    }
    setBusy(status === 'published' ? 'publish' : 'save');
    const payload = {
      ...post,
      slug: post.slug || slugify(post.title),
      tags: parseList(tagsText),
      keywords: parseList(kwText),
      status,
      published_at:
        status === 'published'
          ? post.status === 'published' && post.published_at && !dirtyDate
            ? post.published_at
            : new Date(scheduleAt).toISOString()
          : null,
      cover_url: post.cover_url || null,
    };
    try {
      const res = await fetch(post.id ? `/api/admin/blog/${post.id}` : '/api/admin/blog', {
        method: post.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Save failed');

      setDirty(false);
      const scheduled = status === 'published' && new Date(payload.published_at!) > new Date();
      toast.success(
        status === 'draft'
          ? 'Draft saved'
          : scheduled
            ? 'Scheduled — it goes live at the chosen time'
            : 'Published',
      );
      if (!post.id) {
        router.replace(`/admin/blog/${json.id}`);
      } else {
        setPost((p) => ({ ...p, slug: json.slug, status, published_at: payload.published_at }));
        router.refresh();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!post.id) return;
    if (!window.confirm('Delete this post permanently? This cannot be undone.')) return;
    setBusy('delete');
    const res = await fetch(`/api/admin/blog/${post.id}`, { method: 'DELETE' });
    if (res.ok) {
      setDirty(false);
      toast.success('Post deleted');
      router.push('/admin/blog');
      router.refresh();
    } else {
      toast.error('Could not delete');
      setBusy(null);
    }
  }

  const dirtyDate = scheduleAt !== toLocalInput(post.published_at);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save(post.status === 'published' ? 'published' : 'draft');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const serpTitle = (post.seo_title || post.title || 'Your post title').slice(0, 60);
  const serpDesc = (post.description || 'Your meta description appears here. Write 110–160 characters that make people click.').slice(0, 160);
  const publicUrl = `/blog/${post.slug || slugify(post.title) || 'your-post'}`;
  const isLive = post.status === 'published' && !!post.published_at && new Date(post.published_at) <= new Date();
  const isScheduled = post.status === 'published' && !!post.published_at && new Date(post.published_at) > new Date();

  const scoreColor = seo.score >= 80 ? 'text-emerald-600' : seo.score >= 50 ? 'text-amber-600' : 'text-red-600';
  const dot = { good: 'bg-emerald-500', warn: 'bg-amber-500', bad: 'bg-red-500' } as const;

  const toolBtn =
    'text-muted-foreground hover:bg-muted hover:text-foreground inline-flex size-8 items-center justify-center rounded-md';

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      <BlogProseStyles />

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/admin/blog" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
            <ArrowLeft className="size-3.5" /> All posts
          </Link>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              isLive
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                : isScheduled
                  ? 'bg-sky-500/15 text-sky-700 dark:text-sky-400'
                  : 'bg-muted text-muted-foreground'
            }`}
          >
            {isLive ? 'Published' : isScheduled ? 'Scheduled' : 'Draft'}
          </span>
          {dirty && <span className="text-xs text-amber-600">Unsaved changes</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isLive && (
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="border-border text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm"
            >
              <ExternalLink className="size-3.5" /> View live
            </a>
          )}
          <button
            onClick={() => save('draft')}
            disabled={busy !== null}
            className="border-border hover:bg-muted rounded-lg border px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
          >
            {busy === 'save' ? 'Saving…' : post.status === 'published' ? 'Unpublish & save draft' : 'Save draft'}
          </button>
          <button
            onClick={() => save('published')}
            disabled={busy !== null}
            className="bg-primary text-primary-foreground rounded-lg px-4 py-1.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {busy === 'publish' ? 'Publishing…' : post.status === 'published' ? 'Update' : 'Publish'}
          </button>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ---------------- main column ---------------- */}
        <div className="space-y-4">
          <div className={cardCls}>
            <input
              value={post.title}
              onChange={(e) => {
                set('title', e.target.value);
                if (!slugTouched) set('slug', slugify(e.target.value));
              }}
              placeholder="Post title"
              maxLength={200}
              className="placeholder:text-muted-foreground w-full bg-transparent text-2xl font-bold tracking-tight outline-none"
            />
            <div className="text-muted-foreground mt-2 flex items-center gap-1 text-xs">
              <span>{SITE}/blog/</span>
              <input
                value={post.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  set('slug', slugify(e.target.value));
                }}
                placeholder="post-url"
                className="border-border bg-background min-w-0 flex-1 rounded border px-2 py-1 font-mono outline-none"
              />
            </div>
          </div>

          <div className={`${cardCls} p-0`}>
            <div className="border-border flex flex-wrap items-center justify-between gap-2 border-b px-2 py-1.5">
              <div className="flex flex-wrap items-center gap-0.5">
                <button type="button" title="Heading 2" className={toolBtn} onClick={() => linePrefix('## ', 'Section heading')}>
                  <Heading2 className="size-4" />
                </button>
                <button type="button" title="Heading 3" className={toolBtn} onClick={() => linePrefix('### ', 'Sub-heading')}>
                  <Heading3 className="size-4" />
                </button>
                <button type="button" title="Bold" className={toolBtn} onClick={() => wrap('**', '**', 'bold text')}>
                  <Bold className="size-4" />
                </button>
                <button type="button" title="Italic" className={toolBtn} onClick={() => wrap('*', '*', 'italic text')}>
                  <Italic className="size-4" />
                </button>
                <button type="button" title="Link" className={toolBtn} onClick={insertLink}>
                  <Link2 className="size-4" />
                </button>
                <button type="button" title="Bulleted list" className={toolBtn} onClick={() => linePrefix('- ', 'List item')}>
                  <List className="size-4" />
                </button>
                <button type="button" title="Numbered list" className={toolBtn} onClick={() => linePrefix('1. ', 'List item')}>
                  <ListOrdered className="size-4" />
                </button>
                <button type="button" title="Quote" className={toolBtn} onClick={() => linePrefix('> ', 'Quote')}>
                  <Quote className="size-4" />
                </button>
                <button type="button" title="Code" className={toolBtn} onClick={() => wrap('`', '`', 'code')}>
                  <Code className="size-4" />
                </button>
                <button type="button" title="Insert image" className={toolBtn} onClick={() => bodyUpload.current?.click()}>
                  {busy === 'upload' ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                </button>
                <input
                  ref={bodyUpload}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  hidden
                  onChange={(e) => {
                    void onBodyImage(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </div>
              <div className="bg-muted flex rounded-lg p-0.5 text-xs font-semibold">
                {(['write', 'split', 'preview'] as ViewMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setView(m)}
                    className={`rounded-md px-2.5 py-1 capitalize ${view === m ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className={`grid ${view === 'split' ? 'md:grid-cols-2' : ''}`}>
              {view !== 'preview' && (
                <textarea
                  ref={textRef}
                  value={post.content}
                  onChange={(e) => set('content', e.target.value)}
                  placeholder={STARTER}
                  spellCheck
                  className="border-border min-h-[560px] w-full resize-y bg-transparent p-4 font-mono text-sm leading-relaxed outline-none md:border-r"
                />
              )}
              {view !== 'write' && (
                <div className="min-h-[560px] overflow-auto p-5">
                  {post.content.trim() ? (
                    <div className="blog-prose">
                      <BlogMarkdown content={post.content} />
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">Nothing to preview yet.</p>
                  )}
                </div>
              )}
            </div>
            <div className="border-border text-muted-foreground flex justify-between border-t px-4 py-2 text-xs">
              <span>
                {words} words · {readMinutes(post.content)} min read
              </span>
              <span>Markdown supported · Ctrl+S to save</span>
            </div>
          </div>

          {/* FAQ */}
          <div className={cardCls}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold">FAQ (optional)</h2>
                <p className="text-muted-foreground text-xs">Shown under the post and sent to Google as FAQ rich results.</p>
              </div>
              <button
                type="button"
                onClick={() => set('faq', [...post.faq, { question: '', answer: '' }])}
                className="border-border hover:bg-muted inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold"
              >
                <Plus className="size-3.5" /> Add question
              </button>
            </div>
            <div className="mt-3 space-y-3">
              {post.faq.map((f, i) => (
                <div key={i} className="border-border bg-card-2 space-y-2 rounded-xl border p-3">
                  <input
                    value={f.question}
                    onChange={(e) => set('faq', post.faq.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))}
                    placeholder="Question"
                    className={inputCls}
                  />
                  <textarea
                    value={f.answer}
                    onChange={(e) => set('faq', post.faq.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))}
                    placeholder="Answer (plain text)"
                    rows={2}
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={() => set('faq', post.faq.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-red-600 inline-flex items-center gap-1 text-xs"
                  >
                    <Trash2 className="size-3" /> Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ---------------- sidebar ---------------- */}
        <aside className="space-y-4">
          <div className={cardCls}>
            <h2 className="text-sm font-bold">Publish</h2>
            <label className={`${labelCls} mt-3`}>{post.status === 'published' ? 'Publish date' : 'Publish / schedule for'}</label>
            <input
              type="datetime-local"
              value={scheduleAt}
              onChange={(e) => {
                setScheduleAt(e.target.value);
                setDirty(true);
              }}
              className={inputCls}
            />
            <p className="text-muted-foreground mt-1 text-xs">Pick a future time and press Publish to schedule it.</p>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={post.featured} onChange={(e) => set('featured', e.target.checked)} />
              Feature on the blog home page
            </label>
          </div>

          <div className={cardCls}>
            <h2 className="text-sm font-bold">Cover image</h2>
            {post.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.cover_url} alt="" className="border-border mt-3 aspect-[1200/630] w-full rounded-lg border object-cover" />
            ) : (
              <p className="text-muted-foreground mt-2 text-xs">Recommended 1200×630. Used on the blog and when shared on social.</p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => coverUpload.current?.click()}
                className="border-border hover:bg-muted rounded-lg border px-3 py-1.5 text-xs font-semibold"
              >
                {post.cover_url ? 'Replace' : 'Upload'}
              </button>
              {post.cover_url && (
                <button type="button" onClick={() => set('cover_url', '')} className="text-muted-foreground text-xs hover:text-red-600">
                  Remove
                </button>
              )}
              <input
                ref={coverUpload}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                hidden
                onChange={(e) => {
                  void onCoverImage(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </div>
            <input
              value={post.cover_url}
              onChange={(e) => set('cover_url', e.target.value)}
              placeholder="…or paste an image URL"
              className={`${inputCls} mt-2`}
            />
            <input
              value={post.cover_alt}
              onChange={(e) => set('cover_alt', e.target.value)}
              placeholder="Alt text (describe the image)"
              className={`${inputCls} mt-2`}
            />
          </div>

          <div className={cardCls}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">SEO</h2>
              <span className={`text-lg font-bold ${scoreColor}`}>{seo.score}/100</span>
            </div>

            <label className={`${labelCls} mt-3`}>Focus keyword</label>
            <input
              value={post.focus_keyword}
              onChange={(e) => set('focus_keyword', e.target.value)}
              placeholder="e.g. whatsapp crm for shopify"
              className={inputCls}
            />

            <label className={`${labelCls} mt-3`}>SEO title ({(post.seo_title || post.title).length}/60)</label>
            <input
              value={post.seo_title}
              onChange={(e) => set('seo_title', e.target.value)}
              placeholder={post.title || 'Defaults to the post title'}
              className={inputCls}
            />

            <label className={`${labelCls} mt-3`}>Meta description ({post.description.length}/160)</label>
            <textarea
              value={post.description}
              onChange={(e) => set('description', e.target.value)}
              rows={3}
              maxLength={300}
              className={inputCls}
            />

            <label className={`${labelCls} mt-3`}>Extra keywords (comma separated)</label>
            <textarea value={kwText} onChange={(e) => { setKwText(e.target.value); setDirty(true); }} rows={2} className={inputCls} />

            <div className="border-border bg-background mt-3 rounded-xl border p-3">
              <p className="text-muted-foreground text-[11px]">Google preview</p>
              <p className="mt-1 truncate text-xs text-emerald-700 dark:text-emerald-400">
                {SITE.replace('https://', '')} › blog › {post.slug || '…'}
              </p>
              <p className="text-base leading-snug text-blue-700 dark:text-blue-400">{serpTitle}</p>
              <p className="text-muted-foreground mt-0.5 text-xs leading-snug">{serpDesc}</p>
            </div>

            <ul className="mt-3 space-y-1.5">
              {seo.checks.map((c) => (
                <li key={c.id} className="flex items-start gap-2 text-xs" title={c.hint}>
                  <span className={`mt-1 size-2 shrink-0 rounded-full ${dot[c.status]}`} />
                  <span>
                    <span className="font-medium">{c.label}</span>
                    {c.status !== 'good' && <span className="text-muted-foreground block">{c.hint}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className={cardCls}>
            <h2 className="text-sm font-bold">Organise</h2>
            <label className={`${labelCls} mt-3`}>Category</label>
            <input list="blog-categories" value={post.category} onChange={(e) => set('category', e.target.value)} className={inputCls} />
            <datalist id="blog-categories">
              {CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <label className={`${labelCls} mt-3`}>Tags (comma separated)</label>
            <input value={tagsText} onChange={(e) => { setTagsText(e.target.value); setDirty(true); }} className={inputCls} />
            <label className={`${labelCls} mt-3`}>Author name</label>
            <input value={post.author_name} onChange={(e) => set('author_name', e.target.value)} className={inputCls} />
          </div>

          <details className={cardCls}>
            <summary className="cursor-pointer text-sm font-bold">Advanced</summary>
            <label className={`${labelCls} mt-3`}>Canonical URL (only if this content lives elsewhere)</label>
            <input value={post.canonical_url} onChange={(e) => set('canonical_url', e.target.value)} placeholder="https://…" className={inputCls} />
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={post.noindex} onChange={(e) => set('noindex', e.target.checked)} />
              Hide from search engines (noindex)
            </label>
          </details>

          {post.id && (
            <button
              type="button"
              onClick={remove}
              disabled={busy !== null}
              className="text-muted-foreground inline-flex items-center gap-1.5 text-xs hover:text-red-600"
            >
              <Trash2 className="size-3.5" /> Delete this post
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
