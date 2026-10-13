import type { Metadata } from 'next';
import Link from 'next/link';

import { getPost } from '@/lib/blog';
import {
  BlogFigure,
  BlogPostLayout,
  TemplateExample,
  type FaqItem,
  type TocItem,
} from '@/components/blog/post-layout';

const POST = getPost('whatsapp-appointment-reminders');

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
  { id: 'why-no-shows', label: 'Why people miss appointments' },
  { id: 'schedule', label: 'The reminder schedule that works' },
  { id: 'templates', label: 'Reminder templates you can copy' },
  { id: 'phone-number', label: 'Collect the phone number at booking' },
  { id: 'who', label: 'Who this works for' },
  { id: 'setup', label: 'How to set it up with Calendly and Repeat Grow' },
  { id: 'mistakes', label: 'Mistakes to avoid' },
];

const FAQ: FaqItem[] = [
  {
    question: 'How far in advance should I send an appointment reminder?',
    answer:
      'A reminder 24 hours before gives people time to plan or reschedule, and a second reminder 1 hour before (with the meeting link or address) catches the ones who forgot. Send a confirmation right after booking as well.',
  },
  {
    question: 'Are appointment reminders Utility or Marketing templates?',
    answer:
      'Confirmations, reminders and reschedule notices about a booking the customer made are Utility templates. Promotional messages, like a discount on the next visit, are Marketing.',
  },
  {
    question: 'Does Calendly send WhatsApp reminders itself?',
    answer:
      'Calendly can send email and SMS reminders on some plans, but WhatsApp reminders need a WhatsApp Business API sender. Repeat Grow listens to Calendly booking webhooks and sends the WhatsApp messages from your own business number. Calendly webhooks require a paid Calendly plan.',
  },
  {
    question: 'What time zone are reminders sent in?',
    answer:
      'Reminders are scheduled from the meeting’s start time, and the date and time inside the message use the invitee’s own time zone, so a customer in Dubai sees their local time.',
  },
  {
    question: 'What if someone books an hour before the meeting?',
    answer:
      'Then the 24-hour reminder is skipped — they just booked, and the confirmation has the details. Good reminder systems only send a reminder if the booking was made comfortably before that reminder point.',
  },
];

export default function AppointmentRemindersPost() {
  return (
    <BlogPostLayout post={POST} toc={TOC} faq={FAQ}>
      <p>
        An empty slot costs the same as a full one — the room, the staff, the time you blocked
        out. Most no-shows aren&apos;t rude; people simply forget, or meant to reschedule and never
        got round to it. A short, well-timed reminder on the app they check most fixes a large share
        of that. Here&apos;s a reminder schedule you can use for any booking, the exact WhatsApp
        templates, and how to automate it for Calendly bookings.
      </p>

      <h2 id="why-no-shows">Why people miss appointments</h2>
      <ul>
        <li>
          <strong>They forgot.</strong> The booking was made a week ago, between other things.
        </li>
        <li>
          <strong>Plans changed</strong> and cancelling felt like more effort than not turning up.
        </li>
        <li>
          <strong>They couldn&apos;t find the details</strong> — the meeting link, the address, the
          time in their time zone.
        </li>
      </ul>
      <p>
        Each of these has a fix: a timely nudge, an easy reschedule link, and the details in one
        message they can find in seconds.
      </p>

      <h2 id="schedule">The reminder schedule that works</h2>
      <BlogFigure
        src="/blog/whatsapp-appointment-reminders/reminder-timeline.svg"
        alt="Timeline: confirmation after booking, reminder 24 hours before, reminder 1 hour before, follow-up after a cancellation or no-show"
        caption="Four WhatsApp messages per booking: confirm, remind twice, follow up."
      />
      <ol>
        <li>
          <strong>Confirmation — right after booking.</strong> Date, time, meeting link or address,
          and a reschedule link.
        </li>
        <li>
          <strong>24 hours before.</strong> Gives people time to plan the day, and makes
          rescheduling the easy option instead of silently not showing up.
        </li>
        <li>
          <strong>1 hour before.</strong> &ldquo;Starting soon&rdquo; plus the join link or address —
          this catches the people who simply forgot.
        </li>
        <li>
          <strong>Follow-up after a cancellation or no-show.</strong> A friendly note with a link to
          book again recovers appointments you would otherwise lose.
        </li>
      </ol>

      <h2 id="templates">Reminder templates you can copy</h2>
      <p>
        These are Utility templates — they&apos;re about a booking the customer made. Keep them short,
        and always include the time and a way to reschedule.
      </p>
      <TemplateExample label="booking_confirmed" category="Utility">
        {`Hi {{1}}, your {{2}} is confirmed for {{3}}.
Join: {{4}}
Need to change it? {{5}}`}
      </TemplateExample>
      <TemplateExample label="reminder_24h" category="Utility">
        {`Reminder: your {{1}} with {{2}} is tomorrow, {{3}}.
Can't make it? Reschedule here: {{4}}`}
      </TemplateExample>
      <TemplateExample label="reminder_1h" category="Utility">
        {`Hi {{1}}, your {{2}} starts in 1 hour ({{3}}).
Join here: {{4}}`}
      </TemplateExample>
      <TemplateExample label="missed_followup" category="Utility">
        {`Sorry we missed you today, {{1}}. Book a new time that suits you: {{2}}`}
      </TemplateExample>
      <p>
        In Repeat Grow each variable maps to a booking value: invitee name, meeting name, date,
        time (in the invitee&apos;s time zone), meeting link or location, host, reschedule and cancel
        links, and your booking page.
      </p>

      <h2 id="phone-number">Collect the phone number at booking</h2>
      <p>
        A reminder can only go to a number you have. Calendly doesn&apos;t ask for a phone number by
        default, so add a booking question of type <strong>Phone number</strong> — label it
        &ldquo;WhatsApp number&rdquo; so people know why you&apos;re asking. Turning on Calendly&apos;s text
        reminders also collects a number. Numbers saved without a country code get your default
        (for example +91) added automatically.
      </p>

      <h2 id="who">Who this works for</h2>
      <ul>
        <li>
          <strong>Clinics and therapists</strong> — fewer empty slots, and patients arrive with the
          right details.
        </li>
        <li>
          <strong>Coaches, tutors and online classes</strong> — the join link arrives an hour before,
          in the app they&apos;re already using.
        </li>
        <li>
          <strong>Salons and studios</strong> — rescheduling becomes a tap instead of a no-show.
        </li>
        <li>
          <strong>Real estate and sales demos</strong> — site visits and calls happen on time.
        </li>
      </ul>

      <h2 id="setup">How to set it up with Calendly and Repeat Grow</h2>
      <ol>
        <li>
          <strong>Connect WhatsApp</strong> on the official WhatsApp Business API in Repeat Grow
          (Settings → WhatsApp).
        </li>
        <li>
          <strong>Create the templates</strong> above in Settings → Templates (Utility) and wait for
          Meta&apos;s approval.
        </li>
        <li>
          <strong>Add the phone question</strong> to each Calendly event type.
        </li>
        <li>
          <strong>Connect Calendly:</strong> in Calendly go to Integrations → API &amp; Webhooks,
          generate a personal access token, and paste it in Repeat Grow → Settings → Calendly. The
          booking webhooks are set up for you.
        </li>
        <li>
          <strong>Map the messages:</strong> switch on confirmation, rescheduled, cancelled,
          no-show and the 24-hour and 1-hour reminders, pick each template, and press{' '}
          <strong>Send test</strong>.
        </li>
      </ol>
      <p>
        Reminders are skipped for cancelled meetings and for bookings made after the reminder point,
        and every message lands in your shared inbox — so when a customer replies &ldquo;running 10
        minutes late&rdquo;, your team sees it. Details are in the{' '}
        <Link href="/docs#calendly">Calendly section of the Help Center</Link>.
      </p>

      <h2 id="mistakes">Mistakes to avoid</h2>
      <ul>
        <li>
          <strong>Too many reminders.</strong> Two before the meeting is plenty; more starts to feel
          like spam.
        </li>
        <li>
          <strong>No reschedule link.</strong> If changing the time is hard, people just don&apos;t
          come.
        </li>
        <li>
          <strong>Wrong time zone.</strong> Always show the time in the customer&apos;s time zone.
        </li>
        <li>
          <strong>Mixing in promotions.</strong> Keep reminders about the appointment; send offers
          separately, as Marketing templates, only to people who opted in.
        </li>
      </ul>
    </BlogPostLayout>
  );
}
