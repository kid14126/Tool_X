import type { XPreset } from "./types";

export interface EncodePreset {
  id: XPreset;
  label: string;
  description: string;
  recommended?: boolean;
  /**
   * ffmpeg -vf filter; null = no scale/pad.
   * Scale uses min(target, source) so we never upscale small FB/TikTok sources
   * (upscaling 576p→1080p was making files 4× larger with no quality gain).
   */
  videoFilter: string | null;
  /** Optional max video bitrate (helps keep uploads small/fast). */
  maxrate?: string;
  bufsize?: string;
}

/** Fit inside WxH, never upscale, force even dimensions for yuv420p/H.264. */
function fitNoUpscale(maxW: number, maxH: number): string {
  return [
    `scale='min(${maxW},iw)':'min(${maxH},ih)':force_original_aspect_ratio=decrease`,
    "scale=trunc(iw/2)*2:trunc(ih/2)*2",
    "setsar=1",
  ].join(",");
}

export const ENCODE_PRESETS: Record<XPreset, EncodePreset> = {
  vertical: {
    id: "vertical",
    label: "Dọc 9:16",
    description: "Tối đa 1080×1920, không upscale",
    recommended: true,
    videoFilter: fitNoUpscale(1080, 1920),
    maxrate: "2500k",
    bufsize: "5000k",
  },
  square: {
    id: "square",
    label: "Vuông 1:1",
    description: "Tối đa 1080×1080, không upscale",
    videoFilter: fitNoUpscale(1080, 1080),
    maxrate: "2500k",
    bufsize: "5000k",
  },
  landscape: {
    id: "landscape",
    label: "Ngang 16:9",
    description: "Tối đa 1280×720, không upscale",
    videoFilter: fitNoUpscale(1280, 720),
    maxrate: "2500k",
    bufsize: "5000k",
  },
  keep: {
    id: "keep",
    label: "Giữ tỷ lệ",
    description: "Chỉ re-encode H.264/AAC, không scale",
    videoFilter: "scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1",
    maxrate: "2500k",
    bufsize: "5000k",
  },
};

export const PRESET_LIST = Object.values(ENCODE_PRESETS);

export const X_MAX_DURATION_SEC = 140;

/** Soft target: X allows 512MB, but smaller = upload mượt hơn. */
export const X_SOFT_MAX_MB = 50;
