import type { Metadata } from 'next';
import Link from 'next/link';

import { getPost } from '@/lib/blog';
import { BlogPostLayout, type FaqItem, type TocItem } from '@/components/blog/post-layout';

const POST = getPost('whatsapp-pay-upi-payments-india');

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
  { id: 'why', label: 'Why take payments inside the chat' },
  { id: 'two-ways', label: 'Two ways to get paid: WhatsApp Pay or UPI ID' },
  { id: 'whatsapp-pay-setup', label: 'Setting up WhatsApp Pay' },
  { id: 'upi-setup', label: 'Setting up the UPI ID option' },
  { id: 'send-order', label: 'Sending an order from a chat' },
  { id: 'catalog', label: 'Catalog sharing and catalog orders' },
  { id: 'fulfilment', label: 'Keep customers updated after payment' },
  { id: 'tips', label: 'Tips for more paid orders' },
];

const FAQ: FaqItem[] = [
  {
    question: 'Do I need a payment gateway to take payments on WhatsApp?',
    answer:
      'For WhatsApp Pay, yes: you link a Razorpay, PayU, BillDesk or Zaakpay account to a payment configuration in WhatsApp Manager. No gateway keys are stored in Repeat Grow. If you don’t have one, use the UPI ID option, where the customer pays your UPI ID and an agent marks the order paid.',
  },
  {
    question: 'How does Repeat Grow know an order was paid?',
    answer:
      'With WhatsApp Pay, payment updates arrive on the same WhatsApp webhook and mark the order paid, failed or refunded automatically using the order’s reference ID. With a UPI ID, an agent marks the order paid after seeing the payment.',
  },
  {
    question: 'Can customers order from my catalog?',
    answer:
      'Yes. Create a catalog in Commerce Manager, connect it to your number, and paste the catalog ID in Settings → Orders & payments. You can share the whole catalog or one product in a chat, and carts customers send become pending orders automatically.',
  },
  {
    question: 'Which currency and amounts are used?',
    answer:
      'Orders are in Indian rupees by default. Amounts are stored in paise internally so totals never suffer rounding errors.',
  },
  {
    question: 'Are WhatsApp Pay and the catalog available outside India?',
    answer:
      'WhatsApp Pay through these gateways is India-specific, and Meta’s Payments API for India must be enabled for your business. The UPI ID option works for any Indian business that takes UPI payments.',
  },
];

export default function WhatsAppPayPost() {
  return (
    <BlogPostLayout post={POST} toc={TOC} faq={FAQ}>
      <p>
        Most Indian customers already ask for prices, sizes and availability on WhatsApp. The
        awkward part used to be the last step: sending a UPI QR code, waiting for a screenshot, and
        checking it against your bank app. You can now do the whole thing inside the chat, an order
        summary, a payment request and automatic status updates. Here&apos;s how it works and how to
        set it up in Repeat Grow.
      </p>

      <h2 id="why">Why take payments inside the chat</h2>
      <ul>
        <li>
          <strong>Fewer drop-offs.</strong> The customer decides and pays in the same conversation,
          not after switching apps.
        </li>
        <li>
          <strong>No screenshot matching.</strong> Each order has its own reference, so payments map
          to the right order.
        </li>
        <li>
          <strong>One record.</strong> The chat, the order and the payment status live on the same
          contact, visible to the whole team.
        </li>
      </ul>

      <h2 id="two-ways">Two ways to get paid: WhatsApp Pay or UPI ID</h2>
      <p>In <strong>Settings → Orders &amp; payments</strong> you choose how customers pay:</p>
      <ul>
        <li>
          <strong>WhatsApp Pay.</strong> The customer taps <em>Review and pay</em> and pays with UPI,
          card or netbanking without leaving WhatsApp. It uses a payment configuration you create in
          WhatsApp Manager with Razorpay, PayU, BillDesk or Zaakpay. Payment status is confirmed
          automatically.
        </li>
        <li>
          <strong>UPI ID.</strong> The customer gets an order summary with your UPI ID and pays from
          any UPI app. An agent marks the order as paid. It needs no gateway and is the quickest way
          to start.
        </li>
      </ul>

      <h2 id="whatsapp-pay-setup">Setting up WhatsApp Pay</h2>
      <ol>
        <li>
          <strong>Make sure Meta&apos;s Payments API for India is enabled</strong> for your business.
        </li>
        <li>
          In <strong>WhatsApp Manager → Account tools → Payment configurations</strong>, link your
          Razorpay, PayU, BillDesk or Zaakpay account and name the configuration.
        </li>
        <li>
          In Repeat Grow, open <strong>Settings → Orders &amp; payments</strong>, choose{' '}
          <strong>WhatsApp Pay</strong>, pick the gateway and enter the configuration name.
        </li>
        <li>
          Nothing extra to subscribe: payment updates arrive on the webhook you already use for
          messages.
        </li>
      </ol>

      <h2 id="upi-setup">Setting up the UPI ID option</h2>
      <p>
        Choose <strong>UPI ID</strong> in the same settings page and enter your UPI ID. That&apos;s
        it. Orders you send will include the summary and the ID, and your team marks them paid from
        the order controls once the money arrives.
      </p>

      <h2 id="send-order">Sending an order from a chat</h2>
      <ol>
        <li>Open the conversation and click the <strong>₹ icon</strong> in the chat.</li>
        <li>
          Add the items with quantity and price, plus tax, shipping and any discount.
        </li>
        <li>Send the payment request. The customer sees the total and a way to pay.</li>
        <li>
          Follow the status in the chat and in the list of recent orders in Settings → Orders &amp;
          payments.
        </li>
      </ol>
      <p>
        A short message to go with it keeps the chat friendly, for example: &ldquo;Thanks, Priya!
        I&apos;ve sent your order for 2 cotton kurtas. Tap Review and pay to complete it, and I&apos;ll
        confirm dispatch as soon as it&apos;s done.&rdquo;
      </p>

      <h2 id="catalog">Catalog sharing and catalog orders</h2>
      <p>
        If you sell products, create a catalog in <strong>Commerce Manager</strong>, connect it to
        your number in <strong>WhatsApp Manager → Catalog</strong>, and paste the catalog ID in
        Repeat Grow. From any chat you can share the whole catalog or a single product. When a
        customer sends a cart, it becomes a pending order automatically, ready for your payment
        request.
      </p>

      <h2 id="fulfilment">Keep customers updated after payment</h2>
      <p>
        An order moves through <strong>processing → shipped → delivered</strong> (or cancelled).
        Each time you change the status, the customer is told: WhatsApp Pay orders get an order
        status card, and other orders get a short text message. That removes most &ldquo;where is my
        order?&rdquo; messages before they start. For Shopify stores, the{' '}
        <Link href="/blog/shopify-whatsapp-order-notifications">
          Shopify order notification guide
        </Link>{' '}
        covers automatic shipping and delivery messages.
      </p>

      <h2 id="tips">Tips for more paid orders</h2>
      <ul>
        <li>
          <strong>Reply fast and send the payment request in the same chat.</strong> Interest fades
          quickly.
        </li>
        <li>
          <strong>Double-check the total</strong> before sending: items, shipping and tax.
        </li>
        <li>
          <strong>Use saved replies</strong> for the usual questions, so agents can send the order
          and the explanation in seconds.
        </li>
        <li>
          <strong>Never ask customers for card details or OTPs in the chat.</strong> Payments happen
          only through Review and pay or their own UPI app.
        </li>
      </ul>
      <p>
        Step-by-step screens are in the{' '}
        <Link href="/docs#orders">Orders &amp; payments section of the Help Center</Link>.
      </p>
    </BlogPostLayout>
  );
}
