import type { Metadata } from 'next';
import Link from 'next/link';

import { getPost } from '@/lib/blog';
import {
  BlogDemoCta,
  BlogFigure,
  BlogPostLayout,
  TemplateExample,
  type FaqItem,
  type TocItem,
} from '@/components/blog/post-layout';

const POST = getPost('diwali-whatsapp-marketing-templates');

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
  { id: 'dates', label: 'Diwali 2026 dates to plan around' },
  { id: 'plan', label: 'A day-by-day WhatsApp plan' },
  { id: 'templates', label: 'Templates you can copy' },
  { id: 'approval', label: 'Getting templates approved in time' },
  { id: 'limits', label: 'Messaging limits and costs' },
  { id: 'mistakes', label: 'Mistakes that cost you customers' },
];

const FAQ: FaqItem[] = [
  {
    question: 'When is Diwali in 2026?',
    answer:
      'Diwali (Lakshmi Puja) falls on Sunday, 8 November 2026. Dhanteras is on Friday, 6 November, and Bhai Dooj on Tuesday, 10 November.',
  },
  {
    question: 'Is a Diwali greeting a Marketing or Utility template?',
    answer:
      'Marketing. Greetings, offers and festive sale announcements are all Marketing templates, and Meta will recategorise a greeting submitted as Utility.',
  },
  {
    question: 'How early should I submit Diwali templates?',
    answer:
      'At least a week before you want to send them. Most templates are reviewed within minutes to a few hours, but a rejection and resubmission can take a day, and approvals get busier before big festivals.',
  },
  {
    question: 'Can I send a Diwali broadcast to everyone in my phone contacts?',
    answer:
      'Only to people who agreed to hear from you on WhatsApp. Messaging people who did not opt in leads to blocks and reports, which lowers your quality rating and can pause your templates.',
  },
];

export default function DiwaliWhatsAppPost() {
  return (
    <BlogPostLayout post={POST} toc={TOC} faq={FAQ}>
      <p>
        Diwali is the biggest buying week of the year for most Indian businesses, and WhatsApp is
        where your customers already are. It is also when everyone else is messaging them. A good
        plan, sent on the right days, with templates that are approved in time, is what separates a
        sale from a mute. Here is a simple plan for Diwali 2026 and templates you can copy.
      </p>

      <h2 id="dates">Diwali 2026 dates to plan around</h2>
      <ul>
        <li>
          <strong>Dhanteras</strong>: Friday, 6 November 2026, the big day for gold, silver,
          electronics and utensils.
        </li>
        <li>
          <strong>Choti Diwali</strong>: Saturday, 7 November.
        </li>
        <li>
          <strong>Diwali (Lakshmi Puja)</strong>: Sunday, 8 November.
        </li>
        <li>
          <strong>Govardhan Puja</strong>: Monday, 9 November, and <strong>Bhai Dooj</strong>:
          Tuesday, 10 November.
        </li>
      </ul>
      <p>
        Online orders need delivery time, so for e-commerce the real deadline is the last shipping
        date before Diwali, often around 1 to 3 November.
      </p>

      <h2 id="plan">A day-by-day WhatsApp plan</h2>
      <BlogFigure
        src="/blog/diwali-whatsapp-marketing-templates/campaign-calendar.webp"
        alt="Diwali 2026 WhatsApp campaign calendar from 26 October to 11 November"
        caption="Six sends from early access to the thank-you message. Diwali day itself is a greeting only."
      />
      <ol>
        <li>
          <strong>Now to 25 October: prepare.</strong> Clean your list, tag customers who bought
          last Diwali, and submit all templates.
        </li>
        <li>
          <strong>About 26 October: early access.</strong> Send the offer to your best customers
          first. It feels special, and good engagement helps your messaging limit before the big
          send.
        </li>
        <li>
          <strong>About 30 October: main launch</strong> to everyone who opted in.
        </li>
        <li>
          <strong>Last shipping day: final reminder</strong> for online orders.
        </li>
        <li>
          <strong>6 November: Dhanteras offer</strong> for relevant products, and a store-visit
          reminder for shops.
        </li>
        <li>
          <strong>8 November: greeting only.</strong> No hard sell on Diwali itself.
        </li>
        <li>
          <strong>After Diwali: thank-you and review request</strong> to customers who bought.
        </li>
      </ol>

      <h2 id="templates">Templates you can copy</h2>
      <BlogFigure
        src="/blog/diwali-whatsapp-marketing-templates/diwali-offer-message.webp"
        alt="A Diwali sale WhatsApp message with an image header, offer text and Shop now and Stop promotions buttons"
        caption="A festive banner, one clear offer with a deadline, and two buttons: buy, or opt out."
      />
      <p>
        Variables in double braces are filled per customer. Keep offers clear, add one button, and
        always offer a way to stop promotions.
      </p>
      <TemplateExample label="diwali_early_access" category="Marketing">
        {`Hi {{1}}, Diwali comes early for you ✨
As one of our regular customers, you get {{2}} off before everyone else, until {{3}}.
Tap below to shop. Reply STOP to opt out of offers.`}
      </TemplateExample>
      <TemplateExample label="diwali_sale_launch" category="Marketing">
        {`Our Diwali sale is live, {{1}} 🪔
{{2}} on {{3}}. Order by {{4}} for delivery before Diwali.
Reply STOP to opt out of offers.`}
      </TemplateExample>
      <TemplateExample label="dhanteras_store_visit" category="Marketing">
        {`Happy Dhanteras, {{1}}!
Visit us at {{2}} today for {{3}}. We are open until {{4}}.
Reply STOP to opt out of offers.`}
      </TemplateExample>
      <TemplateExample label="diwali_greeting" category="Marketing">
        {`Wishing you and your family a very Happy Diwali, {{1}} 🪔
Thank you for being part of the {{2}} family this year.`}
      </TemplateExample>
      <TemplateExample label="order_delivery_before_diwali" category="Utility">
        {`Hi {{1}}, your order {{2}} has shipped and should reach you by {{3}}, in time for Diwali.
Track it here: {{4}}`}
      </TemplateExample>
      <p>
        The last one is a Utility template because it is about an order the customer placed. Keep
        offers out of it, or Meta will treat it as Marketing.
      </p>

      <BlogDemoCta
        heading="Want us to set up your Diwali campaign?"
        text="Book a free demo. We will create these templates with you, submit them to Meta and schedule every send before the rush."
      />

      <h2 id="approval">Getting templates approved in time</h2>
      <ul>
        <li>
          <strong>Submit a week early</strong> so a rejection does not cost you the launch day.
        </li>
        <li>
          <strong>Give sample values</strong> for every variable, and do not start or end the
          message with a variable.
        </li>
        <li>
          <strong>No misleading urgency</strong> or claims you cannot back up.
        </li>
        <li>
          <strong>Pick the right category.</strong> Greetings and offers are Marketing. Our{' '}
          <Link href="/blog/whatsapp-broadcast-template-rules">template rules guide</Link> lists
          the common rejection reasons.
        </li>
      </ul>

      <h2 id="limits">Messaging limits and costs</h2>
      <p>
        Two numbers decide how big your Diwali send can be: your messaging limit (how many
        customers you can start conversations with per 24 hours) and the per-message price of
        Marketing templates. If your list is bigger than your limit, send in batches over a few
        days, best customers first. See{' '}
        <Link href="/blog/whatsapp-messaging-limits-2026">how messaging limits work in 2026</Link>{' '}
        and{' '}
        <Link href="/blog/whatsapp-service-message-pricing-2026">
          what replies cost since October 2026
        </Link>
        , because a successful campaign brings a lot of replies.
      </p>

      <h2 id="mistakes">Mistakes that cost you customers</h2>
      <ul>
        <li>
          <strong>Messaging people who never opted in.</strong> Blocks hurt your quality rating
          right when you need it most.
        </li>
        <li>
          <strong>Five messages in five days</strong> to the same person. Two or three well-timed
          messages are enough.
        </li>
        <li>
          <strong>No one to answer replies.</strong> Festive campaigns bring questions about
          sizes, delivery and stock. Plan who answers in the shared inbox.
        </li>
        <li>
          <strong>Selling on Diwali day.</strong> Send a warm greeting instead.
        </li>
      </ul>
      <p>
        <Link href="/">Repeat Grow</Link> lets you schedule each of these broadcasts in advance,
        send to tagged segments, and answer every reply from one shared inbox.{' '}
        <Link href="/demo">Book a free demo</Link> and we can set up your Diwali campaign with you.
      </p>
    </BlogPostLayout>
  );
}
