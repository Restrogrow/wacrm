# Resubmission notes — requirement 1.2.1 (Billing API)

Paste into the Shopify Partner Dashboard resubmission / reviewer-notes
field when resubmitting the app for review.

---

We've added Shopify Billing API integration for merchants who install
Repeat Grow through the App Store or Shopify admin. When such a
merchant chooses a plan in-app (Settings → Plan & billing), we create
a recurring AppSubscription via the Billing API and redirect them to
Shopify's own approval page; the plan only activates once Shopify
confirms the subscription (APP_SUBSCRIPTIONS_UPDATE webhook). Cancelling
in-app cancels the Shopify subscription directly.

One deliberate exception, in case it's reviewed: a merchant who signed
up on our website and is **already paying us directly**, and who later
also installs the Shopify integration from their Shopify admin, is
**not** automatically switched onto Shopify billing. We don't want to
silently move an existing paying customer's billing relationship or
risk double-charging them. Only accounts whose install originated from
Shopify (the App Store listing, or "Install" from the Shopify admin)
are billed through Shopify — this is tracked on our side per account.
Every merchant who installs from the App Store today bills through
Shopify; this exception only protects pre-existing website customers.
