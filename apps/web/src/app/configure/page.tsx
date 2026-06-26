import Link from "next/link";
import { db } from "@/lib/db";
import { products, retailers } from "@pricecheck/db/schema";
import { ConfigureClient } from "./configure-client";

export const dynamic = "force-dynamic";

export default async function ConfigurePage() {
  const [prods, rets] = await Promise.all([
    db.select({ id: products.id, title: products.title, brand: products.brand, category: products.category })
      .from(products)
      .orderBy(products.title),
    db.select({ id: retailers.id, slug: retailers.slug, name: retailers.name, baseUrl: retailers.baseUrl, enabled: retailers.enabled })
      .from(retailers)
      .orderBy(retailers.name),
  ]);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <div className="mb-8 flex items-center gap-3">
        <Link href="/" className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white" title="Back to deals">
          ← Back
        </Link>
        <h1 className="text-lg font-semibold">Configure</h1>
      </div>

      <ConfigureClient initialProducts={prods} initialRetailers={rets} />
    </main>
  );
}
