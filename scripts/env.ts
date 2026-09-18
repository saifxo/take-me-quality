// Load environment variables before anything touches the database client.
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
