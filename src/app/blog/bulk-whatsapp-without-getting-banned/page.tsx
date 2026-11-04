import type { Metadata } from 'next';
import Link from 'next/link';

import { getPost } from '@/lib/blog';
import {
  BlogPostLayout,
  TemplateExample,
  type FaqItem,
  type TocItem,
} from '@/components/blog/post-layout';

const POST = getPost('bulk-whatsapp-without-getting-banned');

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
  twitter: {
    card: 'summary_large_image',
    title: POST.title,
    description: POST.description,
  },
  robots: { index: true, follow: true },
};

const TOC: TocItem[] = [
  { id: 'two-kinds', label: 'Two completely different risks' },
  { id: 'unofficial', label: 'Why unofficial senders get banned' },
  { id: 'quality', label: 'How the quality rating actually works' },
  { id: 'tiers', label: 'Messaging tiers: the real daily limit' },
  { id: 'what-triggers', label: 'What actually triggers trouble' },
  { id: 'consent', label: 'Consent is the whole game' },
  { id: 'templates', label: 'Write templates people do not block' },
  { id: 'recover', label: 'If your rating has already dropped' },
  { id: 'checklist', label: 'The checklist' },
];

const FAQ: FaqItem[] = [
  {
    question: 'Can WhatsApp ban me for sending too many messages?',
    answer:
      'Not on the official WhatsApp Business API, and not for volume by itself. Volume is capped by your messaging tier instead — you simply cannot exceed it. What causes damage is people blocking and reporting you, which lowers your quality rating and can cut your tier.',
  },
  {
    question: 'What is a WhatsApp quality rating?',
    answer:
      'A score Meta assigns your business number — shown as High, Medium or Low — based on recent feedback from recipients, mainly blocks and reports. It is about how people react to your messages, not how many you send.',
  },
  {
    question: 'How many WhatsApp messages can I send per day in India?',
    answer:
      'It depends on your messaging tier, which starts low for a new number and rises as you send to more unique customers without quality problems. Your current limit is visible in your provider dashboard; in Repeat Grow it is under Settings, WhatsApp, Number health.',
  },
  {
    question: 'Will using a bulk WhatsApp sender APK get my number banned?',
    answer:
      'Very likely. Those tools automate the consumer WhatsApp or WhatsApp Business app, which breaks WhatsApp terms of service. Bans there are account-level and you lose the number, not just the ability to send.',
  },
  {
    question: 'My quality rating dropped to Low. What now?',
    answer:
      'Stop all marketing sends on that number immediately and keep only transactional messages going. The rating recovers over a rolling window if recipient feedback improves, so the fastest route back is sending far less, to a far better list, with a clearer reason to be in someone’s chat.',
  },
  {
    question: 'Does one person reporting me matter?',
    answer:
      'One does not. The rating reflects a rate across recent messages, so a small number of complaints in a large well-targeted send is normal. A high complaint rate on a small send is the dangerous shape.',
  },
];

export default function BulkWhatsAppBanPost() {
  return (
    <BlogPostLayout post={POST} toc={TOC} faq={FAQ}>
      <p>
        Nearly every business that starts sending WhatsApp at scale in India
        asks the same question in the same order: how many can I send, and will
        I get banned? The honest answer is that those are two different
        questions with two different mechanisms behind them, and most of the
        advice online confuses them.
      </p>
      <p>
        This explains what actually happens — how the quality rating works,
        what a messaging tier really limits, which behaviours cause trouble,
        and what to do if your number is already in a bad state.
      </p>

      <h2 id="two-kinds">Two completely different risks</h2>
      <p>
        Before anything else, be clear which of these you are exposed to,
        because the advice is opposite.
      </p>
      <table>
        <thead>
          <tr>
            <th></th>
            <th>Unofficial sender</th>
            <th>Official Business API</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>What it is</td>
            <td>
              A script, APK or browser extension driving the normal WhatsApp or
              WhatsApp Business app
            </td>
            <td>
              Meta&apos;s own API, through a provider, with your business
              verified
            </td>
          </tr>
          <tr>
            <td>Main risk</td>
            <td>
              <strong>Account ban.</strong> You lose the number
            </td>
            <td>
              <strong>Throttling.</strong> Your daily limit is cut
            </td>
          </tr>
          <tr>
            <td>Triggered by</td>
            <td>Using it at all. Automation itself breaks the terms</td>
            <td>Blocks and reports from recipients</td>
          </tr>
          <tr>
            <td>Recoverable?</td>
            <td>Usually not. The number is gone with its chat history</td>
            <td>Yes, over a rolling window, by sending better</td>
          </tr>
        </tbody>
      </table>
      <p>
        If you are on an unofficial tool, nothing later in this article will
        save you — the risk is the tool. If you are on the official API, you
        cannot really be &ldquo;banned for volume&rdquo;, and you should stop
        worrying about send rate and start worrying about consent.
      </p>

      <h2 id="unofficial">Why unofficial senders get banned</h2>
      <p>
        It is worth understanding the mechanism, because it explains why
        &ldquo;go slower&rdquo; and &ldquo;rotate numbers&rdquo; do not fix it.
      </p>
      <p>
        WhatsApp is not looking for a message counter. It is looking at shape:
        near-identical text sent to many numbers that have never messaged you,
        almost no replies coming back, and recipients pressing block. A human
        does not behave like that. Once the pattern is recognised the account
        goes, and because the ban is at account level you lose the{' '}
        <em>number</em> — which for most Indian businesses is printed on their
        packaging, their shopfront and their Google listing.
      </p>
      <p>
        Rotating numbers makes it worse, not better. A fresh number with no
        history sending bulk immediately is the most suspicious shape there is.
      </p>

      <h2 id="quality">How the quality rating actually works</h2>
      <p>
        On the official API, your number carries a quality rating that Meta
        shows as <strong>High</strong>, <strong>Medium</strong> or{' '}
        <strong>Low</strong>. Two things about it surprise people:
      </p>
      <ul>
        <li>
          <strong>It is about reactions, not volume.</strong> It is driven by
          recipient feedback — blocks and reports — over a recent rolling
          window. Sending more good messages does not hurt it.
        </li>
        <li>
          <strong>It is a rate, not a count.</strong> A handful of complaints
          inside a large, well-targeted send is normal. A handful inside a tiny
          send is a serious signal.
        </li>
      </ul>
      <p>
        That is why the standard advice to &ldquo;warm up slowly&rdquo; is only
        half right. Slow sending to a bad list still earns blocks; it just
        earns them more slowly. What protects the rating is <em>who</em> you
        send to and <em>why</em> they would want it.
      </p>

      <h2 id="tiers">Messaging tiers: the real daily limit</h2>
      <p>
        Separately from quality, every number sits in a messaging tier that
        caps how many unique customers you can start conversations with in a
        rolling 24 hours. A new number starts in a low tier and moves up as it
        sends to more unique recipients without quality problems — typically
        within days, not months, if the messages are wanted.
      </p>
      <p>
        Two practical consequences:
      </p>
      <ul>
        <li>
          <strong>You cannot blow past the limit even if you try.</strong>{' '}
          Sends beyond the tier fail rather than getting you in trouble. The
          tier is a ceiling, not a tripwire.
        </li>
        <li>
          <strong>A dropped quality rating can cut your tier.</strong> This is
          the thing that actually hurts a business: the limit that falls takes
          your <em>transactional</em> messages down with it — order
          confirmations and OTPs you genuinely cannot afford to lose.
        </li>
      </ul>
      <p>
        Do not take a number for your tier from a blog post, including this
        one. Meta publishes the current tiers and they change; your provider
        dashboard shows your actual limit. In Repeat Grow it is under{' '}
        <strong>Settings → WhatsApp → Number health</strong>, alongside the
        quality rating, and you get warned before Meta restricts sending.
      </p>

      <h2 id="what-triggers">What actually triggers trouble</h2>
      <p>
        In rough order of how much damage they do:
      </p>
      <ol>
        <li>
          <strong>Messaging people who never opted in.</strong> Bought
          databases, scraped lists, &ldquo;we have their number because they
          enquired in 2021&rdquo;. This is the number-one cause and no amount
          of careful copy fixes it.
        </li>
        <li>
          <strong>Ignoring opt-outs.</strong> Someone replies STOP and gets
          another campaign next week. That is a block and often a report, and
          under India&apos;s DPDP Act it is also a compliance problem.
        </li>
        <li>
          <strong>Sending at the wrong hours.</strong> A marketing message at
          1am earns blocks that the identical message at 11am would not.
        </li>
        <li>
          <strong>Frequency.</strong> The same customer hearing from you three
          times a week about nothing in particular.
        </li>
        <li>
          <strong>Mismatch between promise and message.</strong> They opted in
          for order updates and are getting offers.
        </li>
        <li>
          <strong>No way to reply.</strong> If a broadcast goes out from a
          number nobody monitors, the only available action is to block.
        </li>
      </ol>

      <h2 id="consent">Consent is the whole game</h2>
      <p>
        Everything above collapses into one thing: did this person agree to
        hear from you on WhatsApp, and do they remember agreeing?
      </p>
      <p>
        Practically, for an Indian business:
      </p>
      <ul>
        <li>
          <strong>Ask explicitly, at the point of contact.</strong> A checkbox
          at checkout, a tick on the enquiry form, a reply to a first message.
          Not buried in terms.
        </li>
        <li>
          <strong>Keep the record.</strong> Under the DPDP Act you need to be
          able to show when and how someone consented. Your CRM should hold
          that, not a spreadsheet someone maintains by hand.
        </li>
        <li>
          <strong>Honour STOP automatically.</strong> It has to remove them
          everywhere — broadcasts and automations, including messages already
          queued — without anyone on your team remembering to do it.
        </li>
        <li>
          <strong>Separate transactional from marketing.</strong> Order updates
          are Utility templates and are expected. Offers are Marketing and need
          the opt-in. Sending the second under the first&apos;s cover is the
          fastest way to lose a good number.
        </li>
      </ul>

      <h2 id="templates">Write templates people do not block</h2>
      <p>
        Template copy is the last mile. Two versions of the same campaign can
        differ by a lot in block rate.
      </p>
      <TemplateExample label="Likely to get blocked" category="Marketing">
        🔥🔥 BIGGEST SALE EVER!!! UPTO 80% OFF ON EVERYTHING!!! HURRY LIMITED
        STOCK!!! SHOP NOW 🔥🔥
      </TemplateExample>
      <p>
        No name, no context, no reason this arrived, and it reads like every
        scam message the recipient has ever received. Compare:
      </p>
      <TemplateExample label="Same offer, far safer" category="Marketing">
        Hi {'{{1}}'}, the {'{{2}}'} you were looking at is part of our sale this
        week — {'{{3}}'} off until Sunday. Reply here if you want help with the
        size.
      </TemplateExample>
      <p>
        The second one says who they are, what it is about, why it is relevant
        to them, and invites a reply. The rules of thumb:
      </p>
      <ul>
        <li>Use their name, and name the thing. Not &ldquo;your items&rdquo;.</li>
        <li>Say who you are if the number is not obviously you.</li>
        <li>One clear action. Not three buttons and a link.</li>
        <li>No shouting, minimal emoji. It reads as spam because spam does it.</li>
        <li>Invite a reply. A reply is the opposite signal to a block.</li>
      </ul>

      <h2 id="recover">If your rating has already dropped</h2>
      <p>
        A number sitting at Low is recoverable, but not by doing anything
        clever. The rating looks at a recent rolling window, so the only lever
        is to change what is in that window.
      </p>
      <ol>
        <li>
          <strong>Stop all marketing on that number today.</strong> Keep
          transactional messages running — those are wanted and they help.
        </li>
        <li>
          <strong>Find out which campaign did it.</strong> Look at which send
          preceded the drop and which audience it used. It is almost always one
          list.
        </li>
        <li>
          <strong>Delete that list.</strong> Not &ldquo;send to it less
          often&rdquo;.
        </li>
        <li>
          <strong>Resume small.</strong> Your most engaged customers, a message
          they would miss if it stopped, and watch the rating for a week before
          widening.
        </li>
        <li>
          <strong>Do not switch to a fresh number to escape it.</strong> You
          take the list and the habits with you, and a new number has less
          tolerance, not more.
        </li>
      </ol>

      <h2 id="checklist">The checklist</h2>
      <ul>
        <li>On the official WhatsApp Business API, not an unofficial sender.</li>
        <li>Every marketing recipient has a recorded opt-in.</li>
        <li>STOP removes them everywhere, automatically, including queued sends.</li>
        <li>Marketing and Utility templates kept strictly separate.</li>
        <li>No sends during local night hours.</li>
        <li>Templates use the recipient&apos;s name and name the product.</li>
        <li>Replies go to an inbox a human reads.</li>
        <li>Quality rating and messaging tier checked before each big send.</li>
        <li>Bought or scraped lists: never.</li>
      </ul>

      <p>
        If you are moving off an unofficial tool,{' '}
        <Link href="/official-vs-unofficial-whatsapp-api">
          this comparison
        </Link>{' '}
        covers what changes. For the mechanics of sending at scale properly —
        audiences, approved templates, per-recipient delivery status — see{' '}
        <Link href="/bulk-whatsapp-sender">bulk WhatsApp sending on the official API</Link>.
      </p>
    </BlogPostLayout>
  );
}
