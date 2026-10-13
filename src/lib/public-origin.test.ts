import { afterEach, describe, expect, it } from "vitest";

import { publicOrigin } from "./public-origin";

const original = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = original;
});

describe("publicOrigin", () => {
  it("upgrades a public http origin to https", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://repeatgrow.com";
    expect(publicOrigin()).toBe("https://repeatgrow.com");
  });

  it("strips trailing slashes, paths and whitespace", () => {
    process.env.NEXT_PUBLIC_SITE_URL = " https://repeatgrow.com/ ";
    expect(publicOrigin()).toBe("https://repeatgrow.com");
  });

  it("keeps http for local development", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    expect(publicOrigin()).toBe("http://localhost:3000");
  });

  it("falls back to the site URL when unset or invalid", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(publicOrigin()).toBe("https://repeatgrow.com");
    process.env.NEXT_PUBLIC_SITE_URL = "not a url";
    expect(publicOrigin()).toBe("https://repeatgrow.com");
  });
});
