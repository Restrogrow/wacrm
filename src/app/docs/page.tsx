import type { Metadata } from "next";
import Link from "next/link";
import {
  Bot,
  Code2,
  FileText,
  GitBranch,
  HelpCircle,
  MessageSquare,
  PlugZap,
  Radio,
  Rocket,
  Users,
  UsersRound,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { buildBreadcrumbSchema, SITE_URL, SUPPORT_EMAIL, SUPPORT_PHONE } from "@/lib/seo";
import { Toc } from "./docs-ui";

const BREADCRUMB_SCHEMA = buildBreadcrumbSchema([{ name: "Docs", path: "/docs" }]);

export const metadata: Metadata = {
  title: "Help Center",
  description:
    "Learn how to use Repeat Grow: connect WhatsApp, work the shared inbox, manage contacts and pipelines, send broadcasts, and build automations.",
  alternates: { canonical: "/docs" },
  robots: { index: true, follow: true },
};

const TOPICS: { id: string; label: string; blurb: string; icon: LucideIcon }[] = [
  { id: "getting-started", label: "Getting started", blurb: "Set up your account in four steps.", icon: Rocket },
  { id: "connect-whatsapp", label: "Connect WhatsApp", blurb: "Link your WhatsApp Business number.", icon: PlugZap },
  { id: "inbox", label: "Shared inbox", blurb: "Assign, reply, and add notes as a team.", icon: MessageSquare },
  { id: "contacts", label: "Contacts", blurb: "Import, tag, and organise customers.", icon: Users },
  { id: "pipelines", label: "Pipelines", blurb: "Track deals on Kanban boards.", icon: GitBranch },
  { id: "templates", label: "Message templates", blurb: "Create and submit templates to Meta.", icon: FileText },
  { id: "broadcasts", label: "Broadcasts", blurb: "Message many customers at once.", icon: Radio },
  { id: "automations", label: "Automations & flows", blurb: "Reply and tag automatically.", icon: Zap },
  { id: "ai-chatbot", label: "AI chatbot", blurb: "Answer chats from your knowledge base.", icon: Bot },
  { id: "team", label: "Team members", blurb: "Invite teammates and set roles.", icon: UsersRound },
];

const TOC = [...TOPICS.map(({ id, label }) => ({ id, label })), { id: "faq", label: "FAQ" }];

const FAQ = [
  {
    q: "Is Repeat Grow the official WhatsApp Business API?",
    a: "Yes. Repeat Grow connects directly to Meta's WhatsApp Business Platform (Cloud API), so your number stays compliant and isn't at risk from unofficial clients.",
  },
  {
    q: "Can I keep using the WhatsApp app on my phone with the same number?",
    a: "A number registered on the WhatsApp Business API is used through Repeat Grow rather than the phone app. Contact us before moving a number you rely on today and we'll walk you through it.",
  },
  {
    q: "Why didn't my message deliver?",
    a: "WhatsApp only allows free-form text and media within 24 hours of the customer's last message. Outside that window, send an approved template instead.",
  },
  {
    q: "Who pays Meta's messaging fees?",
    a: "Meta bills its per-conversation fees directly to your WhatsApp Business Account. Your Repeat Grow plan covers the CRM.",
  },
  {
    q: "Can I connect Repeat Grow to my own software?",
    a: "Yes. Use the REST API and webhooks to send messages, sync contacts, and receive events. See the API reference.",
  },
];

function Section({
  id,
  n,
  title,
  intro,
  children,
}: {
  id: string;
  n: number;
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="docs-section">
      <h2>
        <span className="num">{String(n).padStart(2, "0")}</span>
        {title}
      </h2>
      {intro ? <p className="intro">{intro}</p> : null}
      <div className="prose">{children}</div>
    </section>
  );
}

function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li>
      <b className="step-title">{title}</b>
      <span className="step-body">{children}</span>
    </li>
  );
}

function Tip({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <div className={`callout${warn ? " warn" : ""}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8h.01M11 12h1v4h1" />
      </svg>
      <div>{children}</div>
    </div>
  );
}

const SITE_HOST = new URL(SITE_URL).host;

/** An app location like "Settings → Templates". With `to`, links to that page on repeatgrow.com. */
const Ui = ({ children, to }: { children: React.ReactNode; to?: string }) =>
  to ? (
    <a href={`${SITE_URL}${to}`} className="ui-path ui-link">
      {children}
    </a>
  ) : (
    <span className="ui-path">{children}</span>
  );

export default function DocsPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_SCHEMA) }}
      />

      <header className="docs-hero">
        <div className="container">
          <span className="eyebrow">Help Center</span>
          <h1>How can we help?</h1>
          <p className="lede">
            Guides for running sales and support on WhatsApp with Repeat Grow, from connecting
            your number to automating replies.
          </p>
          <p className="docs-site">
            Repeat Grow runs at <a href={SITE_URL}>{SITE_HOST}</a> · Log in at{" "}
            <a href={`${SITE_URL}/login`}>{SITE_HOST}/login</a>
          </p>
          <div className="hero-actions">
            <a href={`${SITE_URL}/signup`} className="btn btn-primary">Start free trial</a>
            <Link href="/docs/api" className="btn btn-ghost">
              <Code2 size={16} style={{ marginRight: 6 }} />
              API reference
            </Link>
          </div>
        </div>
      </header>

      <div className="container docs-body">
        <Toc
          items={TOC}
          switchTo={{ href: "/docs/api", title: "API reference", text: "Connect your own apps with the REST API." }}
        />

        <div className="docs-content">
          <div className="topic-grid">
            {TOPICS.map(({ id, label, blurb, icon: Icon }) => (
              <a key={id} href={`#${id}`} className="topic-card">
                <span className="ico"><Icon /></span>
                <b>{label}</b>
                <span>{blurb}</span>
              </a>
            ))}
            <a href="#faq" className="topic-card">
              <span className="ico"><HelpCircle /></span>
              <b>FAQ</b>
              <span>Quick answers to common questions.</span>
            </a>
            <Link href="/docs/api" className="topic-card">
              <span className="ico"><Code2 /></span>
              <b>API reference</b>
              <span>Connect your own apps and scripts.</span>
            </Link>
          </div>

          <Section id="getting-started" n={1} title="Getting started" intro="Go from sign-up to your first WhatsApp reply.">
            <ol className="steps">
              <Step title="Create your account">
                <a href={`${SITE_URL}/signup`}>Sign up at {SITE_HOST}</a> and confirm your email address. Log in any time at{" "}
                <a href={`${SITE_URL}/login`}>{SITE_HOST}/login</a>.
              </Step>
              <Step title="Connect your WhatsApp number">
                Link your WhatsApp Business number (see <a href="#connect-whatsapp">Connect WhatsApp</a>), or ask us to do it for you.
              </Step>
              <Step title="Bring in your contacts">
                Import a CSV of your customers from <Ui to="/contacts">Contacts</Ui>.
              </Step>
              <Step title="Invite your team">
                Add teammates from <Ui to="/settings?tab=members">Settings → Team members</Ui> and start replying from the shared inbox.
              </Step>
            </ol>
            <p>
              Everything in the app is in the left sidebar: Dashboard, Inbox, Notifications,
              Contacts, Pipelines, Broadcasts, Automations, Flows, and Settings.
            </p>
          </Section>

          <Section id="connect-whatsapp" n={2} title="Connect WhatsApp" intro="Link a WhatsApp Business number from Meta to Repeat Grow.">
            <p>
              You need a WhatsApp Business Account on Meta and a phone number that isn&apos;t active
              on the regular WhatsApp app. Then open <Ui to="/settings?tab=whatsapp">Settings → WhatsApp</Ui>.
            </p>
            <ol className="steps">
              <Step title="Enter your Meta details">
                Paste your Phone Number ID, WhatsApp Business Account ID, and access token from Meta Business Manager.
              </Step>
              <Step title="Save">
                Repeat Grow checks the details and stores the token encrypted.
              </Step>
              <Step title="Finish registration">
                If the number shows <em>Not registered</em>, enter its 6-digit two-step verification PIN.
              </Step>
            </ol>
            <Tip>
              Prefer not to do this yourself? We set it up for you, including Meta business
              verification. Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
            </Tip>
          </Section>

          <Section id="inbox" n={3} title="Shared inbox" intro="One WhatsApp number, your whole team.">
            <ul className="bullets">
              <li>Every WhatsApp chat for your number lands in <Ui to="/inbox">Inbox</Ui>, visible to your whole team.</li>
              <li>Assign a conversation to a teammate and set its status to open, pending, or closed.</li>
              <li>Add internal notes that customers never see.</li>
              <li>Send text, images, video, documents, voice notes, and approved templates.</li>
              <li>The contact panel shows the customer&apos;s details, tags, and deals beside the chat.</li>
            </ul>
          </Section>

          <Section id="contacts" n={4} title="Contacts" intro="Keep every customer and their history in one place.">
            <ul className="bullets">
              <li>Contacts are created automatically when someone messages you.</li>
              <li>Import a CSV from <Ui to="/contacts">Contacts</Ui>. Duplicate phone numbers are merged, not duplicated.</li>
              <li>Organise contacts with tags and custom fields in <Ui to="/settings?tab=fields">Settings → Fields &amp; tags</Ui>.</li>
              <li>Each contact keeps its full conversation and deal history.</li>
            </ul>
          </Section>

          <Section id="pipelines" n={5} title="Pipelines" intro="Track deals from first message to closed.">
            <p>
              Track deals on Kanban boards in <Ui to="/pipelines">Pipelines</Ui>. Create a pipeline with your own
              stages, add deals with a value, and drag them between stages. Each deal links to its
              contact and conversation, so the chat history is one click away.
            </p>
            <p>Set your currency in <Ui to="/settings?tab=deals">Settings → Deals &amp; currency</Ui>.</p>
          </Section>

          <Section id="templates" n={6} title="Message templates" intro="Create WhatsApp templates in Repeat Grow and submit them to Meta for approval, with no need to open Meta Business Manager.">
            <p>
              WhatsApp needs an approved template to message a customer who hasn&apos;t written to you
              in the last 24 hours, and for every broadcast. Manage all of yours in{" "}
              <Ui to="/settings?tab=templates">Settings → Templates</Ui>.
            </p>
            <ol className="steps">
              <Step title="Start a new template">
                Open <Ui to="/settings?tab=templates">Settings → Templates</Ui> and create a template. Give it
                a name in lowercase with underscores (for example <code className="ic">order_update</code>) and pick a language.
              </Step>
              <Step title="Choose a category">
                <b>Marketing</b> for offers and promotions, <b>Utility</b> for order and account updates,
                or <b>Authentication</b> for one-time codes. Meta checks that the content matches the category.
              </Step>
              <Step title="Write the message">
                Add an optional header (text, image, video, or document), the body, and an optional footer.
                Use <code className="ic">{"{{1}}"}</code>, <code className="ic">{"{{2}}"}</code> for variables like the customer&apos;s
                name, and fill in a sample value for each so Meta can review it.
              </Step>
              <Step title="Add buttons (optional)">
                Quick replies, a link to a website, a phone number to call, or a copy-code button for coupons and codes.
              </Step>
              <Step title="Submit to Meta">
                Submit the template. Its status shows as pending, then changes to approved or rejected
                automatically. Approval usually takes minutes and at most 24 hours.
              </Step>
            </ol>
            <ul className="bullets">
              <li>Already have templates in Meta? Click <b>Sync from Meta</b> to bring them into Repeat Grow.</li>
              <li>You can edit or delete a template from the same page. Deleting removes it from Meta too.</li>
              <li>Approved templates can be sent from the <Ui to="/inbox">Inbox</Ui>, in <Ui to="/broadcasts">Broadcasts</Ui>, in automations, and through the <Link href="/docs/api">API</Link>.</li>
            </ul>
            <Tip warn>
              Templates are often rejected for promotional wording in the Utility category or for
              unclear variables. Read our{" "}
              <a href={`${SITE_URL}/blog/whatsapp-broadcast-template-rules`}>template rules guide</a> before submitting.
            </Tip>
          </Section>

          <Section id="broadcasts" n={7} title="Broadcasts" intro="Send an approved template to many customers at once.">
            <ol className="steps">
              <Step title="Pick an approved template">
                Open <Ui to="/broadcasts">Broadcasts</Ui> and choose the template to send.
              </Step>
              <Step title="Choose recipients">
                Select who gets it, for example everyone with a certain tag, and fill in any variables.
              </Step>
              <Step title="Send and track">
                Sent, delivered, read, replied, and failed counts update live.
              </Step>
            </ol>
          </Section>

          <Section id="automations" n={8} title="Automations & flows" intro="Let Repeat Grow handle the repetitive work.">
            <p>
              <Ui to="/automations">Automations</Ui> run actions when something happens, such as a new inbound
              message, a customer&apos;s first message, a keyword match, or a tag being added.
              Actions include sending a message, tagging, waiting, branching on conditions, and
              calling a webhook.
            </p>
            <p>
              <Ui to="/flows">Flows</Ui> (beta) is the visual builder for multi-step conversations like menus
              and lead-qualification questions.
            </p>
          </Section>

          <Section id="ai-chatbot" n={9} title="AI chatbot" intro="Answer common questions instantly, day or night.">
            <p>
              In <Ui to="/settings?tab=ai-chatbot">Settings → AI chatbot</Ui>, add your business knowledge (FAQs, policies,
              product details) and switch the chatbot on. It answers WhatsApp chats naturally from
              that knowledge and hands the chat to a human when the customer asks for one. If no
              teammate replies within two hours, it picks the chat back up.
            </p>
          </Section>

          <Section id="team" n={10} title="Team members" intro="Invite teammates by link and control what they can do.">
            <p>Invite teammates from <Ui to="/settings?tab=members">Settings → Team members</Ui>. Each person gets one role:</p>
            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead>
                  <tr><th>Role</th><th>Can do</th></tr>
                </thead>
                <tbody>
                  <tr><td><b>Owner</b></td><td>Everything, including transferring ownership.</td></tr>
                  <tr><td><b>Admin</b></td><td>Manage settings, members, templates, and API keys.</td></tr>
                  <tr><td><b>Agent</b></td><td>Work conversations, contacts, and deals.</td></tr>
                  <tr><td><b>Viewer</b></td><td>Read-only access.</td></tr>
                </tbody>
              </table>
            </div>
          </Section>

          <section id="faq" className="docs-section faq">
            <h2>
              <span className="num">?</span>
              Frequently asked questions
            </h2>
            {FAQ.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </section>

          <div className="help-box">
            <div>
              <h3>Still need help?</h3>
              <p>Message us on WhatsApp or email our support team.</p>
            </div>
            <div className="actions">
              <a href={`https://wa.me/${SUPPORT_PHONE.replace("+", "")}`} target="_blank" rel="noopener" className="btn btn-primary">
                WhatsApp us
              </a>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="btn btn-ghost">Email support</a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
