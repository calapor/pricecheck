import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Image from "next/image";
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
        {process.env.MAINTENANCE_MODE === "true" ? (
          <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 text-center">
            <Image
              src="/pricecheck-logo.png"
              alt="PriceCheck"
              width={780}
              height={300}
              className="h-16 w-auto opacity-80"
              priority
            />
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-800 dark:text-zinc-200">
                We&apos;ll be back soon
              </h1>
              <p className="text-sm text-zinc-500">
                PriceCheck is currently down for maintenance. Check back shortly.
              </p>
            </div>
            <div className="h-1 w-24 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
              <div className="h-full w-full animate-pulse bg-zinc-400 dark:bg-zinc-500 rounded-full" />
            </div>
          </div>
        ) : (
          children
        )}
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
