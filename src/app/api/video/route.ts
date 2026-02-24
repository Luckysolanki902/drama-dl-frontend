import { NextRequest, NextResponse } from "next/server";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

const QUALITY_MAP: Record<string, { label: string; width: number; height: number }> = {
  "380": { label: "380p", width: 512, height: 288 },
  "480": { label: "480p", width: 848, height: 480 },
  "720": { label: "720p", width: 1280, height: 720 },
  "1080": { label: "1080p", width: 1920, height: 1080 },
};

function extractVideoId(url: string): string | null {
  const match = url.match(/dailymotion\.com\/video\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

interface Variant {
  name: string;
  url: string;
  width: number | null;
  height: number | null;
}

function parseM3u8Variants(m3u8Text: string, baseUrl: string): Variant[] {
  const variants: Variant[] = [];
  const lines = m3u8Text.trim().split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("#EXT-X-STREAM-INF")) continue;

    const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/);
    const nameMatch = line.match(/NAME="([^"]+)"/);
    const width = resMatch ? parseInt(resMatch[1]) : null;
    const height = resMatch ? parseInt(resMatch[2]) : null;
    const name = nameMatch ? nameMatch[1] : height ? String(height) : "auto";

    // Next non-comment line is the variant URL
    let variantUrl = "";
    for (let j = i + 1; j < lines.length; j++) {
      if (!lines[j].trim().startsWith("#")) {
        variantUrl = lines[j].trim();
        break;
      }
    }
    if (variantUrl && !variantUrl.startsWith("http")) {
      variantUrl = `${baseUrl}/${variantUrl}`;
    }
    if (variantUrl) {
      variants.push({ name, url: variantUrl, width, height });
    }
  }
  return variants;
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    return NextResponse.json({ error: "Invalid Dailymotion URL" }, { status: 400 });
  }

  try {
    // 1. Fetch metadata
    const metaResp = await fetch(
      `https://www.dailymotion.com/player/metadata/video/${videoId}`,
      {
        headers: {
          ...HEADERS,
          Referer: `https://www.dailymotion.com/video/${videoId}`,
        },
        cache: "no-store",
      }
    );
    if (!metaResp.ok) {
      return NextResponse.json({ error: "Metadata fetch failed" }, { status: 502 });
    }
    const meta = await metaResp.json();

    const title = meta.title || "Unknown";
    const thumbnails = meta.thumbnails || {};
    const thumbnail =
      thumbnails["720"] || thumbnails["480"] || thumbnails["240"] ||
      meta.posters?.["720"] || meta.posters?.["480"] || meta.thumbnail_url || null;
    const duration = meta.duration || null;

    // 2. Try HLS manifest parsing
    const qualities = meta.qualities || {};
    const autoVariants = qualities.auto || [];
    const m3u8Url = autoVariants[0]?.url || null;

    interface Stream {
      quality: string;
      url: string;
      width: number | null;
      height: number | null;
    }
    const streams: Stream[] = [];

    if (m3u8Url) {
      try {
        const m3u8Resp = await fetch(m3u8Url, {
          headers: { ...HEADERS, Referer: `https://www.dailymotion.com/video/${videoId}` },
          cache: "no-store",
        });
        if (m3u8Resp.ok) {
          const m3u8Text = await m3u8Resp.text();
          if (m3u8Text.includes("#EXTM3U")) {
            const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf("/"));
            const variants = parseM3u8Variants(m3u8Text, baseUrl);
            for (const v of variants) {
              // Include both the encoded variant URL (fast path) and videoId (fallback full chain)
              const encodedUrl = Buffer.from(v.url).toString("base64url");
              const encodedTitle = Buffer.from(title).toString("base64url");
              streams.push({
                quality: `${v.name}p`,
                url: `/api/download?id=${videoId}&u=${encodedUrl}&t=${encodedTitle}&q=${v.name}`,
                width: v.width,
                height: v.height,
              });
            }
          }
        }
      } catch (e) {
        console.error("m3u8 fetch failed:", e);
      }
    }

    // 3. Fallback: use stream_formats from metadata
    if (streams.length === 0) {
      const streamFormats = meta.stream_formats;
      let formatKeys: string[] = [];
      if (streamFormats && typeof streamFormats === "object" && !Array.isArray(streamFormats)) {
        formatKeys = Object.keys(streamFormats);
      } else if (Array.isArray(streamFormats)) {
        formatKeys = streamFormats;
      }
      const encodedM3u8 = m3u8Url ? Buffer.from(m3u8Url).toString("base64url") : "";
      const encodedTitle = Buffer.from(title).toString("base64url");
      formatKeys
        .filter((k) => /^\d+$/.test(k))
        .sort((a, b) => parseInt(b) - parseInt(a))
        .forEach((fmt) => {
          const info = QUALITY_MAP[fmt] || { label: `${fmt}p`, width: null, height: parseInt(fmt) };
          streams.push({
            quality: info.label,
            url: `/api/download?id=${videoId}&quality=${fmt}&m=${encodedM3u8}&t=${encodedTitle}`,
            width: info.width,
            height: info.height,
          });
        });
    }

    // 4. Last resort
    if (streams.length === 0) {
      const encodedTitle = Buffer.from(title).toString("base64url");
      streams.push({
        quality: "auto",
        url: `/api/download?id=${videoId}&quality=auto&t=${encodedTitle}`,
        width: null,
        height: null,
      });
    }

    // Sort by height descending
    streams.sort((a, b) => (b.height || 0) - (a.height || 0));

    return NextResponse.json({
      title,
      thumbnail,
      duration,
      streams,
      m3u8Url: m3u8Url || null,
      videoId,
    });
  } catch (e) {
    console.error("Video info extraction failed:", e);
    return NextResponse.json({ error: "Extraction failed" }, { status: 502 });
  }
}
