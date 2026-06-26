"use client";

import { useTransition, useState } from "react";

export function AlertToggle({ offerId, initialEnabled }: { offerId: string; initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !enabled;
    startTransition(async () => {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ offerId, enabled: next }),
      });
      if (res.ok) setEnabled(next);
    });
  }

  return (
    <input
      type="checkbox"
      checked={enabled}
      onChange={toggle}
      disabled={pending}
      title="Alert when on sale"
      className="h-4 w-4 cursor-pointer rounded border-zinc-300 accent-emerald-500 disabled:opacity-50"
    />
  );
}
