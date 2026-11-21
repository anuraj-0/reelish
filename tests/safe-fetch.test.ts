import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { checkUrl, guardedLookup, isPublicAddress, readLimited, robotsAllows, robotsRules, safeGet, SafeFetchError, type Transport } from "@/lib/sources/safe-fetch";

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1",
    "255.255.255.255", "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:169.254.169.254",
    "64:ff9b::7f00:1", "2002:7f00:1::", "2001:db8::1", "not-an-ip",
  ])("blocks %s", (ip) => expect(isPublicAddress(ip)).toBe(false));

  it.each(["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700::1111", "::ffff:8.8.8.8"])("allows %s", (ip) => expect(isPublicAddress(ip)).toBe(true));
});

describe("checkUrl", () => {
  it("upgrades http to https and drops the fragment", () => {
    expect(checkUrl("http://goo.gl/QuRCzK#x").toString()).toBe("https://goo.gl/QuRCzK");
  });
  it.each([
    ["ftp://example.com/a", "blocked_url"],
    ["file:///etc/passwd", "blocked_url"],
    ["https://user:pw@example.com/", "blocked_url"],
    ["https://example.com:8443/", "blocked_url"],
    ["https://localhost/", "blocked_url"],
    ["https://printer.local/", "blocked_url"],
    ["https://intranet/", "blocked_url"],
    ["https://127.0.0.1/", "blocked_address"],
    ["https://[::1]/", "blocked_address"],
    ["https://169.254.169.254/latest/meta-data/", "blocked_address"],
  ])("rejects %s", (url, kind) => {
    expect(() => checkUrl(url)).toThrow(SafeFetchError);
    try {
      checkUrl(url);
    } catch (e) {
      expect((e as SafeFetchError).kind).toBe(kind);
    }
  });
});

describe("guardedLookup", () => {
  const fakeResolve = (addresses: { address: string; family: number }[]) =>
    ((_host: string, _opts: unknown, cb: (err: null, a: typeof addresses) => void) => cb(null, addresses)) as never;

  it("refuses a name that resolves to a private address (DNS rebinding)", async () => {
    const err = await new Promise<NodeJS.ErrnoException | null>((resolve) =>
      guardedLookup("evil.example", {}, (e) => resolve(e), fakeResolve([{ address: "10.0.0.5", family: 4 }])),
    );
    expect(err?.code).toBe("EBLOCKED");
  });

  it("refuses when any one of several addresses is private", async () => {
    const err = await new Promise<NodeJS.ErrnoException | null>((resolve) =>
      guardedLookup("mixed.example", { all: true }, (e) => resolve(e), fakeResolve([{ address: "93.184.216.34", family: 4 }, { address: "127.0.0.1", family: 4 }])),
    );
    expect(err?.code).toBe("EBLOCKED");
  });

  it("passes public addresses through in both callback styles", async () => {
    const single = await new Promise<unknown>((resolve) => guardedLookup("ok.example", {}, (_e, a) => resolve(a), fakeResolve([{ address: "93.184.216.34", family: 4 }])));
    expect(single).toBe("93.184.216.34");
    const all = await new Promise<unknown>((resolve) => guardedLookup("ok.example", { all: true }, (_e, a) => resolve(a), fakeResolve([{ address: "93.184.216.34", family: 4 }])));
    expect(all).toEqual([{ address: "93.184.216.34", family: 4 }]);
  });
});

describe("safeGet redirects and responses", () => {
  const html = { "content-type": "text/html; charset=utf-8" };
  const transportFor = (routes: Record<string, { status: number; headers?: Record<string, string>; body?: string }>): Transport & { calls: string[] } => {
    const calls: string[] = [];
    const t = (async (url: URL) => {
      calls.push(url.toString());
      const r = routes[url.toString()];
      if (!r) throw new Error(`unexpected ${url}`);
      return { status: r.status, headers: r.headers ?? {}, body: r.body ?? "", truncated: false };
    }) as unknown as Transport & { calls: string[] };
    t.calls = calls;
    return t;
  };

  it("follows a shortener redirect and re-checks the target", async () => {
    const t = transportFor({
      "https://goo.gl/abc": { status: 301, headers: { location: "https://www.jamieoliver.com/recipes/carbonara/" } },
      "https://www.jamieoliver.com/recipes/carbonara/": { status: 200, headers: html, body: "<html>ok</html>" },
    });
    const res = await safeGet("http://goo.gl/abc", { accept: "text/html", maxBytes: 1000, timeoutMs: 1000 }, t);
    expect(res.url).toBe("https://www.jamieoliver.com/recipes/carbonara/");
    expect(res.redirects).toEqual(["https://www.jamieoliver.com/recipes/carbonara/"]);
  });

  it("refuses a redirect into a private network", async () => {
    const t = transportFor({ "https://short.example/x": { status: 302, headers: { location: "https://169.254.169.254/latest/meta-data/" } } });
    await expect(safeGet("https://short.example/x", { accept: "text/html", maxBytes: 1000, timeoutMs: 1000 }, t)).rejects.toMatchObject({ kind: "blocked_address" });
  });

  it("refuses a redirect to another scheme or port", async () => {
    const t = transportFor({ "https://a.example/": { status: 302, headers: { location: "https://a.example:2375/" } } });
    await expect(safeGet("https://a.example/", { accept: "text/html", maxBytes: 1000, timeoutMs: 1000 }, t)).rejects.toMatchObject({ kind: "blocked_url" });
  });

  it("stops after 3 redirects", async () => {
    const t = transportFor({
      "https://a.example/1": { status: 302, headers: { location: "/2" } },
      "https://a.example/2": { status: 302, headers: { location: "/3" } },
      "https://a.example/3": { status: 302, headers: { location: "/4" } },
      "https://a.example/4": { status: 302, headers: { location: "/5" } },
    });
    await expect(safeGet("https://a.example/1", { accept: "text/html", maxBytes: 1000, timeoutMs: 1000 }, t)).rejects.toMatchObject({ kind: "too_many_redirects" });
    expect(t.calls).toHaveLength(4);
  });

  it("rejects non-HTML responses and HTTP errors", async () => {
    const t = transportFor({
      "https://a.example/pdf": { status: 200, headers: { "content-type": "application/pdf" } },
      "https://a.example/gone": { status: 404, headers: html },
    });
    await expect(safeGet("https://a.example/pdf", { accept: "text/html", maxBytes: 1000, timeoutMs: 1000 }, t)).rejects.toMatchObject({ kind: "wrong_type" });
    await expect(safeGet("https://a.example/gone", { accept: "text/html", maxBytes: 1000, timeoutMs: 1000 }, t)).rejects.toMatchObject({ kind: "http_error", status: 404 });
  });
});

describe("readLimited", () => {
  it("caps the body and reports truncation", async () => {
    const stream = Readable.from([Buffer.alloc(600, "a"), Buffer.alloc(600, "b")]);
    const { text, truncated } = await readLimited(stream, 1000);
    expect(text.length).toBe(1000);
    expect(truncated).toBe(true);
  });
  it("returns small bodies whole", async () => {
    expect(await readLimited(Readable.from([Buffer.from("hello")]), 1000)).toEqual({ text: "hello", truncated: false });
  });
});

describe("robots.txt", () => {
  const txt = `
User-agent: GPTBot
Disallow: /

User-agent: *
Disallow: /wp-admin/
Allow: /wp-admin/admin-ajax.php
Disallow: /*?print=

User-agent: ReelishBot
User-agent: OtherBot
Disallow: /private/
`;
  it("uses the group naming our bot over the wildcard group", () => {
    const rules = robotsRules(txt);
    expect(robotsAllows(rules, "/private/x")).toBe(false);
    expect(robotsAllows(rules, "/wp-admin/")).toBe(true);
  });
  it("applies the wildcard group, longest match and wildcards", () => {
    const rules = robotsRules(txt, "somebot");
    expect(robotsAllows(rules, "/creamy-soup/")).toBe(true);
    expect(robotsAllows(rules, "/wp-admin/options.php")).toBe(false);
    expect(robotsAllows(rules, "/wp-admin/admin-ajax.php")).toBe(true);
    expect(robotsAllows(rules, "/soup/?print=1")).toBe(false);
  });
  it("treats 'Disallow:' with no path as allow-all, and a blanket ban as a ban", () => {
    expect(robotsAllows(robotsRules("User-agent: *\nDisallow:"), "/anything")).toBe(true);
    expect(robotsAllows(robotsRules("User-agent: *\nDisallow: /"), "/anything")).toBe(false);
  });
  it("doesn't treat a group for a different bot as ours", () => {
    expect(robotsAllows(robotsRules("User-agent: bot\nDisallow: /"), "/x")).toBe(true);
  });
});
