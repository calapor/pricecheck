import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./client";

/** Apply pending migrations from ./drizzle. Run as a k8s Job/initContainer. */
async function main() {
  const { db, client } = createDb();
  await migrate(db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
  await client.end();
  // eslint-disable-next-line no-console
  console.log("migrations applied");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
