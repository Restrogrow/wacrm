=== Repeat Grow for WooCommerce ===
Contributors: repeatgrow
Tags: whatsapp, woocommerce, order notifications, cod confirmation, whatsapp crm
Requires at least: 6.0
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

WhatsApp order updates and a shared WhatsApp inbox for WooCommerce stores. Connect in one click. Official WhatsApp Business API.

== Description ==

Repeat Grow sends your customers WhatsApp messages at every step of an order, automatically:

* **Order placed** and **cash-on-delivery order placed** (ask COD customers to confirm)
* **Order completed**, **cancelled** and **refunded**

Customer replies arrive in a shared WhatsApp inbox your whole team can answer from.

Repeat Grow is a WhatsApp CRM built on the official WhatsApp Business API and an approved Meta Tech Provider, so your number stays safe. It also includes an AI chatbot, broadcasts with approved templates, a product catalog and payment links.

**Connect in one click.** Click *Connect to Repeat Grow*, log in, and approve Repeat Grow on WooCommerce's own approval screen. Repeat Grow creates the order webhooks for you. No keys or secrets to copy.

This plugin stores no keys or secrets. It shows whether your store is connected and can disconnect it.

== External services ==

This plugin connects your store to **Repeat Grow** (https://repeatgrow.com), a WhatsApp CRM service.

* When you click *Connect to Repeat Grow*, your browser opens repeatgrow.com with your store's address so you can confirm the connection. WooCommerce then asks you to approve Repeat Grow and sends Repeat Grow a WooCommerce REST API key for your store.
* Repeat Grow uses that key to create two WooCommerce webhooks (*Order created* and *Order updated*). From then on WooCommerce sends order details (order number, status, totals, items, customer name, phone and email, shipping details) to Repeat Grow, which uses them to send the WhatsApp messages you set up.
* Nothing is sent until you connect, and *Disconnect* removes the webhooks and the key.

Repeat Grow [Terms of Service](https://repeatgrow.com/terms) and [Privacy Policy](https://repeatgrow.com/privacy).

== Installation ==

1. Install and activate the plugin (WooCommerce must be active).
2. Go to **WooCommerce → Repeat Grow** and click **Connect to Repeat Grow**.
3. Log in to Repeat Grow (or start the free 7-day trial) and confirm.
4. Click **Approve** on the WooCommerce screen.
5. In Repeat Grow, choose an approved WhatsApp template for each order event.

Your store must use https:// for one-click connect.

== Frequently Asked Questions ==

= Do I need a WhatsApp Business API number? =

Yes. Repeat Grow sets up the official WhatsApp Business API for you on every plan.

= Who pays for WhatsApp messages? =

Meta bills WhatsApp message fees directly to your WhatsApp Business Account. Repeat Grow charges its plan price only.

= Does it work with High-Performance Order Storage (HPOS)? =

Yes.

= How do I disconnect? =

WooCommerce → Repeat Grow → Disconnect. This deletes Repeat Grow's webhooks and REST key from your store.

== Screenshots ==

1. Connect your store in one click.
2. Automatic WhatsApp messages for each order event in Repeat Grow.

== Changelog ==

= 1.0.0 =
* First release: one-click connect, connection status and disconnect.
