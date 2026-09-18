import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// .env.local wins over .env; real environment variables (e.g. on Vercel) win over both.
config({ path: ".env.local", quiet: true });
config({ quiet: true });

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local first.");

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
