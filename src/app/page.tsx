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
}

type BackendStatus = "cold" | "waking" | "ready";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const COLD_START_TIPS = [
  "Waking up the server… free tier needs a moment",
  "Almost there — servers on free hosting spin down when idle",
  "Hang tight — first request after a nap takes ~30s",
  "Server is booting up… this only happens after inactivity",
];

// ─── Main Page ───────────────────────────────────────────────────────
export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedVideo, setSelectedVideo] = useState<SearchResult | null>(null);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("cold");
  const [coldTipIdx, setColdTipIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const downloadPanelRef = useRef<HTMLDivElement>(null);

  // ── Wake-up ping on mount ──
  useEffect(() => {
    inputRef.current?.focus();
    setBackendStatus("waking");

    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch(`${API_URL}/health`, { signal: ctrl.signal });
        if (res.ok) setBackendStatus("ready");
      } catch {
        // will retry on search
      }
    })();
    return () => ctrl.abort();
  }, []);

  // ── Rotate cold-start tips ──
  useEffect(() => {
    if (backendStatus !== "waking" && !(loading && backendStatus !== "ready"))
      return;
    const id = setInterval(
      () => setColdTipIdx((i) => (i + 1) % COLD_START_TIPS.length),
      4000
    );
    return () => clearInterval(id);
  }, [backendStatus, loading]);

  // Auto-scroll to download panel when a video is selected
  useEffect(() => {
    if (selectedVideo && downloadPanelRef.current) {
      downloadPanelRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [selectedVideo, videoInfo]);

  // ── Search with cold-start retry ──
  const handleSearch = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!query.trim()) return;

      setLoading(true);
      setError("");
      setResults([]);
      setSelectedVideo(null);
      setVideoInfo(null);

      const maxRetries = backendStatus !== "ready" ? 3 : 1;
      let lastErr = "";

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const res = await fetch(
            `${API_URL}/api/search?q=${encodeURIComponent(query.trim())}`,
            { signal: AbortSignal.timeout(45000) }
          );
          if (!res.ok) throw new Error("Search failed");
          const data: SearchResult[] = await res.json();
          setBackendStatus("ready");
          if (data.length === 0)
            setError("No results found. Try a different drama name.");
          setResults(data);
          setLoading(false);
          return;
        } catch (err: unknown) {
          lastErr =
            err instanceof Error ? err.message : "Could not reach server.";
          // wait before retry
          if (attempt < maxRetries - 1) {
            await new Promise((r) => setTimeout(r, 3000));
          }
        }
      }

      setError(
        backendStatus !== "ready"
          ? "Server is still waking up — please try again in a few seconds."
          : `Search failed: ${lastErr}`
      );
      setLoading(false);
    },
    [query, backendStatus]
  );

  // ── Get download links ──
  async function handleSelect(result: SearchResult) {
    setSelectedVideo(result);
    setVideoInfo(null);
    setLoadingVideo(true);

    try {
      const res = await fetch(
        `${API_URL}/api/video?url=${encodeURIComponent(result.url)}`,
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

  const showColdBanner =
    loading && backendStatus !== "ready";

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
          {/* backend status pill */}
          <div className="mt-3 flex justify-center">
            {backendStatus === "waking" && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-amber-400/80 bg-amber-400/10 border border-amber-400/20 rounded-full px-3 py-1 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                Connecting to server…
              </span>
            )}
            {backendStatus === "ready" && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-400/80 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-3 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Server ready
              </span>
            )}
          </div>
        </header>

        {/* ── Search Bar ── */}
        <section className="mx-auto w-full max-w-2xl px-4 mt-6">
          <form onSubmit={handleSearch} className="relative">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a drama name… e.g. Vincenzo, Alchemy of Souls"
              aria-label="Search drama name"
              className="w-full rounded-2xl bg-zinc-900 border border-zinc-700 px-5 py-4 pr-28 text-base text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 transition-all"
            />
            <button
              type="submit"
              disabled={loading}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 px-5 py-2.5 text-sm font-semibold text-white transition-colors cursor-pointer"
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

        {/* ── Cold-start banner ── */}
        {showColdBanner && (
          <div className="mx-auto mt-6 w-full max-w-2xl px-4 animate-fade-in-up">
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 text-center">
              <WakeUpIcon />
              <p className="mt-3 text-sm font-medium text-amber-300">
                {COLD_START_TIPS[coldTipIdx]}
              </p>
              <div className="mt-3 mx-auto w-48 h-1 rounded-full bg-zinc-800 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-amber-500 to-purple-500 animate-cold-bar" />
              </div>
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <p className="text-center mt-6 text-red-400 text-sm animate-fade-in-up">
            {error}
          </p>
        )}

        {/* ── Skeleton loader ── */}
        {loading && !showColdBanner && (
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
                <div className="mt-6 space-y-3">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
                    Available Qualities
                  </p>
                  {videoInfo.streams.map((s, i) => (
                    <a
                      key={i}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-3 rounded-xl bg-zinc-800/80 border border-zinc-700/50 p-4 hover:border-purple-500/50 hover:bg-zinc-800 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`text-xs font-bold px-2.5 py-1 rounded-lg ${qualityColor(s.quality)}`}
                        >
                          {s.quality}
                        </span>
                        <span className="text-sm text-zinc-300">
                          {s.height ? `${s.height}p` : s.quality} stream
                        </span>
                      </div>
                      <span className="text-purple-400 group-hover:text-purple-300 text-sm font-medium flex items-center gap-1">
                        <DownloadIcon /> Download
                      </span>
                    </a>
                  ))}
                  <p className="text-[11px] text-zinc-600 mt-2">
                    Tip: Right-click &rarr; &ldquo;Save link as&rdquo; to download the file directly.
                  </p>
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
            Download Drama Episodes for Free
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-500 max-w-xl mx-auto">
            DramaDL lets you search and download Korean dramas (K-Drama),
            Chinese dramas (C-Drama), Thai dramas, Turkish series and more — all
            in HD quality. Simply type the name of any drama, pick an episode
            from the results, and choose your preferred quality to download.
          </p>
        </section>

        {/* ── Footer ── */}
        <footer className="mt-10 pb-8 text-center text-xs text-zinc-600 space-y-1 px-4">
          <p>
            This is a <span className="text-zinc-400 font-medium">fan-made</span> app.
            We do not host any content.
          </p>
          <p>
            Built with Next.js &amp; FastAPI &mdash; DramaDL &copy;{" "}
            {new Date().getFullYear()}
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

function WakeUpIcon() {
  return (
    <svg className="w-8 h-8 mx-auto text-amber-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
    </svg>
  );
}
