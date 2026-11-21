import { getJobStatus } from "@/lib/jobs/service";

export async function GET(_request: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "not_found" }, { status: 404 });
  const job = getJobStatus(id);
  if (!job) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(job, { headers: { "Cache-Control": "no-store" } });
}
