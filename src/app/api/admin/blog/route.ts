import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { parseBlogInput } from '@/lib/blog-admin';
import { BLOG_POSTS } from '@/lib/blog';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

/** POST /api/admin/blog — create a post. Platform admins only. */
export async function POST(request: Request) {
  const admin = await requirePlatformAdmin();
  const limit = checkRateLimit(`blog-write:${admin.userId}`, { limit: 60, windowMs: 60_000 });
  if (!limit.success) return rateLimitResponse(limit);

  const parsed = parseBlogInput(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // A hand-coded post owns its URL; a database post must not shadow it.
  if (BLOG_POSTS.some((p) => p.slug === parsed.value.slug)) {
    return NextResponse.json({ error: 'That URL is used by an existing post. Pick another slug.' }, { status: 409 });
  }

  const { data, error } = await supabaseAdmin()
    .from('blog_posts')
    .insert({ ...parsed.value, created_by: admin.userId })
    .select('id, slug')
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
  return NextResponse.json({ id: data.id, slug: data.slug }, { status: 201 });
}
