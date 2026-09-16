import { NextResponse } from "next/server";
import { sourcesForSection } from "@/lib/sources";
import { COMPANIES } from "@/lib/companies";
import { parseFeed, parseHatena, parseTrends, dedupe, sortByDate } from "@/lib/rss";
import { parseHtmlList } from "@/lib/html";
import { isAutomotive } from "@/lib/keywords";
import type { FeedSource, FeedStatus, NewsItem, NewsResponse, Section } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 取得元が150を超えるため、1回のリクエストで全部は取りに行かない。
 * タブ（section）ごとに分けて取得し、さらに Next.js のデータキャッシュに
 * 預けることで、2回目以降は外部へ出ずに返す。
 */
const REVALIDATE: Record<Section, number> = {
  report: 300,    // 報道は5分
  release: 1800,  // 企業リリースは30分（更新頻度が低い）
  buzz: 900,      // 反響は15分
};

const TIMEOUT_MS = Number(process.env.FEED_TIMEOUT_MS ?? 8000);
const CONCURRENCY = Number(process.env.FEED_CONCURRENCY ?? 10);

function parseBySource(body: string, source: FeedSource): NewsItem[] {
  switch (source.kind) {
    case "hatena":
      return parseHatena(body, source);
    case "trends":
      return parseTrends(body, source);
    case "html":
      return parseHtmlList(body, source, source.url);
    case "rss":
    default:
      return parseFeed(body, source);
  }
}

async function fetchOne(
  source: FeedSource,
  revalidate: number,
  force: boolean
): Promise<{ items: NewsItem[]; status: FeedStatus }> {
  const base: FeedStatus = {
    id: source.id,
    name: source.name,
    section: source.section,
    category: source.category,
    url: source.url,
    ok: false,
    count: 0,
    error: null,
    unverified: Boolean(source.unverified),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(source.url, {
      signal: controller.signal,
      headers: {
        // 名乗らないと弾く配信元があるため素性を明示する
        "User-Agent": "AutoNewsPortal/3.0 (personal news dashboard)",
        Accept:
          source.kind === "html"
            ? "text/html,application/xhtml+xml,*/*"
            : "application/rss+xml, application/xml, text/xml, */*",
      },
      // force のときだけ実際に取りに行く。通常はキャッシュを使う
      ...(force ? { cache: "no-store" as const } : { next: { revalidate } }),
    });

    if (!res.ok) {
      return { items: [], status: { ...base, error: `HTTP ${res.status}` } };
    }

    const body = await res.text();
    const parsed = parseBySource(body, source);
    const items = source.filterAutomotive
      ? parsed.filter((item) => isAutomotive(item.title))
      : parsed;

    return { items, status: { ...base, ok: true, count: items.length } };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? `タイムアウト (${TIMEOUT_MS}ms)`
          : err.message
        : "不明なエラー";
    return { items: [], status: { ...base, error: message } };
  } finally {
    clearTimeout(timer);
  }
}

/** 取得元が多いので、小分けにして配信元へ殺到させない */
async function fetchAll(sources: FeedSource[], revalidate: number, force: boolean) {
  const results: Awaited<ReturnType<typeof fetchOne>>[] = [];
  for (let i = 0; i < sources.length; i += CONCURRENCY) {
    const chunk = sources.slice(i, i + CONCURRENCY);
    results.push(...(await Promise.all(chunk.map((s) => fetchOne(s, revalidate, force)))));
  }
  return results;
}

function isSection(value: string | null): value is Section {
  return value === "report" || value === "release" || value === "buzz";
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const raw = params.get("section");
  const section: Section = isSection(raw) ? raw : "report";
  const force = params.get("force") === "1";

  const sources = sourcesForSection(section);
  const results = await fetchAll(sources, REVALIDATE[section], force);

  const payload: NewsResponse = {
    section,
    fetchedAt: new Date().toISOString(),
    cached: !force,
    items: sortByDate(dedupe(results.flatMap((r) => r.items))).slice(0, 400),
    feeds: results.map((r) => r.status),
    companies: COMPANIES.map((c) => ({
      code: c.code,
      short: c.short,
      name: c.name,
      sector: c.sector,
    })),
  };

  return NextResponse.json(payload);
}
