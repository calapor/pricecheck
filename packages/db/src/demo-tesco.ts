import { contentHash } from "@pricecheck/core";
import type { Database } from "./client";
import {
  listRetailers,
  createRetailer,
  listAliases,
  addAlias,
  upsertOffer,
  recordScrape,
} from "./repository";

const TESCO_SLUG = "tesco-ireland";
const TESCO_BASE = "https://www.tesco.ie/";
const PARSER_VERSION = "tesco-ireland@1";

function tescoSearchUrl(query: string) {
  return `${TESCO_BASE}groceries/en-IE/search?query=${encodeURIComponent(query)}`;
}

const SALMON_ID = "8290c80a-f5a4-489e-8bf2-86a960ebc164";
const SALMON_ALIAS = "Tesco Complete & Balanced Nutrition Adult Cat with Salmon & Vegetables";

interface DemoProduct {
  productId: string;
  searchName: string;
  title: string;
  amountMinor: number;
  refMinor: number | null;
}

const DEMO_PRODUCTS: DemoProduct[] = [
  {
    productId: SALMON_ID,
    searchName: "salmon cat food",
    title: "Tesco Complete & Balanced Nutrition Adult Cat with Salmon & Vegetables",
    amountMinor: 250,
    refMinor: 300,
  },
  {
    productId: "c37fd41d-adc6-44d2-8115-72559a56ea54",
    searchName: "almond barista",
    title: "Tesco Almond Barista Drink",
    amountMinor: 235,
    refMinor: null,
  },
  {
    productId: "8643531e-2fa3-494f-b766-e1b7ee747b36",
    searchName: "crunchy nut corn flakes",
    title: "Tesco Crunchy Nut Corn Flakes",
    amountMinor: 499,
    refMinor: 599,
  },
  {
    productId: "e121e514-6bf2-49af-a906-8573173a91bc",
    searchName: "flora spread",
    title: "Tesco Sunflower Spread Original",
    amountMinor: 399,
    refMinor: null,
  },
  {
    productId: "1db6f925-761b-43a3-8b8b-ead5ff3cdba6",
    searchName: "gluten free seeded loaf",
    title: "Tesco Gluten Free Seeded Loaf",
    amountMinor: 325,
    refMinor: 399,
  },
];

export async function seedTescoDemo(db: Database): Promise<void> {
  // 1. Find or create the Tesco retailer
  const existing = await listRetailers(db);
  let retailerId = existing.find((r) => r.slug === TESCO_SLUG)?.id;
  if (!retailerId) {
    const created = await createRetailer(db, {
      name: "Tesco Ireland",
      baseUrl: TESCO_BASE,
      slug: TESCO_SLUG,
    });
    retailerId = created.id;
  }

  // 2. Add the salmon alias if not already present
  const salmonAliases = await listAliases(db, SALMON_ID);
  if (!salmonAliases.some((a) => a.alias === SALMON_ALIAS)) {
    await addAlias(db, SALMON_ID, SALMON_ALIAS);
  }

  // 3. Seed each product's offer + price history (two points for a sparkline)
  const threeDaysAgo = new Date(Date.now() - 3 * 86400e3);

  for (const p of DEMO_PRODUCTS) {
    const productUrl = tescoSearchUrl(p.searchName);
    const { id: offerId } = await upsertOffer(db, {
      productId: p.productId,
      retailerId,
      retailerSku: `q:${p.productId}`,
      productUrl,
    });

    // First point: higher ref price (or current price when no ref)
    const refPrice = p.refMinor ?? p.amountMinor;
    await recordScrape(
      db,
      offerId,
      {
        price: { amountMinor: refPrice, currency: "EUR" },
        inStock: true,
        url: productUrl,
        title: p.title,
        sourceHash: contentHash([productUrl, refPrice, "EUR", true, "ref"]),
        parserVersion: PARSER_VERSION,
      },
      threeDaysAgo,
    );

    // Second point: current Tesco price (with "was" price when on sale)
    await recordScrape(db, offerId, {
      price: { amountMinor: p.amountMinor, currency: "EUR" },
      inStock: true,
      url: productUrl,
      title: p.title,
      sourceHash: contentHash([productUrl, p.amountMinor, "EUR", true]),
      parserVersion: PARSER_VERSION,
      ...(p.refMinor ? { retailerOriginalPriceMinor: p.refMinor } : {}),
    });
  }
}
