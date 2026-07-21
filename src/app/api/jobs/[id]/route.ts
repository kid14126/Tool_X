import { getPublicJob } from "@/lib/jobs";
import { jsonWithCors, optionsCors } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(req: Request) {
  return optionsCors(req);
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const job = getPublicJob(id);
  if (!job) {
    return jsonWithCors({ error: "Không tìm thấy job" }, { status: 404, req });
  }
  return jsonWithCors(job, { req });
}
