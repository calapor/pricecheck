"use client";

import { useEffect, useRef, useState } from "react";

const RESET_MS = parseInt(process.env.NEXT_PUBLIC_DEMO_RESET_MINUTES ?? "10", 10) * 60 * 1000;
const POLL_MS = 15_000;

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

export function DemoBanner() {
  const [editedAt, setEditedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const resetting = useRef(false);

  useEffect(() => {
    async function syncState() {
      try {
        const res = await fetch("/api/admin/demo-state");
        if (!res.ok) return;
        const data = (await res.json()) as { lastEditedAt: string | null };
        setEditedAt(data.lastEditedAt ? new Date(data.lastEditedAt).getTime() : null);
      } catch {}
    }
    void syncState();
    const poll = setInterval(() => void syncState(), POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, []);

  useEffect(() => {
    if (editedAt == null || resetting.current) return;
    if (RESET_MS - (now - editedAt) > 0) return;
    resetting.current = true;
    fetch("/api/demo/reset", { method: "POST" })
      .then(() => setEditedAt(null))
      .catch(() => undefined)
      .finally(() => { resetting.current = false; });
  }, [now, editedAt]);

  if (editedAt == null) return null;

  const remaining = Math.max(0, RESET_MS - (now - editedAt));
  const urgent = remaining < 60_000;

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 py-1 text-xs font-medium ${
        urgent
          ? "bg-red-500 text-white"
          : "bg-amber-400 text-amber-900"
      }`}
    >
      <span>Demo</span>
      <span className="opacity-60">·</span>
      <span>resets in {fmt(remaining)}</span>
    </div>
  );
}
