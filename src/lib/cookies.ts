import fs from "fs";
import path from "path";
import { DATA_ROOT, ensureDirs } from "./paths";

export const COOKIES_DIR = path.join(DATA_ROOT, "cookies");

/** Shared Netscape cookies file used by yt-dlp for all platforms. */
export const COOKIES_FILE = path.join(COOKIES_DIR, "cookies.txt");

export function ensureCookiesDir() {
  ensureDirs();
  if (!fs.existsSync(COOKIES_DIR)) {
    fs.mkdirSync(COOKIES_DIR, { recursive: true });
  }
}

export function cookiesStatus(): {
  present: boolean;
  path: string;
  size: number;
  updatedAt: number | null;
} {
  ensureCookiesDir();
  if (!fs.existsSync(COOKIES_FILE)) {
    return { present: false, path: COOKIES_FILE, size: 0, updatedAt: null };
  }
  const st = fs.statSync(COOKIES_FILE);
  return {
    present: st.size > 0,
    path: COOKIES_FILE,
    size: st.size,
    updatedAt: st.mtimeMs,
  };
}

export function getCookiesPathIfPresent(): string | null {
  const st = cookiesStatus();
  return st.present ? COOKIES_FILE : null;
}

/** Basic Netscape cookie jar check (yt-dlp format). */
export function isLikelyNetscapeCookies(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  // Official header or at least domain\tTRUE/FALSE lines
  if (t.includes("# Netscape HTTP Cookie File") || t.includes("# HTTP Cookie File")) {
    return true;
  }
  const lines = t.split(/\r?\n/).filter((l) => l && !l.startsWith("#"));
  if (lines.length === 0) return false;
  // domain \t flag \t path \t secure \t expiry \t name \t value
  return lines.some((l) => l.split("\t").length >= 7);
}

export function saveCookiesText(text: string) {
  ensureCookiesDir();
  if (!isLikelyNetscapeCookies(text)) {
    throw new Error(
      "File cookies không đúng định dạng Netscape. Xuất bằng extension “Get cookies.txt LOCALLY” (Chrome/Edge).",
    );
  }
  fs.writeFileSync(COOKIES_FILE, text, "utf8");
}

export function clearCookies() {
  ensureCookiesDir();
  if (fs.existsSync(COOKIES_FILE)) {
    fs.unlinkSync(COOKIES_FILE);
  }
}
