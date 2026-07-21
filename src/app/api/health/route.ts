import { spawn } from "child_process";
import { cookiesStatus } from "@/lib/cookies";
import { ytdlpRuntimeInfo } from "@/lib/ytdlp";
import { jsonWithCors, optionsCors } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function which(bin: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { windowsHide: true });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

export async function OPTIONS(req: Request) {
  return optionsCors(req);
}

export async function GET(req: Request) {
  const [ytdlp, ffmpeg] = await Promise.all([
    which(process.env.YTDLP_PATH || "yt-dlp", ["--version"]),
    which(process.env.FFMPEG_PATH || "ffmpeg", ["-version"]),
  ]);

  const runtime = ytdlpRuntimeInfo();
  const cookies = cookiesStatus();
  const vercel = Boolean(process.env.VERCEL);

  return jsonWithCors(
    {
      ok: ytdlp && ffmpeg,
      ytdlp,
      ffmpeg,
      node: Boolean(runtime.node),
      nodePath: runtime.node,
      cookies: cookies.present,
      cookiesSize: cookies.size,
      impersonate: runtime.impersonate,
      vercel,
      /**
       * On Vercel serverless there is no system yt-dlp/ffmpeg.
       * UI should set NEXT_PUBLIC_API_URL to a Docker worker.
       */
      hint:
        vercel && !(ytdlp && ffmpeg)
          ? "Vercel không chạy yt-dlp/ffmpeg. Trỏ NEXT_PUBLIC_API_URL tới worker Docker (Railway/Fly/VPS)."
          : undefined,
    },
    { req },
  );
}
