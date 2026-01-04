import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Interview Platform",
  description: "WebRTC video interview platform with AI analysis",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body className="min-h-screen bg-gray-900 text-white">{children}</body>
    </html>
  );
}
