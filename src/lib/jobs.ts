import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { CreateJobBody, JobRecord, JobStatus, XPreset } from "./types";
import { ensureDirs, jobDir, cleanupOldJobs } from "./paths";
import { validateVideoUrl } from "./url";
import { downloadVideo } from "./ytdlp";
import { convertForX } from "./ffmpeg";

const jobs = new Map<string, JobRecord>();
let processing = false;
const queue: string[] = [];

function touch(job: JobRecord, patch: Partial<JobRecord>) {
  const next = { ...job, ...patch, updatedAt: Date.now() };
  jobs.set(job.id, next);
  persistMeta(next);
  return next;
}

function persistMeta(job: JobRecord) {
  try {
    const dir = jobDir(job.id);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safe = { ...job };
    fs.writeFileSync(
      path.join(dir, "job.json"),
      JSON.stringify(safe, null, 2),
      "utf8",
    );
  } catch {
    // non-fatal
  }
}

function publicJob(job: JobRecord) {
  // Don't leak filesystem paths to client
  const {
    inputPath: _i,
    outputPath: _o,
    ...rest
  } = job;
  return rest;
}

export function getJob(id: string) {
  return jobs.get(id) ?? null;
}

export function getPublicJob(id: string) {
  const job = jobs.get(id);
  return job ? publicJob(job) : null;
}

export function createJob(body: CreateJobBody): JobRecord {
  ensureDirs();
  cleanupOldJobs();

  const check = validateVideoUrl(body.url);
  if (!check.ok || !check.url) {
    throw new Error(check.error || "URL không hợp lệ");
  }

  const preset: XPreset = body.preset || "vertical";
  const allowed: XPreset[] = ["vertical", "square", "landscape", "keep"];
  if (!allowed.includes(preset)) {
    throw new Error("Preset không hợp lệ");
  }

  const id = randomUUID();
  const now = Date.now();
  const job: JobRecord = {
    id,
    url: check.url,
    preset,
    trimTo140s: body.trimTo140s !== false,
    status: "queued",
    progress: 0,
    message: "Đang chờ xử lý…",
    createdAt: now,
    updatedAt: now,
  };

  jobs.set(id, job);
  persistMeta(job);
  queue.push(id);
  void pump();

  return job;
}

function setStatus(
  id: string,
  status: JobStatus,
  progress: number,
  message: string,
  extra?: Partial<JobRecord>,
) {
  const job = jobs.get(id);
  if (!job) return;
  touch(job, { status, progress, message, ...extra });
}

async function runJob(id: string) {
  const job = jobs.get(id);
  if (!job) return;

  const dir = jobDir(id);
  fs.mkdirSync(dir, { recursive: true });

  try {
    setStatus(id, "downloading", 10, "Đang tải video & tiêu đề…");
    const { filePath, analyze } = await downloadVideo(job.url, dir);

    const caption = analyze.caption;
    setStatus(id, "downloading", 45, "Tải xong — chuẩn bị convert…", {
      analyze,
      caption,
      inputPath: filePath,
    });

    const outputFilename = `toolx_${analyze.platform}_${analyze.id || id.slice(0, 8)}.mp4`;
    const outputPath = path.join(dir, outputFilename);

    setStatus(id, "converting", 55, "Đang convert chuẩn X (H.264/AAC)…");
    const converted = await convertForX({
      inputPath: filePath,
      outputPath,
      preset: job.preset,
      trimTo140s: job.trimTo140s,
    });

    // Optional: write caption.txt
    fs.writeFileSync(path.join(dir, "caption.txt"), caption, "utf8");

    setStatus(id, "done", 100, "Sẵn sàng tải về", {
      outputPath,
      outputFilename,
      outputSizeBytes: converted.sizeBytes,
      caption,
      analyze,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Lỗi không xác định khi xử lý job.";
    setStatus(id, "error", 0, "Thất bại", { error: message });
  }
}

async function pump() {
  if (processing) return;
  const next = queue.shift();
  if (!next) return;
  processing = true;
  try {
    await runJob(next);
  } finally {
    processing = false;
    if (queue.length) void pump();
  }
}

export function resolveDownloadPath(
  jobId: string,
  kind: "video" | "caption",
): { filePath: string; filename: string; contentType: string } | null {
  const job = jobs.get(jobId);
  if (!job || job.status !== "done") return null;

  const dir = jobDir(jobId);

  if (kind === "video") {
    const filename = job.outputFilename || "output.mp4";
    const filePath = job.outputPath || path.join(dir, filename);
    if (!fs.existsSync(filePath)) return null;
    return {
      filePath,
      filename,
      contentType: "video/mp4",
    };
  }

  const captionPath = path.join(dir, "caption.txt");
  if (!fs.existsSync(captionPath)) return null;
  return {
    filePath: captionPath,
    filename: "caption.txt",
    contentType: "text/plain; charset=utf-8",
  };
}
