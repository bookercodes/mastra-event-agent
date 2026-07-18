import { LibSQLStore } from "@mastra/libsql";

const isProd = process.env.NODE_ENV === "production";

export default new LibSQLStore({
  id: "mastra-storage",
  url: isProd ? process.env.TURSO_DATABASE_URL! : "file:./mastra.db",
  authToken: isProd ? process.env.TURSO_AUTH_TOKEN : undefined,
});
