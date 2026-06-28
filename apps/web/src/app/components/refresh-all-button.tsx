"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function RefreshAllButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<number | null>(null);

  function refresh() {
    setDone(null);
    startTransition(async () => {
      const res = await fetch("/api/refresh-all", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setDone(data.scraped ?? 0);
        // Re-render the server component so newly created/priced offers appear.
        router.refresh();
      }
    });
  }

  return (
    <button
      onClick={refresh}
      disabled={pending}
      className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
    >
      {pending ? "Refreshing…" : done != null ? `Updated ${done} ✓` : "Refresh now"}
    </button>
  );
}
