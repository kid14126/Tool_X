export type Platform = "tiktok" | "instagram" | "facebook" | "unknown";

export type XPreset = "vertical" | "square" | "landscape" | "keep";

export type JobStatus =
  | "queued"
  | "downloading"
  | "converting"
  | "done"
  | "error";

export interface AnalyzeResult {
  platform: Platform;
  id: string;
  title: string;
  description: string;
  uploader: string;
  duration: number | null;
  thumbnail: string | null;
  webpageUrl: string;
  caption: string;
}

export interface JobRecord {
  id: string;
  url: string;
  preset: XPreset;
  trimTo140s: boolean;
  status: JobStatus;
  progress: number;
  message: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
  analyze?: AnalyzeResult;
  caption?: string;
  inputPath?: string;
  outputPath?: string;
  outputFilename?: string;
  /** Output file size in bytes (for UI). */
  outputSizeBytes?: number;
}

export interface CreateJobBody {
  url: string;
  preset?: XPreset;
  trimTo140s?: boolean;
}
