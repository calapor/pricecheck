import { createDb } from "./client";
import { seedDemoData } from "./seed-data";

/**
 * CLI entry for the demo seed. Loads the SuperValu sample dataset (seed-data.ts).
 * Set SEED_RESET=1 to wipe the demo tables first — the Helm demo seed Job and the
 * /admin "reseed" action both use reset so a refresh is deterministic.
 */
async function main() {
  const { db, client } = createDb();
  await seedDemoData(db, { reset: process.env.SEED_RESET === "1" });
  await client.end();
  // eslint-disable-next-line no-console
  console.log("seed complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
