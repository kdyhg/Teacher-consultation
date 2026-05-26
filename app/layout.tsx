import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "담임 상담 워크벤치",
  description: "나이스 성적 자료 분석, 상담 자료, 가정 메시지 생성 도구",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
