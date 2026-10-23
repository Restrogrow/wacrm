<?php
/**
 * Plugin Name:          Repeat Grow for WooCommerce
 * Plugin URI:           https://repeatgrow.com/whatsapp-crm-for-ecommerce
 * Description:          WhatsApp order updates and a shared WhatsApp inbox for your store. Connect your store to Repeat Grow in one click.
 * Version:              1.0.0
 * Author:               Repeat Grow
 * Author URI:           https://repeatgrow.com
 * License:              GPLv2 or later
 * License URI:          https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:          repeat-grow-for-woocommerce
 * Requires at least:    6.0
 * Requires PHP:         7.4
 * Requires Plugins:     woocommerce
 * WC requires at least: 7.0
 *
 * How it works: "Connect to Repeat Grow" opens repeatgrow.com, where the
 * store owner confirms the connection. WooCommerce's own app-authorization
 * screen then asks them to approve Repeat Grow, and Repeat Grow creates the
 * order webhooks through the WooCommerce REST API. This plugin stores no
 * keys or secrets; it only shows the connection and can disconnect it.
 */

defined( 'ABSPATH' ) || exit;

define( 'RGWC_VERSION', '1.0.0' );
define( 'RGWC_APP_URL', 'https://repeatgrow.com' );
define( 'RGWC_WEBHOOK_PREFIX', RGWC_APP_URL . '/api/integrations/woocommerce/webhooks/' );
define( 'RGWC_KEY_DESCRIPTION', 'Repeat Grow - API' );

// Compatible with WooCommerce High-Performance Order Storage (we don't touch order tables).
add_action(
	'before_woocommerce_init',
	function () {
		if ( class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', __FILE__, true );
		}
	}
);

/** WooCommerce → Repeat Grow. */
add_action(
	'admin_menu',
	function () {
		add_submenu_page(
			'woocommerce',
			__( 'Repeat Grow', 'repeat-grow-for-woocommerce' ),
			__( 'Repeat Grow', 'repeat-grow-for-woocommerce' ),
			'manage_woocommerce',
			'repeat-grow',
			'rgwc_render_page'
		);
	},
	60
);

/** "Settings" link on the Plugins screen. */
add_filter(
	'plugin_action_links_' . plugin_basename( __FILE__ ),
	function ( $links ) {
		$url = admin_url( 'admin.php?page=repeat-grow' );
		array_unshift( $links, '<a href="' . esc_url( $url ) . '">' . esc_html__( 'Settings', 'repeat-grow-for-woocommerce' ) . '</a>' );
		return $links;
	}
);

/** The store address Repeat Grow connects to (WooCommerce REST and wc-auth live under it). */
function rgwc_store_url() {
	return untrailingslashit( home_url() );
}

/** Webhooks in this store that deliver to Repeat Grow. */
function rgwc_our_webhooks() {
	if ( ! class_exists( 'WC_Data_Store' ) || ! function_exists( 'wc_get_webhook' ) ) {
		return array();
	}
	$out = array();
	$ids = WC_Data_Store::load( 'webhook' )->search_webhooks( array( 'limit' => -1 ) );
	foreach ( (array) $ids as $id ) {
		$webhook = wc_get_webhook( $id );
		if ( $webhook && 0 === strpos( (string) $webhook->get_delivery_url(), RGWC_WEBHOOK_PREFIX ) ) {
			$out[] = $webhook;
		}
	}
	return $out;
}

/** Remove Repeat Grow's webhooks and the REST key WooCommerce created for it. */
function rgwc_disconnect() {
	foreach ( rgwc_our_webhooks() as $webhook ) {
		$webhook->delete( true );
	}
	global $wpdb;
	// WooCommerce names keys created through /wc-auth "<app name> - API (<date>)".
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery
	$wpdb->query(
		$wpdb->prepare(
			"DELETE FROM {$wpdb->prefix}woocommerce_api_keys WHERE description LIKE %s",
			$wpdb->esc_like( RGWC_KEY_DESCRIPTION ) . '%'
		)
	);
}

/** Handle the Disconnect form (POST + nonce + capability). */
add_action(
	'admin_post_rgwc_disconnect',
	function () {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_die( esc_html__( 'You are not allowed to do this.', 'repeat-grow-for-woocommerce' ) );
		}
		check_admin_referer( 'rgwc_disconnect' );
		rgwc_disconnect();
		wp_safe_redirect( admin_url( 'admin.php?page=repeat-grow&rgwc_disconnected=1' ) );
		exit;
	}
);

function rgwc_render_page() {
	if ( ! current_user_can( 'manage_woocommerce' ) ) {
		return;
	}
	$store       = rgwc_store_url();
	$is_https    = 0 === strpos( $store, 'https://' );
	$webhooks    = rgwc_our_webhooks();
	$active      = array_filter(
		$webhooks,
		function ( $w ) {
			return 'active' === $w->get_status();
		}
	);
	$connected   = count( $active ) > 0;
	$connect_url = add_query_arg( 'store', rawurlencode( $store ), RGWC_APP_URL . '/woocommerce/connect' );
	?>
	<div class="wrap">
		<h1><?php esc_html_e( 'Repeat Grow', 'repeat-grow-for-woocommerce' ); ?></h1>
		<p style="max-width:720px">
			<?php esc_html_e( 'Send WhatsApp messages automatically when a customer places an order, and when it is completed, cancelled or refunded. Replies land in a shared WhatsApp inbox for your team. Runs on the official WhatsApp Business API.', 'repeat-grow-for-woocommerce' ); ?>
		</p>

		<?php if ( isset( $_GET['rgwc_disconnected'] ) ) : // phpcs:ignore WordPress.Security.NonceVerification.Recommended ?>
			<div class="notice notice-success is-dismissible"><p><?php esc_html_e( 'Disconnected. Repeat Grow no longer receives orders from this store.', 'repeat-grow-for-woocommerce' ); ?></p></div>
		<?php endif; ?>

		<div class="card" style="max-width:720px;padding:16px 20px">
			<?php if ( $connected ) : ?>
				<h2 style="margin-top:0">✅ <?php esc_html_e( 'Connected to Repeat Grow', 'repeat-grow-for-woocommerce' ); ?></h2>
				<p><?php esc_html_e( 'These order webhooks send your orders to Repeat Grow:', 'repeat-grow-for-woocommerce' ); ?></p>
				<ul style="list-style:disc;padding-left:20px">
					<?php foreach ( $webhooks as $w ) : ?>
						<li><?php echo esc_html( $w->get_name() . ' — ' . $w->get_status() ); ?></li>
					<?php endforeach; ?>
				</ul>
				<p>
					<a class="button button-primary" href="<?php echo esc_url( RGWC_APP_URL . '/integrations/woocommerce' ); ?>" target="_blank" rel="noopener">
						<?php esc_html_e( 'Choose your WhatsApp messages in Repeat Grow', 'repeat-grow-for-woocommerce' ); ?>
					</a>
				</p>
				<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" onsubmit="return confirm('<?php echo esc_js( __( 'Disconnect this store from Repeat Grow?', 'repeat-grow-for-woocommerce' ) ); ?>');">
					<input type="hidden" name="action" value="rgwc_disconnect" />
					<?php wp_nonce_field( 'rgwc_disconnect' ); ?>
					<button type="submit" class="button"><?php esc_html_e( 'Disconnect', 'repeat-grow-for-woocommerce' ); ?></button>
				</form>
			<?php else : ?>
				<h2 style="margin-top:0"><?php esc_html_e( 'Connect your store', 'repeat-grow-for-woocommerce' ); ?></h2>
				<?php if ( ! $is_https ) : ?>
					<div class="notice notice-warning inline"><p><?php esc_html_e( 'One-click connect needs your store on https://. Turn on SSL first, or use the manual setup in Repeat Grow.', 'repeat-grow-for-woocommerce' ); ?></p></div>
				<?php endif; ?>
				<ol>
					<li><?php esc_html_e( 'Click Connect and log in to Repeat Grow (or start a free 7-day trial).', 'repeat-grow-for-woocommerce' ); ?></li>
					<li><?php esc_html_e( 'Approve Repeat Grow on the WooCommerce screen that opens.', 'repeat-grow-for-woocommerce' ); ?></li>
					<li><?php esc_html_e( 'Done. Repeat Grow creates the order webhooks for you.', 'repeat-grow-for-woocommerce' ); ?></li>
				</ol>
				<p>
					<a class="button button-primary button-hero" href="<?php echo esc_url( $connect_url ); ?>"<?php echo $is_https ? '' : ' aria-disabled="true" style="pointer-events:none;opacity:.6"'; ?>>
						<?php esc_html_e( 'Connect to Repeat Grow', 'repeat-grow-for-woocommerce' ); ?>
					</a>
				</p>
				<p class="description">
					<?php
					printf(
						/* translators: %s: link to sign up */
						esc_html__( 'No account yet? %s', 'repeat-grow-for-woocommerce' ),
						'<a href="' . esc_url( RGWC_APP_URL . '/signup' ) . '" target="_blank" rel="noopener">' . esc_html__( 'Start a free trial', 'repeat-grow-for-woocommerce' ) . '</a>'
					);
					?>
				</p>
			<?php endif; ?>
		</div>
	</div>
	<?php
}
