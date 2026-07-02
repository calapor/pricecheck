import Image from "next/image";
import Link from "next/link";

export function AppHeader({ active }: { active: "deals" | "configure" }) {
  return (
    <header className="flex items-center justify-between">
      <Link href="/" aria-label="PriceCheck">
        <Image
          src="/pricecheck-logo.png"
          alt="PriceCheck"
          width={160}
          height={32}
          className="h-8 w-auto"
          priority
        />
      </Link>
      <nav className="flex gap-1">
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
      </nav>
    </header>
  );
}
