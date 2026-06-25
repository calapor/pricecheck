import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

export function createDb(connectionString = process.env.DATABASE_URL): {
  db: Database;
  client: postgres.Sql;
} {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  // `max` kept low: many small worker pods each hold a pool, so cap per-process
  // connections to avoid exhausting Postgres. Tune alongside replica counts.
  const client = postgres(connectionString, { max: Number(process.env.PG_POOL_MAX ?? 5) });
  return { db: drizzle(client, { schema }), client };
}

let singleton: Database | undefined;

/** Lazily-created shared connection for request handlers and workers. */
export function getDb(): Database {
  if (!singleton) {
    singleton = createDb().db;
  }
  return singleton;
}
