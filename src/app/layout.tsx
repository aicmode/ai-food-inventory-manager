import type { Metadata, Viewport } from "next";

import { Toaster } from "@/components/ui/toast";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "AI食品在庫・発注管理",
    template: "%s | AI食品在庫・発注管理",
  },
  description: "在庫・賞味期限・発注を、ひとつの画面で。複数拠点・ロット・FEFO・AI発注提案に対応した食品在庫管理システム。",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full">
      <body className="min-h-full font-sans antialiased">
        <Toaster>{children}</Toaster>
      </body>
    </html>
  );
}
