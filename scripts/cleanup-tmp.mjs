import fs from "fs";
import path from "path";

const ROOT = path.join(process.cwd(), "data", "jobs");
const TTL_MS = Number(process.env.CLEANUP_TTL_MS || 60 * 60 * 1000);

if (!fs.existsSync(ROOT)) {
  console.log("No jobs dir — nothing to clean.");
  process.exit(0);
}

const now = Date.now();
let removed = 0;

for (const name of fs.readdirSync(ROOT)) {
  const full = path.join(ROOT, name);
  try {
    const stat = fs.statSync(full);
    if (now - stat.mtimeMs > TTL_MS) {
      fs.rmSync(full, { recursive: true, force: true });
      removed += 1;
    }
  } catch (e) {
    console.warn("skip", full, e.message);
  }
}

console.log(`Removed ${removed} job folder(s) older than ${TTL_MS}ms.`);
