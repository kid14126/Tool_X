/**
 * When UI is on Vercel and worker (yt-dlp/ffmpeg) runs elsewhere,
 * set NEXT_PUBLIC_API_URL=https://your-worker.up.railway.app
 * Leave empty for same-origin (local / full Docker deploy).
 */
export function getApiBase(): string {
  const base = process.env.NEXT_PUBLIC_API_URL?.trim() || "";
  return base.replace(/\/$/, "");
}

export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const base = getApiBase();
  return base ? `${base}${p}` : p;
}

export async function apiFetch(path: string, init?: RequestInit) {
  return fetch(apiUrl(path), init);
}
