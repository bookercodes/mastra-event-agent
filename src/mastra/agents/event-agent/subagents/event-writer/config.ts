import { agentConfig } from "@mastra/core/agent";

export default agentConfig({
  id: "event-writer",
  name: "Event Writer Agent",
  description:
    "Writes and revises grounded titles and descriptions for Mastra workshops. Delegate when event copy is needed or the user gives editorial feedback on it.",
  model: "openai/gpt-5.6-sol",
  // File-based subagents otherwise receive filesystem and shell tools by default.
  workspace: () => undefined,
});
