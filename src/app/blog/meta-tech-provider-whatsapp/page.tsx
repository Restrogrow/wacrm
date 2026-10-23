import type { Metadata } from 'next';
import Link from 'next/link';

import { getPost } from '@/lib/blog';
import {
  BlogDemoCta,
  BlogFigure,
  BlogPostLayout,
  type FaqItem,
  type TocItem,
} from '@/components/blog/post-layout';

const POST = getPost('meta-tech-provider-whatsapp');

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
  { id: 'what-it-is', label: 'What a Meta Tech Provider is' },
  { id: 'compared', label: 'Tech Provider, Solution Partner and unofficial tools' },
  { id: 'what-it-means', label: 'What it means for your business' },
  { id: 'check', label: 'How to check a WhatsApp provider is genuine' },
  { id: 'repeat-grow', label: 'Getting started with Repeat Grow' },
];

const FAQ: FaqItem[] = [
  {
    question: 'Is Repeat Grow a Meta Tech Provider?',
    answer:
      'Yes. Repeat Grow is an approved Meta Tech Provider for the WhatsApp Business Platform. Businesses connect their own WhatsApp number to Repeat Grow through Meta’s official Embedded Signup.',
  },
  {
    question: 'What is the difference between a Meta Tech Provider and a BSP?',
    answer:
      'Both use the official WhatsApp Business Platform. A Tech Provider builds software and onboards businesses with Embedded Signup, and each business pays Meta directly for its messages. A Meta Business Partner (Solution Partner, often called a BSP) can also bill message fees to the business on Meta’s behalf.',
  },
  {
    question: 'Who owns my WhatsApp Business Account?',
    answer:
      'You do. The WhatsApp Business Account and phone number stay in your own Meta Business portfolio. Repeat Grow gets permission to send and receive messages for you, and you can remove that access from your Meta Business settings at any time.',
  },
  {
    question: 'Does Repeat Grow add a markup to WhatsApp message fees?',
    answer:
      'No. Meta bills WhatsApp message fees straight to the payment method on your WhatsApp Business Account. Repeat Grow charges only its plan price.',
  },
  {
    question: 'Can my number get banned for using Repeat Grow?',
    answer:
      'Not for using Repeat Grow itself, because it runs on the official API. Any WhatsApp number can still be limited if customers block or report it, so follow WhatsApp’s messaging policies and only message people who opted in.',
  },
];

export default function MetaTechProviderPost() {
  return (
    <BlogPostLayout post={POST} toc={TOC} faq={FAQ}>
      <p>
        Repeat Grow is an approved <strong>Meta Tech Provider</strong> for the WhatsApp Business
        Platform. If you are choosing a WhatsApp CRM or broadcast tool, that phrase tells you a lot
        about how safe your number will be and who controls your data. Here is what a Tech Provider
        is, how it differs from other kinds of WhatsApp tools, and how to check any provider before
        you connect your business number.
      </p>

      <h2 id="what-it-is">What a Meta Tech Provider is</h2>
      <p>
        Meta runs the WhatsApp Business Platform (the Cloud API) for companies that build software on
        top of WhatsApp. A <strong>Tech Provider</strong> is a software company that Meta has
        approved to connect other businesses to that platform. To become one, a company has to:
      </p>
      <ul>
        <li>verify its own business with Meta;</li>
        <li>
          pass Meta&apos;s app review for the WhatsApp permissions it uses, such as sending messages
          and managing WhatsApp Business Accounts;
        </li>
        <li>
          onboard customers through <strong>Embedded Signup</strong>, Meta&apos;s own sign-in window,
          rather than asking for passwords or QR codes.
        </li>
      </ul>
      <p>
        In short, Meta has checked who the provider is and what its app does with WhatsApp, and every
        business it connects goes through Meta&apos;s own flow.
      </p>

      <BlogFigure
        src="/blog/meta-tech-provider-whatsapp/how-it-connects.webp"
        alt="Your business connects to Repeat Grow through Meta Embedded Signup and messages go over the official WhatsApp Cloud API"
        caption="Your number stays in your own Meta Business account. Repeat Grow sends and receives through Meta’s official Cloud API."
      />

      <h2 id="compared">Tech Provider, Solution Partner and unofficial tools</h2>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Meta Tech Provider</th>
              <th>Meta Solution Partner (BSP)</th>
              <th>Unofficial tool</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Uses the official WhatsApp API</td>
              <td>Yes</td>
              <td>Yes</td>
              <td>No (WhatsApp Web or app automation)</td>
            </tr>
            <tr>
              <td>Approved by Meta</td>
              <td>Yes</td>
              <td>Yes</td>
              <td>No</td>
            </tr>
            <tr>
              <td>How you connect</td>
              <td>Embedded Signup</td>
              <td>Embedded Signup or managed setup</td>
              <td>QR code or phone login</td>
            </tr>
            <tr>
              <td>Who bills WhatsApp message fees</td>
              <td>Meta, directly to you</td>
              <td>Meta or the partner</td>
              <td>Not applicable</td>
            </tr>
            <tr>
              <td>Risk of a ban for the tool itself</td>
              <td>No</td>
              <td>No</td>
              <td>High</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Tech Providers and Solution Partners are both on the official platform. The main practical
        difference is billing: with a Tech Provider such as Repeat Grow, Meta charges message fees to
        your own WhatsApp Business Account, so there is no markup on them. Unofficial tools are a
        different category altogether. We explain why in{' '}
        <Link href="/official-vs-unofficial-whatsapp-api">
          official vs unofficial WhatsApp tools
        </Link>
        .
      </p>

      <h2 id="what-it-means">What it means for your business</h2>
      <ul>
        <li>
          <strong>Your number is safe to use.</strong> Messages go through Meta&apos;s Cloud API, so
          WhatsApp has no reason to ban you for the software you use.
        </li>
        <li>
          <strong>You own the account.</strong> Your WhatsApp Business Account, number and templates
          live in your own Meta Business portfolio. You can remove Repeat Grow&apos;s access there at
          any time.
        </li>
        <li>
          <strong>No markup on message fees.</strong> Meta bills WhatsApp fees directly to you at its
          published rates. See{' '}
          <Link href="/blog/whatsapp-service-message-pricing-2026">how WhatsApp pricing works</Link>.
        </li>
        <li>
          <strong>Every official feature.</strong> Approved templates, broadcasts, interactive
          buttons, catalogs, WhatsApp Pay and WhatsApp calling all work, because they are part of the
          platform.
        </li>
        <li>
          <strong>Setup in minutes.</strong> Embedded Signup connects your number from inside Repeat
          Grow, and we help with{' '}
          <Link href="/blog/whatsapp-business-api-verification-guide">business verification</Link>.
        </li>
      </ul>

      <BlogDemoCta
        heading="Connect your number the official way"
        text="Book a free demo and we will connect your WhatsApp number through Meta’s Embedded Signup and set up your inbox with you."
      />

      <h2 id="check">How to check a WhatsApp provider is genuine</h2>
      <ol>
        <li>
          <strong>Look at the connect screen.</strong> A genuine provider opens a Facebook window
          (Embedded Signup) to connect your number. If it asks you to scan a QR code, it is not using
          the API.
        </li>
        <li>
          <strong>Check your Meta Business settings.</strong> After connecting, your WhatsApp Business
          Account should appear under your own business at business.facebook.com, with the
          provider&apos;s app listed under connected apps.
        </li>
        <li>
          <strong>Look for a display name review.</strong> On the official API, Meta reviews your
          display name and you get a quality rating and messaging limits.
        </li>
        <li>
          <strong>Ask who bills message fees.</strong> A clear answer such as &ldquo;Meta bills you
          directly&rdquo; is a good sign.
        </li>
      </ol>

      <h2 id="repeat-grow">Getting started with Repeat Grow</h2>
      <p>
        <Link href="/">Repeat Grow</Link> is a WhatsApp CRM for Indian businesses and a Meta Tech
        Provider. It gives your team a shared inbox, an AI chatbot, an AI voice agent for WhatsApp
        calls, broadcasts, catalog orders and payments, all on the official API. Start with the
        7-day free trial, or see <Link href="/pricing">plans and pricing</Link>.
      </p>
    </BlogPostLayout>
  );
}
