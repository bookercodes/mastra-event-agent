import { SimpleAuth } from "@mastra/core/server";

const apiKey = process.env.MASTRA_SERVER_API_KEY;

if (!apiKey) {
  throw new Error("MASTRA_SERVER_API_KEY missing");
}

export default {
  auth: new SimpleAuth({
    tokens: {
      [apiKey]: {
        id: "internal",
        name: "Internal API",
      },
    },
  }),
};
