"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AnalyzeResult, JobStatus, Platform, XPreset } from "@/lib/types";
import { PRESET_LIST } from "@/lib/presets";
import {
  detectPlatform,
  platformHint,
  platformLabel,
  platformPlaceholder,
} from "@/lib/url";
import {
  clearHistory,
  loadHistory,
  pushHistory,
  type HistoryItem,
} from "@/lib/history";
import { apiFetch, apiUrl, getApiBase } from "@/lib/clientApi";

type Phase = "idle" | "analyzing" | "ready" | "working" | "done" | "error";

interface PublicJob {
  id: string;
  status: JobStatus;
  progress: number;
  message: string;
  error?: string;
  caption?: string;
  analyze?: AnalyzeResult;
  outputFilename?: string;
  outputSizeBytes?: number;
}

function formatDuration(sec: number | null | undefined) {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function formatBytes(bytes: number | null | undefined) {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function platformBadgeClass(platform: Platform | "unknown") {
  switch (platform) {
    case "tiktok":
      return "bg-pink-500/15 text-pink-200 border-pink-500/30";
    case "instagram":
      return "bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-500/30";
    case "facebook":
      return "bg-blue-500/15 text-blue-200 border-blue-500/30";
    default:
      return "bg-zinc-800 text-zinc-300 border-zinc-700";
  }
}

function StatusChip({
  ok,
  label,
  warn,
}: {
  ok: boolean;
  label: string;
  warn?: boolean;
}) {
  const cls = ok
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
    : warn
      ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
      : "border-zinc-700 bg-zinc-900 text-zinc-500";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {ok ? "●" : "○"} {label}
    </span>
  );
}

export default function ToolXApp() {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [analyze, setAnalyze] = useState<AnalyzeResult | null>(null);
  const [preset, setPreset] = useState<XPreset>("vertical");
  const [trimTo140s, setTrimTo140s] = useState(true);
  const [job, setJob] = useState<PublicJob | null>(null);
  const [caption, setCaption] = useState("");
  const [copied, setCopied] = useState(false);
  const [openedX, setOpenedX] = useState(false);
  const [health, setHealth] = useState<{
    ok: boolean;
    ytdlp: boolean;
    ffmpeg: boolean;
    node?: boolean;
    cookies?: boolean;
    vercel?: boolean;
    hint?: string;
  } | null>(null);
  const [cookiesPresent, setCookiesPresent] = useState(false);
  const [cookiesMsg, setCookiesMsg] = useState<string | null>(null);
  const [cookiesBusy, setCookiesBusy] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const typedPlatform = useMemo(
    () => (url.trim() ? detectPlatform(url.trim()) : "unknown"),
    [url],
  );

  async function refreshHealth() {
    try {
      const h = await apiFetch("/api/health").then((r) => r.json());
      setHealth(h);
      setCookiesPresent(Boolean(h.cookies));
    } catch {
      setHealth({
        ok: false,
        ytdlp: false,
        ffmpeg: false,
        hint: getApiBase()
          ? "Không nối được worker API. Kiểm tra NEXT_PUBLIC_API_URL."
          : "Không gọi được /api/health.",
      });
    }
  }

  useEffect(() => {
    void refreshHealth();
    setHistory(loadHistory());
  }, []);

  async function handleCookiesUpload(file: File | null) {
    if (!file) return;
    setCookiesBusy(true);
    setCookiesMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiFetch("/api/cookies", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload cookies thất bại");
      setCookiesPresent(true);
      setCookiesMsg(data.message || "Đã lưu cookies.");
      void refreshHealth();
    } catch (err) {
      setCookiesMsg(err instanceof Error ? err.message : "Lỗi cookies");
    } finally {
      setCookiesBusy(false);
    }
  }

  async function handleCookiesClear() {
    setCookiesBusy(true);
    setCookiesMsg(null);
    try {
      await apiFetch("/api/cookies", { method: "DELETE" });
      setCookiesPresent(false);
      setCookiesMsg("Đã xóa cookies.");
      void refreshHealth();
    } catch {
      setCookiesMsg("Không xóa được cookies.");
    } finally {
      setCookiesBusy(false);
    }
  }

  const resetResult = useCallback(() => {
    setJob(null);
    setCopied(false);
    setOpenedX(false);
    if (phase === "done" || phase === "error" || phase === "working") {
      setPhase(analyze ? "ready" : "idle");
    }
  }, [analyze, phase]);

  async function handleAnalyze(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setAnalyze(null);
    setJob(null);
    setCaption("");
    setOpenedX(false);
    setPhase("analyzing");

    try {
      const res = await apiFetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Phân tích thất bại");
      setAnalyze(data as AnalyzeResult);
      setCaption((data as AnalyzeResult).caption || "");
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi phân tích");
      setPhase("error");
    }
  }

  async function handleConvert() {
    setError(null);
    setJob(null);
    setCopied(false);
    setOpenedX(false);
    setPhase("working");

    try {
      const res = await apiFetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, preset, trimTo140s }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không tạo được job");

      let current = data as PublicJob;
      setJob(current);

      while (current.status !== "done" && current.status !== "error") {
        await new Promise((r) => setTimeout(r, 1000));
        const poll = await apiFetch(`/api/jobs/${current.id}`);
        const next = await poll.json();
        if (!poll.ok) throw new Error(next.error || "Mất job");
        current = next as PublicJob;
        setJob(current);
        if (current.caption) setCaption(current.caption);
        if (current.analyze) setAnalyze(current.analyze);
      }

      if (current.status === "error") {
        setError(current.error || current.message || "Convert thất bại");
        setPhase("error");
        return;
      }

      const finalCaption = current.caption || caption;
      if (current.caption) setCaption(current.caption);
      setPhase("done");

      const meta = current.analyze;
      setHistory(
        pushHistory({
          id: `${Date.now()}`,
          url,
          platform: meta?.platform || detectPlatform(url),
          title: meta?.title || finalCaption.slice(0, 80) || "Video",
          caption: finalCaption,
          preset,
          outputFilename: current.outputFilename,
          outputSizeBytes: current.outputSizeBytes,
          jobId: current.id,
          createdAt: Date.now(),
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi convert");
      setPhase("error");
    }
  }

  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Không copy được — hãy chọn text thủ công.");
    }
  }

  async function copyAndOpenX() {
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      setOpenedX(true);
      window.open("https://x.com/compose/post", "_blank", "noopener,noreferrer");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Không copy được caption. Mở X thủ công và dán caption.");
      window.open("https://x.com/compose/post", "_blank", "noopener,noreferrer");
    }
  }

  function reuseHistory(item: HistoryItem) {
    setUrl(item.url);
    setCaption(item.caption);
    setPreset(item.preset);
    setError(null);
    setAnalyze(null);
    setJob(null);
    setPhase("idle");
    setOpenedX(false);
  }

  const progressPct = job?.progress ?? (phase === "analyzing" ? 30 : 0);

  const canConvert = useMemo(
    () => Boolean(url.trim()) && phase !== "analyzing" && phase !== "working",
    [url, phase],
  );

  const igFbNeedsCookies =
    (typedPlatform === "instagram" || typedPlatform === "facebook") &&
    !cookiesPresent;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10 sm:py-14">
      {/* Header */}
      <header className="space-y-3 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-300">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
          Short video → chuẩn X
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Tool<span className="text-sky-400">_X</span>
        </h1>
        <p className="mx-auto max-w-md text-sm leading-relaxed text-zinc-400">
          Dán link TikTok / Instagram / Facebook — tải video kèm tiêu đề, convert
          MP4 H.264/AAC sẵn đăng lên X.
        </p>
        {health && (
          <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
            <StatusChip ok={Boolean(health.ytdlp)} label="yt-dlp" />
            <StatusChip ok={Boolean(health.ffmpeg)} label="ffmpeg" />
            <StatusChip ok={Boolean(health.node)} label="Node" warn />
            <StatusChip
              ok={Boolean(health.cookies)}
              label="Cookies"
              warn
            />
          </div>
        )}
      </header>

      {/* Binary / deploy health */}
      {health && (!health.ok || health.hint) && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <p className="font-medium">
            {!health.ok ? "Worker chưa sẵn sàng (yt-dlp / ffmpeg)" : "Lưu ý deploy"}
          </p>
          <p className="mt-1 text-amber-100/80">
            {health.hint ||
              `${!health.ytdlp ? "yt-dlp chưa có. " : ""}${!health.ffmpeg ? "ffmpeg chưa có. " : ""}Cần worker Docker (Railway/Fly/VPS) — Vercel serverless không chạy được pipeline tải/convert.`}
          </p>
          {getApiBase() && (
            <p className="mt-1 font-mono text-[11px] text-amber-200/70">
              API: {getApiBase()}
            </p>
          )}
        </div>
      )}

      {/* Cookies */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Cookies nền tảng
            </p>
            <p className="mt-1 text-sm text-zinc-300">
              {cookiesPresent ? (
                <span className="text-emerald-400">● Đã có cookies.txt</span>
              ) : (
                <span className="text-amber-300">
                  ○ Chưa có — IG/FB gần như bắt buộc · TikTok khi bị chặn IP
                </span>
              )}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
              Chrome/Edge → extension{" "}
              <span className="text-zinc-400">“Get cookies.txt LOCALLY”</span> →
              login{" "}
              <span className="text-zinc-400">tiktok.com / instagram.com / facebook.com</span>{" "}
              → Export 1 file .txt (có thể gộp) → Upload.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded-xl border border-zinc-600 bg-zinc-950 px-3 py-2 text-xs font-medium text-zinc-200 hover:border-sky-500/50">
              {cookiesBusy ? "Đang lưu…" : "Upload cookies.txt"}
              <input
                type="file"
                accept=".txt,text/plain"
                className="hidden"
                disabled={cookiesBusy}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  void handleCookiesUpload(f);
                  e.target.value = "";
                }}
              />
            </label>
            {cookiesPresent && (
              <button
                type="button"
                disabled={cookiesBusy}
                onClick={() => void handleCookiesClear()}
                className="rounded-xl border border-zinc-700 px-3 py-2 text-xs text-zinc-400 hover:border-red-500/40 hover:text-red-300"
              >
                Xóa
              </button>
            )}
          </div>
        </div>
        {cookiesMsg && <p className="mt-2 text-xs text-sky-300/90">{cookiesMsg}</p>}
      </section>

      {/* URL form */}
      <form
        onSubmit={handleAnalyze}
        className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 shadow-xl shadow-black/40 backdrop-blur sm:p-5"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <label
            htmlFor="url"
            className="block text-xs font-medium uppercase tracking-wide text-zinc-500"
          >
            Link video
          </label>
          {typedPlatform !== "unknown" && (
            <span
              className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${platformBadgeClass(typedPlatform)}`}
            >
              {platformLabel(typedPlatform)}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="url"
            type="url"
            inputMode="url"
            placeholder={platformPlaceholder(typedPlatform)}
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              resetResult();
            }}
            className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none ring-sky-500/40 transition focus:border-sky-500/50 focus:ring-2"
            required
          />
          <button
            type="submit"
            disabled={phase === "analyzing" || !url.trim()}
            className="shrink-0 rounded-xl bg-sky-500 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {phase === "analyzing" ? "Đang phân tích…" : "Phân tích"}
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-600">{platformHint(typedPlatform)}</p>
        {igFbNeedsCookies && (
          <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            Link {platformLabel(typedPlatform)} — nên upload cookies đã login trước khi phân tích.
          </p>
        )}
      </form>

      {/* Preview + options */}
      {analyze && (
        <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-5">
          <div className="flex gap-4">
            <div className="h-28 w-20 shrink-0 overflow-hidden rounded-lg bg-zinc-800 sm:h-32 sm:w-24">
              {analyze.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={analyze.thumbnail}
                  alt=""
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-zinc-600">
                  No thumb
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-md border px-2 py-0.5 text-xs font-medium ${platformBadgeClass(analyze.platform)}`}
                >
                  {platformLabel(analyze.platform)}
                </span>
                <span className="text-xs text-zinc-500">
                  {formatDuration(analyze.duration)}
                </span>
              </div>
              <h2 className="line-clamp-3 text-sm font-medium leading-snug text-zinc-100">
                {analyze.title}
              </h2>
              {analyze.uploader && (
                <p className="truncate text-xs text-zinc-500">@{analyze.uploader}</p>
              )}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
              Preset X
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PRESET_LIST.map((p) => {
                const active = preset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setPreset(p.id);
                      if (phase === "done") setPhase("ready");
                    }}
                    className={`rounded-xl border px-3 py-2.5 text-left transition ${
                      active
                        ? "border-sky-500/60 bg-sky-500/15 text-sky-100"
                        : "border-zinc-700 bg-zinc-950/50 text-zinc-400 hover:border-zinc-600"
                    }`}
                  >
                    <span className="block text-xs font-semibold">
                      {p.label}
                      {p.recommended ? " ★" : ""}
                    </span>
                    <span className="mt-0.5 block text-[10px] leading-tight opacity-70">
                      {p.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-400">
            <input
              type="checkbox"
              checked={trimTo140s}
              onChange={(e) => setTrimTo140s(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-sky-500 focus:ring-sky-500"
            />
            Cắt còn ≤ 140 giây (giới hạn X non-Premium)
          </label>

          <button
            type="button"
            onClick={handleConvert}
            disabled={!canConvert}
            className="w-full rounded-xl bg-white px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {phase === "working" ? "Đang xử lý…" : "Convert cho X"}
          </button>
        </section>
      )}

      {/* Progress */}
      {(phase === "working" || phase === "analyzing") && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-4">
          <div className="mb-2 flex items-center justify-between text-xs text-zinc-400">
            <span>
              {job?.message ||
                (phase === "analyzing" ? "Đang lấy metadata…" : "…")}
            </span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-sky-500 transition-all duration-500"
              style={{ width: `${Math.max(progressPct, 8)}%` }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Result */}
      {phase === "done" && job?.id && (
        <section className="space-y-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-emerald-300">
            <span className="text-lg">✓</span>
            <h3 className="text-sm font-semibold">Sẵn sàng đăng X</h3>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href={apiUrl(`/api/jobs/${job.id}/download?kind=video`)}
              className="inline-flex items-center justify-center rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-sky-400"
            >
              Tải MP4
              {formatBytes(job.outputSizeBytes)
                ? ` (${formatBytes(job.outputSizeBytes)})`
                : ""}
            </a>
            <button
              type="button"
              onClick={() => void copyAndOpenX()}
              className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-zinc-200"
            >
              {openedX ? "Đã copy · X đã mở" : "Copy caption + mở X"}
            </button>
            <button
              type="button"
              onClick={() => void copyCaption()}
              className="inline-flex items-center justify-center rounded-xl border border-zinc-600 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-200 hover:border-zinc-500"
            >
              {copied && !openedX ? "Đã copy!" : "Copy caption"}
            </button>
            <a
              href={apiUrl(`/api/jobs/${job.id}/download?kind=caption`)}
              className="inline-flex items-center justify-center rounded-xl border border-zinc-600 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-200 hover:border-zinc-500"
            >
              Tải caption.txt
            </a>
          </div>

          <p className="text-[11px] leading-relaxed text-zinc-500">
            Gợi ý: bấm <span className="text-zinc-300">Copy caption + mở X</span> → dán
            caption (Ctrl+V) → đính kèm file MP4 vừa tải.
          </p>

          <div>
            <label
              htmlFor="caption"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500"
            >
              Tiêu đề / caption (chỉnh trước khi đăng)
            </label>
            <textarea
              id="caption"
              rows={4}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none ring-sky-500/30 focus:border-sky-500/50 focus:ring-2"
            />
            <p className="mt-1 text-[11px] text-zinc-600">
              {caption.length} ký tự · {job.outputFilename || "video.mp4"}
              {formatBytes(job.outputSizeBytes)
                ? ` · ${formatBytes(job.outputSizeBytes)}`
                : ""}
              {" · "}X cho phép tới 512MB / 140s
            </p>
          </div>

          <video
            key={job.id}
            controls
            className="max-h-80 w-full rounded-xl bg-black"
            src={apiUrl(`/api/jobs/${job.id}/download?kind=video`)}
          />
        </section>
      )}

      {/* History */}
      {history.length > 0 && (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Gần đây ({history.length})
            </p>
            <button
              type="button"
              onClick={() => {
                clearHistory();
                setHistory([]);
              }}
              className="text-[11px] text-zinc-500 hover:text-zinc-300"
            >
              Xóa lịch sử
            </button>
          </div>
          <ul className="space-y-2">
            {history.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => reuseHistory(item)}
                  className="flex w-full items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 px-3 py-2.5 text-left transition hover:border-zinc-600"
                >
                  <span
                    className={`mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${platformBadgeClass(item.platform)}`}
                  >
                    {platformLabel(item.platform)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 text-xs font-medium text-zinc-200">
                      {item.title}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-zinc-600">
                      {item.outputFilename || item.url}
                      {formatBytes(item.outputSizeBytes)
                        ? ` · ${formatBytes(item.outputSizeBytes)}`
                        : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-[10px] text-zinc-600">
                    {new Date(item.createdAt).toLocaleString("vi-VN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="space-y-2 border-t border-zinc-900 pt-6 text-center text-[11px] leading-relaxed text-zinc-600">
        <p>
          Chỉ dùng cho nội dung bạn sở hữu hoặc được phép sử dụng. Tôn trọng bản quyền
          và điều khoản TikTok / Instagram / Facebook / X.
        </p>
        <p>Self-host · Export file + caption · Đăng thẳng X = phase sau</p>
      </footer>
    </div>
  );
}
