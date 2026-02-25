"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────
interface SearchResult {
  title: string;
  url: string;
  thumbnail: string | null;
  duration: string | null;
  channel: string | null;
}

interface VideoStream {
  quality: string;
  url: string;
  width: number | null;
  height: number | null;
}

interface VideoInfo {
  title: string;
  thumbnail: string | null;
  duration: number | null;
  streams: VideoStream[];
  m3u8Url: string | null;
  videoId: string | null;
}



// Dailymotion URL patterns
const DM_URL_RE =
  /(?:https?:\/\/)?(?:www\.)?dailymotion\.com\/video\/([a-zA-Z0-9]+)/i;
const DM_SHORT_RE =
  /(?:https?:\/\/)?dai\.ly\/([a-zA-Z0-9]+)/i;

function isDailyMotionUrl(input: string): string | null {
  const m1 = input.match(DM_URL_RE);
  if (m1) return `https://www.dailymotion.com/video/${m1[1]}`;
  const m2 = input.match(DM_SHORT_RE);
  if (m2) return `https://www.dailymotion.com/video/${m2[1]}`;
  return null;
}

function detectOS(): "mac" | "windows" | "linux" | "unknown" {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "mac";
  if (ua.includes("win")) return "windows";
  if (ua.includes("linux")) return "linux";
  return "unknown";
}

// ─── Main Page ───────────────────────────────────────────────────────
export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedVideo, setSelectedVideo] = useState<SearchResult | null>(null);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [os, setOs] = useState<"mac" | "windows" | "linux" | "unknown">("unknown");
  const inputRef = useRef<HTMLInputElement>(null);
  const downloadPanelRef = useRef<HTMLDivElement>(null);

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  function downloadScript(videoUrl: string, videoTitle: string, platform?: "mac" | "windows" | "linux") {
    const safeName = videoTitle.replace(/[^\w\s-]/g, "").substring(0, 80).trim();
    const targetOs = platform || os;
    let content: string;
    let filename: string;
    let mime: string;

    if (targetOs === "windows") {
      filename = `download-${safeName.substring(0, 30)}.bat`;
      mime = "application/bat";
      content = [
        `@echo off`,
        `echo ============================================`,
        `echo   DramaDL - Downloading: ${safeName}`,
        `echo ============================================`,
        `echo.`,
        `where yt-dlp >nul 2>&1`,
        `if %errorlevel% neq 0 (`,
        `  echo yt-dlp is not installed. Installing...`,
        `  pip install yt-dlp`,
        `  if %errorlevel% neq 0 (`,
        `    echo.`,
        `    echo ERROR: Could not install yt-dlp.`,
        `    echo Please install Python from python.org first, then run this again.`,
        `    pause`,
        `    exit /b 1`,
        `  )`,
        `)`,
        `echo.`,
        `echo Downloading video...`,
        `yt-dlp -f "bestvideo[height<=720]+bestaudio/best[height<=720]/best" --merge-output-format mp4 "${videoUrl}"`,
        `echo.`,
        `echo ============================================`,
        `echo   Done! Check this folder for the video.`,
        `echo ============================================`,
        `pause`,
      ].join("\r\n");
    } else {
      // Mac (.command) or Linux (.sh)
      const ext = targetOs === "mac" ? "command" : "sh";
      filename = `download-${safeName.substring(0, 30)}.${ext}`;
      mime = "text/plain";
      content = [
        `#!/bin/bash`,
        `echo "============================================"`,
        `echo "  DramaDL - Downloading: ${safeName}"`,
        `echo "============================================"`,
        `echo ""`,
        `# Check if yt-dlp is installed`,
        `if ! command -v yt-dlp &>/dev/null; then`,
        `  echo "yt-dlp not found. Installing..."`,
        targetOs === "mac"
          ? `  if command -v brew &>/dev/null; then brew install yt-dlp; else pip3 install yt-dlp; fi`
          : `  pip3 install yt-dlp`,
        `  if ! command -v yt-dlp &>/dev/null; then`,
        `    echo ""`,
        `    echo "ERROR: Could not install yt-dlp."`,
        targetOs === "mac"
          ? `    echo "Install Homebrew first: /bin/bash -c \\\"\\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\\\""`
          : `    echo "Install Python3 first: sudo apt install python3-pip"`,
        `    echo "Then run this script again."`,
        `    read -p "Press Enter to exit..."`,
        `    exit 1`,
        `  fi`,
        `fi`,
        `echo ""`,
        `echo "Downloading video to Desktop..."`,
        `cd ~/Desktop`,
        `yt-dlp -f "bestvideo[height<=720]+bestaudio/best[height<=720]/best" --merge-output-format mp4 "${videoUrl}"`,
        `echo ""`,
        `echo "============================================"`,
        `echo "  Done! Check your Desktop for the video."`,
        `echo "============================================"`,
        `read -p "Press Enter to close..."`,
      ].join("\n");
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Detect OS on mount ──
  useEffect(() => {
    setOs(detectOS());
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-scroll to download panel when a video is selected
  useEffect(() => {
    if (selectedVideo && downloadPanelRef.current) {
      downloadPanelRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [selectedVideo, videoInfo]);

  // ── Search (uses Vercel /api/search — no external backend) ──
  const handleSearch = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = query.trim();
      if (!trimmed) return;

      // Check if user pasted a Dailymotion link
      const dmUrl = isDailyMotionUrl(trimmed);
      if (dmUrl) {
        setResults([]);
        setError("");
        const pseudoResult: SearchResult = {
          title: "Loading video…",
          url: dmUrl,
          thumbnail: null,
          duration: null,
          channel: null,
        };
        handleSelect(pseudoResult);
        return;
      }

      setLoading(true);
      setError("");
      setResults([]);
      setSelectedVideo(null);
      setVideoInfo(null);

      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}`,
          { signal: AbortSignal.timeout(15000) }
        );
        if (!res.ok) throw new Error("Search failed");
        const data: SearchResult[] = await res.json();
        if (data.length === 0)
          setError("No results found. Try a different drama name.");
        setResults(data);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Search failed.";
        setError(`Search failed: ${msg}`);
      } finally {
        setLoading(false);
      }
    },
    [query]
  );

  // ── Get download links (via local Next.js API route → Vercel) ──
  async function handleSelect(result: SearchResult) {
    setSelectedVideo(result);
    setVideoInfo(null);
    setLoadingVideo(true);

    try {
      const res = await fetch(
        `/api/video?url=${encodeURIComponent(result.url)}`,
        { signal: AbortSignal.timeout(45000) }
      );
      if (!res.ok) throw new Error("Failed to extract video");
      const data: VideoInfo = await res.json();
      setVideoInfo(data);
    } catch {
      setVideoInfo(null);
    } finally {
      setLoadingVideo(false);
    }
  }

  // ── Quality badge color ──
  function qualityColor(q: string) {
    if (q.includes("1080")) return "bg-purple-600 text-white";
    if (q.includes("720")) return "bg-blue-600 text-white";
    if (q.includes("480")) return "bg-green-600 text-white";
    return "bg-zinc-700 text-zinc-300";
  }

  return (
    <>
      {/* animated bg */}
      <div className="hero-gradient" />

      <div className="flex min-h-screen flex-col">
        {/* ── Header / Hero ── */}
        <header className="w-full pt-12 pb-4 px-4 text-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-purple-400 via-pink-400 to-purple-500 bg-clip-text text-transparent">
            DramaDL
          </h1>
          <p className="mt-2 text-zinc-400 text-base sm:text-lg max-w-lg mx-auto">
            Download Korean, Chinese, Thai &amp; Turkish drama episodes for free
            in HD
          </p>
        </header>

        {/* ── Search Bar ── */}
        <section className="mx-auto w-full max-w-2xl px-4 mt-6">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2 sm:gap-0 sm:relative">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Drama name or Dailymotion link…"
              aria-label="Search drama name or paste Dailymotion URL"
              className="w-full rounded-2xl bg-zinc-900 border border-zinc-700 px-5 py-4 sm:pr-28 text-base text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 transition-all"
            />
            <button
              type="submit"
              disabled={loading}
              className="sm:absolute sm:right-2 sm:top-1/2 sm:-translate-y-1/2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 px-5 py-3 sm:py-2.5 text-sm font-semibold text-white transition-colors cursor-pointer"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Spinner /> Searching…
                </span>
              ) : (
                "Search"
              )}
            </button>
          </form>
        </section>

        {/* ── Error ── */}
        {error && (
          <p className="text-center mt-6 text-red-400 text-sm animate-fade-in-up">
            {error}
          </p>
        )}

        {/* ── Skeleton loader ── */}
        {loading && (
          <section className="mx-auto mt-10 w-full max-w-5xl px-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-56 rounded-2xl" />
            ))}
          </section>
        )}

        {/* ── Results Grid ── */}
        {!loading && results.length > 0 && (
          <section className="mx-auto mt-10 w-full max-w-5xl px-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-fade-in-up">
            {results.map((r, i) => (
              <button
                key={i}
                onClick={() => handleSelect(r)}
                className={`group relative rounded-2xl overflow-hidden border transition-all text-left cursor-pointer ${
                  selectedVideo?.url === r.url
                    ? "border-purple-500 ring-2 ring-purple-500/30"
                    : "border-zinc-800 hover:border-zinc-600"
                } bg-zinc-900/70`}
              >
                {/* thumbnail */}
                <div className="relative aspect-video bg-zinc-950 overflow-hidden">
                  {r.thumbnail ? (
                    <img
                      src={r.thumbnail}
                      alt={r.title}
                      className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-600">
                      <FilmIcon />
                    </div>
                  )}
                  {r.duration && (
                    <span className="absolute bottom-2 right-2 bg-black/80 text-xs px-2 py-0.5 rounded-md text-zinc-300 font-mono">
                      {r.duration}
                    </span>
                  )}
                  {/* loading overlay when this card is being fetched */}
                  {selectedVideo?.url === r.url && loadingVideo && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
                      <div className="flex flex-col items-center gap-2">
                        <Spinner />
                        <span className="text-xs text-zinc-300">Loading…</span>
                      </div>
                    </div>
                  )}
                  {/* play overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                    <div className="w-12 h-12 rounded-full bg-purple-600/90 flex items-center justify-center">
                      <PlayIcon />
                    </div>
                  </div>
                </div>
                {/* info */}
                <div className="p-3">
                  <h3 className="text-sm font-medium text-zinc-200 line-clamp-2 leading-snug">
                    {r.title}
                  </h3>
                  {r.channel && (
                    <p className="mt-1 text-xs text-zinc-500 truncate">{r.channel}</p>
                  )}
                </div>
              </button>
            ))}
          </section>
        )}

        {/* ── Download Panel (Modal-like) ── */}
        {selectedVideo && (
          <section ref={downloadPanelRef} className="mx-auto mt-8 w-full max-w-2xl px-4 animate-fade-in-up">
            <div className="glass rounded-2xl p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-zinc-100 line-clamp-2">
                    {selectedVideo.title}
                  </h2>
                  <p className="text-xs text-zinc-500 mt-1">
                    Dailymotion &middot; {selectedVideo.duration || "Full episode"}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedVideo(null);
                    setVideoInfo(null);
                  }}
                  className="shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                >
                  <CloseIcon />
                </button>
              </div>

              {loadingVideo && (
                <div className="mt-6 flex items-center gap-3 text-zinc-400 text-sm">
                  <Spinner /> Extracting download links…
                </div>
              )}

              {videoInfo && (
                <div className="mt-6 space-y-4">
                  {/* Quality badges */}
                  <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-2">
                      Available Qualities
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {videoInfo.streams.map((s, i) => (
                        <span
                          key={i}
                          className={`text-xs font-bold px-3 py-1.5 rounded-lg ${qualityColor(s.quality)}`}
                        >
                          {s.quality}
                          {s.height ? ` (${s.width}×${s.height})` : ""}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Download buttons */}
                  <div className="space-y-3">

                    {/* ── Mac & Windows download buttons ── */}
                    {selectedVideo && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Mac button */}
                        <div className="rounded-xl bg-zinc-800/80 border border-zinc-700/50 p-4 flex flex-col">
                          <button
                            onClick={() =>
                              downloadScript(
                                selectedVideo.url,
                                videoInfo.title || selectedVideo.title,
                                "mac"
                              )
                            }
                            className="w-full flex items-center justify-center gap-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 active:scale-[0.98] px-4 py-3.5 text-white font-bold text-sm transition-all cursor-pointer shadow-lg shadow-purple-600/20"
                          >
                            <AppleIcon />
                            Download for Mac
                          </button>
                          <div className="mt-3 space-y-1.5 text-[11px] text-zinc-400 flex-1">
                            <p className="font-semibold text-zinc-300">How it works:</p>
                            <ol className="list-decimal list-inside space-y-1 text-zinc-500">
                              <li>Click the button above</li>
                              <li>Open the downloaded <span className="text-purple-300">.command</span> file</li>
                              <li>If blocked: right-click → Open</li>
                              <li>Video saves to your <span className="text-zinc-300">Desktop</span></li>
                            </ol>
                            <p className="text-[10px] text-zinc-600 pt-1">Auto-installs Homebrew, yt-dlp & ffmpeg if needed.</p>
                          </div>
                        </div>

                        {/* Windows button */}
                        <div className="rounded-xl bg-zinc-800/80 border border-zinc-700/50 p-4 flex flex-col">
                          <button
                            onClick={() =>
                              downloadScript(
                                selectedVideo.url,
                                videoInfo.title || selectedVideo.title,
                                "windows"
                              )
                            }
                            className="w-full flex items-center justify-center gap-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-[0.98] px-4 py-3.5 text-white font-bold text-sm transition-all cursor-pointer shadow-lg shadow-blue-600/20"
                          >
                            <WindowsIcon />
                            Download for Windows
                          </button>
                          <div className="mt-3 space-y-1.5 text-[11px] text-zinc-400 flex-1">
                            <p className="font-semibold text-zinc-300">How it works:</p>
                            <ol className="list-decimal list-inside space-y-1 text-zinc-500">
                              <li>Click the button above</li>
                              <li>Open the downloaded <span className="text-blue-300">.bat</span> file</li>
                              <li>If blocked: click &quot;More info&quot; → &quot;Run anyway&quot;</li>
                              <li>Video saves to your <span className="text-zinc-300">Desktop</span></li>
                            </ol>
                            <p className="text-[10px] text-zinc-600 pt-1">Auto-installs Python, yt-dlp & ffmpeg if needed.</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── Copy command (collapsed) ── */}
                    {selectedVideo && (
                      <details className="group rounded-xl bg-zinc-800/80 border border-zinc-700/50">
                        <summary className="flex items-center justify-between p-4 cursor-pointer text-sm text-zinc-400 hover:text-zinc-300 transition-colors">
                          <span>Or copy terminal command</span>
                          <svg className="w-4 h-4 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </summary>
                        <div className="px-4 pb-4">
                          <div className="flex items-center gap-2 bg-zinc-900/80 rounded-lg p-3">
                            <code className="text-xs text-green-300 flex-1 overflow-x-auto whitespace-nowrap scrollbar-thin">
                              yt-dlp &quot;{selectedVideo.url}&quot;
                            </code>
                            <button
                              onClick={() =>
                                copyToClipboard(
                                  `yt-dlp "${selectedVideo.url}"`,
                                  "ytdlp"
                                )
                              }
                              className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium transition-colors cursor-pointer"
                            >
                              {copied === "ytdlp" ? "Copied!" : "Copy"}
                            </button>
                          </div>
                        </div>
                      </details>
                    )}

                    <p className="text-[10px] text-zinc-600 text-center">
                      The script runs on your computer — video downloads directly from Dailymotion to you.
                    </p>
                  </div>
                </div>
              )}

              {!loadingVideo && !videoInfo && (
                <p className="mt-6 text-sm text-red-400">
                  Could not extract streams. The video may be geo-restricted or unavailable.
                </p>
              )}
            </div>
          </section>
        )}

        {/* spacer */}
        <div className="flex-1" />

        {/* ── SEO rich text (visible, useful, not spammy) ── */}
        <section className="mx-auto mt-20 w-full max-w-3xl px-6 text-center">
          <h2 className="text-lg font-semibold text-zinc-300">
            Download Any Drama Episode for Free — No Sign-Up
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-500 max-w-xl mx-auto">
            DramaDL is a <strong className="text-zinc-400">100% free drama downloader</strong>.
            Download Korean dramas (K-Drama), Chinese dramas (C-Drama), Thai
            dramas, Turkish series and more in HD — completely free, no account
            needed. Just search the drama name, pick an episode, choose your
            quality (1080p, 720p, 480p), and download instantly.
          </p>
          <p className="mt-3 text-xs leading-relaxed text-zinc-600 max-w-lg mx-auto">
            Popular free downloads: Goblin, Crash Landing on You, Vincenzo,
            The Glory, Alchemy of Souls, Love Between Fairy and Devil,
            Hidden Love, Ertugrul, F4 Thailand — and thousands more.
          </p>
        </section>

        {/* ── Footer ── */}
        <footer className="mt-10 pb-8 text-center text-xs text-zinc-600 space-y-1 px-4">
          <p>
            This is a <span className="text-zinc-400 font-medium">fan-made</span> app.
            We do not host any content — all videos are sourced from public platforms.
          </p>
          <p className="text-zinc-700">
            Free drama downloads &middot; No ads &middot; No sign-up &middot; HD quality
          </p>
          <p>
            DramaDL &copy; {new Date().getFullYear()}
          </p>
        </footer>
      </div>
    </>
  );
}

// ─── Icons ───────────────────────────────────────────────────────────
function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 20 20">
      <path d="M6.3 2.8A1 1 0 005 3.7v12.6a1 1 0 001.3.9l10-6.3a1 1 0 000-1.8l-10-6.3z" />
    </svg>
  );
}

function FilmIcon() {
  return (
    <svg className="w-10 h-10" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0118 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C5.496 8.25 6 7.746 6 7.125v-1.5M4.875 8.25C5.496 8.25 6 8.754 6 9.375v1.5c0 .621-.504 1.125-1.125 1.125m1.5 0h12m-12 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m12-3.75c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5m1.5 0c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-1.5-3.75C18.504 12 18 11.496 18 10.875v-1.5c0-.621.504-1.125 1.125-1.125m1.5 3.75c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function WindowsIcon() {
  return (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M3 12V6.75l8-1.25V12H3zm0 .5h8v6.5l-8-1.25V12.5zM11.5 5.34l9.5-1.34v8h-9.5V5.34zM11.5 12.5H21v7.5l-9.5-1.34V12.5z" />
    </svg>
  );
}
