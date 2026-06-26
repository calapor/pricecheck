import { eq } from "drizzle-orm";
import { createDb } from "./client";
import { offers, priceHistory, products, retailers } from "./schema";

/**
 * Seed a demo retailer + offers. We use books.toscrape.com — a sandbox site
 * explicitly built for scraping practice — so the vertical slice has a real,
 * ToS-safe target to hit locally.
 */
async function main() {
  const { db, client } = createDb();

  const [retailer] = await db
    .insert(retailers)
    .values({
      slug: "books-toscrape",
      name: "Books to Scrape (demo)",
      baseUrl: "https://books.toscrape.com",
      strategy: "http",
      maxConcurrency: 2,
      crawlDelayMs: 500,
      policy: { note: "Public sandbox for scraping practice." },
    })
    .onConflictDoUpdate({ target: retailers.slug, set: { updatedAt: new Date() } })
    .returning();

  const demoBooks = [
    {
      title: "A Light in the Attic",
      url: "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html",
      sku: "a-light-in-the-attic_1000",
    },
    {
      title: "Tipping the Velvet",
      url: "https://books.toscrape.com/catalogue/tipping-the-velvet_999/index.html",
      sku: "tipping-the-velvet_999",
    },
  ];

  const demoOfferIds: string[] = [];

  for (const book of demoBooks) {
    const [product] = await db
      .insert(products)
      .values({ title: book.title, category: "Books", fuzzyKey: book.title.toLowerCase() })
      .returning();

    const [offer] = await db
      .insert(offers)
      .values({
        productId: product!.id,
        retailerId: retailer!.id,
        retailerSku: book.sku,
        productUrl: book.url,
        currency: "GBP",
        freshnessTargetMinutes: 1440,
      })
      .onConflictDoUpdate({
        target: [offers.retailerId, offers.retailerSku],
        set: { updatedAt: new Date() },
      })
      .returning();

    demoOfferIds.push(offer!.id);
  }

  // Insert price history to simulate prior-high + current-low for each offer
  const now = new Date();
  const demoPrices = [
    { highMinor: 1299, lowMinor: 849 },
    { highMinor: 999, lowMinor: 699 },
  ];

  for (let i = 0; i < demoOfferIds.length; i++) {
    const offerId = demoOfferIds[i]!;
    const { highMinor, lowMinor } = demoPrices[i]!;

    const historyRows = [50, 40, 30, 20, 10, 5, 1].map((daysAgo) => {
      const scrapedAt = new Date(now.getTime() - daysAgo * 86_400_000);
      // High price for older rows, drop to low price in the last week
      const priceMinor = daysAgo > 7 ? highMinor : lowMinor;
      return {
        offerId,
        priceMinor,
        currency: "GBP",
        inStock: true,
        scrapedAt,
        sourceHash: `seed-${daysAgo}`,
        parserVersion: "seed-1.0",
      };
    });

    await db.insert(priceHistory).values(historyRows).onConflictDoNothing();

    // Set deal columns so listOnSaleOffers returns results without a live scrape
    const reductionBps = Math.round(((highMinor - lowMinor) / highMinor) * 10000);
    await db
      .update(offers)
      .set({
        latestPriceMinor: lowMinor,
        latestInStock: true,
        lastScrapedAt: now,
        lastSeenAt: now,
        referencePriceMinor: highMinor,
        onSale: true,
        reductionBps,
        updatedAt: now,
      })
      .where(eq(offers.id, offerId));
  }

  await client.end();
  // eslint-disable-next-line no-console
  console.log("seed complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
