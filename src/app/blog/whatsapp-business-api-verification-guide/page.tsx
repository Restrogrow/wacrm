import type { Metadata } from 'next';
import Link from 'next/link';

import { getPost } from '@/lib/blog';
import { BlogPostLayout, type FaqItem, type TocItem } from '@/components/blog/post-layout';

const POST = getPost('whatsapp-business-api-verification-guide');

export const metadata: Metadata = {
  title: POST.title,
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
  { id: 'business-manager', label: 'Create a Meta Business Manager account' },
  { id: 'business-verification', label: 'Submit Meta Business verification' },
  { id: 'phone-number', label: 'Register and verify your phone number' },
  { id: 'display-name', label: 'Get your display name and templates approved' },
  { id: 'timeline', label: 'How long this actually takes' },
];

const FAQ: FaqItem[] = [
  {
    question: 'Can I use my existing WhatsApp number for the API?',
    answer:
      'Yes, but it can’t stay active on the regular WhatsApp or WhatsApp Business app at the same time. Back up the chats you need, then register the number on the API during setup.',
  },
  {
    question: 'Is business verification the same as the green tick?',
    answer:
      'No. Business verification confirms your company to Meta. The verified badge is a separate request for notable brands and isn’t needed to send messages.',
  },
  {
    question: 'Which documents does Meta accept?',
    answer:
      'Typically a business registration certificate, GST certificate or similar tax document, or a utility bill in the business’s legal name, plus a website on a domain you own that shows the same name.',
  },
];

export default function VerificationGuidePost() {
  return (
    <BlogPostLayout post={POST} toc={TOC} faq={FAQ}>
      <p>
        &ldquo;WhatsApp Business API verification&rdquo; is really two separate approvals: Meta Business
        verification for your company, and WhatsApp Business account approval for the number itself.
        Here is the order they actually happen in.
      </p>

      <h2 id="business-manager">1. Create a Meta Business Manager account</h2>
      <p>
        Every WhatsApp Business API number lives inside a Meta Business Manager (Business Portfolio)
        account tied to a real company. This is where Meta verifies who you are before you can send
        template messages at scale.
      </p>

      <h2 id="business-verification">2. Submit Meta Business verification</h2>
      <p>
        Meta checks your legal business name, address and website against official documents,
        typically a business registration or tax document and proof that the domain or website is
        yours. Mismatches between your legal name and what&apos;s shown publicly are the most common
        cause of delay here.
      </p>

      <h2 id="phone-number">3. Register and verify your phone number</h2>
      <p>
        The number you connect to the WhatsApp Business API cannot already be active on the regular
        WhatsApp or WhatsApp Business app on a phone. It needs to be migrated or freed up first.
        Verification is a one-time code sent by call or SMS during setup.
      </p>

      <h2 id="display-name">4. Get your display name and templates approved</h2>
      <p>
        Your business display name (what recipients see) goes through its own review, separate from
        business verification. Message templates for broadcasts also need individual approval before
        they can be sent. See{' '}
        <Link href="/blog/whatsapp-broadcast-template-rules">WhatsApp template rules explained</Link>.
      </p>

      <h2 id="timeline">How long this actually takes</h2>
      <p>
        Business verification can take anywhere from under a day to around a week depending on
        document clarity and request volume. Template approval is typically much faster, often
        minutes to a few hours. Repeat Grow&apos;s guided setup connects your number through
        Meta&apos;s embedded signup, so most of these steps happen in one flow.
      </p>
      <p>
        Want this handled for you instead of doing it manually?{' '}
        <Link href="/pricing">See Repeat Grow&apos;s plans</Link>. WhatsApp Business API setup is
        included on every one.
      </p>
    </BlogPostLayout>
  );
}
