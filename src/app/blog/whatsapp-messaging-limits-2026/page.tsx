import type { Metadata } from 'next';
import Link from 'next/link';

import { getPost } from '@/lib/blog';
import { BlogPostLayout, type FaqItem, type TocItem } from '@/components/blog/post-layout';

const POST = getPost('whatsapp-messaging-limits-2026');

export const metadata: Metadata = {
  title: POST.seoTitle ? { absolute: POST.seoTitle } : POST.title,
  description: POST.description,
  keywords: POST.keywords,
  alternates: { canonical: `/blog/${POST.slug}` },
  openGraph: {
    type: 'article',
    url: `/blog/${POST.slug}`,
    title: `${POST.title} | Repeat Grow`,
    description: POST.description,
    publishedTime: POST.datePublished,
    section: POST.category,
    tags: POST.keywords,
  },
  twitter: { card: 'summary_large_image', title: POST.title, description: POST.description },
  robots: { index: true, follow: true },
};

const TOC: TocItem[] = [
  { id: 'what-it-counts', label: 'What the messaging limit counts' },
  { id: 'portfolio', label: 'Limits now belong to your business portfolio' },
  { id: 'tiers', label: 'The tiers: from 250 upwards' },
  { id: 'get-2000', label: 'How to get past 250' },
  { id: 'scale', label: 'How to keep scaling' },
  { id: 'check', label: 'Where to see your current limit' },
  { id: 'big-lists', label: 'Sending to a list bigger than your limit' },
];

const FAQ: FaqItem[] = [
  {
    question: 'How many WhatsApp messages can I send per day on the Business API?',
    answer:
      'The limit counts unique customers you start conversations with in a rolling 24 hours, not messages. New business portfolios start at 250. Verified businesses and those that complete Meta’s scaling path move up to higher limits automatically.',
  },
  {
    question: 'Do replies to customers count towards the limit?',
    answer:
      'No. The limit applies to business-initiated messages (templates sent to people who have not messaged you recently). Replying to customers who wrote to you does not use it.',
  },
  {
    question: 'Is the limit per phone number?',
    answer:
      'Not any more. Meta moved messaging limits to the business portfolio level, so every number in the portfolio shares the same limit.',
  },
  {
    question: 'How do I increase my WhatsApp messaging limit quickly?',
    answer:
      'Complete Meta Business verification, keep your quality rating high, and send templates to people who opted in. Once Meta’s criteria are met, the upgrade happens automatically, usually within hours.',
  },
  {
    question: 'Does a low quality rating reduce my limit?',
    answer:
      'Low quality can stop you moving up and puts templates at risk of being paused. Meta has changed how quality affects limits over time, so check the current rules on its messaging limits page.',
  },
];

export default function MessagingLimitsPost() {
  return (
    <BlogPostLayout post={POST} toc={TOC} faq={FAQ}>
      <p>
        You have a list of 5,000 customers and a great Diwali offer, but WhatsApp will only let
        your new number reach 250 of them today. That cap is the messaging limit. Meta changed how
        it works in late 2025 and again in 2026, and many guides still describe the old system.
        Here is how limits work now and how to raise yours.
      </p>

      <h2 id="what-it-counts">What the messaging limit counts</h2>
      <ul>
        <li>
          <strong>Unique customers, not messages.</strong> Sending three templates to the same
          person counts once.
        </li>
        <li>
          <strong>A rolling 24 hours</strong>, not a calendar day.
        </li>
        <li>
          <strong>Only business-initiated messages</strong>: templates sent to people who have not
          messaged you in the last 24 hours. Replies to customers who wrote to you are not counted.
        </li>
      </ul>

      <h2 id="portfolio">Limits now belong to your business portfolio</h2>
      <p>
        Limits used to be set per phone number, and each new number started from the bottom.
        According to{' '}
        <a
          href="https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits"
          rel="noopener"
        >
          Meta&apos;s messaging limits documentation
        </a>
        , limits are now set at the <strong>business portfolio</strong> level and shared by every
        number in it. Adding a second number no longer means starting again at 250, and the old
        per-number <code>messaging_limit_tier</code> field in the API is deprecated.
      </p>

      <h2 id="tiers">The tiers: from 250 upwards</h2>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Stage</th>
              <th>Customers per 24 hours</th>
              <th>How you get there</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>New portfolio</td>
              <td>250</td>
              <td>Default</td>
            </tr>
            <tr>
              <td>First step up</td>
              <td>2,000</td>
              <td>Business verification, or Meta&apos;s quality scaling path</td>
            </tr>
            <tr>
              <td>Higher tiers</td>
              <td>Up to 100,000 and then unlimited</td>
              <td>Automatic, when you use enough of your limit with good quality</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Several providers report that Meta has been removing intermediate tiers in 2026, so
        verified businesses can move to a much higher limit much faster than before. The exact
        tier steps are Meta&apos;s to change, so always trust the number shown in your own account
        over any table, including this one.
      </p>

      <h2 id="get-2000">How to get past 250</h2>
      <ol>
        <li>
          <strong>Complete Meta Business verification.</strong> This is the most reliable way up.
          Our{' '}
          <Link href="/blog/whatsapp-business-api-verification-guide">
            step-by-step verification guide
          </Link>{' '}
          covers the documents Meta asks for.
        </li>
        <li>
          <strong>Or use the scaling path</strong>: send good-quality templates to enough unique
          customers over a short period, and Meta raises the limit without verification.
        </li>
        <li>
          <strong>Set a display name that matches your business</strong> and keep the profile
          complete (logo, description, website).
        </li>
      </ol>

      <h2 id="scale">How to keep scaling</h2>
      <ul>
        <li>
          <strong>Only message people who opted in.</strong> Blocks and spam reports are the main
          thing that holds limits back.
        </li>
        <li>
          <strong>Keep the quality rating green.</strong> Check it in WhatsApp Manager before big
          campaigns.
        </li>
        <li>
          <strong>Make templates relevant.</strong> Personalise with the customer&apos;s name and
          their last order. Generic blasts get blocked more.
        </li>
        <li>
          <strong>Give an easy way to stop.</strong> A &ldquo;Stop promotions&rdquo; button costs
          you one unsubscribe instead of one spam report.
        </li>
        <li>
          <strong>Ramp up gradually</strong> on a new number instead of sending the whole list on
          day one.
        </li>
      </ul>

      <h2 id="check">Where to see your current limit</h2>
      <p>
        Open WhatsApp Manager in Meta Business Suite and look at the phone number&apos;s overview,
        or read <code>whatsapp_business_manager_messaging_limit</code> from the Graph API. In{' '}
        <Link href="/">Repeat Grow</Link>, the WhatsApp settings page shows your connected number,
        its quality rating and its status, so you can check before you schedule a broadcast.
      </p>

      <h2 id="big-lists">Sending to a list bigger than your limit</h2>
      <p>
        If your list is larger than your limit, split it: send to your most engaged customers
        first, then the rest over the next days. Good engagement on the first batch is what moves
        you up. Broadcasts in Repeat Grow can be scheduled and sent to segments, so a 5,000-person
        list can go out in batches without manual work. Read the{' '}
        <Link href="/blog/whatsapp-broadcast-template-rules">template rules</Link> before you
        start, so a rejected template does not delay the campaign.
      </p>
    </BlogPostLayout>
  );
}
