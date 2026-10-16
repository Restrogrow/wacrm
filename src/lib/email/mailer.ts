// ============================================================
// Outgoing email from the app (server-only), via SMTP.
//
// Configure in the server environment (Hostinger hPanel):
//   SMTP_HOST   e.g. smtp.gmail.com
//   SMTP_PORT   465 (SSL) or 587 (STARTTLS)
//   SMTP_USER   e.g. support@repeatgrow.com
//   SMTP_PASS   the Google Workspace App Password (16 letters)
//   SMTP_FROM   optional, e.g. "Repeat Grow <support@repeatgrow.com>"
// Without them, isEmailConfigured() is false and features that email
// (daily summary) say so instead of failing.
// ============================================================

import nodemailer, { type Transporter } from 'nodemailer';

let transporter: Transporter | null = null;

export function isEmailConfigured(): boolean {
  return !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );
}

function getTransporter(): Transporter {
  if (!isEmailConfigured())
    throw new Error('Email (SMTP) is not configured on the server');
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 465);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

export async function sendEmail(message: {
  to: string[];
  subject: string;
  html: string;
  text: string;
  /** Where replies go (for example the person who filled in a form). */
  replyTo?: string;
}): Promise<void> {
  const from =
    process.env.SMTP_FROM || `Repeat Grow <${process.env.SMTP_USER}>`;
  await getTransporter().sendMail({ from, ...message });
}
