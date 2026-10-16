import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, Clock, Mail } from 'lucide-react'

import { EmailsPreview, type PreviewEmail } from '@/components/admin/emails-preview'
import { AUTOMATED_JOBS, EMAIL_CATALOG, supabaseTemplateSource } from '@/lib/email/catalog'
import { SUPABASE_AUTH_TEMPLATES } from '@/lib/email/content'
import { isEmailConfigured } from '@/lib/email/mailer'

export const metadata: Metadata = { title: 'Emails' }
export const dynamic = 'force-dynamic'

export default function AdminEmailsPage() {
  const emails: PreviewEmail[] = EMAIL_CATALOG.map((entry) => {
    const mail = entry.render()
    const base: PreviewEmail = {
      id: entry.id,
      name: entry.name,
      category: entry.category,
      sender: entry.sender,
      trigger: entry.trigger,
      audience: entry.audience,
      schedule: entry.schedule,
      live: entry.live,
      note: entry.note,
      supabaseTemplate: entry.supabaseTemplate,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    }
    if (entry.sender === 'supabase') {
      const key = (Object.keys(SUPABASE_AUTH_TEMPLATES) as (keyof typeof SUPABASE_AUTH_TEMPLATES)[]).find(
        (k) => SUPABASE_AUTH_TEMPLATES[k].dashboardName === entry.supabaseTemplate,
      )
      if (key) {
        const src = supabaseTemplateSource(key)
        base.supabaseHtml = src.html
        base.supabaseSubject = src.subject
      }
    }
    return base
  })

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/admin" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
            <ArrowLeft className="size-3.5" /> Admin dashboard
          </Link>
          <h1 className="mt-2 flex items-center gap-2 text-xl font-bold tracking-tight">
            <Mail className="size-5 text-primary" /> Emails
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            Every email Repeat Grow sends: how it looks, when it goes out, and a button to send yourself a sample.
          </p>
        </div>
      </header>

      <EmailsPreview
        emails={emails}
        smtpConfigured={isEmailConfigured()}
        testRecipient={process.env.EMAIL_TEST_RECIPIENT || 'restrogrow@gmail.com'}
      />

      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-base font-bold tracking-tight">
          <Clock className="size-4 text-primary" /> Automated jobs (crons)
        </h2>
        <p className="text-muted-foreground mt-1 text-xs">
          These are called by your host&apos;s scheduler. Live status is on{' '}
          <Link href="/admin/system" className="text-primary underline underline-offset-2">
            System health
          </Link>
          .
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {AUTOMATED_JOBS.map((job) => (
            <div key={job.name} className="rounded-2xl border border-border bg-card-2 p-4">
              <p className="text-sm font-bold">{job.name}</p>
              <p className="mt-1 font-mono text-xs text-primary">{job.endpoint}</p>
              <p className="text-muted-foreground mt-1 text-xs">{job.schedule}</p>
              <ul className="mt-3 space-y-1.5 text-xs">
                {job.tasks.map((t) => (
                  <li key={t.label} className="flex items-start gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                    <span>
                      {t.label}
                      {t.email ? <span className="ml-1 rounded-full bg-primary-soft px-2 py-0.5 font-semibold text-primary">✉ {t.email}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
