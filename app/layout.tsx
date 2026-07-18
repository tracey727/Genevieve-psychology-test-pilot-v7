import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GENEVIEVE HEALTH™ — Irene & Staff Connected Safety Hub",
  description:
    "Controlled fictional-data psychology practice safety, continuity, staff support, supervision and audit demonstration for Irene and Mood & Mind Centre.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/demo/assets/icon-192.png",
    shortcut: "/demo/assets/icon-192.png",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "GENEVIEVE Staff", statusBarStyle: "black-translucent" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-AU">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
