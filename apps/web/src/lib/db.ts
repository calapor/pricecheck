import "server-only";
import { getDb, type Database } from "@pricecheck/db";

// Defer the real connection to first use: importing this module during
// `next build` page-data collection must not require DATABASE_URL at build time.
// `getDb()` itself memoizes the pool, so this only ever connects once.
export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real as object, prop);
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(real) : value;
  },
});
