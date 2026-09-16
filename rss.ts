import { XMLParser } from "fast-xml-parser";
import type { FeedSource, NewsItem } from "./types";
import { COMPANIES } from "./companies";
import { matchCompanies, matchTopics } from "./keywords";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

const asArray = <T,>(v: T | T[] | undefined): T[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

/** 要素が文字列でもオブジェクトでもテキストを取り出す */
function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o["#text"] === "string") return o["#text"];
    if (typeof o["@_href"] === "string") return o["@_href"];
  }
  return "";
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

function toIso(raw: string): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Google ニュースの見出しは「本文の見出し - 媒体名」という形式。
 * 媒体名を切り出して、見出しからは取り除く。
 */
const MAX_OUTLET_LENGTH = 30;

function splitGoogleTitle(title: string): { title: string; outlet: string | null } {
  const idx = title.lastIndexOf(" - ");
  if (idx <= 0) return { title, outlet: null };

  const outlet = title.slice(idx + 3).trim();

  // 媒体名は短く、文の区切りを含まない。見出し本文に含まれるハイフンで
  // 誤って切らないよう、この2条件を満たすときだけ媒体名とみなす。
  if (!outlet || outlet.length > MAX_OUTLET_LENGTH) return { title, outlet: null };
  if (/[。、！？]/.test(outlet)) return { title, outlet: null };

  return { title: title.slice(0, idx).trim(), outlet };
}

/** RSS 2.0 / RSS 1.0(RDF) / Atom のどれでも項目を取り出す */
export function parseFeed(xml: string, source: FeedSource): NewsItem[] {
  const root = parser.parse(xml) as Record<string, any>;

  let raw: any[] = [];
  if (root.rss?.channel) {
    raw = asArray(root.rss.channel.item);
  } else if (root["rdf:RDF"]) {
    raw = asArray(root["rdf:RDF"].item);
  } else if (root.feed) {
    raw = asArray(root.feed.entry);
  } else if (root.channel) {
    raw = asArray(root.channel.item);
  }

  const isGoogle = source.url.includes("news.google.com");

  return raw
    .map((entry): NewsItem | null => {
      const rawTitle = stripTags(text(entry.title));
      if (!rawTitle) return null;

      let link = text(entry.link);
      if (!link && entry.link) {
        // Atom は link を配列で持ち、href 属性にURLが入る
        const alt = asArray(entry.link).find(
          (l: any) => !l?.["@_rel"] || l["@_rel"] === "alternate"
        );
        link = text(alt);
      }
      if (!link) link = text(entry.guid) || text(entry.id);
      if (!link) return null;

      const published =
        toIso(text(entry.pubDate)) ??
        toIso(text(entry["dc:date"])) ??
        toIso(text(entry.published)) ??
        toIso(text(entry.updated)) ??
        null;

      const { title, outlet } = isGoogle
        ? splitGoogleTitle(rawTitle)
        : { title: rawTitle, outlet: null };

      return {
        id: `${source.id}:${link}`,
        title,
        url: link,
        publishedAt: published,
        section: source.section,
        sourceId: source.id,
        sourceName: source.name,
        outlet: outlet ?? (isGoogle ? stripTags(text(entry.source)) || null : null),
        category: source.category,
        companies: source.companyCode
          ? [...new Set([source.companyCode, ...matchCompanies(title)])]
          : matchCompanies(title),
        topics: matchTopics(title),
      };
    })
    .filter((x): x is NewsItem => x !== null);
}

/** 見出しの表記ゆれを吸収して重複判定するためのキー */
function dedupeKey(item: NewsItem): string {
  // タブをまたいで束ねない。同じ話題でも「報道」と「企業リリース」は
  // 別の情報なので、どちらも残す。
  return item.section + "|" + item.title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s"'“”「」『』【】（）()]/g, "")
    .slice(0, 60);
}

/**
 * 同じ記事が複数フィードから来るため、見出しで束ねる。
 * 元記事へ直接リンクできる媒体（専門メディア）を Google ニュース経由より優先。
 */
export function dedupe(items: NewsItem[]): NewsItem[] {
  const best = new Map<string, NewsItem>();
  for (const item of items) {
    const key = dedupeKey(item);
    const current = best.get(key);
    if (!current) {
      best.set(key, item);
      continue;
    }
    const currentIsGoogle = current.sourceId.startsWith("gn-");
    const nextIsGoogle = item.sourceId.startsWith("gn-");
    if (currentIsGoogle && !nextIsGoogle) best.set(key, item);
  }
  return [...best.values()];
}

export function sortByDate(items: NewsItem[]): NewsItem[] {
  return [...items].sort((a, b) => {
    if (!a.publishedAt) return 1;
    if (!b.publishedAt) return -1;
    return b.publishedAt.localeCompare(a.publishedAt);
  });
}


/**
 * はてなブックマークの検索RSS。
 * item に hatena:bookmarkcount が入っており、これが反響の強さになる。
 * 元記事のURLと媒体のドメインも取れるので、どこの記事が読まれているか分かる。
 */
export function parseHatena(xml: string, source: FeedSource): NewsItem[] {
  const root = parser.parse(xml) as Record<string, any>;
  const raw = asArray(root["rdf:RDF"]?.item ?? root.rss?.channel?.item);

  return raw
    .map((entry): NewsItem | null => {
      const title = stripTags(text(entry.title));
      const link = text(entry.link);
      if (!title || !link) return null;

      const score = Number(
        text(entry["hatena:bookmarkcount"]) || text(entry.bookmarkcount) || 0
      );

      let outlet: string | null = null;
      try {
        outlet = new URL(link).hostname.replace(/^www\./, "");
      } catch {
        outlet = null;
      }

      return {
        id: `${source.id}:${link}`,
        title,
        url: link,
        publishedAt: toIso(text(entry["dc:date"])) ?? toIso(text(entry.pubDate)),
        section: source.section,
        sourceId: source.id,
        sourceName: source.name,
        outlet,
        category: source.category,
        companies: source.companyCode
          ? [...new Set([source.companyCode, ...matchCompanies(title)])]
          : matchCompanies(title),
        topics: matchTopics(title),
        score: Number.isFinite(score) ? score : 0,
      };
    })
    .filter((x): x is NewsItem => x !== null);
}

/**
 * Google トレンドの急上昇ワード。
 * 日本全体の急上昇なので大半は自動車と無関係。追跡企業の名前に当たった
 * ものだけを残す。当たれば「いま検索が伸びている」という強い信号になる。
 */
export function parseTrends(xml: string, source: FeedSource): NewsItem[] {
  const root = parser.parse(xml) as Record<string, any>;
  const raw = asArray(root.rss?.channel?.item);
  const out: NewsItem[] = [];

  for (const entry of raw) {
    const term = stripTags(text(entry.title));
    if (!term) continue;

    const newsItems = asArray(entry["ht:news_item"]);
    const headlines = newsItems
      .map((n: any) => stripTags(text(n["ht:news_item_title"])))
      .filter(Boolean);

    // 急上昇ワード本体か、紐づく記事見出しに追跡企業が出ていれば採用
    const hit = [term, ...headlines].flatMap((t) => matchCompanies(t));
    if (hit.length === 0) continue;

    const first = newsItems[0];
    const link =
      text(first?.["ht:news_item_url"]) ||
      `https://trends.google.co.jp/trends/explore?q=${encodeURIComponent(term)}&geo=JP`;
    const traffic = stripTags(text(entry["ht:approx_traffic"]));

    out.push({
      id: `${source.id}:${term}`,
      title: traffic ? `急上昇ワード「${term}」（${traffic}）` : `急上昇ワード「${term}」`,
      url: link,
      publishedAt: toIso(text(entry.pubDate)),
      section: source.section,
      sourceId: source.id,
      sourceName: source.name,
      outlet: "Google トレンド",
      category: source.category,
      companies: [...new Set(hit)],
      topics: matchTopics([term, ...headlines].join(" ")),
    });
  }

  return out;
}

/** COMPANIES を参照していることを型チェックに示すための再エクスポート */
export const TRACKED_CODES = COMPANIES.map((c) => c.code);
