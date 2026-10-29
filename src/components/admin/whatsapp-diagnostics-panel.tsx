"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, Loader2, Zap, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WhatsappDiagnostics } from "@/lib/whatsapp/diagnostics";

interface Props {
  accountId: string;
}

// Admin-side counterpart to the "Verify with Meta" button in the
// customer's own Settings → WhatsApp page — same underlying checks
// (src/lib/whatsapp/diagnostics.ts), but callable by a platform admin
// for ANY account, so support can tell whether a number — especially
// a coexistence one — is actually live without needing the
// customer's login.
export function WhatsappDiagnosticsPanel({ accountId }: Props) {
  const [loading, setLoading] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [result, setResult] = useState<
    (WhatsappDiagnostics & { reconnect_steps?: string[] }) | { message: string } | null
  >(null);

  // Re-subscribe our app to the WABA and point the number's webhook back
  // at Repeat Grow, then show the fresh checks.
  const reconnect = async () => {
    setReconnecting(true);
    try {
      const res = await fetch(`/api/admin/accounts/${accountId}/verify-whatsapp`, { method: "POST" });
      const data = await res.json();
      setResult(res.ok ? data : { message: data.error ?? "Reconnect failed" });
    } catch (err) {
      setResult({ message: err instanceof Error ? err.message : "Request failed" });
    } finally {
      setReconnecting(false);
    }
  };

  const runCheck = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/accounts/${accountId}/verify-whatsapp`);
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({
        message: err instanceof Error ? err.message : "Request failed",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Live status check
        </h3>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={reconnect}
            disabled={loading || reconnecting}
            className="h-8 gap-1.5"
            title="Use when customer messages don't arrive: re-links Repeat Grow to this number's webhooks"
          >
            {reconnecting ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />}
            Reconnect webhooks
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={runCheck}
            disabled={loading || reconnecting}
            className="h-8 gap-1.5"
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Zap className="size-3.5" />
            )}
            Check against Meta
          </Button>
        </div>
      </div>

      {result && "message" in result && (
        <p className="mt-3 text-xs text-muted-foreground">{result.message}</p>
      )}

      {result && "checks" in result && (
        <div className="mt-3 space-y-2 text-xs">
          <p className="font-medium text-foreground">
            Result:{" "}
            <span className={result.live ? "text-emerald-400" : "text-amber-400"}>
              {result.live ? "live" : "not live"}
            </span>
          </p>

          <ul className="space-y-1 text-muted-foreground">
            {Object.entries(result.checks).map(([key, value]) => (
              <li key={key} className="flex items-center gap-1.5">
                {value === true ? (
                  <CheckCircle2 className="size-3 shrink-0 text-emerald-400" />
                ) : value === false ? (
                  <XCircle className="size-3 shrink-0 text-red-400" />
                ) : (
                  <span className="size-3 shrink-0 rounded-full border border-border" />
                )}
                <code>{key}</code>
              </li>
            ))}
          </ul>

          <div className="space-y-0.5 border-t border-border/60 pt-2 text-muted-foreground">
            <p>
              Messages go to:{" "}
              <code className="break-all text-foreground">{result.webhook_url ?? "unknown"}</code>
            </p>
            <p>
              Apps on this WhatsApp account:{" "}
              <span className="text-foreground">
                {result.subscribed_apps?.length ? result.subscribed_apps.join(", ") : "none"}
              </span>
            </p>
          </div>

          {result.reconnect_steps && result.reconnect_steps.length > 0 && (
            <ul className="space-y-1 border-t border-border/60 pt-2 text-emerald-400">
              {result.reconnect_steps.map((step, i) => (
                <li key={i}>✓ {step}</li>
              ))}
            </ul>
          )}

          {result.errors.length > 0 && (
            <ul className="space-y-1 border-t border-border/60 pt-2 text-red-300">
              {result.errors.map((e, i) => (
                <li key={i}>• {e}</li>
              ))}
            </ul>
          )}

          {result.coexistence.is_on_biz_app && (
            <div className="space-y-1 border-t border-border/60 pt-2">
              <p className="font-medium text-foreground">
                WhatsApp Business app sync (coexistence)
              </p>
              <p className="text-muted-foreground">
                Contacts:{" "}
                {result.coexistence.contacts_synced_at
                  ? `synced ${new Date(result.coexistence.contacts_synced_at).toLocaleString()}`
                  : "not synced yet"}
              </p>
              <p className="text-muted-foreground">
                History:{" "}
                {result.coexistence.history_synced_at
                  ? `synced ${new Date(result.coexistence.history_synced_at).toLocaleString()}`
                  : "not synced yet"}
                {result.coexistence.history_progress != null &&
                  ` (${result.coexistence.history_progress}%)`}
              </p>
              {result.coexistence.sync_error && (
                <p className="text-red-300">
                  • Sync error: {result.coexistence.sync_error}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
