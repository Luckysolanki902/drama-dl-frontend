import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300; // 5 minutes max for Vercel Pro, 60s on Hobby

const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

function parseM3u8Variants(
  m3u8Text: string,
  baseUrl: string
): { name: string; url: string; height: number | null }[] {
  const variants: { name: string; url: string; height: number | null }[] = [];
  const lines = m3u8Text.trim().split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("#EXT-X-STREAM-INF")) continue;
    const resMatch = line.match(/RESOLUTION=\d+x(\d+)/);
    const nameMatch = line.match(/NAME="([^"]+)"/);
    const height = resMatch ? parseInt(resMatch[1]) : null;
    const name = nameMatch ? nameMatch[1] : height ? String(height) : "auto";
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
    if (variantUrl) variants.push({ name, url: variantUrl, height });
  }
  return variants;
}

async function fetchOk(
  url: string,
  headers: Record<string, string>,
  retries = 3
): Promise<Response | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(url, { headers, cache: "no-store" });
      if (resp.ok) return resp;
      console.error(`Fetch ${i + 1}/${retries} ${url.substring(0, 80)}: ${resp.status}`);
    } catch (e) {
      console.error(`Fetch ${i + 1}/${retries} ${url.substring(0, 80)}: ${e}`);
    }
    if (i < retries - 1) await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
  }
  return null;
}

async function resolveVariantAndSegments(
  videoId: string,
  quality: string
): Promise<{ segments: string[]; title: string } | null> {
  // Full chain: metadata -> m3u8 -> variant -> segments — all from same Lambda/IP
  const referer = `https://www.dailymotion.com/video/${videoId}`;

  // 1. Metadata
  const metaResp = await fetchOk(
    `https://www.dailymotion.com/player/metadata/video/${videoId}`,
    { ...HEADERS, Referer: referer },
    2
  );
  if (!metaResp) return null;
  const meta = await metaResp.json();
  const title = (meta.title || "video")
    .replace(/[^\w\s-]/g, "")
    .substring(0, 60)
    .trim();

  // 2. Master m3u8 (5 retries — CDN director is flaky from cloud IPs)
  const m3u8Url = meta.qualities?.auto?.[0]?.url;
  if (!m3u8Url) return null;

  const m3u8Resp = await fetchOk(m3u8Url, { ...HEADERS, Referer: referer }, 5);
  if (!m3u8Resp) return null;
  const m3u8Text = await m3u8Resp.text();
  if (!m3u8Text.includes("#EXTM3U")) return null;

  // 3. Find variant
  const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf("/"));
  const variants = parseM3u8Variants(m3u8Text, baseUrl);
  if (variants.length === 0) return null;

  const match = variants.find(
    (v) => v.name === quality || String(v.height) === quality
  );
  const variantUrl = match?.url || variants[variants.length - 1].url;

  // 4. Fetch variant m3u8 (segment playlist) — same Lambda IP, should work
  const varResp = await fetchOk(variantUrl, HEADERS, 3);
  if (!varResp) return null;
  const varText = await varResp.text();
  const varBase = variantUrl.substring(0, variantUrl.lastIndexOf("/"));

  const segments = varText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => (l.startsWith("http") ? l : `${varBase}/${l}`));

  return segments.length > 0 ? { segments, title } : null;
}

async function streamFromVariantUrl(
  variantUrl: string
): Promise<string[] | null> {
  const resp = await fetchOk(variantUrl, HEADERS, 3);
  if (!resp) return null;
  const text = await resp.text();
  const base = variantUrl.substring(0, variantUrl.lastIndexOf("/"));

  const segments = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => (l.startsWith("http") ? l : `${base}/${l}`));

  return segments.length > 0 ? segments : null;
}

export async function GET(request: NextRequest) {
  const encodedUrl = request.nextUrl.searchParams.get("u");
  const encodedTitle = request.nextUrl.searchParams.get("t");
  const qualityParam =
    request.nextUrl.searchParams.get("q") ||
    request.nextUrl.searchParams.get("quality") ||
    "auto";
  const videoId = request.nextUrl.searchParams.get("id");

  let title = "video";
  if (encodedTitle) {
    try {
      title = Buffer.from(encodedTitle, "base64url").toString();
    } catch {
      /* ignore */
    }
  }

  let segments: string[] | null = null;

  // Strategy 1: Full chain from same Lambda (most reliable — same IP throughout)
  if (videoId) {
    console.log(
      `[download] Strategy 1: full chain for ${videoId} @ ${qualityParam}`
    );
    const result = await resolveVariantAndSegments(videoId, qualityParam);
    if (result) {
      segments = result.segments;
      if (title === "video") title = result.title;
    }
  }

  // Strategy 2: Direct variant URL (fast but may fail if Lambda IP differs)
  if (!segments && encodedUrl) {
    console.log(`[download] Strategy 2: direct variant URL`);
    try {
      const variantUrl = Buffer.from(encodedUrl, "base64url").toString();
      segments = await streamFromVariantUrl(variantUrl);
    } catch (e) {
      console.error("[download] Strategy 2 failed:", e);
    }
  }

  if (!segments || segments.length === 0) {
    return NextResponse.json(
      {
        error:
          "Could not resolve video stream. The CDN may be blocking this request.",
        tip: "Try again — each attempt gets a different server route.",
      },
      { status: 502 }
    );
  }

  console.log(
    `[download] Streaming ${segments.length} segments @ ${qualityParam}`
  );

  // Stream all segments as concatenated .ts file
  const capturedSegments = segments;
  const stream = new ReadableStream({
    async start(controller) {
      for (let i = 0; i < capturedSegments.length; i++) {
        try {
          const segResp = await fetch(capturedSegments[i], {
            headers: HEADERS,
            cache: "no-store",
          });
          if (!segResp.ok || !segResp.body) {
            console.error(`Segment ${i} failed: ${segResp.status}`);
            continue;
          }
          const reader = segResp.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } catch (e) {
          console.error(`Segment ${i} error:`, e);
        }
      }
      controller.close();
    },
  });

  const filename = `${title} ${qualityParam}p.ts`;

  return new Response(stream, {
    headers: {
      "Content-Type": "video/mp2t",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-cache",
    },
  });
}
