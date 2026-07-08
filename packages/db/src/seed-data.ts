import type { Database } from "./client";
import fixtureJson from "./fixtures/supervalu.json";
import {
  type NewOffer,
  type NewProduct,
  type NewProductAlias,
  type NewRetailer,
  offers,
  priceHistory,
  productAliases,
  products,
  retailers,
  scraperPlugins,
} from "./schema";
import { clearDemoDirty } from "./repository";

/**
 * Sample data for the showcase/demo deploy. This is a verbatim snapshot of the
 * live SuperValu retailer and its products (see export-fixture.ts) — the *only*
 * dataset the demo seeds. The demo's worker/scheduler then keep prices fresh.
 *
 * Timestamps come out of JSON as ISO strings; Drizzle's timestamp columns want
 * `Date`, so every date field is rehydrated on the way in.
 */

// Row shapes as they sit in the JSON (dates are strings). An empty array in the
// fixture (e.g. productAliases) would otherwise infer as never[], so type it.
type Iso = string;
interface Fixture {
  retailer: NewRetailer & { strategy: Iso; createdAt: Iso; updatedAt: Iso };
  products: (NewProduct & { createdAt: Iso; updatedAt: Iso })[];
  productAliases: (NewProductAlias & { createdAt: Iso })[];
  offers: (NewOffer & {
    createdAt: Iso;
    updatedAt: Iso;
    lastScrapedAt: Iso | null;
    lastSeenAt: Iso | null;
  })[];
  priceHistory: (Omit<typeof priceHistory.$inferInsert, "scrapedAt"> & { scrapedAt: Iso })[];
}

const fixture = fixtureJson as unknown as Fixture;

const date = (v: Iso): Date => new Date(v);
const dateOrNull = (v: Iso | null): Date | null => (v == null ? null : new Date(v));

/**
 * Load the demo dataset into `db`. With `reset: true` the demo tables are wiped
 * first so a re-seed is deterministic (no duplicates, no stale rows) — safe only
 * because the demo runs its own isolated database.
 */
export async function seedDemoData(db: Database, opts: { reset?: boolean } = {}): Promise<void> {
  if (opts.reset) {
    // Children first, then parents. (alerts/scrape_runs fall away via cascade /
    // set-null when their offer or retailer is removed.)
    await db.delete(priceHistory);
    await db.delete(offers);
    await db.delete(productAliases);
    await db.delete(products);
    await db.delete(retailers);
    await db.delete(scraperPlugins);
    await clearDemoDirty(db);
  }

  const r = fixture.retailer;
  await db
    .insert(retailers)
    .values({ ...r, createdAt: date(r.createdAt), updatedAt: date(r.updatedAt) })
    .onConflictDoNothing();

  if (fixture.products.length) {
    await db
      .insert(products)
      .values(
        fixture.products.map((p) => ({
          ...p,
          createdAt: date(p.createdAt),
          updatedAt: date(p.updatedAt),
        })),
      )
      .onConflictDoNothing();
  }

  if (fixture.productAliases.length) {
    await db
      .insert(productAliases)
      .values(fixture.productAliases.map((a) => ({ ...a, createdAt: date(a.createdAt) })))
      .onConflictDoNothing();
  }

  if (fixture.offers.length) {
    await db
      .insert(offers)
      .values(
        fixture.offers.map((o) => ({
          ...o,
          createdAt: date(o.createdAt),
          updatedAt: date(o.updatedAt),
          lastScrapedAt: dateOrNull(o.lastScrapedAt),
          lastSeenAt: dateOrNull(o.lastSeenAt),
        })),
      )
      .onConflictDoNothing();
  }

  if (fixture.priceHistory.length) {
    await db
      .insert(priceHistory)
      .values(fixture.priceHistory.map((h) => ({ ...h, scrapedAt: date(h.scrapedAt) })))
      .onConflictDoNothing();
  }
}
