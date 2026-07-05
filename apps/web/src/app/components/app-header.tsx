import Image from "next/image";
import Link from "next/link";

export function AppHeader({ active }: { active: "deals" | "configure" | "admin" }) {
  return (
    <header className="flex flex-col items-center gap-3 md:flex-row md:justify-between">
      <div className="flex items-center gap-3">
        <Link href="/" aria-label="PriceCheck">
          <Image
            src="/pricecheck-logo.png"
            alt="PriceCheck"
            width={780}
            height={300}
            className="h-12 w-auto"
            priority
          />
        </Link>
        {process.env.DEMO_MODE === "true" && (
          <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-widest uppercase bg-amber-400/20 text-amber-600 border border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-400 dark:border-amber-400/25 select-none">
            Demo
          </span>
        )}
      </div>
      <nav className="flex flex-wrap justify-center gap-1 md:justify-end">
        <Link
          href="/"
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            active === "deals"
              ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
              : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
          }`}
        >
          On Sale Now
        </Link>
        <Link
          href="/configure"
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            active === "configure"
              ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
              : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
          }`}
        >
          Configure
        </Link>
        <Link
          href="/admin"
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            active === "admin"
              ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
              : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
          }`}
        >
          Admin
        </Link>
      </nav>
    </header>
  );
}
