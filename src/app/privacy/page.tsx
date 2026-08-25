import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  robots: {
    index: true,
    follow: true,
  },
};

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
        &larr; Back to Repeat Grow
      </Link>

      <h1 className="mt-6 text-3xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: August 25, 2026</p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-foreground/90">
        <section>
          <p>
            Repeat Grow (&quot;Repeat Grow&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) provides a WhatsApp
            CRM platform built on the official WhatsApp Business API. This
            Privacy Policy explains what information we collect, how we use
            it, and the choices you have, both as a business that uses Repeat
            Grow (a &quot;Customer&quot;) and as an end user whose messages a
            Customer manages through the platform.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">1. Information We Collect</h2>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>
              <span className="font-medium text-foreground">Account information:</span> name, email
              address, phone number, and business details you provide when
              you sign up or are invited to a Repeat Grow account.
            </li>
            <li>
              <span className="font-medium text-foreground">WhatsApp Business data:</span> contacts,
              messages, message templates, and media that flow through a
              Customer&apos;s connected WhatsApp Business number. This data is
              processed on behalf of the Customer, who controls it.
            </li>
            <li>
              <span className="font-medium text-foreground">Usage data:</span> log data, device and
              browser information, and general usage patterns that help us
              operate and improve the platform.
            </li>
            <li>
              <span className="font-medium text-foreground">Cookies:</span> used to keep you signed in
              and remember basic preferences (such as theme). We do not use
              cookies for third-party advertising.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">2. How We Use Information</h2>
          <p className="mt-3">We use the information above to:</p>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>Provide, operate, and maintain the Repeat Grow platform.</li>
            <li>
              Send and receive WhatsApp messages on behalf of a Customer,
              through the official WhatsApp Business API.
            </li>
            <li>Provide customer support and respond to inquiries.</li>
            <li>Monitor for security issues, fraud, and abuse.</li>
            <li>Improve and develop new features.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">3. How We Share Information</h2>
          <p className="mt-3">We do not sell personal data. We share information only:</p>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>
              With <span className="font-medium text-foreground">Meta / WhatsApp</span>, as required
              to send and receive messages through the WhatsApp Business
              API.
            </li>
            <li>
              With <span className="font-medium text-foreground">Supabase</span>, our database and
              infrastructure provider, which stores account and message data
              on our behalf under its own security and confidentiality
              commitments.
            </li>
            <li>When required by law, regulation, or a valid legal process.</li>
            <li>With a Customer&apos;s own team members, as configured by that Customer within their account.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">4. Data Storage &amp; Security</h2>
          <p className="mt-3">
            Data is encrypted in transit (HTTPS/TLS) and access to sensitive
            fields, such as WhatsApp API tokens, is encrypted at rest.
            Database access is restricted through row-level security
            policies, and inbound webhooks are verified using signed
            requests. See our{" "}
            <Link href="/security" className="underline">
              Security page
            </Link>{" "}
            for more detail.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">5. Data Retention</h2>
          <p className="mt-3">
            We retain account and message data for as long as a Customer&apos;s
            account is active, or as needed to provide the service. Data is
            deleted or anonymized within a reasonable period after an
            account is closed, except where retention is required by law.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">6. Your Rights</h2>
          <p className="mt-3">
            Depending on your location, you may have the right to access,
            correct, or request deletion of your personal data. If you are
            an end user messaging a business that uses Repeat Grow, please
            contact that business directly, as they control the data. If
            you are a Repeat Grow Customer, contact us using the details
            below.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">7. Children&apos;s Privacy</h2>
          <p className="mt-3">
            Repeat Grow is intended for business use and is not directed at
            individuals under the age of 18. We do not knowingly collect
            personal data from children.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">8. Changes to This Policy</h2>
          <p className="mt-3">
            We may update this Privacy Policy from time to time. Material
            changes will be reflected by updating the &quot;Last updated&quot; date
            above.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">9. Grievance Officer &amp; Contact</h2>
          <p className="mt-3">
            In accordance with the Information Technology Act, 2000 and the
            rules made thereunder, for any privacy concerns, questions, or
            grievances regarding this policy, please contact:
          </p>
          <p className="mt-3">
            Repeat Grow
            <br />
            Email:{" "}
            <a href="mailto:restrogrow@gmail.com" className="underline">
              restrogrow@gmail.com
            </a>
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">10. Governing Law</h2>
          <p className="mt-3">
            This Privacy Policy is governed by the laws of India, without
            regard to its conflict of law provisions.
          </p>
        </section>
      </div>
    </div>
  );
}
