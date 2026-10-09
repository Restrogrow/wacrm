import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isStaleBuildError, reloadOnceForStaleBuild } from "./stale-build";

describe("isStaleBuildError", () => {
  it("recognises chunk / module-factory errors from an old build", () => {
    expect(isStaleBuildError(new TypeError("Cannot read properties of undefined (reading 'call')"))).toBe(true);
    expect(isStaleBuildError(Object.assign(new Error("Loading chunk 3794 failed."), { name: "ChunkLoadError" }))).toBe(true);
    expect(isStaleBuildError(new TypeError("Failed to fetch dynamically imported module: /x.js"))).toBe(true);
  });

  it("ignores ordinary app errors", () => {
    expect(isStaleBuildError(new TypeError("Cannot read properties of undefined (reading 'name')"))).toBe(false);
    expect(isStaleBuildError(new Error("Base UI error #31"))).toBe(false);
    expect(isStaleBuildError(null)).toBe(false);
  });
});

describe("reloadOnceForStaleBuild", () => {
  const store = new Map<string, string>();
  const reload = vi.fn();

  beforeEach(() => {
    store.clear();
    reload.mockClear();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
      location: { reload },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reloads once, then not again within the cooldown", () => {
    expect(reloadOnceForStaleBuild(1_000_000)).toBe(true);
    expect(reloadOnceForStaleBuild(1_010_000)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("allows another reload after the cooldown", () => {
    reloadOnceForStaleBuild(1_000_000);
    expect(reloadOnceForStaleBuild(1_040_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
