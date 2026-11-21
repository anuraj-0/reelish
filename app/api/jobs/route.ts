import { clientHash, startJob } from "@/lib/jobs/service";
import { CreateJobInput } from "@/lib/jobs/types";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  const input = CreateJobInput.safeParse(body);
  if (!input.success) return Response.json({ error: "invalid" }, { status: 400 });

  // Creates (or joins) a persisted job and returns at once; the worker does the processing.
  const result = startJob(input.data.url, clientHash(request.headers));
  return Response.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
