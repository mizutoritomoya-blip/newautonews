"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CompanyMeta, NewsItem, NewsResponse, Section } from "@/lib/types";
import { SECTION_LABELS } from "@/lib/types";
import { CATEGORY_LABELS } from "@/lib/sources";
import { SECTOR_LABELS, type Sector } from "@/lib/companies";

const POLL_MS = 60_000;
const SECTIONS: Section[] = ["report", "release", "buzz"];
const SECTORS: Sector[] = ["oem", "dealer", "finance", "parts", "other"];
const DOW = ["日", "月", "火", "水", "木", "金", "土"];

const SECTION_NOTES: Record<Section, string> = {
  report:
    "新聞社・通信社・テレビ局が報じた自動車関連の見出し。追跡企業が見出しに出ている記事には印が付く。",
  release:
    "各社が自社サイトに出したお知らせ。報道されなかった小さな告知もここに入る。",
  buzz:
    "はてなブックマークで集められている記事と、Google トレンドで追跡企業の名前が急上昇したもの。数字はブックマーク数。",
};

function jstParts(iso: string) {
  const d = new Date(iso);
  const f = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    month: get("month"),
    date: get("day"),
    year: get("year"),
    time: `${get("hour")}:${get("minute")}`,
    dow: DOW[d.getDay()] ?? "",
  };
}

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "たった今";
  if (mins < 60) return `${mins}分前`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}時間前`;
  return `${Math.round(hours / 24)}日前`;
}

export default function Portal() {
  const [bySection, setBySection] = useState<Partial<Record<Section, NewsResponse>>>({});
  const [errors, setErrors] = useState<Partial<Record<Section, string>>>({});
  const [loadingSection, setLoadingSection] = useState<Section | null>("report");
  const [section, setSection] = useState<Section>("report");
  const [sector, setSector] = useState<Sector | "all">("all");
  const [company, setCompany] = useState<string>("all");
  const [onlyTracked, setOnlyTracked] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(async (target: Section, force = false) => {
    setLoadingSection((current) => current ?? target);
    try {
      const res = await fetch(
        `/api/news?section=${target}${force ? "&force=1" : ""}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = (await res.json()) as NewsResponse;
      setBySection((prev) => ({ ...prev, [target]: payload }));
      setErrors((prev) => ({ ...prev, [target]: undefined }));
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [target]: err instanceof Error ? err.message : "取得に失敗しました",
      }));
    } finally {
      setLoadingSection((current) => (current === target ? null : current));
    }
  }, []);

  // 表示中のタブを読み、残りのタブは裏で先読みする
  useEffect(() => {
    if (!bySection[section] && !errors[section]) load(section);
  }, [section, bySection, errors, load]);

  useEffect(() => {
    const timer = setTimeout(() => {
      for (const s of SECTIONS) {
        if (s !== section && !bySection[s] && !errors[s]) load(s);
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [section, bySection, errors, load]);

  // 表示中のタブだけを定期更新する
  useEffect(() => {
    const timer = setInterval(() => load(section), POLL_MS);
    const onFocus = () => load(section);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [section, load]);

  const current = bySection[section];
  const data = current ?? null;
  const error = errors[section] ?? null;
  const loading = loadingSection === section && !current;

  const companies: CompanyMeta[] = useMemo(() => {
    for (const s of SECTIONS) {
      const found = bySection[s]?.companies;
      if (found?.length) return found;
    }
    return [];
  }, [bySection]);
  const byCode = useMemo(() => {
    const m = new Map<string, CompanyMeta>();
    for (const c of companies) m.set(c.code, c);
    return m;
  }, [companies]);

  const items = useMemo(() => current?.items ?? [], [current]);

  const sectionCounts = useMemo(() => {
    const c: Partial<Record<Section, number>> = {};
    for (const s of SECTIONS) {
      const loaded = bySection[s];
      if (loaded) c[s] = loaded.items.length;
    }
    return c;
  }, [bySection]);

  const visible = useMemo(() => {
    const q = query.trim().normalize("NFKC").toLowerCase();
    return items.filter((item) => {
      if (company !== "all" && !item.companies.includes(company)) return false;
      if (sector !== "all") {
        const hit = item.companies.some((code) => byCode.get(code)?.sector === sector);
        if (!hit) return false;
      }
      if (onlyTracked && item.companies.length === 0) return false;
      if (q) {
        const hay = `${item.title} ${item.outlet ?? ""} ${item.sourceName}`
          .normalize("NFKC")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, company, sector, onlyTracked, query, byCode]);

  const groups = useMemo(() => {
    const map = new Map<string, NewsItem[]>();
    for (const item of visible) {
      const key = item.publishedAt ? jstParts(item.publishedAt).day : "日付不明";
      const list = map.get(key);
      if (list) list.push(item);
      else map.set(key, [item]);
    }
    return [...map.entries()];
  }, [visible]);

  const trackedCount = useMemo(
    () => items.filter((i) => i.companies.length > 0).length,
    [items]
  );

  const feeds = useMemo(() => current?.feeds ?? [], [current]);

  return (
    <div className="wrap">
      <header className="masthead">
        <p className="eyebrow">Automotive Press Monitor</p>
        <h1>自動車報道ウォッチ</h1>
        <p className="standfirst">
          報道・企業リリース・ネットの反響を、追跡企業{companies.length}社を軸に
          一画面で追う。見出しに追跡企業が出ていれば印が付く。
        </p>
        <div className="status-line">
          <span className="live">1分ごとに自動更新</span>
          <span>
            収録 <b>{items.length}</b> 件
          </span>
          <span>
            うち追跡企業 <b>{trackedCount}</b> 件
          </span>
          <span>
            最終取得 <b>{data ? ago(data.fetchedAt) : "—"}</b>
          </span>
          <button
            type="button"
            className="chip"
            onClick={() => load(section, true)}
            style={{ marginLeft: "auto" }}
          >
            今すぐ更新
          </button>
        </div>

        <div className="tabs" role="tablist">
          {SECTIONS.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              className="tab"
              aria-selected={section === s}
              onClick={() => setSection(s)}
            >
              {SECTION_LABELS[s]}
              <span className="count">{sectionCounts[s] ?? "…"}</span>
            </button>
          ))}
        </div>
        <p className="tabnote">{SECTION_NOTES[section]}</p>
      </header>

      <div className="controls">
        <div className="chiprow">
          <span className="rowlabel">業種</span>
          <button
            type="button"
            className="chip"
            aria-pressed={sector === "all"}
            onClick={() => setSector("all")}
          >
            すべて
          </button>
          {SECTORS.filter((s) => companies.some((c) => c.sector === s)).map((s) => (
            <button
              key={s}
              type="button"
              className="chip"
              aria-pressed={sector === s}
              onClick={() => setSector(sector === s ? "all" : s)}
            >
              {SECTOR_LABELS[s]}
            </button>
          ))}
          <button
            type="button"
            className="chip"
            aria-pressed={onlyTracked}
            onClick={() => setOnlyTracked((v) => !v)}
          >
            追跡企業のみ
          </button>
        </div>
        <div className="chiprow">
          <span className="rowlabel">絞り込み</span>
          <select
            className="select"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            aria-label="企業で絞り込む"
          >
            <option value="all">全企業</option>
            {companies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            className="search"
            type="search"
            value={query}
            placeholder="見出し・媒体名で絞り込む"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <main>
        {loading && <div className="empty">見出しを読み込んでいます…</div>}

        {!loading && error && (
          <div className="empty">
            <b>取得に失敗しました（{error}）。</b>{" "}
            下の「取得元の状態」でどのフィードが落ちているか確認してください。
          </div>
        )}

        {!loading && !error && visible.length === 0 && (
          <div className="empty">
            <b>条件に合う見出しがありません。</b>{" "}
            絞り込みを外すか、検索語を短くしてください。
          </div>
        )}

        {groups.map(([day, list]) => {
          const head = list[0]?.publishedAt ? jstParts(list[0].publishedAt) : null;
          return (
            <div className="daygroup" key={day}>
              <div className="daystamp">
                {head ? (
                  <>
                    <span className="dnum">
                      {head.month}/{head.date}
                    </span>
                    <span>{head.year}</span>
                    <br />
                    <span className="dow">{head.dow}</span>
                  </>
                ) : (
                  <span className="dnum">日付不明</span>
                )}
              </div>
              <div className="items">
                {list.map((item) => (
                  <a
                    key={item.id}
                    className={`item${item.companies.length ? " flagged" : ""}`}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <div className="item-meta">
                      {item.publishedAt && (
                        <span className="time">{jstParts(item.publishedAt).time}</span>
                      )}
                      <span className="outlet">{item.outlet ?? item.sourceName}</span>
                      {typeof item.score === "number" && item.score > 0 && (
                        <span className="score">{item.score} users</span>
                      )}
                      {item.companies.map((code) => (
                        <span className="tag company" key={code}>
                          {byCode.get(code)?.short ?? code}
                        </span>
                      ))}
                    </div>
                    <div className="item-title">{item.title}</div>
                  </a>
                ))}
              </div>
            </div>
          );
        })}
      </main>

      <section className="health">
        <h2>取得元の状態（{SECTION_LABELS[section]}）</h2>
        <p>
          いま開いているタブの取得元です。赤い印は今回取得できなかったもの。
          企業リリースが0件のままの場合は、<code>lib/companies.ts</code> の
          その企業の <code>newsUrl</code> がお知らせ一覧のページを指しているか
          確認してください。JavaScriptで描画されるページは取得できません。
        </p>
        <div className="tablescroll">
          <table>
            <thead>
              <tr>
                <th>取得元</th>
                <th>区分</th>
                <th>件数</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {feeds.map((feed) => (
                <tr key={feed.id}>
                  <td className="name">
                    <span
                      className={`dot ${
                        feed.ok ? "ok" : feed.unverified ? "unverified" : "ng"
                      }`}
                    />
                    {feed.name}
                  </td>
                  <td>{CATEGORY_LABELS[feed.category]}</td>
                  <td className="num">{feed.count}</td>
                  <td className={feed.error ? "err" : ""}>
                    {feed.error ?? "正常"}
                    {!feed.ok && feed.unverified ? "（要確認）" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer>
        見出しとリンクのみを表示し、記事本文は取得・保存していません。リンク先は
        各媒体および各社のサイトです。個人的な情報収集の用途を想定しています。
      </footer>
    </div>
  );
}
