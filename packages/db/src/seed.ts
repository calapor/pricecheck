import { createDb } from "./client";
import { offers, products, retailers } from "./schema";

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

  for (const book of demoBooks) {
    const [product] = await db
      .insert(products)
      .values({ title: book.title, category: "Books", fuzzyKey: book.title.toLowerCase() })
      .returning();

    await db
      .insert(offers)
      .values({
        productId: product!.id,
        retailerId: retailer!.id,
        retailerSku: book.sku,
        productUrl: book.url,
        currency: "GBP",
        freshnessTargetMinutes: 1440,
      })
      .onConflictDoNothing({ target: [offers.retailerId, offers.retailerSku] });
  }

  await client.end();
  // eslint-disable-next-line no-console
  console.log("seed complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
