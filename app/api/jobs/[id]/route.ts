import { getMockJob } from "@/lib/jobs/mock";

export async function GET(_request: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  const { id } = await ctx.params;
  const job = getMockJob(id);
  if (!job) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(job, { headers: { "Cache-Control": "no-store" } });
}
