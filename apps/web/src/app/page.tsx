import { formatMoney } from "@pricecheck/core";
import { listLatestOffers } from "@pricecheck/db";
import { db } from "@/lib/db";
import { RefreshButton } from "./refresh-button";

// Reads live DB state, so render per-request.
export const dynamic = "force-dynamic";

function staleness(lastScrapedAt: Date | null): string {
  if (!lastScrapedAt) return "never scraped";
  const mins = Math.round((Date.now() - new Date(lastScrapedAt).getTime()) / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 48 ? `${hrs}h ago` : `${Math.round(hrs / 24)}d ago`;
}

export default async function Home() {
  const offers = await listLatestOffers(db);

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">PriceCheck</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Latest prices across retailers. Refreshed daily, or on demand.
      </p>

      <div className="mt-8 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-2 font-medium">Product</th>
              <th className="px-4 py-2 font-medium">Retailer</th>
              <th className="px-4 py-2 font-medium">Price</th>
              <th className="px-4 py-2 font-medium">Stock</th>
              <th className="px-4 py-2 font-medium">Updated</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {offers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  No offers yet. Seed the DB and run the worker.
                </td>
              </tr>
            )}
            {offers.map((o) => (
              <tr key={o.offerId} className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="px-4 py-3">
                  <a href={o.productUrl} className="hover:underline" rel="noreferrer">
                    {o.productTitle}
                  </a>
                </td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{o.retailerName}</td>
                <td className="px-4 py-3 font-medium">
                  {o.priceMinor != null
                    ? formatMoney({ amountMinor: o.priceMinor, currency: o.currency })
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  {o.inStock == null ? "—" : o.inStock ? "In stock" : "Out"}
                </td>
                <td className="px-4 py-3 text-zinc-500">{staleness(o.lastScrapedAt)}</td>
                <td className="px-4 py-3 text-right">
                  <RefreshButton offerId={o.offerId} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
