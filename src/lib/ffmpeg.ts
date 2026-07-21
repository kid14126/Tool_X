import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { ENCODE_PRESETS, X_MAX_DURATION_SEC } from "./presets";
import type { XPreset } from "./types";

const FFMPEG_BIN = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE_BIN = process.env.FFPROBE_PATH || "ffprobe";

export class FfmpegError extends Error {
  constructor(
    message: string,
    public readonly stderr?: string,
  ) {
    super(message);
    this.name = "FfmpegError";
  }
}

function run(
  bin: string,
  args: string[],
  timeoutMs = 300_000,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new FfmpegError("ffmpeg/ffprobe timeout."));
    }, timeoutMs);

    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new FfmpegError(
            `Không tìm thấy ${bin}. Cài ffmpeg hoặc chạy qua Docker (xem README).`,
          ),
        );
      } else {
        reject(err);
      }
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else {
        reject(
          new FfmpegError(
            `Encode thất bại (code ${code}).`,
            stderr.slice(-800),
          ),
        );
      }
    });
  });
}

export async function probeDurationSec(inputPath: string): Promise<number | null> {
  try {
    const { stdout } = await run(
      FFPROBE_BIN,
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        inputPath,
      ],
      30_000,
    );
    const n = parseFloat(stdout.trim());
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export async function probeVideoSize(
  inputPath: string,
): Promise<{ width: number; height: number } | null> {
  try {
    const { stdout } = await run(
      FFPROBE_BIN,
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "csv=p=0:s=x",
        inputPath,
      ],
      30_000,
    );
    const [w, h] = stdout.trim().split("x").map(Number);
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      return { width: w, height: h };
    }
    return null;
  } catch {
    return null;
  }
}

export async function convertForX(options: {
  inputPath: string;
  outputPath: string;
  preset: XPreset;
  trimTo140s: boolean;
}): Promise<{
  outputPath: string;
  duration: number | null;
  sizeBytes: number;
}> {
  const { inputPath, outputPath, preset, trimTo140s } = options;

  if (!fs.existsSync(inputPath)) {
    throw new FfmpegError("File input không tồn tại.");
  }

  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const encode = ENCODE_PRESETS[preset];
  const args: string[] = ["-y", "-i", inputPath];

  if (trimTo140s) {
    const duration = await probeDurationSec(inputPath);
    if (duration !== null && duration > X_MAX_DURATION_SEC) {
      args.push("-t", String(X_MAX_DURATION_SEC));
    }
  }

  if (encode.videoFilter) {
    args.push("-vf", encode.videoFilter);
  }

  // Social-friendly encode: H.264 High + yuv420p + faststart
  // CRF 23 quality, maxrate cap so short clips stay small for X upload
  args.push(
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-level",
    "4.1",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "medium",
    "-crf",
    "23",
  );

  if (encode.maxrate) {
    args.push("-maxrate", encode.maxrate);
  }
  if (encode.bufsize) {
    args.push("-bufsize", encode.bufsize);
  }

  args.push(
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    outputPath,
  );

  await run(FFMPEG_BIN, args, 600_000);

  if (!fs.existsSync(outputPath)) {
    throw new FfmpegError("Encode xong nhưng không thấy file output.");
  }

  const duration = await probeDurationSec(outputPath);
  const sizeBytes = fs.statSync(outputPath).size;
  return { outputPath, duration, sizeBytes };
}
