import type { Metadata } from 'next';
import Link from 'next/link';

import { getPost } from '@/lib/blog';
import { BlogPostLayout, type FaqItem, type TocItem } from '@/components/blog/post-layout';

const POST = getPost('whatsapp-business-voice-calling');

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
  { id: 'what', label: 'What WhatsApp business calling is' },
  { id: 'how', label: 'How a call reaches your team' },
  { id: 'calling-back', label: 'Calling customers back' },
  { id: 'requirements', label: 'Requirements from Meta' },
  { id: 'costs', label: 'What it costs' },
  { id: 'setup', label: 'How to turn it on in Repeat Grow' },
  { id: 'limits', label: 'Limits to know about' },
];

const FAQ: FaqItem[] = [
  {
    question: 'Do customers need to install anything to call my business?',
    answer:
      'No. They call from your business profile in WhatsApp like any other contact. Your agents need only a browser and a microphone.',
  },
  {
    question: 'Are calls recorded?',
    answer:
      'No. Repeat Grow does not record calls. Audio goes directly between the agent’s browser and Meta.',
  },
  {
    question: 'Do I need a phone line or a SIM?',
    answer:
      'No. Calls are handled over the internet in the browser (WebRTC), through the number that is connected to the WhatsApp Business API.',
  },
  {
    question: 'Can I call a customer who has never contacted me?',
    answer:
      'Only with permission. If the customer has not allowed calls, the Call button sends a WhatsApp call permission request instead. Meta limits these to 1 request a day and 2 a week per customer.',
  },
  {
    question: 'Why can’t I turn calling on?',
    answer:
      'Usually the number is not yet on the Cloud API, its messaging limit is below 2,000 customers a day, or the calls webhook field is not subscribed. Repeat Grow shows the reason in plain words next to the switch.',
  },
];

export default function VoiceCallingPost() {
  return (
    <BlogPostLayout post={POST} toc={TOC} faq={FAQ}>
      <p>
        A lot of customers would rather talk than type, especially for urgent problems or bigger
        purchases. WhatsApp&apos;s business calling lets them call your WhatsApp number directly, and
        your team can answer from the same place they already handle chats. Here is how it works,
        what Meta requires and how to turn it on.
      </p>

      <h2 id="what">What WhatsApp business calling is</h2>
      <p>
        Meta&apos;s Calling API lets a business receive and place voice calls on its WhatsApp Business
        API number. Instead of handing out a separate phone number, customers tap the call icon in
        your WhatsApp chat or profile. In Repeat Grow the calls are handled in the browser, next to
        the conversation, contact details and deal history.
      </p>

      <h2 id="how">How a call reaches your team</h2>
      <ol>
        <li>
          A customer calls your WhatsApp number. <strong>Every agent&apos;s browser rings</strong>{' '}
          with an incoming-call card and a ringtone, on any page of the app.
        </li>
        <li>
          The <strong>first agent to press Answer</strong> takes the call. The others stop ringing,
          so two people never pick up the same call.
        </li>
        <li>
          The agent sees the customer&apos;s chat and notes, can mute, hang up, and watches a live
          timer.
        </li>
        <li>
          Afterwards the call appears under <strong>Recent calls</strong> in the contact panel.
        </li>
      </ol>

      <h2 id="calling-back">Calling customers back</h2>
      <p>
        Agents use the <strong>Call</strong> button in the chat header. WhatsApp requires the
        customer&apos;s consent for business-initiated calls: if they have not allowed calls, the
        button sends a call permission request instead, and you can call once they accept. Meta
        allows 1 permission request a day and 2 a week per customer, so use them when it matters.
      </p>

      <h2 id="requirements">Requirements from Meta</h2>
      <ul>
        <li>The number is on the <strong>Cloud API</strong>.</li>
        <li>
          The number has a messaging limit of <strong>2,000 customers a day or more</strong>.
        </li>
        <li>
          The <strong>calls</strong> webhook field is subscribed in the Meta App Dashboard.
        </li>
        <li>
          Agents use a browser with WebRTC (Chrome, Edge, Safari or Firefox) and allow the
          microphone.
        </li>
      </ul>

      <h2 id="costs">What it costs</h2>
      <p>
        Calls the <strong>customer starts are free</strong>. Calls the <strong>business starts</strong>{' '}
        are billed per minute by Meta and need the customer&apos;s permission. Repeat Grow does not add
        a charge for calling.
      </p>

      <h2 id="setup">How to turn it on in Repeat Grow</h2>
      <ol>
        <li>Apply the calling migration (self-hosters) and connect your WhatsApp number.</li>
        <li>
          In the Meta App Dashboard, open WhatsApp → Configuration and subscribe to the{' '}
          <strong>calls</strong> webhook field.
        </li>
        <li>
          In Repeat Grow go to <strong>Settings → WhatsApp → WhatsApp calling</strong> and switch it
          on (admins only).
        </li>
        <li>
          If Meta says calling is not enabled for the number, the card explains why, for example the
          messaging limit or a Cloud-API-only requirement, instead of showing an error.
        </li>
      </ol>
      <p>
        More detail is in the{' '}
        <Link href="/docs#inbox">shared inbox section of the Help Center</Link>. If your number
        isn&apos;t on the official API yet, start with{' '}
        <Link href="/blog/whatsapp-business-api-verification-guide">
          how WhatsApp Business API verification works
        </Link>
        .
      </p>

      <h2 id="limits">Limits to know about</h2>
      <ul>
        <li>
          <strong>Strict office networks</strong> can block WebRTC audio. Repeat Grow uses public
          STUN only, with no TURN server.
        </li>
        <li>
          <strong>Nothing is recorded</strong>, so note down key points in the chat or contact
          notes.
        </li>
        <li>
          <strong>Permission requests are rationed</strong> by Meta (1 a day, 2 a week per
          customer).
        </li>
      </ul>
    </BlogPostLayout>
  );
}
