// Single source of truth for blog post metadata, shared by the /blog
// index, each post's layout (hero, schema, related posts), the per-post
// Open Graph images and sitemap.ts. A new post needs an entry here, a
// page.tsx + opengraph-image.tsx under src/app/blog/<slug>/, and its
// images under public/blog/<slug>/. Newest first.

export interface BlogPost {
  slug: string;
  title: string;
  /** Shorter <title> for search results when `title` is over ~60 characters. */
  seoTitle?: string;
  /** Meta description and card excerpt — keep it under ~160 characters. */
  description: string;
  /** Free text; hand-coded posts use E-commerce, Bookings, WhatsApp API, Templates, Payments. */
  category: string;
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
    slug: 'whatsapp-pay-upi-payments-india',
    title: 'How to Take Payments on WhatsApp in India: WhatsApp Pay and UPI',
    seoTitle: 'WhatsApp Pay & UPI: Take Payments on WhatsApp in India',
    description:
      'Take payments inside WhatsApp chats in India: WhatsApp Pay with Razorpay, PayU, BillDesk or Zaakpay, or a UPI ID, plus catalog orders.',
    category: 'Payments',
    datePublished: '2026-10-16',
    readMinutes: 7,
    cover: '/blog/whatsapp-pay-upi-payments-india/cover.svg',
    coverAlt: 'A WhatsApp order summary with a Review and pay button',
    keywords: [
      'whatsapp pay india',
      'accept payments on whatsapp',
      'whatsapp upi payment',
      'whatsapp catalog orders',
      'whatsapp order payment request',
    ],
  },
  {
    slug: 'whatsapp-business-voice-calling',
    title: 'WhatsApp Business Voice Calling: How Customers Can Call Your Team',
    seoTitle: 'WhatsApp Business Voice Calling: How It Works',
    description:
      'How WhatsApp Business calling works: customer calls ring every agent in the browser, call-back permission, Meta requirements and costs.',
    category: 'WhatsApp API',
    datePublished: '2026-10-16',
    readMinutes: 6,
    cover: '/blog/whatsapp-business-voice-calling/cover.svg',
    coverAlt: 'An incoming WhatsApp call ringing on a team inbox with an Answer button',
    keywords: [
      'whatsapp business calling api',
      'whatsapp voice calls for business',
      'whatsapp calling crm',
      'receive whatsapp calls in browser',
      'whatsapp call permission',
    ],
  },
  {
    slug: 'shopify-whatsapp-order-notifications',
    title: 'Shopify WhatsApp Order Notifications: The Complete Guide for Indian Stores',
    seoTitle: 'Shopify WhatsApp Order Notifications: India Guide',
    description:
      'The six WhatsApp messages every Shopify store should send, from order and COD confirmation to delivery and abandoned cart, with templates.',
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
    seoTitle: 'WhatsApp Appointment Reminders That Cut No-Shows',
    description:
      'A WhatsApp reminder schedule for Calendly bookings: confirmation, 24-hour and 1-hour reminders and follow-ups, with ready-to-use templates.',
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
    seoTitle: 'WhatsApp Business API Verification: Step by Step',
    description:
      'What Meta Business verification and WhatsApp Business API approval need, step by step, from Business Manager to your first approved number.',
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
      'What Meta checks before approving a WhatsApp template, how categories affect pricing, and the most common reasons templates get rejected.',
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
