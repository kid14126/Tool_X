import type { Platform, XPreset } from "./types";

export interface HistoryItem {
  id: string;
  url: string;
  platform: Platform;
  title: string;
  caption: string;
  preset: XPreset;
  outputFilename?: string;
  outputSizeBytes?: number;
  jobId?: string;
  createdAt: number;
}

const KEY = "toolx_history_v1";
const MAX = 12;

export function loadHistory(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveHistory(items: HistoryItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)));
  } catch {
    // quota / private mode
  }
}

export function pushHistory(item: HistoryItem): HistoryItem[] {
  const prev = loadHistory().filter(
    (h) => h.url !== item.url || h.jobId !== item.jobId,
  );
  const next = [item, ...prev].slice(0, MAX);
  saveHistory(next);
  return next;
}

export function clearHistory() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}
