"use client";

import { useState, useTransition } from "react";

/** Triggers an on-demand (priority) refresh for one offer. */
export function RefreshButton({ offerId }: { offerId: string }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function refresh() {
    setDone(false);
    startTransition(async () => {
      const res = await fetch("/api/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ offerId }),
      });
      if (res.ok) setDone(true);
    });
  }

  return (
    <button
      onClick={refresh}
      disabled={pending}
      className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
    >
      {pending ? "Queuing…" : done ? "Queued ✓" : "Refresh"}
    </button>
  );
}
