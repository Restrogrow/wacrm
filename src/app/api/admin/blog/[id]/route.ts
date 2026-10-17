import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { parseBlogInput } from '@/lib/blog-admin';
import { BLOG_POSTS } from '@/lib/blog';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

type Ctx = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PATCH /api/admin/blog/:id — save the whole post. Platform admins only. */
export async function PATCH(request: Request, { params }: Ctx) {
  const admin = await requirePlatformAdmin();
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const limit = checkRateLimit(`blog-write:${admin.userId}`, { limit: 60, windowMs: 60_000 });
  if (!limit.success) return rateLimitResponse(limit);

  const parsed = parseBlogInput(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (BLOG_POSTS.some((p) => p.slug === parsed.value.slug)) {
    return NextResponse.json({ error: 'That URL is used by an existing post. Pick another slug.' }, { status: 409 });
  }

  const db = supabaseAdmin();
  const { data: before } = await db.from('blog_posts').select('slug').eq('id', id).maybeSingle();
  if (!before) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error } = await db
    .from('blog_posts')
    .update({ ...parsed.value, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, slug, status, published_at, updated_at')
    .single();

  if (error) {
    const dup = error.code === '23505';
    return NextResponse.json(
      { error: dup ? 'That URL is already used by another post.' : error.message },
      { status: dup ? 409 : 500 },
    );
  }

  revalidatePath('/blog');
  revalidatePath(`/blog/${data.slug}`);
  if (before.slug !== data.slug) revalidatePath(`/blog/${before.slug}`);
  return NextResponse.json(data);
}

/** DELETE /api/admin/blog/:id — permanently remove a post. */
export async function DELETE(_request: Request, { params }: Ctx) {
  await requirePlatformAdmin();
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error } = await supabaseAdmin().from('blog_posts').delete().eq('id', id).select('slug').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePath('/blog');
  if (data) revalidatePath(`/blog/${data.slug}`);
  return NextResponse.json({ ok: true });
}
