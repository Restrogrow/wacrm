import type { Metadata } from 'next';
import Link from 'next/link';

import { getPost } from '@/lib/blog';
import {
  BlogPostLayout,
  TemplateExample,
  type FaqItem,
  type TocItem,
} from '@/components/blog/post-layout';

const POST = getPost('abandoned-cart-recovery-whatsapp-india');

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
  { id: 'why-carts-die', label: 'Why Indian carts get abandoned' },
  { id: 'why-whatsapp', label: 'Why WhatsApp beats cart-recovery email' },
  { id: 'timing', label: 'When to send (and when to stop)' },
  { id: 'marketing-template', label: 'It has to be a Marketing template' },
  { id: 'what-to-say', label: 'What the message should actually say' },
  { id: 'the-link', label: 'The checkout link is the whole message' },
  { id: 'rules', label: 'Rules that keep your number healthy' },
  { id: 'measuring', label: 'How to tell if it is working' },
  { id: 'setup', label: 'Setting it up with Repeat Grow' },
];

const FAQ: FaqItem[] = [
  {
    question: 'Can I send abandoned cart messages on WhatsApp in India?',
    answer:
      'Yes, with the official WhatsApp Business API and a Marketing-category template, sent to customers who have opted in to marketing messages. A cart reminder is promotional, not transactional — it is not covered by the Utility category you use for order confirmations.',
  },
  {
    question: 'How long should I wait before sending a cart reminder?',
    answer:
      'Between 30 minutes and a few hours after the cart goes quiet. Earlier than about 20 minutes and you are interrupting someone who is still shopping; after roughly 24 hours the intent is mostly gone and you are just spending money on a message.',
  },
  {
    question: 'Will a cart reminder get my WhatsApp number banned?',
    answer:
      'Not on its own. What damages a number is volume without consent: chasing people who never opted in, sending several reminders for one cart, or ignoring customers who replied STOP. Meta tracks blocks and reports as a quality rating, and a number that drops to Low gets its sending limit cut.',
  },
  {
    question: 'What should the discount be in a cart recovery message?',
    answer:
      'Usually nothing on the first message. A reminder with the cart link recovers a meaningful share of carts on its own, and leading with a discount teaches customers to abandon carts on purpose. Keep a coupon for a later nudge, or for high-value carts only.',
  },
  {
    question: 'Does this work without Shopify?',
    answer:
      'Yes, as long as something can tell your CRM that a checkout started and then went quiet — a WooCommerce plugin, a Shopify webhook, or a direct API call from a custom store. The messaging rules are the same whatever the platform.',
  },
  {
    question: 'What happens if the customer buys after the reminder is queued?',
    answer:
      'Nothing should reach them. A customer who has just paid must not get a "you left something behind" message, so the integration has to cancel anything pending for that checkout the moment the order arrives.',
  },
];

export default function AbandonedCartWhatsAppPost() {
  return (
    <BlogPostLayout post={POST} toc={TOC} faq={FAQ}>
      <p>
        Most Indian D2C stores lose somewhere between two-thirds and three-quarters of the
        carts that get started. The recovery email you set up once sits unread in a
        promotions tab. Meanwhile the inbox that customer actually checks every few minutes
        is <strong>WhatsApp</strong>.
      </p>
      <p>
        This is a practical playbook: when to send, what the message should say, which
        template category you are legally obliged to use, and how to know whether any of it
        made money. It applies whatever platform you run — Shopify, WooCommerce or
        something custom.
      </p>

      <h2 id="why-carts-die">Why Indian carts get abandoned</h2>
      <p>
        Cart recovery copy works much better when it answers the real reason someone
        stopped. In India the reasons cluster:
      </p>
      <ul>
        <li>
          <strong>Price shock at checkout.</strong> Shipping and taxes appear only at the
          last step, and the total no longer matches the number in their head.
        </li>
        <li>
          <strong>COD doubt.</strong> Plenty of shoppers will not prepay a store they have
          not bought from before. If you offer cash on delivery and the checkout did not
          make that obvious, you lost a buyer who was ready.
        </li>
        <li>
          <strong>Payment friction.</strong> A failed UPI collect request, an expired
          session, an OTP that never arrived. The customer did not change their mind — the
          payment simply did not complete.
        </li>
        <li>
          <strong>Genuine distraction.</strong> Someone adding to a cart on a phone at
          10pm is one notification away from forgetting entirely.
        </li>
      </ul>
      <p>
        Only the last one is really &ldquo;abandonment&rdquo;. The others are objections, and
        an objection is something a message can answer.
      </p>

      <h2 id="why-whatsapp">Why WhatsApp beats cart-recovery email</h2>
      <p>
        Three things make WhatsApp a better channel for this specific job:
      </p>
      <ul>
        <li>
          <strong>It gets opened.</strong> A WhatsApp message arrives next to chats with
          family, not in a tab the customer visits weekly.
        </li>
        <li>
          <strong>They can reply.</strong> &ldquo;Is COD available?&rdquo; is the most
          common reason a cart dies, and on WhatsApp that question lands in your team inbox
          where someone can answer it and close the sale. An email cannot do that.
        </li>
        <li>
          <strong>You can see what happened.</strong> The official API reports delivered and
          read status per message, so you are not guessing at open rates.
        </li>
      </ul>

      <h2 id="timing">When to send (and when to stop)</h2>
      <p>
        Timing matters more than copy. The window you are aiming for is after the customer
        has clearly stopped, but while they still remember what they were buying.
      </p>
      <table>
        <thead>
          <tr>
            <th>Delay after the cart goes quiet</th>
            <th>What it feels like to the customer</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Under ~20 minutes</td>
            <td>
              Intrusive. Many of these people are still shopping in another tab, and you
              have just told them you are watching.
            </td>
          </tr>
          <tr>
            <td>
              <strong>30 minutes to a few hours</strong>
            </td>
            <td>
              <strong>The sweet spot.</strong> The session is over, the intent is intact,
              the product is still in their head.
            </td>
          </tr>
          <tr>
            <td>Next morning</td>
            <td>
              Still works, especially for carts abandoned late at night — but expect a lower
              hit rate.
            </td>
          </tr>
          <tr>
            <td>After ~24 hours</td>
            <td>
              Mostly spend without return. By now it reads as marketing, because that is
              what it is.
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        Two stopping rules matter as much as the timing, and both are about not embarrassing
        yourself:
      </p>
      <ul>
        <li>
          <strong>Stop the moment they order.</strong> A customer who has just paid must
          never receive &ldquo;you left something behind&rdquo;. If you queue a reminder in
          advance, it has to be cancellable — and cancelled on the phone number, not just
          the cart ID, because people abandon on mobile and buy on a laptop.
        </li>
        <li>
          <strong>Stop if they said STOP.</strong> An opt-out has to apply to messages you
          queued <em>before</em> they opted out, not only to new ones.
        </li>
      </ul>

      <h2 id="marketing-template">It has to be a Marketing template</h2>
      <p>
        This is the part stores get wrong, and it is the part that costs them their number.
      </p>
      <p>
        Order confirmations, shipping updates and delivery notifications are{' '}
        <strong>Utility</strong> templates: they tell the customer about something they
        already did. A cart reminder is not that. Nobody asked to be reminded. It is{' '}
        <strong>Marketing</strong>, it needs the customer&apos;s opt-in, and Meta will
        reject a cart-recovery template submitted as Utility — or worse, approve it and then
        recategorise it later.
      </p>
      <p>Practically, that means:</p>
      <ul>
        <li>
          Collect marketing consent at checkout with a real checkbox and plain wording, not
          buried in terms.
        </li>
        <li>
          Keep the consent record. Under India&apos;s DPDP Act you need to be able to show
          when and how someone agreed.
        </li>
        <li>
          Honour opt-outs automatically. &ldquo;STOP&rdquo; should remove them from
          marketing without anyone on your team doing anything.
        </li>
      </ul>
      <p>
        A customer who never opted in is not a cart you can recover on WhatsApp. Recover
        that one with email, or with a human phone call if the cart is worth it.
      </p>

      <h2 id="what-to-say">What the message should actually say</h2>
      <p>
        Short, specific, one action. You are not writing an ad — you are handing someone
        back something they were already holding.
      </p>
      <TemplateExample label="Cart reminder — the baseline" category="Marketing">
        Hi {'{{1}}'}, you left {'{{2}}'} in your cart at {'{{3}}'}. Your cart is still
        saved — tap below to finish checking out.
      </TemplateExample>
      <p>
        That is it. Name, what it was, where from, and a button. The three things that make
        it work are the customer&apos;s name, the actual product (not &ldquo;your
        items&rdquo;), and a button that goes straight back to the filled cart.
      </p>
      <p>
        If you know <em>why</em> carts die on your store, answer that objection directly
        instead of repeating the generic version:
      </p>
      <TemplateExample label="When COD doubt is the real problem" category="Marketing">
        Hi {'{{1}}'}, your {'{{2}}'} is still saved. We do offer Cash on Delivery — you can
        pay when it reaches you. Tap below to place the order.
      </TemplateExample>
      <TemplateExample label="When the payment failed, not the intent" category="Marketing">
        Hi {'{{1}}'}, looks like your payment for {'{{2}}'} didn&apos;t go through. Nothing
        was charged and your cart is saved. Tap below to try again.
      </TemplateExample>
      <p>
        Note what is <em>not</em> in any of these: a discount. A plain reminder recovers a
        real share of carts on its own, and a store that always sends 10% off teaches its
        regulars to abandon the cart first. Hold the coupon back for a later nudge, or for
        carts above a value where the margin can take it.
      </p>

      <h2 id="the-link">The checkout link is the whole message</h2>
      <p>
        Everything above is wasted if the button does not drop the customer back into a
        filled cart. Two things to get right:
      </p>
      <ul>
        <li>
          <strong>Use the platform&apos;s own recovery URL.</strong> Shopify and WooCommerce
          both generate a link that restores the exact cart. A link to your homepage, or to
          the product page, is a different and much worse message.
        </li>
        <li>
          <strong>Mind how dynamic URL buttons work.</strong> A WhatsApp template button is
          registered with Meta as a fixed prefix plus one variable —{' '}
          <code>https://yourstore.in/{'{{1}}'}</code> — and the send fills in only the part
          after the prefix. So your integration has to strip the origin off the recovery
          URL and send just the path. If it sends the whole URL you get{' '}
          <code>yourstore.in/https://yourstore.in/checkouts/…</code> and a dead button.
        </li>
      </ul>
      <p>
        That also means the link has to be on <em>your</em> domain for the button to work.
        A courier or third-party link on a different host cannot fill a button registered to
        your store&apos;s prefix.
      </p>

      <h2 id="rules">Rules that keep your number healthy</h2>
      <p>
        Meta scores every WhatsApp business number on a quality rating driven by blocks and
        reports. Drop to Low and your daily sending limit is cut, which affects your order
        confirmations too — the transactional messages you actually cannot afford to lose.
        Cart recovery is the most common way stores damage that rating.
      </p>
      <ul>
        <li>
          <strong>One reminder per cart.</strong> Not one per visit, not one per device. If
          you add a second nudge, make it meaningfully later and meaningfully different.
        </li>
        <li>
          <strong>Never message a cart older than about a week.</strong> There is no intent
          left to recover, only annoyance to cause.
        </li>
        <li>
          <strong>Respect quiet hours.</strong> A marketing message at 1am earns a block.
          Hold it until morning rather than skipping it.
        </li>
        <li>
          <strong>De-duplicate properly.</strong> Platforms retry webhooks when they do not
          get a fast response, so the same abandoned cart can arrive several times. If your
          integration does not de-duplicate, the customer gets the same reminder twice and
          you have taught them to block you.
        </li>
      </ul>

      <h2 id="measuring">How to tell if it is working</h2>
      <p>
        &ldquo;Open rate&rdquo; is not the metric. The only number that matters is{' '}
        <strong>orders recovered</strong> — carts that were abandoned, got a message, and
        then converted. Track the funnel so you can see where it breaks:
      </p>
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th>What it tells you when it is low</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Sent</td>
            <td>
              Consent or phone-number quality. Most likely you are missing opt-ins, or
              checkout is storing numbers you cannot message.
            </td>
          </tr>
          <tr>
            <td>Delivered</td>
            <td>
              Bad numbers — usually missing country codes on numbers typed as
              &ldquo;98765 43210&rdquo;.
            </td>
          </tr>
          <tr>
            <td>Read</td>
            <td>Timing. You are sending when nobody is looking at their phone.</td>
          </tr>
          <tr>
            <td>Orders recovered</td>
            <td>
              The message or the link. Either the copy is not answering the real objection,
              or the button is not restoring the cart.
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        One honest caveat: WhatsApp does not report clicks on a template&apos;s URL button.
        Anyone showing you a &ldquo;click rate&rdquo; for one is inferring it. Judge the
        message on recovered orders instead, which is the number you were after anyway.
      </p>

      <h2 id="setup">Setting it up with Repeat Grow</h2>
      <p>
        If you are on Shopify, connecting the store takes a few minutes and the cart
        reminder is one of the automatic messages you can switch on:
      </p>
      <ol>
        <li>
          Connect your store under <strong>Integrations → Shopify</strong>. The checkout
          webhooks are created for you.
        </li>
        <li>
          Create a <strong>Marketing</strong> template for the reminder and get it approved
          by Meta. Give it a URL button with your store domain and a <code>{'{{1}}'}</code>{' '}
          suffix.
        </li>
        <li>
          Under <strong>Automatic messages → Abandoned cart</strong>, pick that template,
          map each <code>{'{{n}}'}</code> to a value (customer name, items, store name) and
          map the button to the checkout link.
        </li>
        <li>Set the idle delay. Start at 30 minutes and adjust once you have numbers.</li>
      </ol>
      <p>
        Orders cancel pending reminders automatically, opted-out customers are skipped, and
        repeated webhooks for one cart will not produce a second message. For WooCommerce
        there is a plugin that does the same thing, and a{' '}
        <Link href="/docs/api">REST API</Link> if you run a custom store.
      </p>
      <p>
        Related reading:{' '}
        <Link href="/blog/shopify-whatsapp-order-notifications">
          the six WhatsApp messages every Shopify store should send
        </Link>
        , and{' '}
        <Link href="/blog/whatsapp-broadcast-template-rules">
          how to get Marketing templates approved
        </Link>
        .
      </p>
    </BlogPostLayout>
  );
}
