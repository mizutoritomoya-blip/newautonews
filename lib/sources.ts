import { COMPANIES } from "./companies";
import type { FeedSource } from "./types";

/**
 * Google ニュースの検索RSS。
 *
 * 新聞社・通信社・テレビ局の多くは自社RSSを廃止しているか配信URLを公開して
 * いない。Google ニュースの検索RSSは配信元の媒体名つきで見出しを返すため、
 * 大手メディアを横断して拾う最も確実な手段になる。`site:` で媒体を指定でき、
 * `when:` で対象期間を絞れる。
 */
function gn(
  id: string,
  name: string,
  category: FeedSource["category"],
  query: string,
  companyCode?: string
): FeedSource {
  return {
    id,
    name,
    section: "report",
    category,
    kind: "rss",
    url: `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ja&gl=JP&ceid=JP:ja`,
    companyCode,
  };
}

const AUTO = "(自動車 OR クルマ OR EV OR トヨタ OR 日産 OR ホンダ)";

/** ── 報道：媒体別 ───────────────────────────────────────── */
const MEDIA: FeedSource[] = [
  gn("kyodo", "共同通信", "wire", `${AUTO} site:nordot.app OR site:kyodo.co.jp when:3d`),
  gn("jiji", "時事通信", "wire", `${AUTO} site:jiji.com when:3d`),
  gn("reuters-jp", "ロイター", "wire", `${AUTO} site:jp.reuters.com OR site:reuters.com/jp when:3d`),
  gn("bloomberg-jp", "ブルームバーグ", "wire", `${AUTO} site:bloomberg.co.jp when:3d`),

  gn("nikkei", "日本経済新聞", "press", `${AUTO} site:nikkei.com when:3d`),
  gn("asahi", "朝日新聞", "press", `${AUTO} site:asahi.com when:3d`),
  gn("yomiuri", "読売新聞", "press", `${AUTO} site:yomiuri.co.jp when:3d`),
  gn("mainichi", "毎日新聞", "press", `${AUTO} site:mainichi.jp when:3d`),
  gn("sankei", "産経新聞", "press", `${AUTO} site:sankei.com when:3d`),
  gn("tokyonp", "東京新聞", "press", `${AUTO} site:tokyo-np.co.jp when:5d`),
  gn("chunichi", "中日新聞", "press", `${AUTO} site:chunichi.co.jp when:5d`),

  gn("nhk", "NHK", "broadcast", `${AUTO} site:nhk.or.jp when:3d`),
  gn("ntv", "日本テレビ", "broadcast", `${AUTO} site:news.ntv.co.jp when:5d`),
  gn("tbs", "TBS", "broadcast", `${AUTO} site:newsdig.tbs.co.jp when:5d`),
  gn("fuji", "フジテレビ", "broadcast", `${AUTO} site:fnn.jp when:5d`),
  gn("tvasahi", "テレビ朝日", "broadcast", `${AUTO} site:news.tv-asahi.co.jp when:5d`),
  gn("tvtokyo", "テレビ東京", "broadcast", `${AUTO} site:txbiz.tv-tokyo.co.jp OR site:tv-tokyo.co.jp when:5d`),

  // 媒体別クエリから漏れた地方紙・経済誌を拾う保険
  gn("all-industry", "横断：自動車業界", "wire", "自動車業界 OR 自動車メーカー when:2d"),
  gn("all-ev", "横断：EV・電動化", "wire", "電気自動車 OR EV 自動車 when:2d"),
  gn("all-sales", "横断：販売・中古車", "wire", "新車販売 OR 中古車 OR 自動車販売店 when:3d"),
];

/** ── 報道：企業別（companies.ts で gnews: true の企業）───── */
const COMPANY_NEWS: FeedSource[] = COMPANIES.filter((c) => c.gnews).map((c) =>
  gn(`gn-${c.code}`, `報道：${c.short}`, "wire", `${c.name} when:3d`, c.code)
);

/**
 * URL に含まれる {year} を現在の年（JST）へ置き換える。
 * 年別ページしか静的に読めないサイトのための仕組み。
 */
function resolveYear(url: string): string {
  if (!url.includes("{year}")) return url;
  const year = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).format(new Date());
  return url.replaceAll("{year}", year);
}

/** ── 企業リリース（companies.ts で newsUrl を持つ企業）───── */
const RELEASES: FeedSource[] = COMPANIES.filter((c) => c.newsUrl).flatMap((c) => {
  const urls = [c.newsUrl!, ...(c.extraNewsUrls ?? [])];
  return urls.map((url, i) => ({
    id: i === 0 ? `rel-${c.code}` : `rel-${c.code}-${i}`,
    // 複数ページを持つ企業は、どのページ由来か分かるようホスト名を添える
    name:
      i === 0
        ? `${c.short} ニュースリリース`
        : `${c.short} ニュースリリース（${hostLabel(url)}）`,
    section: "release" as const,
    category: "corporate" as const,
    kind: (c.newsKind ?? "html") as "rss" | "html",
    url: resolveYear(url),
    companyCode: c.code,
  }));
});

/** URLから一覧表示用の短いラベルを作る */
function hostLabel(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.split("/").filter(Boolean)[0];
    return path && path !== "index.html" ? path : u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** ── 本国ニュースルーム（海外メーカー）───────────────── */
const GLOBAL_RELEASES: FeedSource[] = COMPANIES.filter((c) => c.globalNewsUrl).map(
  (c) => ({
    id: `glb-${c.code}`,
    name: `${c.short} 本国ニュースルーム`,
    section: "release" as const,
    category: "corporate" as const,
    kind: (c.globalNewsKind ?? "html") as "rss" | "html",
    url: resolveYear(c.globalNewsUrl!),
    companyCode: c.code,
  })
);

/**
 * ── ネットの反響：はてなブックマーク ─────────────────────
 * 企業名を含む記事が、いま何件ブックマークされているかを返す。
 * X の代わりに「ネット上でいま読まれている記事」を測る指標として使う。
 */
const BUZZ: FeedSource[] = COMPANIES.filter((c) => c.buzz).map((c) => ({
  id: `hb-${c.code}`,
  name: `反響：${c.short}`,
  section: "buzz" as const,
  category: "social" as const,
  kind: "hatena" as const,
  url: `https://b.hatena.ne.jp/search/text?q=${encodeURIComponent(
    c.buzzQuery ?? c.name
  )}&mode=rss&sort=recent&users=3`,
  companyCode: c.code,
}));

/** ── ネットの反響：Google トレンド ───────────────────────── */
const TRENDS: FeedSource[] = [
  {
    id: "gtrends",
    name: "Google トレンド（日本）",
    section: "buzz",
    category: "social",
    kind: "trends",
    url: "https://trends.google.co.jp/trending/rss?geo=JP",
  },
];

/** ── 任意：自社RSSを直接読む媒体 ─────────────────────────── */
const DIRECT_RSS: FeedSource[] = [
  {
    id: "asahi-rss",
    name: "朝日新聞 経済（直接RSS）",
    section: "report",
    category: "press",
    kind: "rss",
    url: "https://www.asahi.com/rss/asahi/business.rdf",
    unverified: true,
    filterAutomotive: true,
  },
  {
    id: "nhk-rss",
    name: "NHK 経済（直接RSS）",
    section: "report",
    category: "broadcast",
    kind: "rss",
    url: "https://www.nhk.or.jp/rss/news/cat5.xml",
    unverified: true,
    filterAutomotive: true,
  },
];

export const SOURCES: FeedSource[] = [
  ...MEDIA,
  ...COMPANY_NEWS,
  ...RELEASES,
  ...GLOBAL_RELEASES,
  ...BUZZ,
  ...TRENDS,
  ...DIRECT_RSS,
];

export function sourcesForSection(section: FeedSource["section"]): FeedSource[] {
  return SOURCES.filter((s) => s.section === section);
}

export const CATEGORY_LABELS: Record<string, string> = {
  wire: "通信社・横断",
  press: "新聞社",
  broadcast: "テレビ局",
  corporate: "企業リリース",
  social: "ネットの反響",
};
