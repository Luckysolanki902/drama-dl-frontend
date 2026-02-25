import { NextRequest, NextResponse } from "next/server";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

interface SearchResult {
  title: string;
  url: string;
  thumbnail: string | null;
  duration: string | null;
  channel: string | null;
}

/**
 * Primary: Dailymotion public API search
 */
async function dailymotionApiSearch(
  query: string,
  maxResults = 12
): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    search: `${query} drama full episode`,
    fields: "id,title,thumbnail_480_url,duration,owner.screenname,url",
    limit: String(maxResults),
    sort: "relevance",
    longer_than: "10", // > 10 min — skip short clips
  });

  const resp = await fetch(
    `https://api.dailymotion.com/videos?${params}`,
    { headers: HEADERS, cache: "no-store" }
  );
  if (!resp.ok) throw new Error(`DM API ${resp.status}`);
  const data = await resp.json();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.list || []).map((item: any) => {
    const durSec = Number(item.duration) || 0;
    let duration: string | null = null;
    if (durSec) {
      const m = Math.floor(durSec / 60);
      const s = durSec % 60;
      duration = `${m}:${String(s).padStart(2, "0")}`;
    }
    return {
      title: String(item.title || ""),
      url:
        String(item.url || `https://www.dailymotion.com/video/${item.id}`),
      thumbnail: item.thumbnail_480_url ? String(item.thumbnail_480_url) : null,
      duration,
      channel: item["owner.screenname"] ? String(item["owner.screenname"]) : null,
    } as SearchResult;
  });
}

/**
 * Fallback: scrape Google for "query drama full episode site:dailymotion.com"
 */
async function googleSearchDailymotion(
  query: string,
  maxResults = 12
): Promise<SearchResult[]> {
  const searchQuery = `${query} drama full episode site:dailymotion.com`;
  const url = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&num=${maxResults + 5}`;

  const resp = await fetch(url, { headers: HEADERS, cache: "no-store" });
  if (!resp.ok) throw new Error(`Google ${resp.status}`);
  const html = await resp.text();

  const results: SearchResult[] = [];
  // Parse Google results with regex (no heavy HTML parser needed)
  const linkRegex = /\/url\?q=(https?:\/\/(?:www\.)?dailymotion\.com\/video\/[a-zA-Z0-9]+)[^"&]*/g;
  const seen = new Set<string>();
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    const dmUrl = decodeURIComponent(match[1]);
    if (seen.has(dmUrl)) continue;
    seen.add(dmUrl);

    // Try to extract title from nearby <h3> — simplified regex approach
    const idx = match.index;
    const snippet = html.substring(Math.max(0, idx - 500), idx + 500);
    const h3Match = snippet.match(/<h3[^>]*>(.*?)<\/h3>/);
    const title = h3Match
      ? h3Match[1].replace(/<[^>]+>/g, "").trim()
      : dmUrl;

    if (title.length < 3) continue;

    results.push({
      title,
      url: dmUrl,
      thumbnail: null,
      duration: null,
      channel: null,
    });

    if (results.length >= maxResults) break;
  }

  return results;
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json(
      { error: "Missing search query" },
      { status: 400 }
    );
  }

  // Try Dailymotion API first, fall back to Google scrape
  try {
    const results = await dailymotionApiSearch(q);
    if (results.length > 0) {
      return NextResponse.json(results);
    }
  } catch (e) {
    console.warn("DM API search failed:", e);
  }

  try {
    const results = await googleSearchDailymotion(q);
    return NextResponse.json(results);
  } catch (e) {
    console.error("Google search also failed:", e);
    return NextResponse.json(
      { error: "Search failed. Please try again." },
      { status: 502 }
    );
  }
}
