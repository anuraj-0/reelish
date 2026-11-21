import { describe, expect, it } from "vitest";
import { createMockJob, DEMO_UNAVAILABLE_ID, getMockJob } from "@/lib/jobs/mock";
import { parseVideoUrl } from "@/lib/url";

const parsed = (url: string) => {
  const r = parseVideoUrl(url);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe("mock jobs", () => {
  it("never reports a stage as done before its time, and succeeds with the fixture id", () => {
    const id = createMockJob(parsed("https://www.youtube.com/shorts/VTR8vxBFGDY"));
    const t0 = Date.parse(getMockJob(id)!.startedAt);

    const early = getMockJob(id, t0 + 100)!;
    expect(early.status).toBe("running");
    expect(early.stages.map((s) => s.state)).toEqual(["active", "pending", "pending", "pending"]);
    expect(early.recipeId).toBeNull();

    const mid = getMockJob(id, t0 + 2000)!; // metadata ends at 1.2 s, linked_recipe at 2.8 s
    expect(mid.stages.map((s) => s.state)).toEqual(["done", "active", "pending", "pending"]);

    const done = getMockJob(id, t0 + 60_000)!;
    expect(done.status).toBe("succeeded");
    expect(done.stages.every((s) => s.state === "done")).toBe(true);
    expect(done.recipeId).toBe("yt-VTR8vxBFGDY");
  });

  it("fails at the first stage for the private-video demo and leaves later stages pending", () => {
    const id = createMockJob(parsed(`https://www.youtube.com/watch?v=${DEMO_UNAVAILABLE_ID}`));
    const t0 = Date.parse(getMockJob(id)!.startedAt);
    const job = getMockJob(id, t0 + 5000)!;
    expect(job.status).toBe("failed");
    expect(job.error).toBe("unavailable");
    expect(job.stages.map((s) => s.state)).toEqual(["failed", "pending", "pending", "pending"]);
    expect(job.recipeId).toBeNull();
  });

  it("is honest that unknown videos can't be processed in the preview", () => {
    const id = createMockJob(parsed("https://www.instagram.com/reel/SomeOtherReel1/"));
    const t0 = Date.parse(getMockJob(id)!.startedAt);
    expect(getMockJob(id, t0 + 5000)).toMatchObject({ status: "failed", error: "preview_only" });
  });

  it("returns null for unknown job ids", () => {
    expect(getMockJob("nope")).toBeNull();
  });
});
