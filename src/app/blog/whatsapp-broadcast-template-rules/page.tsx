import type { Metadata } from 'next';
import Link from 'next/link';

import { getPost } from '@/lib/blog';
import {
  BlogPostLayout,
  TemplateExample,
  type FaqItem,
  type TocItem,
} from '@/components/blog/post-layout';

const POST = getPost('whatsapp-broadcast-template-rules');

export const metadata: Metadata = {
  title: POST.title,
  description: POST.description,
  keywords: POST.keywords,
  alternates: { canonical: `/blog/${POST.slug}` },
  openGraph: {
    type: 'article',
    url: `/blog/${POST.slug}`,
    title: `${POST.title} — Repeat Grow`,
    description: POST.description,
    publishedTime: POST.datePublished,
    section: POST.category,
    tags: POST.keywords,
  },
  twitter: { card: 'summary_large_image', title: POST.title, description: POST.description },
  robots: { index: true, follow: true },
};

const TOC: TocItem[] = [
  { id: 'categories', label: 'Templates are categorized, and the category affects pricing' },
  { id: 'variables', label: 'Variables need realistic sample content' },
  { id: 'rejections', label: 'Common rejection reasons' },
  { id: 'tracking', label: 'Delivery and read tracking' },
];

const FAQ: FaqItem[] = [
  {
    question: 'When do I need a WhatsApp template?',
    answer:
      'Whenever you start a conversation, or message a customer who hasn’t written to you in the last 24 hours. Inside that 24-hour window you can reply with normal free-form messages.',
  },
  {
    question: 'Can I edit a template after it is approved?',
    answer:
      'Changes to an approved template go back through review, so plan your wording before submitting. Many teams simply create a new version with a new name.',
  },
  {
    question: 'How long does template approval take?',
    answer:
      'Often minutes, sometimes a few hours. Templates that are clearly categorized and have realistic sample values are approved fastest.',
  },
];

export default function TemplateRulesPost() {
  return (
    <BlogPostLayout post={POST} toc={TOC} faq={FAQ}>
      <p>
        Any message you broadcast to a customer who hasn&apos;t messaged you in the last 24 hours has
        to go through a pre-approved WhatsApp message template. Here&apos;s what actually gets
        checked, and why templates get rejected.
      </p>

      <h2 id="categories">Templates are categorized, and the category affects pricing</h2>
      <p>
        Meta classifies every template as <strong>Marketing</strong>, <strong>Utility</strong> or{' '}
        <strong>Authentication</strong>. A promo broadcast is Marketing; an order confirmation or
        shipping update is Utility; an OTP is Authentication. Meta prices messages differently by
        category, so miscategorizing a template (for example, dressing up a promo as a utility
        update) is both a rejection risk and a billing issue.
      </p>
      <TemplateExample label="order_shipped — approved" category="Utility">
        {`Hi {{1}}, your order {{2}} has shipped.
Track it here: {{3}}`}
      </TemplateExample>
      <TemplateExample label="diwali_sale — submitted as Utility, rejected" category="Marketing">
        {`Big Diwali sale! 50% off everything today.
Shop now: {{1}}`}
      </TemplateExample>
      <p>
        The second one is a perfectly good <em>Marketing</em> template — it just can&apos;t pretend to
        be Utility.
      </p>

      <h2 id="variables">Variables need realistic sample content</h2>
      <p>
        Templates with variables like <code>{'{{1}}'}</code> for a name or order number must include
        example values when submitted for review. Reviewers reject templates where the sample
        content is missing, placeholder-only, or inconsistent with the stated category. Use real-looking
        samples: &ldquo;Priya&rdquo;, &ldquo;#1042&rdquo;, &ldquo;₹1,499&rdquo;.
      </p>

      <h2 id="rejections">Common rejection reasons</h2>
      <ul>
        <li>Promotional language in a template marked as Utility.</li>
        <li>Missing or generic variable examples.</li>
        <li>Asking for sensitive personal information (card numbers, passwords, ID numbers).</li>
        <li>A template that starts or ends with a variable, or is mostly variables.</li>
        <li>Content that breaks WhatsApp&apos;s commerce and business policies.</li>
      </ul>
      <p>
        Approved templates can&apos;t be freely edited once they&apos;re live — a changed template goes
        back through review.
      </p>

      <h2 id="tracking">Delivery and read tracking</h2>
      <p>
        Once approved, each broadcast send reports delivery and read status per recipient back
        through the API — useful for confirming an order-update broadcast actually reached
        customers, not just that it was sent.
      </p>
      <p>
        Repeat Grow&apos;s broadcast tool manages templates, variable substitution, scheduling and
        per-recipient tracking in one place — see <Link href="/pricing">pricing and plan limits</Link>{' '}
        for broadcast volume per plan, or read how stores use templates for{' '}
        <Link href="/blog/shopify-whatsapp-order-notifications">Shopify order notifications</Link>.
      </p>
    </BlogPostLayout>
  );
}
