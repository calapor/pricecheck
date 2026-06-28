"use client";

import { useState, useCallback, useEffect } from "react";

interface Retailer {
  id: string;
  slug: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
}

interface AvailableScraper {
  slug: string;
  displayName: string;
  baseUrl: string;
  source: "built-in" | "plugin";
}

interface JudgeVerdict {
  score: number;
  recommendation: "install" | "warn" | "reject";
  findings: Array<{ severity: "error" | "warning" | "info"; message: string }>;
}

interface Props {
  initial: Retailer[];
  onSaved: () => void;
}

type Mode = "idle" | "add-existing" | "generate";

/**
 * Parse a fetch Response as JSON without throwing on an empty or non-JSON body
 * (e.g. a 500/504 with no payload), which otherwise surfaces as the opaque
 * "JSON.parse: unexpected end of data" error.
 */
async function safeJson<T = Record<string, unknown>>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function ShopsPanel({ initial, onSaved }: Props) {
  const [items, setItems] = useState<Retailer[]>(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", baseUrl: "" });
  const [mode, setMode] = useState<Mode>("idle");

  // Available scrapers (built-ins + installed plugins)
  const [available, setAvailable] = useState<AvailableScraper[]>([]);
  const [selectedSlug, setSelectedSlug] = useState("");

  // Generate wizard state
  const [shopUrl, setShopUrl] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedBundle, setGeneratedBundle] = useState<string | null>(null);
  const [generatedSlug, setGeneratedSlug] = useState("");
  const [generatedDisplayName, setGeneratedDisplayName] = useState("");
  const [generatedBaseUrl, setGeneratedBaseUrl] = useState("");
  const [verdict, setVerdict] = useState<JudgeVerdict | null>(null);
  const [installing, setInstalling] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch("/api/retailers");
    if (res.ok) setItems(await res.json());
  }, []);

  const loadAvailable = useCallback(async () => {
    const res = await fetch("/api/scrapers");
    if (res.ok) setAvailable(await res.json());
  }, []);

  // Inline fetch on mount — avoids calling a setState-dispatching function
  // directly inside the effect body (react-hooks/set-state-in-effect).
  useEffect(() => {
    fetch("/api/scrapers")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: AvailableScraper[] | null) => { if (data) setAvailable(data); })
      .catch(() => {});
  }, []);

  // Slugs already added as retailers — filter them from the dropdown
  const existingSlugs = new Set(items.map((r) => r.slug));
  const unaddedScrapers = available.filter((s) => !existingSlugs.has(s.slug));

  async function handleAddExisting() {
    const scraper = available.find((s) => s.slug === selectedSlug);
    if (!scraper) return;
    await fetch("/api/retailers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: scraper.displayName, baseUrl: scraper.baseUrl, slug: scraper.slug }),
    });
    setMode("idle");
    setSelectedSlug("");
    await reload();
    onSaved();
  }

  async function handleGenerate() {
    if (!shopUrl.trim()) return;
    setGenerating(true);
    setGenerateError(null);
    setGeneratedBundle(null);
    setVerdict(null);
    try {
      const res = await fetch("/api/scrapers/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shopUrl: shopUrl.trim() }),
      });
      const data = await safeJson<{
        error?: string;
        bundleJs?: string;
        slug?: string;
        displayName?: string;
        baseUrl?: string;
        verdict?: JudgeVerdict;
      }>(res);
      if (!res.ok || !data) {
        setGenerateError(data?.error ?? `Generation failed (HTTP ${res.status})`);
        return;
      }
      setGeneratedBundle(data.bundleJs ?? "");
      setGeneratedSlug(data.slug ?? "");
      setGeneratedDisplayName(data.displayName ?? "");
      setGeneratedBaseUrl(data.baseUrl ?? "");
      setVerdict(data.verdict ?? null);
    } catch (err) {
      setGenerateError(String(err));
    } finally {
      setGenerating(false);
    }
  }

  async function handleInstall() {
    if (!generatedBundle) return;
    setInstalling(true);
    try {
      const res = await fetch("/api/scrapers/install", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: generatedSlug,
          displayName: generatedDisplayName,
          baseUrl: generatedBaseUrl,
          bundleJs: generatedBundle,
        }),
      });
      const data = await safeJson<{ error?: string }>(res);
      if (!res.ok || !data) {
        setGenerateError(data?.error ?? `Install failed (HTTP ${res.status})`);
        return;
      }
      // Plugin installed — reload available list so it appears in the dropdown
      await loadAvailable();
      setMode("idle");
      setGeneratedBundle(null);
      setVerdict(null);
      setShopUrl("");
    } finally {
      setInstalling(false);
    }
  }

  async function handleSave(id: string) {
    await fetch(`/api/retailers/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });
    setEditing(null);
    await reload();
    onSaved();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/retailers/${id}`, { method: "DELETE" });
    await reload();
    onSaved();
  }

  function startEdit(r: Retailer) {
    setEditing(r.id);
    setDraft({ name: r.name, baseUrl: r.baseUrl });
  }

  const verdictColour =
    verdict?.recommendation === "install"
      ? "text-green-600 dark:text-green-400"
      : verdict?.recommendation === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Shops</h2>
        {mode === "idle" && (
          <div className="flex gap-2">
            {unaddedScrapers.length > 0 && (
              <button
                onClick={() => { setMode("add-existing"); setSelectedSlug(unaddedScrapers[0]?.slug ?? ""); }}
                className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                + Add shop
              </button>
            )}
            <button
              onClick={() => setMode("generate")}
              className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              ✦ Generate scraper
            </button>
          </div>
        )}
      </div>

      {/* Add existing scraper dropdown */}
      {mode === "add-existing" && (
        <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <label className="text-xs text-zinc-500">Select a shop</label>
          <select
            value={selectedSlug}
            onChange={(e) => setSelectedSlug(e.target.value)}
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {unaddedScrapers.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.displayName} ({s.slug})
                {s.source === "plugin" ? " [plugin]" : ""}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              onClick={handleAddExisting}
              className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
            >
              Add
            </button>
            <button
              onClick={() => setMode("idle")}
              className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Generate wizard */}
      {mode === "generate" && (
        <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <p className="text-xs text-zinc-500">
            Paste the shop&apos;s homepage URL — Claude will inspect the page and generate a scraper.
          </p>
          <input
            autoFocus
            placeholder="https://shop.example.ie/"
            value={shopUrl}
            onChange={(e) => setShopUrl(e.target.value)}
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          {generateError && (
            <p className="text-xs text-red-500">{generateError}</p>
          )}
          {!generatedBundle && (
            <div className="flex gap-2">
              <button
                onClick={handleGenerate}
                disabled={generating || !shopUrl.trim()}
                className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-white dark:text-zinc-900"
              >
                {generating ? "Generating…" : "Generate"}
              </button>
              <button
                onClick={() => { setMode("idle"); setGeneratedBundle(null); setVerdict(null); }}
                className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Generated bundle + judge verdict */}
          {generatedBundle && verdict && (
            <div className="flex flex-col gap-3">
              {/* Judge verdict */}
              <div className="rounded border border-zinc-200 p-2 dark:border-zinc-700">
                <div className={`flex items-center gap-2 text-xs font-medium ${verdictColour}`}>
                  <span>Judge: {verdict.recommendation.toUpperCase()}</span>
                  <span className="text-zinc-400">({verdict.score}/100)</span>
                </div>
                {verdict.findings.length > 0 && (
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {verdict.findings.map((f, i) => (
                      <li key={i} className={`text-[11px] ${f.severity === "error" ? "text-red-500" : f.severity === "warning" ? "text-amber-500" : "text-zinc-400"}`}>
                        [{f.severity}] {f.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Generated bundle (editable) */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-500">Generated bundle (editable)</label>
                <div className="grid grid-cols-2 gap-1">
                  <input
                    placeholder="slug"
                    value={generatedSlug}
                    onChange={(e) => setGeneratedSlug(e.target.value)}
                    className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                  />
                  <input
                    placeholder="Display Name"
                    value={generatedDisplayName}
                    onChange={(e) => setGeneratedDisplayName(e.target.value)}
                    className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </div>
                <textarea
                  value={generatedBundle}
                  onChange={(e) => setGeneratedBundle(e.target.value)}
                  rows={10}
                  className="w-full rounded border border-zinc-300 px-2 py-1 font-mono text-[11px] dark:border-zinc-700 dark:bg-zinc-900"
                />
              </div>

              {generateError && <p className="text-xs text-red-500">{generateError}</p>}

              <div className="flex gap-2">
                <button
                  onClick={handleInstall}
                  disabled={installing || verdict.recommendation === "reject"}
                  className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-white dark:text-zinc-900"
                  title={verdict.recommendation === "reject" ? "Judge rejected this bundle — fix errors before installing" : undefined}
                >
                  {installing ? "Installing…" : "Install plugin"}
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700"
                >
                  Regenerate
                </button>
                <button
                  onClick={() => { setMode("idle"); setGeneratedBundle(null); setVerdict(null); }}
                  className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Existing retailers list */}
      <ul className="flex flex-col gap-1">
        {items.map((r) =>
          editing === r.id ? (
            <li key={r.id} className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <input
                autoFocus
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              <input
                value={draft.baseUrl}
                onChange={(e) => setDraft((d) => ({ ...d, baseUrl: e.target.value }))}
                className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => handleSave(r.id)}
                  className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditing(null)}
                  className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700"
                >
                  Cancel
                </button>
              </div>
            </li>
          ) : (
            <li
              key={r.id}
              className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2 text-sm dark:border-zinc-800"
            >
              <span>
                {r.name}
                <span className="ml-1 text-xs text-zinc-400">{r.slug}</span>
              </span>
              <div className="flex gap-2">
                <button onClick={() => startEdit(r)} className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
                  Edit
                </button>
                <button onClick={() => handleDelete(r.id)} className="text-xs text-red-500 hover:text-red-700">
                  Delete
                </button>
              </div>
            </li>
          ),
        )}
        {items.length === 0 && mode === "idle" && (
          <li className="py-4 text-center text-sm text-zinc-400">No shops yet.</li>
        )}
      </ul>
    </section>
  );
}
