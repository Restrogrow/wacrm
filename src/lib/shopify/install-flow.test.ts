import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Shopify's "Immediately authenticates after install" check: an install
// signed by Shopify must go straight to OAuth consent, even with no
// Repeat Grow session.

const requireRole = vi.fn();
vi.mock("@/lib/auth/account", async () => {
  class UnauthorizedError extends Error {}
  return { requireRole: (...a: unknown[]) => requireRole(...a), UnauthorizedError };
});

const SECRET = "shpss_test_secret";

function signed(query: Record<string, string>): string {
  const message = Object.keys(query)
    .sort()
    .map((k) => `${k}=${query[k]}`)
    .join("&");
  const hmac = createHmac("sha256", SECRET).update(message).digest("hex");
  return new URLSearchParams({ ...query, hmac }).toString();
}

describe("GET /api/integrations/shopify/install", () => {
  beforeEach(() => {
    vi.stubEnv("SHOPIFY_API_KEY", "client-id");
    vi.stubEnv("SHOPIFY_API_SECRET", SECRET);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://repeatgrow.com");
    requireRole.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("sends a Shopify-signed install straight to consent without a session", async () => {
    const { UnauthorizedError } = await import("@/lib/auth/account");
    requireRole.mockRejectedValue(new UnauthorizedError());
    const { GET } = await import("@/app/api/integrations/shopify/install/route");
    const q = signed({ shop: "demo-store.myshopify.com", timestamp: "1700000000" });
    const res = await GET(new Request(`https://repeatgrow.com/api/integrations/shopify/install?${q}`));
    const location = res.headers.get("location") ?? "";
    expect(location).toMatch(/^https:\/\/demo-store\.myshopify\.com\/admin\/oauth\/authorize\?/);
    expect(requireRole).not.toHaveBeenCalled();
  });

  it("sends an unsigned request with no session to login", async () => {
    const { UnauthorizedError } = await import("@/lib/auth/account");
    requireRole.mockRejectedValue(new UnauthorizedError());
    const { GET } = await import("@/app/api/integrations/shopify/install/route");
    const res = await GET(new Request("https://repeatgrow.com/api/integrations/shopify/install?shop=demo-store.myshopify.com"));
    expect(res.headers.get("location")).toMatch(/\/login\?next=/);
  });

  it("does not trust a forged signature", async () => {
    const { UnauthorizedError } = await import("@/lib/auth/account");
    requireRole.mockRejectedValue(new UnauthorizedError());
    const { GET } = await import("@/app/api/integrations/shopify/install/route");
    const res = await GET(
      new Request("https://repeatgrow.com/api/integrations/shopify/install?shop=demo-store.myshopify.com&timestamp=1&hmac=deadbeef"),
    );
    expect(res.headers.get("location")).toMatch(/\/login\?next=/);
  });
});

describe("hashClaimToken", () => {
  it("is a stable sha-256 hex digest", async () => {
    vi.doMock("@/lib/flows/admin-client", () => ({ supabaseAdmin: vi.fn() }));
    const { hashClaimToken } = await import("./connect");
    expect(hashClaimToken("abc")).toBe(hashClaimToken("abc"));
    expect(hashClaimToken("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashClaimToken("abc")).not.toBe(hashClaimToken("abd"));
  });
});
