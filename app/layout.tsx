import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "IM-ON",
  applicationName: "IM-ON",
  description: "보안 사업장 출퇴근 및 TBM 출문 관리 웹앱",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
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
