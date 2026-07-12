import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Image from "next/image";
import { DemoBanner } from "@/components/demo-banner";
import { WelcomeWizard, type WizardSlide } from "@/app/components/welcome-wizard";
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

const pricecheckSlides: WizardSlide[] = [
  {
    visual: (
      <div className="flex h-32 items-center justify-center">
        <Image
          src="/pricecheck-logo.png"
          alt="PriceCheck"
          width={520}
          height={200}
          className="h-20 w-auto"
          priority
        />
      </div>
    ),
    headline: "Welcome to PriceCheck",
    body: (
      <ul className="mt-2.5 space-y-1.5 pl-5 list-disc text-left text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
        <li>Any shop with an online presence can be added</li>
        <li>Add a shop to see best prices compared</li>
        <li>Map equivalent products across shops, including their different names</li>
      </ul>
    ),
  },
  {
    visual: (
      <div className="flex h-32 items-center justify-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
          <Image
            src="anthropic-1.svg"
            alt="Anthropic"
            width={520}
            height={200}
            className="h-20 w-auto"
            priority
          />
        </div>
      </div>
    ),
    headline: "Extensible design leveraging Anthropic Claude API",
    body: (
      <ul className="mt-2.5 space-y-1.5 pl-5 list-disc text-left text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
        <li>Paste a shop URL and click <strong>Generate</strong>.</li>
        <li><strong>Claude Opus 4.8</strong> generates custom shop scrapers from a URL — zero manual plugin authoring</li>
        <li>An <strong>AI judge</strong> evaluates each generated plugin with a confidence score before it&apos;s approved to run</li>
        <li>Once approved, future price updates are collected directly with <strong>no further AI API calls required</strong>.</li>
      </ul>
    ),
  },
  {
    visual: (
      <div className="flex h-32 items-center justify-center">
        <div className="bg-zinc-100 px-4 py-2 dark:bg-zinc-800">
          <Image
            src="cluster.png"
            alt="k8s Cluster"
            width={520}
            height={200}
            className="h-20 w-auto"
            priority
          />
        </div>
      </div>
    ),
    headline: "Imitates real-world production deployments",
    body: (
      <ul className="mt-2.5 space-y-1.5 pl-5 list-disc text-left text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
        <li>Deployed on a self-hosted <strong>Kubernetes (k3s)</strong> cluster running on ARM64 Raspberry Pi nodes</li>
        <li><strong>Jenkins CI/CD</strong> pipeline running on-cluster — builds, tests, and deploys on every push</li>
        <li>Full <strong>Vitest / JUnit</strong> test suite with CI reporting and badge status on every PR</li>
        <li><strong>VM-sandboxed plugin architecture</strong> — third-party scraper code runs in isolation, never touching core infra</li>
        <li><strong>Headless browser fallback</strong> for bot-protected sites that block standard HTTP scrapers</li>
        <li>Built on Next.js + PostgreSQL (on-cluster) + BullMQ — production-grade stack, not a toy demo</li>
      </ul>
    ),
  },
  {
    visual: (
      <div className="flex h-32 items-center justify-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-11 w-11 text-emerald-600 dark:text-emerald-400"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      </div>
    ),
    headline: "You're all set",
    body: (
      <>
        <ul className="mt-2.5 space-y-1.5 list-disc pl-5 text-left text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          <li>Browse today&apos;s deals or head to Configure to build your personal watchlist.</li>
          <li>Happy bargain hunting!</li>
        </ul>
        <div className="mt-4 border-t border-zinc-200 pt-3 text-xs italic leading-relaxed text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
          <p>
            <strong>Note:</strong> This is a demo environment. All data resets automatically after approximately 10 minutes of use.
          </p>
          <p className="mt-2">
            Modern bot protection means some retailers may not be fully accessible. This portfolio project focuses on demonstrating AI-assisted development workflows rather than production-grade scraping coverage.
          </p>
        </div>
      </>
    ),
  },
];

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
        {process.env.DEMO_MODE === "true" && <DemoBanner />}
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
        <WelcomeWizard slides={pricecheckSlides} sessionKey="demo_welcome_seen" />
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
