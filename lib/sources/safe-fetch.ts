import "server-only";
import dns from "node:dns";
import https from "node:https";
import net from "node:net";
import type { IncomingMessage } from "node:http";
import type { Readable } from "node:stream";
import zlib from "node:zlib";

/**
 * Fetching pages whose URLs come from video descriptions (untrusted input). Guards:
 * - https only (http links are upgraded), default port, no credentials in the URL;
 * - every connection's resolved IP must be public; checked inside the socket's DNS lookup,
 *   so a hostname can't pass the check and then resolve somewhere private (DNS rebinding);
 * - redirects followed manually, at most 3, each hop re-checked;
 * - size cap on the decoded body (also protects against compression bombs), content-type check,
 *   per-request timeout.
 */

export const USER_AGENT = "Mozilla/5.0 (compatible; ReelishBot/0.1; reads recipe metadata from links in video descriptions)";
export const ROBOTS_TOKEN = "reelishbot";

export type FetchFailure =
  | "blocked_url" // not https-able, credentials, port, private address
  | "blocked_address"
  | "too_many_redirects"
  | "http_error"
  | "wrong_type"
  | "timeout"
  | "network"
  | "robots_disallowed";

export class SafeFetchError extends Error {
  constructor(
    readonly kind: FetchFailure,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SafeFetchError";
  }
}

// ---- Address checks -----------------------------------------------------------------------

const BLOCKED = new net.BlockList();
for (const [addr, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) BLOCKED.addSubnet(addr, prefix, "ipv4");
for (const [addr, prefix] of [
  ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64], ["2001::", 23], ["2001:db8::", 32],
  ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as const) BLOCKED.addSubnet(addr, prefix, "ipv6");

/** True only for globally routable unicast addresses. */
export function isPublicAddress(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return !BLOCKED.check(ip, "ipv4");
  if (family === 6) {
    const lower = ip.toLowerCase();
    // IPv4-mapped (::ffff:a.b.c.d or ::ffff:7f00:1): judge the embedded IPv4 address.
    const mapped = lower.match(/^::ffff:(?:0:)?(.+)$/);
    if (mapped) {
      const tail = mapped[1];
      if (net.isIPv4(tail)) return isPublicAddress(tail);
      const hex = tail.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
      if (!hex) return false;
      const n = (parseInt(hex[1], 16) << 16) | parseInt(hex[2], 16);
      return isPublicAddress([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join("."));
    }
    return !BLOCKED.check(lower, "ipv6");
  }
  return false;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

/** A drop-in for dns.lookup that refuses names resolving to any non-public address. */
export function guardedLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback, resolve = dns.lookup) {
  resolve(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "");
    const list = addresses as dns.LookupAddress[];
    const bad = list.find((a) => !isPublicAddress(a.address));
    if (!list.length || bad) {
      const e = new Error(`blocked address for ${hostname}`) as NodeJS.ErrnoException;
      e.code = "EBLOCKED";
      return callback(e, "");
    }
    if (options.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

/** Normalises a candidate URL or explains why we won't fetch it. */
export function checkUrl(input: string | URL): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new SafeFetchError("blocked_url", "not a URL");
  }
  if (url.protocol === "http:") url.protocol = "https:"; // we only ever speak https
  if (url.protocol !== "https:") throw new SafeFetchError("blocked_url", `scheme ${url.protocol}`);
  if (url.username || url.password) throw new SafeFetchError("blocked_url", "credentials in URL");
  if (url.port && url.port !== "443") throw new SafeFetchError("blocked_url", `port ${url.port}`);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) && !isPublicAddress(host)) throw new SafeFetchError("blocked_address", "private address literal");
  if (!net.isIP(host) && (!host.includes(".") || /\.(local|localhost|internal|lan|home|corp)$/i.test(host) || host === "localhost")) {
    throw new SafeFetchError("blocked_url", "non-public hostname");
  }
  url.hash = "";
  return url;
}

// ---- Body reading -------------------------------------------------------------------------

/** Reads at most maxBytes from a stream; anything beyond is dropped and the stream destroyed. */
export async function readLimited(stream: Readable, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
  const chunks: Buffer[] = [];
  let size = 0;
  let truncated = false;
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (size + buf.length > maxBytes) {
      chunks.push(buf.subarray(0, maxBytes - size));
      size = maxBytes;
      truncated = true;
      stream.destroy();
      break;
    }
    chunks.push(buf);
    size += buf.length;
  }
  return { text: Buffer.concat(chunks).toString("utf8"), truncated };
}

function decoded(res: IncomingMessage): Readable {
  const encoding = String(res.headers["content-encoding"] ?? "").toLowerCase();
  if (encoding === "gzip" || encoding === "x-gzip") return res.pipe(zlib.createGunzip());
  if (encoding === "deflate") return res.pipe(zlib.createInflate());
  if (encoding === "br") return res.pipe(zlib.createBrotliDecompress());
  return res;
}

// ---- Transport (injectable for tests) -------------------------------------------------------

export type RawResponse = { status: number; headers: Record<string, string | undefined>; body: string; truncated: boolean };
export type Transport = (url: URL, opts: { accept: string; maxBytes: number; timeoutMs: number; signal?: AbortSignal }) => Promise<RawResponse>;

export const httpsTransport: Transport = (url, opts) =>
  new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "GET",
        lookup: guardedLookup as unknown as typeof dns.lookup,
        headers: { "User-Agent": USER_AGENT, Accept: opts.accept, "Accept-Language": "en", "Accept-Encoding": "gzip, deflate, br" },
        timeout: opts.timeoutMs,
        signal: opts.signal,
      },
      (res) => {
        const headers: Record<string, string | undefined> = {};
        for (const [k, v] of Object.entries(res.headers)) headers[k] = Array.isArray(v) ? v.join(", ") : v;
        const status = res.statusCode ?? 0;
        // Don't download bodies we won't use.
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, headers, body: "", truncated: false });
        }
        readLimited(decoded(res), opts.maxBytes).then(({ text, truncated }) => resolve({ status, headers, body: text, truncated }), reject);
      },
    );
    req.on("timeout", () => req.destroy(new SafeFetchError("timeout", "timed out")));
    req.on("error", (e: NodeJS.ErrnoException) => {
      if (e instanceof SafeFetchError) return reject(e);
      if (e.code === "EBLOCKED") return reject(new SafeFetchError("blocked_address", e.message));
      if (e.name === "AbortError") return reject(new SafeFetchError("timeout", "aborted"));
      reject(new SafeFetchError("network", e.code ?? e.message));
    });
    req.end();
  });

export type SafeResponse = { url: string; status: number; contentType: string; body: string; truncated: boolean; redirects: string[] };

export async function safeGet(
  input: string,
  opts: { accept: "text/html" | "text/plain"; maxBytes: number; timeoutMs: number; maxRedirects?: number; signal?: AbortSignal },
  transport: Transport = httpsTransport,
): Promise<SafeResponse> {
  const maxRedirects = opts.maxRedirects ?? 3;
  const redirects: string[] = [];
  let url = checkUrl(input);
  for (let hop = 0; ; hop++) {
    const accept = opts.accept === "text/html" ? "text/html,application/xhtml+xml;q=0.9" : "text/plain";
    const res = await transport(url, { accept, maxBytes: opts.maxBytes, timeoutMs: opts.timeoutMs, signal: opts.signal });
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      if (hop >= maxRedirects) throw new SafeFetchError("too_many_redirects", `more than ${maxRedirects} redirects`);
      url = checkUrl(new URL(res.headers.location, url));
      redirects.push(url.toString());
      continue;
    }
    if (res.status !== 200) throw new SafeFetchError("http_error", `HTTP ${res.status}`, res.status);
    const contentType = (res.headers["content-type"] ?? "").toLowerCase();
    const okType = opts.accept === "text/html" ? /text\/html|application\/xhtml\+xml/.test(contentType) : /text\/plain/.test(contentType) || contentType === "";
    if (!okType) throw new SafeFetchError("wrong_type", `content-type ${contentType || "missing"}`);
    return { url: url.toString(), status: res.status, contentType, body: res.body, truncated: res.truncated, redirects };
  }
}

// ---- robots.txt ---------------------------------------------------------------------------

type Rule = { allow: boolean; path: string };

/** Rules that apply to us: the group naming our token, else the "*" group. */
export function robotsRules(text: string, token = ROBOTS_TOKEN): Rule[] {
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === "user-agent") {
      if (!current || !lastWasAgent) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((field === "allow" || field === "disallow") && current) {
      lastWasAgent = false;
      if (field === "disallow" && value === "") continue; // "Disallow:" with nothing = allow all
      current.rules.push({ allow: field === "allow", path: value });
    } else {
      lastWasAgent = false;
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a.replace(/\/.*$/, "") === token));
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  return chosen.flatMap((g) => g.rules);
}

function ruleMatches(rulePath: string, path: string): boolean {
  const anchored = rulePath.endsWith("$");
  const pattern = (anchored ? rulePath.slice(0, -1) : rulePath)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${pattern}${anchored ? "$" : ""}`).test(path);
}

/** Longest matching rule wins; Allow wins ties (RFC 9309). */
export function robotsAllows(rules: Rule[], pathAndQuery: string): boolean {
  let best: Rule | null = null;
  for (const rule of rules) {
    if (!ruleMatches(rule.path, pathAndQuery)) continue;
    if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow)) best = rule;
  }
  return best ? best.allow : true;
}
