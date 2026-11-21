import { createMockJob } from "@/lib/jobs/mock";
import { CreateJobInput } from "@/lib/jobs/types";
import { parseVideoUrl } from "@/lib/url";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  const input = CreateJobInput.safeParse(body);
  if (!input.success) return Response.json({ error: "invalid" }, { status: 400 });

  const parsed = parseVideoUrl(input.data.url);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  // M1: simulated job over saved recipes. M2 swaps in the persisted queue.
  const jobId = createMockJob(parsed.value);
  return Response.json({ jobId }, { status: 202 });
}
