import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "自動車報道ウォッチ",
  description:
    "新聞社・通信社・テレビ局の自動車関連ニュースの見出しを、媒体名つきで一列に並べて追うための個人用ダッシュボード。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@600;700&family=Zen+Kaku+Gothic+New:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
