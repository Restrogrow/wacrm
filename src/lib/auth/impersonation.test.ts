import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Impersonation is the one place in the app where a cookie can be
// traded for "log this browser in as somebody else", so these tests
// are about the guardrails rather than the happy path:
//
//   - the cookie token is only ever stored hashed, so a dump of
//     `impersonation_sessions` can't be replayed
//   - a failed session swap rolls the row back, so we never end up
//     inside a customer's account with no recorded way out
//   - /stop re-checks that the admin it's about to restore *still*
//     has platform access, and does nothing at all if not
//   - a stale cookie (browser since signed in as someone else) does
//     not produce a banner claiming an impersonation that isn't live

type Result = { data: unknown; error: unknown };

interface Op {
  table: string;
  verb: "select" | "insert" | "update" | "delete";
  payload?: Record<string, unknown>;
  filters: Array<[string, string, unknown]>;
}

interface Builder extends PromiseLike<Result> {
  select: (columns?: string) => Builder;
  insert: (payload: Record<string, unknown>) => Builder;
  update: (payload: Record<string, unknown>) => Builder;
  delete: () => Builder;
  eq: (column: string, value: unknown) => Builder;
  is: (column: string, value: unknown) => Builder;
  gt: (column: string, value: unknown) => Builder;
  single: () => Promise<Result>;
  maybeSingle: () => Promise<Result>;
}

// ------------------------------------------------------------
// Service-role client mock. Terminal results come from a per-table
// FIFO queue (the same table is read, inserted into and updated in
// one flow), and every operation is recorded so tests can assert on
// the filters — "excludes already-ended rows" is a claim about a
// `.is('ended_at', null)`, not about a return value.
// ------------------------------------------------------------
function makeAdminClient(queues: Record<string, Result[]>) {
  const ops: Op[] = [];
  const next = (table: string): Result =>
    queues[table]?.shift() ?? { data: null, error: null };

  const from = (table: string): Builder => {
    const op: Op = { table, verb: "select", filters: [] };
    ops.push(op);
    const b: Builder = {
      select: () => b,
      insert: (payload) => {
        op.verb = "insert";
        op.payload = payload;
        return b;
      },
      update: (payload) => {
        op.verb = "update";
        op.payload = payload;
        return b;
      },
      delete: () => {
        op.verb = "delete";
        return b;
      },
      eq: (column, value) => {
        op.filters.push(["eq", column, value]);
        return b;
      },
      is: (column, value) => {
        op.filters.push(["is", column, value]);
        return b;
      },
      gt: (column, value) => {
        op.filters.push(["gt", column, value]);
        return b;
      },
      single: () => Promise.resolve(next(table)),
      maybeSingle: () => Promise.resolve(next(table)),
      then: (onFulfilled, onRejected) =>
        Promise.resolve(next(table)).then(onFulfilled, onRejected),
    };
    return b;
  };

  return { ops, from };
}

// ------------------------------------------------------------
// Cookie jar mock standing in for next/headers `cookies()`.
// ------------------------------------------------------------
function makeCookieJar(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const sets: Array<{
    name: string;
    value: string;
    options: Record<string, unknown>;
  }> = [];
  const deletes: string[] = [];

  return {
    sets,
    deletes,
    jar: {
      get: (name: string) => {
        const value = store.get(name);
        return value === undefined ? undefined : { name, value };
      },
      set: (name: string, value: string, options: Record<string, unknown>) => {
        sets.push({ name, value, options });
        store.set(name, value);
      },
      delete: ({ name }: { name: string; path?: string }) => {
        deletes.push(name);
        store.delete(name);
      },
    },
  };
}

const COOKIE = "rg_impersonation";

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

// --- module mocks -------------------------------------------------

let cookieJar = makeCookieJar();
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve(cookieJar.jar),
}));

let admin = makeAdminClient({});
const getUserById = vi.fn();
const generateLink = vi.fn();
vi.mock("@/lib/flows/admin-client", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => admin.from(table),
    auth: { admin: { getUserById, generateLink } },
  }),
}));

const verifyOtp = vi.fn();
const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve({ auth: { verifyOtp, getUser } }),
}));

const isPlatformAdmin = vi.fn();
vi.mock("@/lib/auth/platform-admin", () => ({
  isPlatformAdmin: (userId: string) => isPlatformAdmin(userId),
}));

const { startImpersonation, stopImpersonation, getImpersonationState } =
  await import("./impersonation");

// Target user lookup + magic-link mint succeed unless a test says
// otherwise; every flow here needs both.
function mockSessionMintOk(email = "owner@customer.test") {
  getUserById.mockResolvedValue({
    data: { user: { id: "u-target", email } },
    error: null,
  });
  generateLink.mockResolvedValue({
    data: { properties: { hashed_token: "HASHED_TOKEN" } },
    error: null,
  });
}

function activeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "row-1",
    admin_user_id: "u-admin",
    target_user_id: "u-target",
    account_id: "acct-1",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    ended_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  cookieJar = makeCookieJar();
  admin = makeAdminClient({});
});

describe("startImpersonation", () => {
  it("stores only the hash of the cookie token", async () => {
    admin = makeAdminClient({
      impersonation_sessions: [{ data: { id: "row-1" }, error: null }],
    });
    mockSessionMintOk();
    verifyOtp.mockResolvedValue({ error: null });

    await startImpersonation({
      adminUserId: "u-admin",
      targetUserId: "u-target",
      accountId: "acct-1",
    });

    const cookie = cookieJar.sets.at(0);
    expect(cookie?.name).toBe(COOKIE);
    expect(cookie?.options).toMatchObject({ httpOnly: true, path: "/" });

    const insert = admin.ops.find((o) => o.verb === "insert");
    expect(insert?.table).toBe("impersonation_sessions");
    expect(insert?.payload).toMatchObject({
      admin_user_id: "u-admin",
      target_user_id: "u-target",
      account_id: "acct-1",
      token_hash: sha256(cookie!.value),
    });
    // The plaintext must not be recoverable from the row.
    expect(insert?.payload?.token_hash).not.toBe(cookie!.value);
  });

  it("redeems the minted magic-link token to swap the session", async () => {
    admin = makeAdminClient({
      impersonation_sessions: [{ data: { id: "row-1" }, error: null }],
    });
    mockSessionMintOk();
    verifyOtp.mockResolvedValue({ error: null });

    await startImpersonation({
      adminUserId: "u-admin",
      targetUserId: "u-target",
      accountId: "acct-1",
    });

    expect(generateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: "owner@customer.test",
    });
    expect(verifyOtp).toHaveBeenCalledWith({
      type: "magiclink",
      token_hash: "HASHED_TOKEN",
    });
  });

  it("rolls the row back and sets no cookie when the swap fails", async () => {
    admin = makeAdminClient({
      impersonation_sessions: [{ data: { id: "row-1" }, error: null }],
    });
    mockSessionMintOk();
    verifyOtp.mockResolvedValue({ error: { message: "token rejected" } });

    await expect(
      startImpersonation({
        adminUserId: "u-admin",
        targetUserId: "u-target",
        accountId: "acct-1",
      }),
    ).rejects.toThrow(/token rejected/);

    const del = admin.ops.find((o) => o.verb === "delete");
    expect(del?.table).toBe("impersonation_sessions");
    expect(del?.filters).toContainEqual(["eq", "id", "row-1"]);
    expect(cookieJar.sets).toHaveLength(0);
  });

  it("does not record a session when the row insert fails", async () => {
    admin = makeAdminClient({
      impersonation_sessions: [
        { data: null, error: { message: "insert blew up" } },
      ],
    });
    mockSessionMintOk();

    await expect(
      startImpersonation({
        adminUserId: "u-admin",
        targetUserId: "u-target",
        accountId: "acct-1",
      }),
    ).rejects.toThrow(/insert blew up/);

    // Bailed before touching the session — the admin is still signed in.
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(cookieJar.sets).toHaveLength(0);
  });
});

describe("stopImpersonation", () => {
  it("throws when there is no impersonation cookie", async () => {
    await expect(stopImpersonation()).rejects.toThrow(
      /No active impersonation/,
    );
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("looks the row up by token hash, excluding ended and expired ones", async () => {
    cookieJar = makeCookieJar({ [COOKIE]: "plaintext-token" });
    admin = makeAdminClient({
      impersonation_sessions: [
        { data: activeRow(), error: null },
        { data: null, error: null }, // the ended_at update
      ],
    });
    isPlatformAdmin.mockResolvedValue(true);
    getUserById.mockResolvedValue({
      data: { user: { id: "u-admin", email: "support@repeatgrow.test" } },
      error: null,
    });
    generateLink.mockResolvedValue({
      data: { properties: { hashed_token: "ADMIN_TOKEN" } },
      error: null,
    });
    verifyOtp.mockResolvedValue({ error: null });

    await stopImpersonation();

    const lookup = admin.ops.find((o) => o.verb === "select");
    expect(lookup?.filters).toContainEqual([
      "eq",
      "token_hash",
      sha256("plaintext-token"),
    ]);
    expect(lookup?.filters).toContainEqual(["is", "ended_at", null]);
    expect(
      lookup?.filters.some(([op, col]) => op === "gt" && col === "expires_at"),
    ).toBe(true);
  });

  it("closes the row single-use, clears the cookie and restores the admin", async () => {
    cookieJar = makeCookieJar({ [COOKIE]: "plaintext-token" });
    admin = makeAdminClient({
      impersonation_sessions: [
        { data: activeRow(), error: null },
        { data: null, error: null },
      ],
    });
    isPlatformAdmin.mockResolvedValue(true);
    getUserById.mockResolvedValue({
      data: { user: { id: "u-admin", email: "support@repeatgrow.test" } },
      error: null,
    });
    generateLink.mockResolvedValue({
      data: { properties: { hashed_token: "ADMIN_TOKEN" } },
      error: null,
    });
    verifyOtp.mockResolvedValue({ error: null });

    await stopImpersonation();

    const update = admin.ops.find((o) => o.verb === "update");
    expect(update?.payload?.ended_at).toEqual(expect.any(String));
    expect(update?.filters).toContainEqual(["eq", "id", "row-1"]);
    // The `is(ended_at, null)` on the update is what makes it
    // single-use under a concurrent second click.
    expect(update?.filters).toContainEqual(["is", "ended_at", null]);

    expect(cookieJar.deletes).toContain(COOKIE);
    expect(generateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: "support@repeatgrow.test",
    });
    expect(verifyOtp).toHaveBeenCalledWith({
      type: "magiclink",
      token_hash: "ADMIN_TOKEN",
    });
  });

  it("refuses to restore an admin whose platform access was revoked", async () => {
    cookieJar = makeCookieJar({ [COOKIE]: "plaintext-token" });
    admin = makeAdminClient({
      impersonation_sessions: [{ data: activeRow(), error: null }],
    });
    isPlatformAdmin.mockResolvedValue(false);

    await expect(stopImpersonation()).rejects.toThrow(
      /no longer has platform access/,
    );

    expect(isPlatformAdmin).toHaveBeenCalledWith("u-admin");
    // Nothing happened: no session swap, row left open.
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(admin.ops.some((o) => o.verb === "update")).toBe(false);
    expect(cookieJar.deletes).toHaveLength(0);
  });
});

describe("getImpersonationState", () => {
  it("returns null without a cookie", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u-target" } } });
    await expect(getImpersonationState()).resolves.toBeNull();
  });

  it("ignores a stale cookie when the live session is somebody else", async () => {
    cookieJar = makeCookieJar({ [COOKIE]: "plaintext-token" });
    admin = makeAdminClient({
      impersonation_sessions: [{ data: activeRow(), error: null }],
    });
    getUser.mockResolvedValue({
      data: { user: { id: "u-someone-else", email: "other@x.test" } },
    });

    await expect(getImpersonationState()).resolves.toBeNull();
  });

  it("describes the live impersonation for the banner", async () => {
    cookieJar = makeCookieJar({ [COOKIE]: "plaintext-token" });
    admin = makeAdminClient({
      impersonation_sessions: [{ data: activeRow(), error: null }],
      accounts: [{ data: { name: "Cafe Mocha" }, error: null }],
    });
    getUser.mockResolvedValue({
      data: { user: { id: "u-target", email: "owner@customer.test" } },
    });
    getUserById.mockResolvedValue({
      data: { user: { id: "u-admin", email: "support@repeatgrow.test" } },
      error: null,
    });

    await expect(getImpersonationState()).resolves.toEqual({
      adminEmail: "support@repeatgrow.test",
      targetEmail: "owner@customer.test",
      accountName: "Cafe Mocha",
    });
  });
});
