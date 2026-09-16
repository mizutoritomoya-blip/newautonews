import type { Sector } from "./companies";

/** 画面のタブ。取得元ではなく「何の情報か」で分ける。 */
export type Section = "report" | "release" | "buzz";

export const SECTION_LABELS: Record<Section, string> = {
  report: "報道",
  release: "企業リリース",
  buzz: "ネットの反響",
};

export type SourceCategory =
  | "wire"       // 通信社・大手横断
  | "press"      // 新聞社
  | "broadcast"  // テレビ局
  | "corporate"  // 企業のニュースリリース
  | "social";    // はてなブックマーク・Googleトレンド

export type FeedKind = "rss" | "html" | "hatena" | "trends";

export type FeedSource = {
  id: string;
  name: string;
  section: Section;
  category: SourceCategory;
  kind: FeedKind;
  url: string;
  /** 配信URLが推定のものに付ける。落ちていても想定内だと画面で示す */
  unverified?: boolean;
  /** この取得元が特定企業に紐づく場合の証券コード */
  companyCode?: string;
  /** 自動車関連かどうかの絞り込みを適用するか */
  filterAutomotive?: boolean;
};

export type NewsItem = {
  id: string;
  title: string;
  url: string;
  publishedAt: string | null;
  section: Section;
  sourceId: string;
  sourceName: string;
  /** 実際に報じた媒体名（Google ニュース経由やはてブの場合） */
  outlet: string | null;
  category: SourceCategory;
  /** 見出しに含まれていた追跡企業の証券コード */
  companies: string[];
  /** 見出しに含まれていた業界キーワード */
  topics: string[];
  /** はてなブックマーク数。反響の強さの指標 */
  score?: number;
};

export type FeedStatus = {
  id: string;
  name: string;
  section: Section;
  category: SourceCategory;
  url: string;
  ok: boolean;
  count: number;
  error: string | null;
  unverified: boolean;
};

export type CompanyMeta = {
  code: string;
  short: string;
  name: string;
  sector: Sector;
};

export type NewsResponse = {
  section: Section;
  fetchedAt: string;
  cached: boolean;
  items: NewsItem[];
  feeds: FeedStatus[];
  companies: CompanyMeta[];
};
