import { getPriceHistorySeries, listOnSaleOffers } from "@pricecheck/db";
import { db } from "@/lib/db";
import { AppHeader } from "./components/app-header";
import { DealsTable } from "./components/deals-table";
import { RefreshAllButton } from "./components/refresh-all-button";
import { UpdatedAt } from "./components/updated-at";

export const dynamic = "force-dynamic";

export default async function Home() {
  const deals = await listOnSaleOffers(db);
  const offerIds = deals.map((d) => d.offerId);
  const seriesMap = await getPriceHistorySeries(db, offerIds, 30);

  const history: Record<string, { at: string; priceMinor: number }[]> = {};
  for (const [offerId, pts] of seriesMap.entries()) {
    history[offerId] = pts.map((p) => ({ at: p.at.toISOString(), priceMinor: p.priceMinor }));
  }

  const now = Date.now();

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <AppHeader active="deals" />

      <div className="mt-8">
        <DealsTable deals={deals} history={history} />
      </div>

      <footer className="mt-6 flex items-center justify-between text-xs text-zinc-400">
        <UpdatedAt at={now} />
        <RefreshAllButton />
      </footer>
    </main>
  );
}
