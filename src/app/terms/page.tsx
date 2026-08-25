import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  robots: {
    index: true,
    follow: true,
  },
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
        &larr; Back to Repeat Grow
      </Link>

      <h1 className="mt-6 text-3xl font-bold tracking-tight">Terms &amp; Conditions</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: August 25, 2026</p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-foreground/90">
        <section>
          <p>
            These Terms &amp; Conditions (&quot;Terms&quot;) govern your access to and
            use of Repeat Grow, a WhatsApp CRM platform built on the official
            WhatsApp Business API and operated by Repeat Grow (&quot;we&quot;,
            &quot;us&quot;, or &quot;our&quot;). By using Repeat Grow, you agree to these
            Terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">1. The Service</h2>
          <p className="mt-3">
            Repeat Grow provides a shared inbox, contacts, sales pipelines,
            broadcasts, and no-code automations for teams communicating with
            customers over WhatsApp. We set up and support the platform for
            each customer (&quot;you&quot; or &quot;Customer&quot;) as agreed at the time of
            onboarding.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">2. Account Responsibilities</h2>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>You are responsible for the accuracy of information you provide when setting up your account.</li>
            <li>You are responsible for maintaining the confidentiality of your login credentials and API keys.</li>
            <li>You are responsible for the actions of any team member you invite to your account.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">3. Acceptable Use</h2>
          <p className="mt-3">You agree not to use Repeat Grow to:</p>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>Send unsolicited bulk messages (spam) or violate WhatsApp&apos;s Business Messaging Policy.</li>
            <li>Transmit unlawful, harmful, or fraudulent content.</li>
            <li>Attempt to gain unauthorized access to the platform or another Customer&apos;s data.</li>
            <li>Reverse engineer, resell, or white-label the platform without a separate written agreement.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">4. Third-Party Services</h2>
          <p className="mt-3">
            Repeat Grow relies on the official WhatsApp Business API, provided
            by Meta, and on Supabase for hosting and data storage. Your use of
            WhatsApp messaging through Repeat Grow is also subject to Meta&apos;s
            own WhatsApp Business Messaging Policy and Terms of Service. We
            are not responsible for outages, policy changes, or account
            actions taken by Meta or Supabase.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">5. Fees &amp; Payment</h2>
          <p className="mt-3">
            Repeat Grow is offered on a custom-plan basis, scoped to your
            team size and WhatsApp volume. Fees, billing frequency, and
            payment terms are as agreed in writing (including by email) at
            the time your plan is set up. We do not publish a fixed public
            price list.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">6. Data &amp; Privacy</h2>
          <p className="mt-3">
            Our collection and use of personal data is described in our{" "}
            <Link href="/privacy" className="underline">
              Privacy Policy
            </Link>
            . You remain responsible for the WhatsApp contacts and messages
            you manage through Repeat Grow and for complying with applicable
            data protection law with respect to your own customers.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">7. Intellectual Property</h2>
          <p className="mt-3">
            Repeat Grow, its branding, and its underlying software remain our
            property. Nothing in these Terms transfers ownership of the
            platform to you. You retain ownership of your own business data.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">8. Termination</h2>
          <p className="mt-3">
            Either party may end the service arrangement as agreed at
            onboarding, or with reasonable written notice where no separate
            agreement specifies a term. We may suspend or terminate access
            immediately for a material violation of these Terms, including
            violations of WhatsApp&apos;s messaging policies.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">9. Disclaimer of Warranties</h2>
          <p className="mt-3">
            The platform is provided &quot;as is&quot; and &quot;as available.&quot; See our{" "}
            <Link href="/disclaimer" className="underline">
              Disclaimer
            </Link>{" "}
            page for further detail.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">10. Limitation of Liability</h2>
          <p className="mt-3">
            To the maximum extent permitted by law, Repeat Grow will not be
            liable for indirect, incidental, or consequential damages
            arising from your use of the platform, including message
            delivery failures caused by WhatsApp/Meta.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">11. Governing Law &amp; Disputes</h2>
          <p className="mt-3">
            These Terms are governed by the laws of India. Any disputes
            arising from these Terms will be subject to the exclusive
            jurisdiction of the courts of India.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">12. Changes to These Terms</h2>
          <p className="mt-3">
            We may update these Terms from time to time. Continued use of
            Repeat Grow after an update constitutes acceptance of the
            revised Terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">13. Contact</h2>
          <p className="mt-3">
            Questions about these Terms can be sent to{" "}
            <a href="mailto:restrogrow@gmail.com" className="underline">
              restrogrow@gmail.com
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
