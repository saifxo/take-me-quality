import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

type Sql = ReturnType<typeof postgres>;

const globalForDb = globalThis as unknown as { __tmqSql?: Sql };

function createClient(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local (or add it in Vercel → Settings → Environment Variables).");
  }
  const local = /localhost|127\.0\.0\.1/.test(url);
  return postgres(url, {
    // Serverless functions each hold their own pool; keep it small on Vercel.
    max: process.env.VERCEL ? 3 : 10,
    // Required for transaction-mode poolers such as Neon's pooled endpoint.
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 15,
    ssl: local ? false : "require",
    onnotice: () => {},
  });
}

// Connections are opened lazily on the first query, so importing this module is cheap.
export const sql: Sql = globalForDb.__tmqSql ?? createClient();
if (process.env.NODE_ENV !== "production") globalForDb.__tmqSql = sql;

export const db = drizzle(sql, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export { schema };
