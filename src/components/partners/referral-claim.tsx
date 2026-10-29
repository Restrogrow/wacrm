"use client";

import { useEffect } from "react";

// Headless: once per browser session, asks the server to credit this
// account to the partner whose /r/<code> link the visitor came through.
// The referral cookie is httpOnly, so the server decides; without it the
// call returns at once (see /api/partner/claim).
const DONE_KEY = "rg-ref-claimed";

export function ReferralClaim() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(DONE_KEY)) return;
      sessionStorage.setItem(DONE_KEY, "1");
    } catch {}
    void fetch("/api/partner/claim", { method: "POST" }).catch(() => {});
  }, []);
  return null;
}
