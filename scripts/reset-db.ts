/** Drop every table in the target database (local development only). */
import "./env";
import { sql } from "../src/db";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/localhost|127\.0\.0\.1/.test(url) && !process.argv.includes("--force")) {
    console.error("Refusing to reset a non-local database. Pass --force if you really mean it.");
    process.exit(1);
  }
  await sql.unsafe("drop schema if exists public cascade; create schema public; drop schema if exists drizzle cascade;");
  console.log("✓ Database emptied");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
