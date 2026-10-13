// Single source of truth for blog post metadata, shared by the /blog
// index, each post's layout (hero, schema, related posts), the per-post
// Open Graph images and sitemap.ts. A new post needs an entry here, a
// page.tsx + opengraph-image.tsx under src/app/blog/<slug>/, and its
// images under public/blog/<slug>/. Newest first.

export interface BlogPost {
  slug: string;
  title: string;
  /** Meta description and card excerpt — keep it under ~160 characters. */
  description: string;
  category: 'E-commerce' | 'Bookings' | 'WhatsApp API' | 'Templates';
  datePublished: string;
  dateModified?: string;
  readMinutes: number;
  /** 1200×630 cover in public/. */
  cover: string;
  coverAlt: string;
  keywords: string[];
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'shopify-whatsapp-order-notifications',
    title: 'Shopify WhatsApp Order Notifications: The Complete Guide for Indian Stores',
    description:
      'The six WhatsApp messages every Shopify store should send — order confirmation, COD confirmation, shipping, delivery and abandoned cart — with template examples and setup steps.',
    category: 'E-commerce',
    datePublished: '2026-10-13',
    readMinutes: 9,
    cover: '/blog/shopify-whatsapp-order-notifications/cover.svg',
    coverAlt:
      'A Shopify order turning into WhatsApp messages: order confirmed, shipped and delivered',
    keywords: [
      'shopify whatsapp order notifications',
      'whatsapp order confirmation',
      'cod confirmation whatsapp',
      'abandoned cart whatsapp',
      'shopify whatsapp integration india',
    ],
  },
  {
    slug: 'whatsapp-appointment-reminders',
    title: 'How to Reduce No-Shows with WhatsApp Appointment Reminders',
    description:
      'A simple WhatsApp reminder schedule for Calendly bookings — confirmation, 24-hour and 1-hour reminders, and follow-ups — with ready-to-use templates for clinics, coaches and salons.',
    category: 'Bookings',
    datePublished: '2026-10-13',
    readMinutes: 8,
    cover: '/blog/whatsapp-appointment-reminders/cover.svg',
    coverAlt: 'A calendar booking with WhatsApp reminders sent 24 hours and 1 hour before',
    keywords: [
      'whatsapp appointment reminders',
      'reduce no-shows',
      'calendly whatsapp reminders',
      'whatsapp booking confirmation',
      'appointment reminder template',
    ],
  },
  {
    slug: 'whatsapp-business-api-verification-guide',
    title: 'How to Get WhatsApp Business API Verified: A Step-by-Step Guide',
    description:
      'What Meta Business verification and WhatsApp Business API approval actually require, in order — from a Meta Business Manager account to your first approved number.',
    category: 'WhatsApp API',
    datePublished: '2026-10-05',
    readMinutes: 5,
    cover: '/blog/whatsapp-business-api-verification-guide/cover.svg',
    coverAlt: 'A verified badge next to a WhatsApp Business profile',
    keywords: [
      'whatsapp business api verification',
      'meta business verification',
      'whatsapp business api approval',
    ],
  },
  {
    slug: 'whatsapp-broadcast-template-rules',
    title: 'WhatsApp Broadcast Template Rules Explained',
    description:
      'What Meta actually checks before approving a WhatsApp message template, the categories that affect pricing, and the most common reasons templates get rejected.',
    category: 'Templates',
    datePublished: '2026-10-05',
    readMinutes: 4,
    cover: '/blog/whatsapp-broadcast-template-rules/cover.svg',
    coverAlt: 'A WhatsApp message template with approved and rejected checks',
    keywords: [
      'whatsapp template rules',
      'whatsapp template rejected',
      'whatsapp marketing utility template',
    ],
  },
];

export function getPost(slug: string): BlogPost {
  const post = BLOG_POSTS.find((p) => p.slug === slug);
  if (!post) throw new Error(`Unknown blog post: ${slug}`);
  return post;
}

export function relatedPosts(slug: string, count = 2): BlogPost[] {
  const post = getPost(slug);
  const others = BLOG_POSTS.filter((p) => p.slug !== slug);
  return [
    ...others.filter((p) => p.category === post.category),
    ...others.filter((p) => p.category !== post.category),
  ].slice(0, count);
}

export function formatPostDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
