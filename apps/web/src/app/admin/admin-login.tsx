"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function AdminLogin() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Login failed");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-24 flex w-full max-w-xs flex-col gap-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          aria-label="Go back"
        >
          ←
        </button>
        <h1 className="text-lg font-semibold">Admin</h1>
      </div>
      <input
        type="password"
        autoFocus
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={busy || !password}
        className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-white dark:text-zinc-900"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export function AdminLogout() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await fetch("/api/admin/login", { method: "DELETE" });
        router.refresh();
      }}
      className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
    >
      Sign out
    </button>
  );
}

const RESET_MS = parseInt(process.env.NEXT_PUBLIC_DEMO_RESET_MINUTES ?? "10", 10) * 60 * 1000;
const POLL_MS = 15_000;

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

/** Demo-only: wipe and reload the SuperValu sample data. Shows a countdown when data has been edited. */
export function ReseedDemoButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editedAt, setEditedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const polling = useRef<ReturnType<typeof setInterval> | null>(null);

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
    polling.current = setInterval(() => void syncState(), POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (polling.current) clearInterval(polling.current);
      clearInterval(tick);
    };
  }, []);

  async function reseed() {
    setBusy(true);
    await fetch("/api/admin/reseed", { method: "POST" }).catch(() => null);
    setEditedAt(null);
    setBusy(false);
    router.refresh();
  }

  const remaining = editedAt != null ? Math.max(0, RESET_MS - (now - editedAt)) : null;
  const urgent = remaining != null && remaining < 60_000;

  return (
    <button
      onClick={reseed}
      disabled={busy}
      className={`rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${
        urgent
          ? "border-red-400 text-red-600 hover:bg-red-50 dark:border-red-600 dark:text-red-400 dark:hover:bg-red-950"
          : remaining != null
            ? "border-amber-400 text-amber-700 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-400 dark:hover:bg-amber-950"
            : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      }`}
    >
      {busy
        ? "Reseeding…"
        : remaining != null
          ? `Reset seed data (${fmt(remaining)})`
          : "Reseed demo data"}
    </button>
  );
}
