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
  title: "PriceCheck",
  description: "Latest prices across retailers, refreshed daily.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <div
          className="fixed bottom-1 right-1.5 text-[11px] font-mono text-zinc-400 opacity-60 pointer-events-none z-[9999]"
          title="Running build"
        >
          {process.env.APP_VERSION ?? "dev"}
        </div>
      </body>
    </html>
  );
}
