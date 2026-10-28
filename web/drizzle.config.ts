import { defineConfig } from "drizzle-kit";
import "dotenv/config";

export default defineConfig({
  schema: "./src/lib/db/schema/index.ts",
  // Netlify Database auto-applies committed files from this directory on deploy.
  out: "./netlify/database/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.NETLIFY_DB_URL ||
      process.env.NETLIFY_DATABASE_URL ||
      process.env.DATABASE_URL ||
      "postgres://community_os:community_os@localhost:5432/community_os",
  },
  strict: true,
  verbose: true,
});
