import { agentConfig } from "@mastra/core/agent";

export default agentConfig({
  id: "description-writer",
  name: "Description Writer Agent",
  description:
    "Writes and revises grounded descriptions for Mastra workshops. Delegate when a workshop description is needed or the user gives editorial feedback on one.",
  model: "openai/gpt-5.6-sol",
  // File-based subagents otherwise receive filesystem and shell tools by default.
  workspace: () => undefined,
});
