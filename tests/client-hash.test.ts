import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "@/lib/db";
import { resetEnvForTests } from "@/lib/env";
import { clientHash } from "@/lib/jobs/service";

let db: Db;
const h = (init: Record<string, string>) => clientHash(new Headers(init), db);

beforeEach(() => {
  db = openDb(":memory:");
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvForTests();
});

describe("clientHash behind our proxy (TRUST_PROXY=true)", () => {
  beforeEach(() => {
    vi.stubEnv("TRUST_PROXY", "true");
    resetEnvForTests();
  });

  it("uses X-Real-IP, which Nginx sets to the connecting address", () => {
    expect(h({ "x-real-ip": "203.0.113.7" })).toBe(h({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1, 203.0.113.7" }));
    expect(h({ "x-real-ip": "203.0.113.7" })).not.toBe(h({ "x-real-ip": "203.0.113.8" }));
  });

  it("can't be dodged by forging the first X-Forwarded-For entry", () => {
    const real = "203.0.113.7";
    expect(h({ "x-forwarded-for": `9.9.9.1, ${real}` })).toBe(h({ "x-forwarded-for": `9.9.9.2, ${real}` }));
    expect(h({ "x-forwarded-for": real })).toBe(h({ "x-forwarded-for": `9.9.9.1, ${real}` }));
  });
});

it("ignores forwarding headers unless the proxy is trusted", () => {
  vi.stubEnv("TRUST_PROXY", "false");
  resetEnvForTests();
  expect(h({ "x-real-ip": "203.0.113.7" })).toBe(h({ "x-real-ip": "198.51.100.1" }));
});
