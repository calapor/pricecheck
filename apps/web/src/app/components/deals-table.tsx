"use client";

import { useState } from "react";
import { formatMoney } from "@pricecheck/core";
import type { OnSaleListing } from "@pricecheck/db";
import { AlertToggle } from "./alert-toggle";
import { Sparkline } from "./sparkline";

type SortKey = "product" | "shop" | "save";

function SortHeader({
  label,
  col,
  active,
  dir,
  onToggle,
}: {
  label: string;
  col: SortKey;
  active: boolean;
  dir: "asc" | "desc";
  onToggle: (col: SortKey) => void;
}) {
  return (
    <th
      className="cursor-pointer select-none px-4 py-2 font-medium hover:text-zinc-900 dark:hover:text-white"
      onClick={() => onToggle(col)}
    >
      {label}
      <span className="ml-1 text-[10px]">{active ? (dir === "asc" ? "↑" : "↓") : "↕"}</span>
    </th>
  );
}

interface Props {
  deals: OnSaleListing[];
  history: Record<string, { at: string; priceMinor: number }[]>;
}

export function DealsTable({ deals, history }: Props) {
  const [sort, setSort] = useState<SortKey>("save");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  function toggleSort(key: SortKey) {
    if (sort === key) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setDir(key === "save" ? "desc" : "asc");
    }
  }

  const sorted = [...deals].sort((a, b) => {
    let cmp = 0;
    if (sort === "product") cmp = a.productTitle.localeCompare(b.productTitle);
    else if (sort === "shop") cmp = a.retailerName.localeCompare(b.retailerName);
    else cmp = a.reductionBps - b.reductionBps;
    return dir === "asc" ? cmp : -cmp;
  });

  const topOfferId = deals.reduce(
    (best, d) => (d.reductionBps > (best?.reductionBps ?? -1) ? d : best),
    null as OnSaleListing | null,
  )?.offerId;

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 text-left text-zinc-500 dark:bg-zinc-900">
          <tr>
            <SortHeader label="Product" col="product" active={sort === "product"} dir={dir} onToggle={toggleSort} />
            <SortHeader label="Shop" col="shop" active={sort === "shop"} dir={dir} onToggle={toggleSort} />
            <th className="px-4 py-2 font-medium">Now</th>
            <th className="px-4 py-2 font-medium">Was</th>
            <SortHeader label="Save" col="save" active={sort === "save"} dir={dir} onToggle={toggleSort} />
            <th className="px-4 py-2 font-medium">30d</th>
            <th className="px-4 py-2 font-medium">Alert</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                No deals right now. Run the worker to scrape prices.
              </td>
            </tr>
          )}
          {sorted.map((d) => {
            const pts = (history[d.offerId] ?? []).map((p) => ({ ...p, at: new Date(p.at) }));
            const savePct = (d.reductionBps / 100).toFixed(0);
            return (
              <tr key={d.offerId} className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="px-4 py-3">
                  <span className="font-medium">{d.productTitle}</span>
                  {d.offerId === topOfferId && (
                    <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                      Top deal
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    {d.retailerName}
                  </span>
                </td>
                <td className="px-4 py-3 font-semibold">
                  {formatMoney({ amountMinor: d.latestPriceMinor, currency: d.currency })}
                </td>
                <td className="px-4 py-3 text-zinc-400 line-through">
                  {formatMoney({ amountMinor: d.referencePriceMinor, currency: d.currency })}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                    -{savePct}%
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Sparkline points={pts} />
                </td>
                <td className="px-4 py-3">
                  <AlertToggle offerId={d.offerId} initialEnabled={d.alertEnabled} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
