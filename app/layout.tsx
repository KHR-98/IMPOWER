import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "출퇴근통합시스템",
  description: "보안 사업장 출퇴근 및 TBM 출문 관리 웹앱",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
