import { spawn, execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import type { AnalyzeResult, Platform } from "./types";
import { detectPlatform, normalizeVideoUrl, platformLabel } from "./url";
import { getCookiesPathIfPresent } from "./cookies";

const YTDLP_BIN = process.env.YTDLP_PATH || "yt-dlp";

export class YtDlpError extends Error {
  constructor(
    message: string,
    public readonly stderr?: string,
  ) {
    super(message);
    this.name = "YtDlpError";
  }
}

/** Resolve node.exe for TikTok JS challenge (required on recent yt-dlp). */
function resolveNodePath(): string | null {
  if (process.env.NODE_PATH_BIN && fs.existsSync(process.env.NODE_PATH_BIN)) {
    return process.env.NODE_PATH_BIN;
  }
  // Common Windows install
  const winDefault = "C:\\Program Files\\nodejs\\node.exe";
  if (process.platform === "win32" && fs.existsSync(winDefault)) {
    return winDefault;
  }
  try {
    const out = execFileSync(
      process.platform === "win32" ? "where" : "which",
      ["node"],
      { encoding: "utf8", windowsHide: true },
    );
    const first = out.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
    if (first && fs.existsSync(first)) return first;
  } catch {
    // ignore
  }
  // process.execPath is often the node running Next.js
  if (process.execPath && /node/i.test(process.execPath) && fs.existsSync(process.execPath)) {
    return process.execPath;
  }
  return null;
}

/**
 * yt-dlp may rewrite the cookie jar file. Work on a temp copy so the master
 * `data/cookies/cookies.txt` is not truncated/corrupted.
 */
function materializeCookiesForRun(): string | null {
  const master = process.env.YTDLP_COOKIES || getCookiesPathIfPresent();
  if (!master || !fs.existsSync(master)) return null;

  const tmpDir = path.join(path.dirname(master), "runtime");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const tmp = path.join(tmpDir, `cookies-${process.pid}-${Date.now()}.txt`);
  fs.copyFileSync(master, tmp);
  return tmp;
}

/**
 * Shared yt-dlp flags that make TikTok/IG/FB extraction more reliable.
 * - Node JS runtime: solves TikTok challenge / rehydration
 * - Cookies: preferred when present (real session beats TLS impersonate)
 * - Impersonate Chrome: only when NO cookies — combo cookies+impersonate often 403 on TikTok
 */
export function baseYtDlpArgs(): string[] {
  const args: string[] = ["--no-playlist", "--no-warnings"];

  const nodePath = resolveNodePath();
  if (nodePath) {
    args.push("--js-runtimes", `node:${nodePath}`);
  }

  // Optional: allow remote ejs scripts (harmless if unused)
  if (process.env.YTDLP_REMOTE_EJS !== "0") {
    args.push("--remote-components", "ejs:github");
  }

  const cookies = materializeCookiesForRun();
  const hasCookies = Boolean(cookies);

  if (hasCookies) {
    args.push("--cookies", cookies!);
  } else if (process.env.YTDLP_COOKIES_FROM_BROWSER) {
    // e.g. chrome | edge | firefox — browser must be closed on Windows
    args.push("--cookies-from-browser", process.env.YTDLP_COOKIES_FROM_BROWSER);
  }

  // Impersonate only without cookie jar — TikTok returns 403 if both are mixed
  const forceImpersonate = process.env.YTDLP_FORCE_IMPERSONATE === "1";
  const skipImpersonate = process.env.YTDLP_NO_IMPERSONATE === "1";
  if (!skipImpersonate && (forceImpersonate || !hasCookies)) {
    args.push("--impersonate", process.env.YTDLP_IMPERSONATE || "chrome");
  }

  return args;
}

function cleanupRuntimeCookies(args: string[]) {
  const idx = args.indexOf("--cookies");
  if (idx === -1) return;
  const file = args[idx + 1];
  if (!file) return;
  // Only delete temp copies under cookies/runtime/
  if (!file.replace(/\\/g, "/").includes("/cookies/runtime/")) return;
  try {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch {
    // ignore
  }
}

function run(
  args: string[],
  opts?: { cwd?: string; timeoutMs?: number; platform?: Platform },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(YTDLP_BIN, args, {
      cwd: opts?.cwd,
      windowsHide: true,
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";
    const timeout = opts?.timeoutMs ?? 120_000;

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      cleanupRuntimeCookies(args);
      reject(new YtDlpError("yt-dlp timeout — link quá chậm hoặc bị chặn."));
    }, timeout);

    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      cleanupRuntimeCookies(args);
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new YtDlpError(
            "Không tìm thấy yt-dlp. Cài đặt yt-dlp hoặc chạy qua Docker (xem README).",
          ),
        );
      } else {
        reject(err);
      }
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      cleanupRuntimeCookies(args);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const hint = classifyYtDlpError(stderr || stdout, opts?.platform);
        reject(new YtDlpError(hint, stderr || stdout));
      }
    });
  });
}

function classifyYtDlpError(text: string, platform?: Platform): string {
  const t = text.toLowerCase();
  const label = platform ? platformLabel(platform) : "Nền tảng";

  if (
    t.includes("unable to extract universal data for rehydration") ||
    t.includes("unable to extract webpage video data")
  ) {
    return (
      "TikTok chặn extract (rehydration). Tool đã bật Node + impersonate — " +
      "nếu vẫn lỗi, upload cookies TikTok (đăng nhập tiktok.com rồi xuất cookies.txt)."
    );
  }

  if (t.includes("your ip address is blocked") || t.includes("ip address is blocked")) {
    return (
      "TikTok chặn IP máy này. Cần cookies tài khoản TikTok đã đăng nhập: " +
      "xuất cookies.txt (extension Get cookies.txt LOCALLY) rồi upload trong Tool_X."
    );
  }

  if (
    t.includes("instagram") &&
    (t.includes("login") || t.includes("cookie") || t.includes("rate-limit") || t.includes("please wait"))
  ) {
    return (
      "Instagram yêu cầu đăng nhập / bị rate-limit. " +
      "Mở instagram.com (đã login) → export cookies.txt → Upload trong Tool_X."
    );
  }

  if (
    (t.includes("facebook") || t.includes("fb.com")) &&
    (t.includes("login") || t.includes("cookie") || t.includes("cannot parse") || t.includes("empty"))
  ) {
    return (
      "Facebook cần session đăng nhập. " +
      "Mở facebook.com (đã login) → export cookies.txt (gộp chung 1 file) → Upload."
    );
  }

  if (
    t.includes("private") ||
    t.includes("login required") ||
    t.includes("sign in") ||
    t.includes("cookies are needed") ||
    t.includes("requested content is not available")
  ) {
    return `${label}: video private / cần đăng nhập. Upload cookies Netscape (.txt) đã login.`;
  }

  if (t.includes("not available") || t.includes("unavailable") || t.includes("removed")) {
    return "Video không khả dụng hoặc đã bị gỡ.";
  }

  if (t.includes("unsupported url") || t.includes("no video formats") || t.includes("no video could be found")) {
    if (platform === "instagram") {
      return "Không lấy được video IG. Thử link /reel/… công khai + cookies đã login Instagram.";
    }
    if (platform === "facebook") {
      return "Không lấy được video FB. Thử link Reel/Watch công khai + cookies đã login Facebook.";
    }
    return "Không trích xuất được video từ URL này.";
  }

  if (t.includes("http error 403") || t.includes("forbidden") || (t.includes("blocked") && t.includes("403"))) {
    return `${label} trả 403. Upload cookies (đã login) hoặc thử lại sau / đổi mạng.`;
  }

  if (t.includes("http error 401") || t.includes("http error 429")) {
    return `${label} chặn tạm (401/429). Đợi vài phút hoặc refresh cookies mới.`;
  }

  // Strip long github boilerplate from raw yt-dlp errors
  const first =
    text
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith("File ") && !l.startsWith("ERROR: ")) ||
    text.split("\n").find((l) => l.includes("ERROR")) ||
    "yt-dlp thất bại.";

  const cleaned = first.replace(/^ERROR:\s*/i, "").slice(0, 320);
  return cleaned;
}

interface YtDlpInfo {
  id?: string;
  title?: string;
  description?: string;
  fulltitle?: string;
  uploader?: string;
  channel?: string;
  creator?: string;
  duration?: number;
  thumbnail?: string;
  thumbnails?: { url?: string }[];
  webpage_url?: string;
  original_url?: string;
}

function buildCaption(info: YtDlpInfo): string {
  const title = (info.title || info.fulltitle || "").trim();
  const description = (info.description || "").trim();

  if (title && description && description !== title) {
    if (description.startsWith(title) || title.length >= description.length) {
      return title;
    }
    return description.length > title.length ? description : title;
  }
  return title || description || "Video ngắn";
}

function mapInfo(info: YtDlpInfo, fallbackUrl: string): AnalyzeResult {
  const platform = detectPlatform(
    info.webpage_url || info.original_url || fallbackUrl,
  ) as Platform;
  const thumbnail =
    info.thumbnail ||
    info.thumbnails?.slice().reverse().find((t) => t.url)?.url ||
    null;

  return {
    platform: platform === "unknown" ? detectPlatform(fallbackUrl) : platform,
    id: info.id || "unknown",
    title: (info.title || info.fulltitle || "").trim() || "Không có tiêu đề",
    description: (info.description || "").trim(),
    uploader: (info.uploader || info.channel || info.creator || "").trim(),
    duration: typeof info.duration === "number" ? info.duration : null,
    thumbnail,
    webpageUrl: info.webpage_url || info.original_url || fallbackUrl,
    caption: buildCaption(info),
  };
}

type Strategy =
  | "auto"
  | "cookies"
  | "cookies_impersonate"
  | "impersonate"
  | "plain";

function strategyArgs(strategy: Strategy): string[] {
  const args: string[] = ["--no-playlist", "--no-warnings"];
  const nodePath = resolveNodePath();
  if (nodePath) {
    args.push("--js-runtimes", `node:${nodePath}`);
  }
  if (process.env.YTDLP_REMOTE_EJS !== "0") {
    args.push("--remote-components", "ejs:github");
  }

  if (strategy === "auto") {
    return baseYtDlpArgs();
  }

  const wantCookies =
    strategy === "cookies" || strategy === "cookies_impersonate";
  const wantImpersonate =
    strategy === "impersonate" || strategy === "cookies_impersonate";

  if (wantCookies) {
    const cookies = materializeCookiesForRun();
    if (cookies) args.push("--cookies", cookies);
  }

  if (wantImpersonate) {
    args.push("--impersonate", process.env.YTDLP_IMPERSONATE || "chrome");
  }

  return args;
}

/**
 * Platform-aware strategy order:
 * - TikTok: cookies alone first (cookies+impersonate often 403), then impersonate
 * - IG/FB: cookies first (almost always needed), then cookies+impersonate, then plain
 */
function buildStrategies(platform: Platform): Strategy[] {
  const hasCookies = Boolean(
    getCookiesPathIfPresent() || process.env.YTDLP_COOKIES,
  );

  if (platform === "instagram" || platform === "facebook") {
    if (hasCookies) {
      return ["cookies", "cookies_impersonate", "impersonate", "plain"];
    }
    // Without cookies IG/FB rarely work — still try
    return ["impersonate", "plain"];
  }

  // TikTok (and unknown)
  if (hasCookies) return ["cookies", "impersonate", "plain"];
  return ["impersonate", "plain"];
}

/** Format selection tuned per platform (yt-dlp names vary). */
function formatArgs(platform: Platform): string[] {
  // Prefer progressive mp4 when possible; fallback best video+audio merge
  if (platform === "instagram" || platform === "facebook") {
    return [
      "-f",
      "b[ext=mp4]/best[ext=mp4]/bv*+ba/b",
      "--merge-output-format",
      "mp4",
    ];
  }
  return ["-f", "bv*+ba/b", "--merge-output-format", "mp4"];
}

async function runWithStrategies(
  buildArgs: (base: string[]) => string[],
  timeoutMs: number,
  platform: Platform,
): Promise<{ stdout: string; stderr: string }> {
  const strategies = buildStrategies(platform);
  let lastErr: unknown;

  for (let i = 0; i < strategies.length; i++) {
    const strategy = strategies[i];
    const base = strategyArgs(strategy);
    // Skip cookie strategies if no jar available
    if (
      (strategy === "cookies" || strategy === "cookies_impersonate") &&
      !base.includes("--cookies")
    ) {
      continue;
    }
    try {
      return await run(buildArgs(base), { timeoutMs, platform });
    } catch (err) {
      lastErr = err;
      // brief backoff before next strategy (rate-limit / 403)
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  // Enrich final error if IG/FB without cookies
  if (
    (platform === "instagram" || platform === "facebook") &&
    !getCookiesPathIfPresent() &&
    !process.env.YTDLP_COOKIES
  ) {
    throw new YtDlpError(
      `${platformLabel(platform)} gần như luôn cần cookies đã login. ` +
        `Export cookies.txt từ ${platform === "instagram" ? "instagram.com" : "facebook.com"} rồi Upload trong Tool_X.`,
      lastErr instanceof YtDlpError ? lastErr.stderr : undefined,
    );
  }

  throw lastErr instanceof Error
    ? lastErr
    : new YtDlpError("Không tải được video sau mọi chiến lược.");
}

/** Metadata only — no media download. */
export async function analyzeUrl(url: string): Promise<AnalyzeResult> {
  const clean = normalizeVideoUrl(url);
  const platform = detectPlatform(clean);

  const { stdout } = await runWithStrategies(
    (base) => [...base, "--dump-single-json", "--skip-download", clean],
    90_000,
    platform,
  );

  let info: YtDlpInfo;
  try {
    info = JSON.parse(stdout) as YtDlpInfo;
  } catch {
    throw new YtDlpError("Không parse được metadata từ yt-dlp.");
  }

  return mapInfo(info, clean);
}

/**
 * Download best mp4-ish video into outDir.
 * Returns absolute path to the media file + analyze metadata.
 */
export async function downloadVideo(
  url: string,
  outDir: string,
): Promise<{ filePath: string; analyze: AnalyzeResult }> {
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const clean = normalizeVideoUrl(url);
  const platform = detectPlatform(clean);
  const outTemplate = path.join(outDir, "source.%(ext)s");

  await runWithStrategies(
    (base) => [
      ...base,
      "--write-info-json",
      ...formatArgs(platform),
      "-o",
      outTemplate,
      clean,
    ],
    300_000,
    platform,
  );

  const files = fs.readdirSync(outDir);
  const infoFile = files.find((f) => f.endsWith(".info.json"));
  let analyze: AnalyzeResult;

  if (infoFile) {
    const raw = JSON.parse(
      fs.readFileSync(path.join(outDir, infoFile), "utf8"),
    ) as YtDlpInfo;
    analyze = mapInfo(raw, clean);
  } else {
    analyze = await analyzeUrl(clean);
  }

  const media = files.find(
    (f) =>
      f.startsWith("source.") &&
      !f.endsWith(".info.json") &&
      !f.endsWith(".json") &&
      !f.endsWith(".part"),
  );

  if (!media) {
    throw new YtDlpError("Tải xong nhưng không thấy file video.");
  }

  return {
    filePath: path.join(outDir, media),
    analyze,
  };
}

export function ytdlpRuntimeInfo() {
  return {
    bin: YTDLP_BIN,
    node: resolveNodePath(),
    cookies: getCookiesPathIfPresent(),
    impersonate: process.env.YTDLP_IMPERSONATE || "chrome",
  };
}
