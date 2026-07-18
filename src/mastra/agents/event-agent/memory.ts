import { Memory } from "@mastra/memory";

export default new Memory({
  options: {
    observationalMemory: {
      model: "openai/gpt-5.4-mini",
      scope: "thread",
      observation: {
        messageTokens: 15000,
      },
      reflection: {
        observationTokens: 20000,
      },
    },
  },
});
