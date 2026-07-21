import { validateVideoUrl } from "@/lib/url";
import { analyzeUrl, YtDlpError } from "@/lib/ytdlp";
import { cleanupOldJobs, ensureDirs } from "@/lib/paths";
import { jsonWithCors, optionsCors } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function OPTIONS(req: Request) {
  return optionsCors(req);
}

export async function POST(req: Request) {
  try {
    ensureDirs();
    cleanupOldJobs();

    const body = (await req.json()) as { url?: string };
    const check = validateVideoUrl(body.url || "");
    if (!check.ok || !check.url) {
      return jsonWithCors({ error: check.error }, { status: 400, req });
    }

    const result = await analyzeUrl(check.url);
    return jsonWithCors(result, { req });
  } catch (err) {
    const message =
      err instanceof YtDlpError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Phân tích thất bại";
    return jsonWithCors({ error: message }, { status: 502, req });
  }
}
