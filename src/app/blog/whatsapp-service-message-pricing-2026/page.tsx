import type { Metadata } from 'next';
import Link from 'next/link';

import { getPost } from '@/lib/blog';
import { BlogPostLayout, type FaqItem, type TocItem } from '@/components/blog/post-layout';

const POST = getPost('whatsapp-service-message-pricing-2026');

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
  { id: 'what-changed', label: 'What changed on 1 October 2026' },
  { id: 'still-free', label: 'What is billed and what is still free' },
  { id: 'rates', label: 'How much a service message costs' },
  { id: 'example', label: 'A worked example for a small business' },
  { id: 'cut-costs', label: 'Seven ways to keep the bill down' },
  { id: 'repeat-grow', label: 'How Repeat Grow handles it' },
];

const FAQ: FaqItem[] = [
  {
    question: 'Are WhatsApp service messages still free in 2026?',
    answer:
      'No. From 1 October 2026 Meta charges for free-form replies a business sends inside the 24-hour customer service window. They are billed per message at the same rate as utility messages for the customer’s country.',
  },
  {
    question: 'Do I pay when a customer messages me?',
    answer:
      'No. Messages customers send to you are not charged. You pay for the messages your business sends.',
  },
  {
    question: 'Are click-to-WhatsApp ad chats still free?',
    answer:
      'Providers report that the free entry-point window from click-to-WhatsApp ads and Facebook Page call-to-action buttons is unchanged. Check Meta’s pricing page for the current rules in your country.',
  },
  {
    question: 'Is there a free monthly allowance of service messages?',
    answer:
      'Some providers say there is, others say there is not. Treat every reply as billable when you budget, and check the current rate card on Meta’s WhatsApp pricing page.',
  },
  {
    question: 'Who bills me for these messages if I use Repeat Grow?',
    answer:
      'Meta bills WhatsApp message fees directly to the payment method on your WhatsApp Business Account. Repeat Grow’s plan price does not add a markup on Meta’s message fees.',
  },
];

export default function ServiceMessagePricingPost() {
  return (
    <BlogPostLayout post={POST} toc={TOC} faq={FAQ}>
      <p>
        For more than a year, replying to customers on the WhatsApp Business API cost nothing as
        long as the customer had written to you in the last 24 hours. That ended on 1 October
        2026. Meta now charges for service messages too. If your team answers a lot of chats, your
        WhatsApp bill is about to look different. Here is what changed, what is still free, and how
        to keep costs under control.
      </p>

      <h2 id="what-changed">What changed on 1 October 2026</h2>
      <p>
        WhatsApp has charged per message since July 2025: each delivered template is billed by
        category (marketing, utility or authentication) and by the customer&apos;s country. Until
        30 September 2026, two kinds of message inside the 24-hour customer service window were
        free:
      </p>
      <ul>
        <li>
          <strong>Free-form replies</strong>: the normal text, images and documents your agents
          or chatbot send while the chat is open.
        </li>
        <li>
          <strong>Utility templates</strong> sent while that window was open.
        </li>
      </ul>
      <p>
        From 1 October 2026 both are billed per message, at the utility rate of the customer&apos;s
        country. Many providers, including Zoho, SendPulse, YCloud and AiSensy, published notices
        about the change in September and October 2026.
      </p>

      <h2 id="still-free">What is billed and what is still free</h2>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Message</th>
              <th>Before 1 Oct 2026</th>
              <th>From 1 Oct 2026</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Messages customers send you</td>
              <td>Free</td>
              <td>Free</td>
            </tr>
            <tr>
              <td>Free-form reply inside 24 hours</td>
              <td>Free</td>
              <td>Billed, utility rate</td>
            </tr>
            <tr>
              <td>Utility template inside 24 hours</td>
              <td>Free</td>
              <td>Billed, utility rate</td>
            </tr>
            <tr>
              <td>Utility template outside 24 hours</td>
              <td>Billed</td>
              <td>Billed</td>
            </tr>
            <tr>
              <td>Marketing template</td>
              <td>Billed</td>
              <td>Billed</td>
            </tr>
            <tr>
              <td>Authentication (OTP) template</td>
              <td>Billed</td>
              <td>Billed</td>
            </tr>
            <tr>
              <td>Chats started from a click-to-WhatsApp ad</td>
              <td>Free window</td>
              <td>Free window (reported unchanged)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 id="rates">How much a service message costs</h2>
      <p>
        A service message costs the same as a utility message for the customer&apos;s country, and
        that is one of the cheapest categories. Marketing messages stay the most expensive. Meta
        publishes the exact rates per country and updates them a few times a year, so take the
        current number from{' '}
        <a href="https://developers.facebook.com/docs/whatsapp/pricing" rel="noopener">
          Meta&apos;s WhatsApp pricing page
        </a>{' '}
        rather than from a blog post, including this one. Rates are in the currency of your WhatsApp
        Business Account, and taxes are added on top.
      </p>
      <p>
        Some providers say each business gets a number of free service messages every month;
        others say there is no free allowance. Until Meta&apos;s rate card for your account shows
        one, budget as if every reply is billed.
      </p>

      <h2 id="example">A worked example for a small business</h2>
      <p>
        Say an online store handles 600 customer chats a month in India, and an agent sends about
        five replies per chat. That is 3,000 replies a month that were free in September and are
        billed from October. Multiply 3,000 by the current Indian utility rate on Meta&apos;s rate
        card and you have the new monthly cost. For most small Indian businesses this is a few
        hundred rupees a month: noticeable, but much smaller than the cost of marketing broadcasts.
        A support-heavy team with tens of thousands of replies should plan for it properly.
      </p>

      <h2 id="cut-costs">Seven ways to keep the bill down</h2>
      <ol>
        <li>
          <strong>Answer in one message, not five.</strong> Every bubble is now a billed message.
          Teach agents to send one complete answer instead of &ldquo;Hi&rdquo;, &ldquo;one
          minute&rdquo;, &ldquo;checking&rdquo; and so on.
        </li>
        <li>
          <strong>Use quick replies and saved answers</strong> so complete answers are as fast to
          send as short ones.
        </li>
        <li>
          <strong>Send links to tracking pages</strong> instead of manual status updates in chat.
        </li>
        <li>
          <strong>Use interactive buttons and lists.</strong> One message with three buttons
          replaces a back-and-forth of several messages.
        </li>
        <li>
          <strong>Do not auto-reply to every message.</strong> A &ldquo;thanks, we got your
          message&rdquo; bot reply now costs money each time. Keep away-messages for outside
          business hours only.
        </li>
        <li>
          <strong>Move broadcasts to utility where they really are utility.</strong> Order, booking
          and account updates are utility; offers are marketing. Do not dress up an offer as a
          utility template, as Meta will recategorise or reject it.
        </li>
        <li>
          <strong>Watch the numbers weekly.</strong> Check sent messages per conversation for each
          agent, and look for bots or automations that loop.
        </li>
      </ol>

      <h2 id="repeat-grow">How Repeat Grow handles it</h2>
      <p>
        <Link href="/">Repeat Grow</Link> is a WhatsApp CRM on the official WhatsApp Business API.
        Meta bills message fees directly to your WhatsApp Business Account, with no markup from us.
        The shared inbox has saved replies, interactive buttons and lists, and business-hours rules
        for auto-replies, so your team answers in fewer messages. See{' '}
        <Link href="/pricing">plans and pricing</Link>, or read how{' '}
        <Link href="/blog/whatsapp-broadcast-template-rules">template categories</Link> decide
        what you pay for broadcasts.
      </p>
    </BlogPostLayout>
  );
}
