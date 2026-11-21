import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { openDb, setDbForTests } from "@/lib/db";
import { resetEnvForTests } from "@/lib/env";
import { POST } from "@/app/start/route";

beforeEach(() => {
  vi.stubEnv("REELISH_PIPELINE", "fixtures");
  resetEnvForTests();
  setDbForTests(openDb(":memory:"));
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvForTests();
  setDbForTests(undefined);
});

const post = (url: string) =>
  POST(new Request("http://localhost:3000/start", { method: "POST", body: new URLSearchParams({ url }), headers: { host: "reelish.example" } }));

it("redirects with a relative Location, so it works behind a proxy on any public host", async () => {
  const res = await post("https://www.youtube.com/shorts/VTR8vxBFGDY");
  expect(res.status).toBe(303);
  expect(res.headers.get("location")).toMatch(/^\/jobs\/[0-9a-f-]{36}$/);
});

it("sends invalid links back to the home page", async () => {
  const res = await post("not a link");
  expect(res.status).toBe(303);
  expect(res.headers.get("location")).toBe("/");
});
