import type { Platform } from "./types";

const HOST_RULES: { platform: Platform; hosts: string[] }[] = [
  {
    platform: "tiktok",
    hosts: [
      "tiktok.com",
      "www.tiktok.com",
      "m.tiktok.com",
      "vm.tiktok.com",
      "vt.tiktok.com",
      "www.vm.tiktok.com",
      "www.vt.tiktok.com",
    ],
  },
  {
    platform: "instagram",
    hosts: [
      "instagram.com",
      "www.instagram.com",
      "m.instagram.com",
      "instagr.am",
      "www.instagr.am",
      "l.instagram.com", // share redirect
    ],
  },
  {
    platform: "facebook",
    hosts: [
      "facebook.com",
      "www.facebook.com",
      "m.facebook.com",
      "web.facebook.com",
      "mbasic.facebook.com",
      "fb.watch",
      "www.fb.watch",
      "fb.com",
      "www.fb.com",
      "fb.gg",
      "l.facebook.com",
      "lm.facebook.com",
    ],
  },
];

/** Tracking / clutter query params safe to strip before yt-dlp. */
const STRIP_PARAMS = new Set([
  "fbclid",
  "gclid",
  "igshid",
  "igsh",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "si",
  "feature",
  "refsrc",
  "ref",
  "mibextid",
  "_r",
  "_t",
  "rdid",
  "share_app_id",
  "share_id",
  "share_link_id",
  "share_session_id",
]);

export function detectPlatform(rawUrl: string): Platform {
  let host: string;
  try {
    host = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return "unknown";
  }

  for (const rule of HOST_RULES) {
    if (rule.hosts.some((h) => host === h || host.endsWith(`.${h}`))) {
      return rule.platform;
    }
  }
  return "unknown";
}

/**
 * Clean share/tracking params and normalize common short/share forms
 * so yt-dlp extractors match more reliably.
 */
export function normalizeVideoUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return rawUrl.trim();
  }

  // l.instagram.com / l.facebook.com often wrap the real link in ?u=
  if (
    (parsed.hostname === "l.instagram.com" ||
      parsed.hostname === "l.facebook.com" ||
      parsed.hostname === "lm.facebook.com") &&
    parsed.searchParams.get("u")
  ) {
    try {
      return normalizeVideoUrl(parsed.searchParams.get("u")!);
    } catch {
      // fall through
    }
  }

  // Strip noise query params (keep essential like story_fbid if any)
  for (const key of [...parsed.searchParams.keys()]) {
    if (STRIP_PARAMS.has(key.toLowerCase())) {
      parsed.searchParams.delete(key);
    }
  }

  // Instagram: prefer /reel/ and /p/ without trailing junk
  if (detectPlatform(parsed.toString()) === "instagram") {
    // /reels/ID → /reel/ID (both work; keep as-is)
    parsed.hash = "";
  }

  // Facebook: www / m / web → leave host (yt-dlp handles), drop hash
  if (detectPlatform(parsed.toString()) === "facebook") {
    parsed.hash = "";
  }

  // Rebuild without empty search
  const qs = parsed.searchParams.toString();
  return `${parsed.origin}${parsed.pathname}${qs ? `?${qs}` : ""}`;
}

export function validateVideoUrl(rawUrl: string): {
  ok: boolean;
  url?: string;
  platform?: Platform;
  error?: string;
} {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { ok: false, error: "Vui lòng dán link video." };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: "URL không hợp lệ." };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { ok: false, error: "Chỉ chấp nhận http/https." };
  }

  const platform = detectPlatform(parsed.toString());
  if (platform === "unknown") {
    return {
      ok: false,
      error: "Chỉ hỗ trợ link TikTok, Instagram (Reel/Post) hoặc Facebook (Reel/Watch).",
    };
  }

  const normalized = normalizeVideoUrl(parsed.toString());

  // Soft path checks — warn-style reject only on obvious non-video pages
  try {
    const path = new URL(normalized).pathname.toLowerCase();
    if (platform === "instagram") {
      const okPath =
        path.includes("/reel") ||
        path.includes("/reels/") ||
        path.includes("/p/") ||
        path.includes("/tv/") ||
        path.includes("/stories/"); // best-effort
      if (!okPath && path.split("/").filter(Boolean).length <= 1) {
        return {
          ok: false,
          error: "Link Instagram nên là /reel/… hoặc /p/… (không phải trang profile).",
        };
      }
    }
    if (platform === "facebook") {
      const looksProfileOnly =
        /^\/(profile\.php)?$/i.test(path) ||
        (/^\/[^/]+\/?$/.test(path) &&
          !path.includes("watch") &&
          !path.includes("reel") &&
          !path.includes("video"));
      // too aggressive to block — fb URLs vary; only block empty
      if (path === "/" || path === "") {
        return { ok: false, error: "Hãy dán link video/reel Facebook cụ thể." };
      }
      void looksProfileOnly;
    }
  } catch {
    // ignore
  }

  return { ok: true, url: normalized, platform };
}

export function platformLabel(platform: Platform): string {
  switch (platform) {
    case "tiktok":
      return "TikTok";
    case "instagram":
      return "Instagram";
    case "facebook":
      return "Facebook";
    default:
      return "Khác";
  }
}

export function platformHint(platform: Platform | "unknown"): string {
  switch (platform) {
    case "tiktok":
      return "TikTok: short link vt./vm. cũng được · nếu 403 → upload cookies";
    case "instagram":
      return "Instagram: dùng link /reel/… hoặc /p/… · gần như luôn cần cookies đã login IG";
    case "facebook":
      return "Facebook: Reel / fb.watch / video · hay cần cookies đã login FB";
    default:
      return "Dán link TikTok · Instagram Reel · Facebook Reel/Watch";
  }
}

/** Suggest example placeholder by platform or generic. */
export function platformPlaceholder(platform: Platform | "unknown"): string {
  switch (platform) {
    case "instagram":
      return "https://www.instagram.com/reel/…";
    case "facebook":
      return "https://www.facebook.com/reel/… hoặc fb.watch/…";
    case "tiktok":
      return "https://www.tiktok.com/@user/video/… hoặc vt.tiktok.com/…";
    default:
      return "https://www.tiktok.com/@user/video/… · instagram.com/reel/… · facebook.com/reel/…";
  }
}
