# Repeat Grow for WooCommerce (WordPress plugin)

One-click connection between a WooCommerce store and Repeat Grow. The plugin
adds **WooCommerce → Repeat Grow** with a *Connect* button, the connection
status and *Disconnect*. It stores no keys or secrets.

## How the one-click flow works

1. *Connect to Repeat Grow* opens `https://repeatgrow.com/woocommerce/connect?store=<home_url>`.
2. The merchant logs in; an admin confirms (`src/app/woocommerce/connect/page.tsx`).
3. `POST /api/integrations/woocommerce/authorize` saves the store row and returns the
   store's own `/wc-auth/v1/authorize` URL with a signed, 1-hour state
   (`src/lib/woocommerce/one-click.ts`).
4. The merchant clicks **Approve** in WooCommerce. WooCommerce POSTs a read/write
   REST key to `/api/integrations/woocommerce/wc-auth/callback`, which verifies the
   state and stores the key encrypted (`woocommerce_stores.api_consumer_*`).
5. WooCommerce sends the merchant to `/integrations/woocommerce?wc_return=1`, which
   calls `/api/integrations/woocommerce/setup-webhooks` to create the *Order created*
   and *Order updated* webhooks through the store's REST API (idempotent).

Disconnect (in the plugin) deletes our webhooks and the REST key named
`Repeat Grow - API …`. The store must be on https and at the domain root
(WordPress in a sub-folder isn't supported by one-click yet; use manual setup).

## Build the zip

```
python - <<'EOF'
import zipfile, os
src = 'integrations/woocommerce-plugin/repeat-grow-for-woocommerce'
with zipfile.ZipFile('public/downloads/repeat-grow-for-woocommerce.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(src):
        for f in sorted(files):
            p = os.path.join(root, f)
            z.write(p, os.path.relpath(p, 'integrations/woocommerce-plugin').replace(os.sep, '/'))
EOF
```

Run from `wacrm/`. Don't use Windows PowerShell's `Compress-Archive`: it can write
backslash paths that WordPress can't install. The zip is served at
`https://repeatgrow.com/downloads/repeat-grow-for-woocommerce.zip`.

## Publish on WordPress.org (owner)

1. Create a WordPress.org account and set it as `Contributors:` in `readme.txt`.
2. Test on a real https WooCommerce store, then update `Tested up to:`.
3. Submit the zip at https://wordpress.org/plugins/developers/add/ and answer the
   review email. After approval, upload via the SVN repository they give you.
4. Add screenshots (`assets/screenshot-1.png` …) and a banner/icon in SVN `assets/`.
