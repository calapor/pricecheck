"use client";

import { useState } from "react";

export interface DailyPoint {
  day: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
}

type Metric = "calls" | "cost" | "tokens";

const METRICS: { key: Metric; label: string }[] = [
  { key: "calls", label: "Calls" },
  { key: "cost", label: "Cost" },
  { key: "tokens", label: "Tokens" },
];

function value(p: DailyPoint, m: Metric): number {
  if (m === "calls") return p.calls;
  if (m === "cost") return p.costMicros;
  return p.inputTokens + p.outputTokens;
}

function format(v: number, m: Metric): string {
  if (m === "cost") return `$${(v / 1e6).toFixed(2)}`;
  if (m === "tokens") return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);
  return String(v);
}

/** Interactive bar chart of AI usage over time — the "usage over time" view. */
export function UsageChart({ points }: { points: DailyPoint[] }) {
  const [metric, setMetric] = useState<Metric>("cost");

  if (points.length === 0) {
    return <p className="text-sm text-zinc-400">No usage recorded yet.</p>;
  }

  const values = points.map((p) => value(p, metric));
  const max = Math.max(...values, 1);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1">
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              metric === m.key
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="flex h-40 items-end gap-1">
        {points.map((p) => {
          const v = value(p, metric);
          const pct = Math.max((v / max) * 100, v > 0 ? 2 : 0);
          return (
            <div
              key={p.day}
              className="group relative flex flex-1 flex-col items-center justify-end"
              title={`${p.day}: ${format(v, metric)}`}
            >
              <span className="pointer-events-none absolute -top-5 hidden whitespace-nowrap rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] text-white group-hover:block dark:bg-white dark:text-zinc-900">
                {format(v, metric)}
              </span>
              <div
                className="w-full rounded-t bg-emerald-500/80 transition-all group-hover:bg-emerald-500"
                style={{ height: `${pct}%` }}
              />
            </div>
          );
        })}
      </div>

      <div className="flex justify-between text-[10px] text-zinc-400">
        <span>{points[0]!.day}</span>
        <span>{points[points.length - 1]!.day}</span>
      </div>
    </div>
  );
}
