import { createJob, getPublicJob } from "@/lib/jobs";
import type { CreateJobBody } from "@/lib/types";
import { jsonWithCors, optionsCors } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function OPTIONS(req: Request) {
  return optionsCors(req);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreateJobBody;
    const job = createJob(body);
    return jsonWithCors(getPublicJob(job.id), { status: 201, req });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Không tạo được job";
    return jsonWithCors({ error: message }, { status: 400, req });
  }
}
