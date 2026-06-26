"use client";

import { useState, useTransition } from "react";

export function RefreshAllButton() {
  const [pending, startTransition] = useTransition();
  const [count, setCount] = useState<number | null>(null);

  function refresh() {
    setCount(null);
    startTransition(async () => {
      const res = await fetch("/api/refresh-all", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setCount(data.queued);
      }
    });
  }

  return (
    <button
      onClick={refresh}
      disabled={pending}
      className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
    >
      {pending ? "Queuing…" : count != null ? `Queued ${count} ✓` : "Refresh now"}
    </button>
  );
}
