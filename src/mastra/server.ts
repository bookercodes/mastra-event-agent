import { SimpleAuth } from "@mastra/core/server";

const isProd = process.env.NODE_ENV === "production";
const apiKey = process.env.MASTRA_SERVER_API_KEY;

if (isProd && !apiKey) {
  throw new Error("MASTRA_SERVER_API_KEY missing");
}

const auth = isProd
  ? new SimpleAuth({
      tokens: {
        [apiKey!]: {
          id: "internal",
          name: "Internal API",
        },
      },
    })
  : undefined;

export default {
  auth,
};
