import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** POST /api/admin/blog/upload — multipart `file`; returns the public URL. */
export async function POST(request: Request) {
  const admin = await requirePlatformAdmin();
  const limit = checkRateLimit(`blog-upload:${admin.userId}`, { limit: 30, windowMs: 60_000 });
  if (!limit.success) return rateLimitResponse(limit);

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: 'Use a PNG, JPG, WebP or GIF image.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image is over 5 MB.' }, { status: 400 });

  const path = `${new Date().getUTCFullYear()}/${randomUUID()}.${ext}`;
  const db = supabaseAdmin();
  const { error } = await db.storage
    .from('blog-media')
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, cacheControl: '31536000' });
  if (error) return NextResponse.json({ error: (console.error('[api] database error:', error.message), 'Something went wrong. Please try again.') }, { status: 500 });

  const { data } = db.storage.from('blog-media').getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
