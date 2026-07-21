import fs from "fs";
import path from "path";

// Scope data under ./data only; ignore comment keeps NFT from tracing whole tree
export const DATA_ROOT = path.join(/* turbopackIgnore: true */ process.cwd(), "data");
export const TMP_ROOT = path.join(DATA_ROOT, "tmp");
export const JOBS_ROOT = path.join(DATA_ROOT, "jobs");

export function ensureDirs() {
  for (const dir of [DATA_ROOT, TMP_ROOT, JOBS_ROOT]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export function jobDir(jobId: string) {
  return path.join(JOBS_ROOT, jobId);
}

/** Delete job folders older than ttlMs (default 1 hour). */
export function cleanupOldJobs(ttlMs = 60 * 60 * 1000) {
  ensureDirs();
  const now = Date.now();
  if (!fs.existsSync(JOBS_ROOT)) return;

  for (const name of fs.readdirSync(JOBS_ROOT)) {
    const full = path.join(JOBS_ROOT, name);
    try {
      const stat = fs.statSync(full);
      if (now - stat.mtimeMs > ttlMs) {
        fs.rmSync(full, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  }
}
