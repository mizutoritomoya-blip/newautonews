import type { FeedSource, NewsItem } from "./types";
import { matchCompanies, matchTopics } from "./keywords";

/**
 * 企業のニュースリリース一覧ページから、日付つきのリンクを拾う。
 *
 * 日本の企業サイトのお知らせ欄は、ほぼ例外なく「日付 + 見出しリンク」の
 * 並びでできている。社ごとにHTML構造は違うが、この並びだけは共通なので、
 * リンクとその周辺テキストに日付があるかどうかで判定する。
 * セレクタを社ごとに書かずに済むぶん取りこぼしはあるが、企業を増やすときに
 * URLを1つ足すだけで済む。
 */

const DATE_PATTERNS: { re: RegExp; toIso: (m: RegExpMatchArray) => string }[] = [
  // 2026年9月9日 / 2026年09月09日
  {
    re: /(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/,
    toIso: (m) => iso(m[1], m[2], m[3]),
  },
  // 2026.09.09 / 2026/09/09 / 2026-09-09
  {
    re: /(20\d{2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})/,
    toIso: (m) => iso(m[1], m[2], m[3]),
  },
];

function iso(y: string, m: string, d: string): string {
  const mm = m.padStart(2, "0");
  const dd = d.padStart(2, "0");
  // 企業の開示は日本時間。時刻が無いので 09:00 JST 相当に置く
  return new Date(`${y}-${mm}-${dd}T09:00:00+09:00`).toISOString();
}

function findDate(text: string): string | null {
  for (const p of DATE_PATTERNS) {
    const m = text.match(p.re);
    if (m) {
      const value = p.toIso(m);
      if (!Number.isNaN(new Date(value).getTime())) return value;
    }
  }
  return null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function plain(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

/** ナビゲーションやフッターの定型リンクを落とす */
const NOISE = [
  "一覧", "もっと見る", "詳しくはこちら", "こちら", "トップ", "ホーム",
  "プライバシー", "サイトマップ", "お問い合わせ", "採用", "English",
  "次へ", "前へ", "PDF", "ページの先頭",
];

const MIN_TITLE = 8;
const MAX_TITLE = 160;
/** リンクの直前・直後どこまでを日付探索の範囲とするか */
const CONTEXT = 220;

export function parseHtmlList(
  html: string,
  source: FeedSource,
  pageUrl: string
): NewsItem[] {
  // 本文以外を落としてから走査する
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const anchor = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set<string>();
  const out: NewsItem[] = [];

  let m: RegExpExecArray | null;
  while ((m = anchor.exec(body)) !== null) {
    const href = m[1];
    const title = plain(m[2]);

    if (!href || href.startsWith("#") || href.startsWith("javascript:")) continue;
    if (title.length < MIN_TITLE || title.length > MAX_TITLE) continue;
    if (NOISE.some((n) => title === n || title.startsWith(n))) continue;

    let url: string;
    try {
      url = new URL(href, pageUrl).toString();
    } catch {
      continue;
    }
    if (seen.has(url)) continue;

    // リンクの前後から日付を探す。多くのサイトは日付がリンクの直前にある
    const before = body.slice(Math.max(0, m.index - CONTEXT), m.index);
    const after = body.slice(anchor.lastIndex, anchor.lastIndex + 80);
    const published =
      findDate(plain(before)) ?? findDate(title) ?? findDate(plain(after));

    // 日付が見つからないリンクはナビゲーションとみなして捨てる
    if (!published) continue;

    seen.add(url);
    out.push({
      id: `${source.id}:${url}`,
      title,
      url,
      publishedAt: published,
      section: source.section,
      sourceId: source.id,
      sourceName: source.name,
      outlet: source.name,
      category: source.category,
      companies: source.companyCode
        ? [...new Set([source.companyCode, ...matchCompanies(title)])]
        : matchCompanies(title),
      topics: matchTopics(title),
    });
  }

  return out.slice(0, 40);
}
