import { ImageResponse } from 'next/og';

import { getPost } from '@/lib/blog';
import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderBlogOgImage } from '@/lib/og-image';

const POST = getPost('whatsapp-business-api-verification-guide');

export const runtime = 'edge';
export const alt = POST.title;
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return new ImageResponse(renderBlogOgImage(POST.title, POST.category), { ...size });
}
