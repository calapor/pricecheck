import {
  getAiUsageDaily,
  getAiUsageSummary,
  getRecentAiUsage,
  getRecentRequestLogs,
  getTopCountries,
} from "@pricecheck/db";
import { db } from "@/lib/db";
import { isAdmin } from "@/lib/admin-auth";
import { AppHeader } from "../components/app-header";
import { AdminLogin, AdminLogout, ReseedDemoButton } from "./admin-login";
import { UsageChart } from "./usage-chart";

export const dynamic = "force-dynamic";

function usd(micros: number): string {
  return `$${(micros / 1e6).toFixed(2)}`;
}

function tokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export default async function AdminPage() {
  if (!(await isAdmin())) {
    return (
      <main className="mx-auto w-full max-w-5xl px-6 py-12">
        <AdminLogin />
      </main>
    );
  }

  const [summary, daily, recent, visitors, countries] = await Promise.all([
    getAiUsageSummary(db),
    getAiUsageDaily(db, 30),
    getRecentAiUsage(db, 20),
    getRecentRequestLogs(db, 30),
    getTopCountries(db, 30),
  ]);

  const location = (r: { city: string | null; region: string | null; country: string | null }) =>
    [r.city, r.region, r.country].filter(Boolean).join(", ") || "—";

  const cards = [
    { label: "Total cost", value: usd(summary.costMicros) },
    { label: "API calls", value: String(summary.calls) },
    { label: "Input tokens", value: tokens(summary.inputTokens) },
    { label: "Output tokens", value: tokens(summary.outputTokens) },
  ];

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <AppHeader active="admin" />
      <div className="mt-8 flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Admin · AI usage</h1>
        <div className="flex items-center gap-3">
          {process.env.DEMO_MODE === "true" && <ReseedDemoButton />}
          <AdminLogout />
        </div>
      </div>

      {/* Summary cards */}
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="text-xs text-zinc-500">{c.label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{c.value}</div>
          </div>
        ))}
      </div>

      {/* Usage over time */}
      <section className="mt-8 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="mb-3 text-sm font-semibold">Usage over time (last 30 days)</h2>
        <UsageChart points={daily} />
      </section>

      {/* Recent calls */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold">Recent calls</h2>
        <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Operation</th>
                <th className="px-3 py-2 font-medium">Model</th>
                <th className="px-3 py-2 text-right font-medium">In</th>
                <th className="px-3 py-2 text-right font-medium">Out</th>
                <th className="px-3 py-2 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-3 py-2 text-zinc-500">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2">{r.operation}</td>
                  <td className="px-3 py-2 text-zinc-500">{r.model}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{tokens(r.inputTokens)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{tokens(r.outputTokens)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{usd(r.costMicros)}</td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-zinc-400">
                    No calls yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Web traffic */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold">Web traffic</h2>

        {/* Top locations */}
        <div className="mb-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="mb-2 text-xs text-zinc-500">Top locations (last 30 days)</div>
          {countries.length === 0 ? (
            <div className="text-sm text-zinc-400">No visits yet.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {countries.map((c) => (
                <span
                  key={c.country}
                  className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                >
                  {c.country} · <span className="tabular-nums font-medium">{c.visits}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Recent visitors */}
        <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Path</th>
                <th className="px-3 py-2 font-medium">IP</th>
                <th className="px-3 py-2 font-medium">Location</th>
                <th className="px-3 py-2 font-medium">User-agent</th>
              </tr>
            </thead>
            <tbody>
              {visitors.map((r) => (
                <tr key={r.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-3 py-2 whitespace-nowrap text-zinc-500">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{r.path}</td>
                  <td className="px-3 py-2 font-mono text-xs text-zinc-500">{r.ip ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-500">{location(r)}</td>
                  <td className="max-w-[16rem] truncate px-3 py-2 text-xs text-zinc-400" title={r.userAgent ?? ""}>
                    {r.userAgent ?? "—"}
                  </td>
                </tr>
              ))}
              {visitors.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-zinc-400">
                    No visits logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
