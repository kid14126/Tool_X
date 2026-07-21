import fs from "fs";
import { resolveDownloadPath } from "@/lib/jobs";
import { fileWithCors, jsonWithCors, optionsCors } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function OPTIONS(req: Request) {
  return optionsCors(req);
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind") === "caption" ? "caption" : "video";

  const resolved = resolveDownloadPath(id, kind);
  if (!resolved) {
    return jsonWithCors(
      { error: "File chưa sẵn sàng hoặc job không tồn tại" },
      { status: 404, req },
    );
  }

  const data = fs.readFileSync(resolved.filePath);
  return fileWithCors(data, {
    req,
    headers: {
      "Content-Type": resolved.contentType,
      "Content-Disposition": `attachment; filename="${resolved.filename}"`,
      "Content-Length": String(data.length),
      "Cache-Control": "no-store",
    },
  });
}
