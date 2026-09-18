import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

// Every test talks to the dedicated test database, never local dev data.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://tmq:tmq_local_pw@localhost:5433/tmq_test";
process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-123";
process.env.GEMINI_API_KEY = ""; // AI calls are never made from tests
