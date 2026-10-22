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
    slug: 'diwali-whatsapp-marketing-templates',
    title: 'Diwali WhatsApp Marketing 2026: Campaign Plan and Templates That Get Approved',
    seoTitle: 'Diwali WhatsApp Marketing 2026: Plan & Templates',
    description:
      'A day-by-day WhatsApp plan for Diwali 2026 (8 November), with Marketing and Utility templates you can copy and the mistakes that get them rejected.',
    category: 'Marketing',
    datePublished: '2026-10-22',
    readMinutes: 7,
    cover: '/blog/diwali-whatsapp-marketing-templates/cover.svg',
    coverAlt: 'A diya next to a WhatsApp Diwali offer message with a Shop now button',
    keywords: [
      'diwali whatsapp marketing',
      'diwali whatsapp templates',
      'diwali offer message for customers',
      'festive whatsapp campaign',
      'whatsapp broadcast diwali 2026',
    ],
  },
  {
    slug: 'whatsapp-service-message-pricing-2026',
    title: 'WhatsApp Service Messages Are No Longer Free: What Changed on 1 October 2026',
    seoTitle: 'WhatsApp Service Message Pricing (October 2026)',
    description:
      'Since 1 October 2026 Meta charges for replies inside the 24-hour window. What is billed now, what is still free, and how to keep your bill down.',
    category: 'WhatsApp API',
    datePublished: '2026-10-22',
    readMinutes: 6,
    cover: '/blog/whatsapp-service-message-pricing-2026/cover.svg',
    coverAlt: 'A WhatsApp reply bubble with a rupee price tag on it',
    keywords: [
      'whatsapp service message pricing',
      'whatsapp api pricing 2026',
      'whatsapp service conversation charges',
      'is whatsapp business api free',
      'whatsapp pricing october 2026',
    ],
  },
  {
    slug: 'whatsapp-messaging-limits-2026',
    title: 'WhatsApp Messaging Limits in 2026: How Many People Can You Message per Day?',
    seoTitle: 'WhatsApp Messaging Limits 2026: Tiers Explained',
    description:
      'How WhatsApp Business API messaging limits work in 2026: portfolio-level limits, the 250 starting limit, how to get to 2,000 and beyond, and what lowers you.',
    category: 'WhatsApp API',
    datePublished: '2026-10-22',
    readMinutes: 6,
    cover: '/blog/whatsapp-messaging-limits-2026/cover.svg',
    coverAlt: 'A rising bar chart of daily WhatsApp messaging limits from 250 upwards',
    keywords: [
      'whatsapp messaging limit',
      'whatsapp business api limit per day',
      'whatsapp messaging tier',
      'increase whatsapp messaging limit',
      'whatsapp business portfolio limit',
    ],
  },
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
