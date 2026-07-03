import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { eq, inArray } from "drizzle-orm";
import { createDb } from "./client";
import { offers, priceHistory, productAliases, products, retailers } from "./schema";

/**
 * One-off snapshot tool. Reads the current `supervalu` retailer and everything
 * hanging off it (products, aliases, offers with their deal columns, and price
 * history) from DATABASE_URL and writes a pretty-printed fixture. That fixture is
 * the *only* sample data the demo deploy seeds — see seed-data.ts.
 *
 * The fixture is meant to be hand-editable: after running this, curate
 * fixtures/supervalu.json (drop products, tweak prices) before committing.
 *
 * Run with: pnpm db:export-fixture
 */
const RETAILER_SLUG = "supervalu";

const here = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(here, "fixtures", "supervalu.json");

async function main() {
  const { db, client } = createDb();

  const [retailer] = await db.select().from(retailers).where(eq(retailers.slug, RETAILER_SLUG));
  if (!retailer) {
    throw new Error(`No retailer with slug "${RETAILER_SLUG}" in this database.`);
  }

  const offerRows = await db.select().from(offers).where(eq(offers.retailerId, retailer.id));
  const productIds = [...new Set(offerRows.map((o) => o.productId))];
  const offerIds = offerRows.map((o) => o.id);

  const productRows = productIds.length
    ? await db.select().from(products).where(inArray(products.id, productIds))
    : [];
  const aliasRows = productIds.length
    ? await db.select().from(productAliases).where(inArray(productAliases.productId, productIds))
    : [];
  const historyRows = offerIds.length
    ? await db.select().from(priceHistory).where(inArray(priceHistory.offerId, offerIds))
    : [];

  // Drop the auto-increment id from price history; it is regenerated on insert.
  const history = historyRows.map(({ id: _id, ...rest }) => rest);

  const fixture = {
    retailer,
    products: productRows,
    productAliases: aliasRows,
    offers: offerRows,
    priceHistory: history,
  };

  writeFileSync(OUT_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
  await client.end();
  // eslint-disable-next-line no-console
  console.log(
    `wrote ${OUT_PATH}: ${productRows.length} products, ${offerRows.length} offers, ${history.length} price points`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
