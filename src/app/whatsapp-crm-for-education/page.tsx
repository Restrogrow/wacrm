import type { Metadata } from "next";
import Link from "next/link";
import { buildBreadcrumbSchema } from "@/lib/seo";

const BREADCRUMB_SCHEMA = buildBreadcrumbSchema([
  { name: "WhatsApp CRM for Education", path: "/whatsapp-crm-for-education" },
]);

const PAGE_TITLE = "WhatsApp CRM for Coaching Institutes & Education Businesses";
const PAGE_DESCRIPTION =
  "Turn enquiries into enrollments with a WhatsApp pipeline, automate demo-class and fee-due follow-ups, and broadcast timetables and batch updates on the official WhatsApp Business API.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: {
    canonical: "/whatsapp-crm-for-education",
  },
  openGraph: {
    type: "website",
    url: "/whatsapp-crm-for-education",
    title: `${PAGE_TITLE} — Repeat Grow`,
    description: PAGE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function EducationUseCasePage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_SCHEMA) }}
      />
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
        &larr; Back to Repeat Grow
      </Link>

      <h1 className="mt-6 text-3xl font-bold tracking-tight">{PAGE_TITLE}</h1>
      <p className="mt-4 text-sm leading-relaxed text-foreground/80">
        Coaching institutes and education businesses live on WhatsApp for
        enquiries, demo bookings, and parent communication. Repeat Grow
        turns that into a counselor pipeline instead of a flood of
        unassigned chats.
      </p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-foreground/90">
        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            From enquiry to enrollment, tracked in one pipeline
          </h2>
          <p className="mt-2">
            Every enquiry — from ads, your website, or a walk-in referral —
            lands in the shared inbox and moves through stages like
            enquiry, demo scheduled, trial attended, and enrolled, with the
            full conversation attached.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            Automated demo and fee-due follow-ups
          </h2>
          <p className="mt-2">
            No-code automations can confirm a demo-class booking, remind a
            student the day before, and follow up afterward — or send a
            fee-due reminder on a schedule — without a counselor having to
            remember each one manually.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            Broadcast timetables and batch updates
          </h2>
          <p className="mt-2">
            Send timetable changes, exam reminders, and batch announcements
            as Meta-approved template broadcasts, with delivery and read
            tracking, to your whole student list at once.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            A shared inbox for your counseling team
          </h2>
          <p className="mt-2">
            Multiple counselors can work the same WhatsApp Business number,
            with conversations assigned by batch, course, or counselor, so
            no enquiry sits unanswered because it landed with the wrong
            person.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">FAQ</h2>
          <div className="mt-3 space-y-5">
            <div>
              <p className="font-medium text-foreground">
                Can we separate enquiries by course or batch?
              </p>
              <p className="mt-1 text-foreground/80">
                Yes — use tags and custom fields to segment contacts by
                course, batch, or counselor, and build pipelines and
                broadcasts around those segments.
              </p>
            </div>
            <div>
              <p className="font-medium text-foreground">
                Is this compliant for sending reminders to parents and
                students?
              </p>
              <p className="mt-1 text-foreground/80">
                Broadcasts use Meta-approved message templates on the
                official WhatsApp Business API, which requires recipient
                opt-in and template approval — the same compliance model
                any official WhatsApp broadcast follows.
              </p>
            </div>
          </div>
        </section>
      </div>

      <div className="mt-12 flex flex-wrap gap-3">
        <Link
          href="/signup"
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Start Free Trial
        </Link>
        <Link
          href="/pricing"
          className="rounded-md border px-5 py-2.5 text-sm font-semibold text-foreground"
        >
          See plans &amp; pricing
        </Link>
      </div>
    </div>
  );
}
