// Cloudflare Turnstile inside a WebView. Supabase's captcha protection is on, so
// sign up / sign in / password reset all need a token from this widget.
// The page is loaded with baseUrl https://repeatgrow.com, which is one of the
// hostnames the widget is registered for.
import { forwardRef, type ComponentType, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { Text } from '@/components/ui/Text';
import { SITE_URL, TURNSTILE_SITE_KEY } from '@/config';
import { radius, useTheme } from '@/theme';

// react-native-webview's bundled types do not line up with React 19's JSX types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Web = WebView as unknown as ComponentType<any>;

export interface TurnstileHandle {
  reset: () => void;
}

function buildHtml(siteKey: string, theme: 'light' | 'dark') {
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>html,body{margin:0;padding:0;background:transparent;display:flex;align-items:center;justify-content:center;height:100%;overflow:hidden}</style>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onReady" async defer></script>
</head><body><div id="box"></div>
<script>
var wid = null;
function send(type, value){ window.ReactNativeWebView.postMessage(JSON.stringify({type:type, value:value})); }
function onReady(){
  wid = turnstile.render('#box', {
    sitekey: ${JSON.stringify(siteKey)},
    theme: ${JSON.stringify(theme)},
    callback: function(t){ send('token', t); },
    'expired-callback': function(){ send('token', null); },
    'error-callback': function(c){ send('error', String(c)); },
    'before-interactive-callback': function(){ send('interactive', true); }
  });
  send('ready', true);
}
window.resetTurnstile = function(){ try{ if(wid!==null){ turnstile.reset(wid); } }catch(e){} send('token', null); };
</script></body></html>`;
}

export const TurnstileWebView = forwardRef<TurnstileHandle, { onToken: (token: string | null) => void }>(function TurnstileWebView(
  { onToken },
  ref,
) {
  const { colors, dark } = useTheme();
  const web = useRef<{ injectJavaScript: (js: string) => void } | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const html = useMemo(() => buildHtml(TURNSTILE_SITE_KEY, dark ? 'dark' : 'light'), [dark]);

  useImperativeHandle(ref, () => ({
    reset: () => {
      onToken(null);
      web.current?.injectJavaScript('window.resetTurnstile && window.resetTurnstile(); true;');
    },
  }));

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(e.nativeEvent.data) as { type: string; value: unknown };
        if (msg.type === 'ready') setReady(true);
        else if (msg.type === 'token') {
          setFailed(false);
          onToken(typeof msg.value === 'string' ? msg.value : null);
        } else if (msg.type === 'error') {
          setFailed(true);
          onToken(null);
        }
      } catch {
        /* ignore malformed messages */
      }
    },
    [onToken],
  );

  if (!TURNSTILE_SITE_KEY) return null;

  return (
    <View
      style={[styles.wrap, { backgroundColor: colors.surface, borderColor: failed ? colors.danger : colors.border }]}
      accessibilityLabel="Security check"
    >
      <Web
        ref={web}
        originWhitelist={['*']}
        source={{ html, baseUrl: SITE_URL }}
        onMessage={onMessage}
        onError={() => setFailed(true)}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        setSupportMultipleWindows={false}
        style={{ backgroundColor: 'transparent' }}
      />
      {!ready && !failed ? (
        <View style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: colors.surface }]} pointerEvents="none">
          <ActivityIndicator color={colors.primary} />
          <Text variant="caption" muted>
            Loading security check...
          </Text>
        </View>
      ) : null}
      {failed ? (
        <View style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: colors.surface }]} pointerEvents="none">
          <Text variant="caption" color={colors.danger} style={{ textAlign: 'center', paddingHorizontal: 12 }}>
            The security check could not load. Check your connection.
          </Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { height: 74, borderRadius: radius.md, borderWidth: 1, overflow: 'hidden' },
  overlay: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
});
