import { describe, expect, it } from "vitest";
import { parseVideoUrl } from "@/lib/url";

describe("parseVideoUrl", () => {
  it.each([
    ["https://www.youtube.com/watch?v=VTR8vxBFGDY", "youtube", "VTR8vxBFGDY"],
    ["https://youtube.com/watch?v=VTR8vxBFGDY&t=13s&si=abc", "youtube", "VTR8vxBFGDY"],
    ["https://m.youtube.com/watch?v=VTR8vxBFGDY", "youtube", "VTR8vxBFGDY"],
    ["https://www.youtube.com/shorts/s4na199iyag", "youtube", "s4na199iyag"],
    ["youtube.com/shorts/s4na199iyag?feature=share", "youtube", "s4na199iyag"],
    ["https://youtu.be/VTR8vxBFGDY?si=x", "youtube", "VTR8vxBFGDY"],
    ["  https://www.instagram.com/reel/DWZqrugEacU/  ", "instagram", "DWZqrugEacU"],
    ["https://www.instagram.com/reels/DWZqrugEacU/?igsh=abc", "instagram", "DWZqrugEacU"],
    ["https://instagram.com/p/DPeUV0GjQnF", "instagram", "DPeUV0GjQnF"],
    ["https://www.instagram.com/themodernnonna/reel/DPeUV0GjQnF/", "instagram", "DPeUV0GjQnF"],
  ])("accepts %s", (input, platform, videoId) => {
    const r = parseVideoUrl(input);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.platform).toBe(platform);
      expect(r.value.videoId).toBe(videoId);
      expect(r.value.key).toBe(`${platform}:${videoId}`);
    }
  });

  it("rebuilds the canonical URL instead of reusing the input", () => {
    const r = parseVideoUrl("http://m.youtube.com/watch?v=VTR8vxBFGDY&list=PLx&utm_source=evil");
    expect(r.ok && r.value.canonicalUrl).toBe("https://www.youtube.com/watch?v=VTR8vxBFGDY");
  });

  it.each([
    ["", "empty"],
    ["not a url at all", "invalid"],
    ["javascript:alert(1)", "invalid"],
    ["ftp://youtube.com/watch?v=VTR8vxBFGDY", "invalid"],
    ["https://user:pass@youtube.com/watch?v=VTR8vxBFGDY", "invalid"],
    ["https://youtube.com:8080/watch?v=VTR8vxBFGDY", "invalid"],
    ["https://www.tiktok.com/@x/video/123", "unsupported_site"],
    ["https://youtube.com.evil.example/watch?v=VTR8vxBFGDY", "unsupported_site"],
    ["https://www.youtube.com/@themodernnonna", "unsupported_path"],
    ["https://www.youtube.com/watch?v=short", "unsupported_path"],
    ["https://www.instagram.com/themodernnonna/", "unsupported_path"],
    ["https://www.instagram.com/reel/", "unsupported_path"],
    ["https://www.instagram.com/reel/bad$code/", "unsupported_path"],
  ])("rejects %j as %s", (input, error) => {
    const r = parseVideoUrl(input);
    expect(r).toEqual({ ok: false, error });
  });
});
