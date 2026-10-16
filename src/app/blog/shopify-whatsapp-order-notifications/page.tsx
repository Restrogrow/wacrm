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

const POST = getPost('shopify-whatsapp-order-notifications');

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
  { id: 'why-whatsapp', label: 'Why order updates belong on WhatsApp' },
  { id: 'six-messages', label: 'The 6 messages every store should send' },
  { id: 'templates', label: 'Template examples you can copy' },
  { id: 'cod', label: 'COD confirmation: fewer refused deliveries' },
  { id: 'rules', label: 'Rules to follow (so your number stays healthy)' },
  { id: 'setup', label: 'How to set it up with Repeat Grow' },
  { id: 'checklist', label: 'Launch checklist' },
];

const FAQ: FaqItem[] = [
  {
    question: 'Can I send Shopify order updates on WhatsApp without an app on my store?',
    answer:
      'Yes. Shopify can send webhooks (Settings → Notifications → Webhooks) to a WhatsApp CRM like Repeat Grow, which turns each event into an approved WhatsApp template. A one-click app connection does the same without creating webhooks by hand.',
  },
  {
    question: 'Do I need the official WhatsApp Business API?',
    answer:
      'For automated, business-initiated messages at scale, yes. The official API (Meta Cloud API) lets you send approved templates to customers, track delivery and read status, and avoid the ban risk of unofficial automation tools.',
  },
  {
    question: 'Which template category should order updates use?',
    answer:
      'Order confirmations, shipping, delivery and cancellation messages are Utility templates: they update the customer about something they already did. Abandoned-cart reminders and offers are Marketing templates and need the customer’s opt-in.',
  },
  {
    question: 'What if the customer typed their number without +91?',
    answer:
      'Indian checkouts often store numbers like "98765 43210". A good integration adds the country code from the shipping address (or your store’s default) before sending, so the message still reaches the customer.',
  },
  {
    question: 'Will customers get the same message twice?',
    answer:
      'They shouldn’t. Shopify retries webhooks if it doesn’t get a quick response, so the integration must de-duplicate each event. Repeat Grow records every delivery and every send, so retries never produce duplicates.',
  },
];

export default function ShopifyWhatsAppPost() {
  return (
    <BlogPostLayout post={POST} toc={TOC} faq={FAQ}>
      <p>
        Your customer just paid. Now they wait and wonder. Is the order confirmed? When will it
        ship? Where is it now? Most stores answer those questions by email, but for a lot of
        Indian shoppers the inbox they actually check is <strong>WhatsApp</strong>. This guide
        covers exactly which WhatsApp messages a Shopify store should send, what each template
        should say, the rules that keep your number in good standing, and how to automate the
        whole thing in about fifteen minutes.
      </p>

      <h2 id="why-whatsapp">Why order updates belong on WhatsApp</h2>
      <p>
        Order updates are the messages customers <em>want</em>. They reduce &ldquo;where is my
        order?&rdquo; calls and chats, they make cash-on-delivery customers more likely to accept the
        parcel, and every message is a chance to bring the customer back. Sending them on WhatsApp
        has three practical advantages:
      </p>
      <ul>
        <li>
          <strong>It&apos;s where customers already are.</strong> A WhatsApp message sits next to
          chats with family and friends, not in a promotions tab.
        </li>
        <li>
          <strong>Customers can reply.</strong> &ldquo;Can you deliver after 6?&rdquo; lands in your team
          inbox instead of a no-reply address.
        </li>
        <li>
          <strong>You can see what happened.</strong> The official API reports delivered and read
          status for every message.
        </li>
      </ul>

      <h2 id="six-messages">The 6 messages every store should send</h2>
      <p>
        Map your WhatsApp messages to the moments Shopify already tracks. Each one is triggered by a
        Shopify event, so once it&apos;s set up nobody on your team has to press send.
      </p>
      <BlogFigure
        src="/blog/shopify-whatsapp-order-notifications/order-journey.svg"
        alt="Timeline of six WhatsApp messages: abandoned cart, order placed, COD confirmation, shipped, out for delivery, delivered"
        caption="The six WhatsApp moments in a Shopify order, and which template category each uses."
      />
      <table>
        <thead>
          <tr>
            <th>Message</th>
            <th>Shopify event</th>
            <th>Category</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Order confirmation</td>
            <td>Order creation</td>
            <td>Utility</td>
          </tr>
          <tr>
            <td>COD confirmation (Confirm / Cancel buttons)</td>
            <td>Order creation, cash on delivery</td>
            <td>Utility</td>
          </tr>
          <tr>
            <td>Shipped, with courier and tracking link</td>
            <td>Fulfillment creation</td>
            <td>Utility</td>
          </tr>
          <tr>
            <td>Out for delivery</td>
            <td>Fulfillment update (carrier status)</td>
            <td>Utility</td>
          </tr>
          <tr>
            <td>Delivered, with a review request</td>
            <td>Fulfillment update (carrier status)</td>
            <td>Utility</td>
          </tr>
          <tr>
            <td>Abandoned cart reminder</td>
            <td>Checkout creation / update, then idle</td>
            <td>Marketing</td>
          </tr>
        </tbody>
      </table>
      <p>
        You don&apos;t need all six on day one. Start with the order confirmation and the shipped
        message. They answer the two questions customers ask most, then add the rest.
      </p>

      <h2 id="templates">Template examples you can copy</h2>
      <p>
        Business-initiated WhatsApp messages must use a template that Meta has approved. Variables
        like <code>{'{{1}}'}</code> are filled from the order each time. Keep templates short,
        specific and clearly about the order; that&apos;s what gets them approved as Utility. (More on
        approvals in{' '}
        <Link href="/blog/whatsapp-broadcast-template-rules">WhatsApp template rules explained</Link>
        .)
      </p>
      <TemplateExample label="order_confirmation" category="Utility">
        {`Hi {{1}}, thanks for your order {{2}}! 🎉
Total: {{3}}
We'll message you here when it ships. View your order: {{4}}`}
      </TemplateExample>
      <TemplateExample label="order_shipped" category="Utility">
        {`Good news, {{1}}, order {{2}} is on its way with {{3}}.
Track it here: {{4}}`}
      </TemplateExample>
      <TemplateExample label="order_delivered" category="Utility">
        {`Your order {{1}} has been delivered. We hope you love it, {{2}}!
Reply here if anything isn't right.`}
      </TemplateExample>
      <TemplateExample label="cart_reminder" category="Marketing">
        {`Hi {{1}}, you left something in your cart 🛒
{{2}}
Complete your order here: {{3}}`}
      </TemplateExample>
      <p>
        In Repeat Grow you map each <code>{'{{n}}'}</code> to a store value (customer first name,
        order number, total, items, tracking link, courier, order status link or checkout link)
        and see a live preview before switching the message on.
      </p>

      <h2 id="cod">COD confirmation: fewer refused deliveries</h2>
      <p>
        Cash on delivery is popular in India, and every COD parcel that comes back unaccepted costs
        you shipping both ways. A COD confirmation message asks the customer to confirm the order
        before you ship it:
      </p>
      <TemplateExample label="cod_confirmation" category="Utility">
        {`Hi {{1}}, please confirm your cash-on-delivery order {{2}} for {{3}}.
[ Confirm order ]  [ Cancel ]`}
      </TemplateExample>
      <p>
        Add two <strong>quick-reply buttons</strong> to the template. When the customer taps one, the
        reply lands in your inbox and can trigger an automation, for example, tag the contact
        &ldquo;COD confirmed&rdquo; or alert your team to call the ones who cancelled. Ship the confirmed
        orders first; follow up on the silent ones before dispatch.
      </p>

      <h2 id="rules">Rules to follow (so your number stays healthy)</h2>
      <ul>
        <li>
          <strong>Use the right category.</strong> Don&apos;t dress a promotion up as a Utility
          template; Meta rejects it, and it&apos;s the fastest way to lose trust.
        </li>
        <li>
          <strong>Get opt-in for marketing.</strong> Abandoned-cart reminders and offers need the
          customer&apos;s permission: a WhatsApp opt-in checkbox at checkout works well.
        </li>
        <li>
          <strong>Honour opt-outs.</strong> When a customer replies STOP or taps &ldquo;Stop
          promotions&rdquo;, stop marketing messages to them. Repeat Grow does this automatically.
        </li>
        <li>
          <strong>Send one message per event.</strong> Duplicates annoy customers and hurt your
          number&apos;s quality rating: make sure retries from Shopify are de-duplicated.
        </li>
        <li>
          <strong>Fix phone numbers.</strong> Add +91 to numbers saved without a country code, or
          the message never arrives.
        </li>
      </ul>

      <h2 id="setup">How to set it up with Repeat Grow</h2>
      <ol>
        <li>
          <strong>Connect WhatsApp.</strong> Sign up and connect your number on the official
          WhatsApp Business API in Settings → WhatsApp.
        </li>
        <li>
          <strong>Create your templates.</strong> In Settings → Templates, create the templates
          above (Utility for order updates, Marketing for cart reminders) and submit them to Meta.
        </li>
        <li>
          <strong>Connect your store.</strong> In Settings → Shopify, click{' '}
          <strong>Connect Shopify</strong>, or choose <strong>Connect with webhooks</strong> and paste
          your store&apos;s webhook signing key. Repeat Grow lists exactly which webhooks to add.
        </li>
        <li>
          <strong>Map each event.</strong> Switch on the events you want, pick the approved template,
          choose what fills each variable, and use <strong>Send test</strong> to see the real message on
          your phone.
        </li>
        <li>
          <strong>Watch it work.</strong> Every message appears in your shared inbox and in the
          &ldquo;Recent messages&rdquo; log, with a reason if anything was skipped.
        </li>
      </ol>
      <p>
        Selling to other industries too? See how teams use{' '}
        <Link href="/whatsapp-crm-for-ecommerce">WhatsApp CRM for e-commerce</Link>, and the{' '}
        <Link href="/docs#shopify">Shopify section of the Help Center</Link>.
      </p>

      <h2 id="checklist">Launch checklist</h2>
      <ul>
        <li>WhatsApp number connected on the official API</li>
        <li>Order confirmation and shipped templates approved (Utility)</li>
        <li>COD confirmation template with Confirm / Cancel buttons</li>
        <li>WhatsApp opt-in at checkout before turning on cart reminders</li>
        <li>Default country code set to 91</li>
        <li>A test order placed and the messages checked on a real phone</li>
      </ul>
    </BlogPostLayout>
  );
}
