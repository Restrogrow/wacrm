# Security incident response policy

**Owner:** Repeat Grow (repeatgrow.com) · **Contact:** support@repeatgrow.com · **Adopted:** 22 October 2026 ·
**Review:** every 12 months, and after every incident.

This policy says what we do when customer data may have been exposed, changed or lost. It covers the Repeat Grow
web app, mobile app, API, database (Supabase), hosting (Hostinger) and every integration, including Shopify.

## 1. What counts as an incident

Any event that may affect the confidentiality, integrity or availability of data we hold for merchants or their
customers. For example: unauthorised access to the database or an admin account, a leaked key or token (Supabase
service key, `ENCRYPTION_KEY`, WhatsApp, Shopify or other integration tokens), data visible to the wrong account,
lost or corrupted data, or a vulnerability reported to us that could lead to any of these.

## 2. Roles

- **Incident lead:** the account owner of Repeat Grow (founder). Decides severity, coordinates the response,
  and sends notifications.
- **Engineering:** whoever maintains the code and infrastructure; contains and fixes the issue.
- Reports from anyone (merchants, customers, researchers) go to **support@repeatgrow.com**. We acknowledge within
  1 business day.

## 3. Severity

| Level | Example | Start response |
|---|---|---|
| Critical | Customer personal data exposed outside its account; database or admin access compromised | Immediately |
| High | A secret key leaked but no evidence of misuse; data could be exposed by a known bug | Within 4 hours |
| Medium | Limited exposure of non-personal data; service outage | Within 1 business day |
| Low | Weakness with no realistic path to data | Next planned release |

## 4. Response steps

1. **Record** the time, who reported it and what is known, in a private incident note.
2. **Contain:** revoke or rotate affected credentials (Supabase keys, `ENCRYPTION_KEY`, API keys, integration
   tokens), disable affected features or accounts, block abusive IP addresses, and take the app offline if needed.
3. **Investigate:** use the audit log, Supabase logs, hosting logs and webhook logs to find what was accessed,
   which accounts and which data, and since when. Preserve the evidence.
4. **Fix** the root cause, add a test that would have caught it, and deploy.
5. **Recover:** restore lost or corrupted data from backups where needed and confirm the fix holds.
6. **Notify** (section 5).
7. **Review** within 14 days: what happened, why, what changed. Update this policy if needed.

## 5. Notification

- **Affected merchants** (and, through them, their customers where they ask us to help) are told without undue
  delay, and in any case within **72 hours** of confirming that their data was affected. The notice says what
  happened, what data was involved, what we have done, and what they should do.
- **Shopify:** for incidents involving data received from Shopify, we notify Shopify as required by the Shopify
  Partner Program Agreement and API terms.
- **Authorities:** we notify the Data Protection Board of India under the Digital Personal Data Protection Act,
  and any other regulator where the law requires it, within the time the law sets.

## 6. Prevention we already run

Row-level security on every table (tested in CI), encryption of tokens and secrets with AES-256-GCM, encrypted
connections (HTTPS) everywhere, signed and verified webhooks, rate limits, an append-only audit log, platform-admin
access limited to named people, secrets kept only in hosting environment variables, and deletion of Shopify
customer data on the `customers/redact` and `shop/redact` webhooks.
