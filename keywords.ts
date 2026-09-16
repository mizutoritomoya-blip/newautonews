import { COMPANIES } from "./companies";

export { COMPANIES };

/** 業界の関心事。見出しに含まれていればタグとして立てる。 */
export const TOPICS: { id: string; label: string; aliases: string[] }[] = [
  { id: "ev", label: "EV", aliases: ["EV", "ＥＶ", "電気自動車", "BEV", "PHEV", "ハイブリッド", "全固体電池"] },
  { id: "ad", label: "自動運転", aliases: ["自動運転", "ADAS", "ロボタクシー", "レベル4", "SDV"] },
  { id: "sales", label: "販売・流通", aliases: ["販売店", "ディーラー", "中古車", "新車販売", "登録台数", "残価"] },
  { id: "finance", label: "金融・与信", aliases: ["オートローン", "残価設定", "リース", "クレジット", "与信"] },
  { id: "recall", label: "リコール", aliases: ["リコール", "不正", "認証", "型式指定"] },
  { id: "earnings", label: "業績", aliases: ["決算", "業績予想", "営業利益", "最終利益", "上方修正", "下方修正"] },
  { id: "policy", label: "政策・規制", aliases: ["補助金", "関税", "規制", "国交省", "経産省", "自工会"] },
];

const normalize = (s: string) => s.normalize("NFKC").toLowerCase();

export function matchCompanies(title: string): string[] {
  const t = normalize(title);
  return COMPANIES.filter((c) => c.aliases.some((a) => t.includes(normalize(a)))).map(
    (c) => c.code
  );
}

export function matchTopics(title: string): string[] {
  const t = normalize(title);
  return TOPICS.filter((k) => k.aliases.some((a) => t.includes(normalize(a)))).map((k) => k.id);
}

/**
 * 自動車の記事かどうかの判定に使う一般語。
 * 媒体の経済RSSなど、自動車以外も流れてくるフィードを絞り込むために使う。
 */
const AUTO_TERMS = [
  "自動車", "クルマ", "車", "EV", "ＥＶ", "電気自動車", "ハイブリッド",
  "自動運転", "新車", "中古車", "軽自動車", "トラック", "二輪", "バイク",
  "カーシェア", "モビリティ", "リコール", "ガソリン", "免許", "販売店", "ディーラー",
];

export function isAutomotive(title: string): boolean {
  const t = normalize(title);
  if (COMPANIES.some((c) => c.aliases.some((a) => t.includes(normalize(a))))) return true;
  return AUTO_TERMS.some((w) => t.includes(normalize(w)));
}
